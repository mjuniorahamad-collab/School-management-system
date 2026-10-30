<#
.SYNOPSIS
  Restores a School Management System database from a `pg_dump --format=custom`
  backup created by db-backup.ps1.

.DESCRIPTION
  Reads DATABASE_URL from the environment. There is no `.env` fallback. Requires
  pg_restore on PATH. The password is passed only via PGPASSWORD and is never
  printed.

  Restore DESTROYS the current contents of the target database: the dump is
  applied with --clean --if-exists --single-transaction. The exact target
  identity must be confirmed with -ConfirmHost, -ConfirmPort and
  -ConfirmDatabase. -Yes only skips the final destructive-command prompt; it
  never replaces the identity confirmations. Non-interactive runs require -Yes
  plus all three identity confirmations.

  If DATABASE_URL is pooled, RESTORE_DATABASE_URL must supply the direct,
  unpooled URL for the same database.

.PARAMETER File
  Path to the .dump file to restore. Required.

.PARAMETER ConfirmHost
  Exact target host (canonical, unpooled endpoint).

.PARAMETER ConfirmPort
  Exact target port.

.PARAMETER ConfirmDatabase
  Exact target database name.

.PARAMETER Yes
  Skip the destructive-command confirmation prompt.

.PARAMETER ValidateOnly
  Validate the target, confirmations and backup file, then exit before pg_restore.

.EXAMPLE
  ./scripts/db-restore.ps1 -File backups/school-management-school-20260901-060000.dump `
    -ConfirmHost ep-example.neon.tech -ConfirmPort 5432 -ConfirmDatabase neondb -Yes
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$File,
  [string]$ConfirmHost,
  [string]$ConfirmPort,
  [string]$ConfirmDatabase,
  [switch]$Yes,
  [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"

function Get-QueryValue([string]$query, [string]$name) {
  $query = $query.TrimStart("?")
  foreach ($pair in ($query -split "&")) {
    if ($pair -eq "") { continue }
    $parts = $pair -split "=", 2
    $key = [Uri]::UnescapeDataString($parts[0])
    if ($key -eq $name) {
      if ($parts.Length -lt 2) { return "" }
      return [Uri]::UnescapeDataString($parts[1])
    }
  }
  return $null
}

function Test-PooledHost([string]$hostName) {
  $lower = $hostName.ToLowerInvariant()
  return ($lower -split "\." | Where-Object { $_.Contains("pooler") }).Count -gt 0
}

function Get-CanonicalHost([string]$hostName) {
  $hostValue = $hostName.Trim().ToLowerInvariant()
  if ($hostValue -eq "") { return "" }
  if ($hostValue -match "^[0-9a-f:]+$") { return $hostValue }

  if (-not (Test-PooledHost $hostValue)) { return $hostValue }

  if (-not $hostValue.EndsWith(".neon.tech")) {
    throw "Unsupported pooled database host '$hostValue'."
  }
  $labels = $hostValue -split "\."
  $first = $labels[0]
  if (-not $first.StartsWith("ep-") -or -not $first.EndsWith("-pooler")) {
    throw "Ambiguous Neon pooled host '$hostValue'."
  }
  $directFirst = $first.Substring(0, $first.Length - "-pooler".Length)
  if (-not $directFirst.StartsWith("ep-") -or $directFirst.Length -le "ep-".Length) {
    throw "Ambiguous Neon pooled host '$hostValue'."
  }
  $canonicalLabels = @($directFirst) + $labels[1..($labels.Length - 1)]
  if (($canonicalLabels | Where-Object { $_.Contains("pooler") }).Count -gt 0) {
    throw "Ambiguous Neon pooled host '$hostValue'."
  }
  return ($canonicalLabels -join ".")
}

function Read-TargetUrl([string]$raw, [string]$label) {
  try {
    $uri = [Uri]$raw
  } catch {
    throw "$label is not a parseable PostgreSQL connection string."
  }
  if ($uri.Scheme -ne "postgres" -and $uri.Scheme -ne "postgresql") {
    throw "$label must start with postgresql:// or postgres://"
  }

  $database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart("/"))
  if (-not $database) { throw "$label has no database name" }

  $userInfo = $uri.UserInfo
  $user = ""
  $password = ""
  if ($userInfo -ne "") {
    $colon = $userInfo.IndexOf(":")
    if ($colon -ge 0) {
      $user = [Uri]::UnescapeDataString($userInfo.Substring(0, $colon))
      $password = [Uri]::UnescapeDataString($userInfo.Substring($colon + 1))
    } else {
      $user = [Uri]::UnescapeDataString($userInfo)
    }
  }

  $hostParam = Get-QueryValue $uri.Query "host"
  $hostName = $uri.DnsSafeHost
  if (-not $hostName -and $hostParam) { $hostName = $hostParam }
  if (-not $hostName) { throw "$label has no host (or a socket host query parameter)" }
  $ipAddress = $null
  if ($hostName.Contains(":") -and [System.Net.IPAddress]::TryParse($hostName, [ref]$ipAddress)) {
    $hostName = $ipAddress.ToString()
  }
  $port = if ($uri.Port -gt 0) { "$($uri.Port)" } else { "5432" }
  $pgbouncer = Get-QueryValue $uri.Query "pgbouncer"
  $pooledByQuery = $null -ne $pgbouncer -and @("1", "true", "yes") -contains $pgbouncer.Trim().ToLowerInvariant()

  return [pscustomobject]@{
    Host = $hostName
    CanonicalHost = (Get-CanonicalHost $hostName)
    Port = $port
    Database = $database
    User = $user
    Password = $password
    Pooled = (Test-PooledHost $hostName) -or $pooledByQuery
  }
}

$rawAppUrl = $env:DATABASE_URL
if (-not $rawAppUrl) {
  throw "DATABASE_URL is not set. The restore script does not read .env."
}
$app = Read-TargetUrl $rawAppUrl "DATABASE_URL"
$target = $app
if ($app.Pooled) {
  $rawRestoreUrl = $env:RESTORE_DATABASE_URL
  if (-not $rawRestoreUrl) {
    throw "DATABASE_URL uses a pooled endpoint; set RESTORE_DATABASE_URL to the direct, unpooled URL for the same database."
  }
  $target = Read-TargetUrl $rawRestoreUrl "RESTORE_DATABASE_URL"
  if ($target.Pooled) {
    throw "RESTORE_DATABASE_URL must use a direct, unpooled endpoint."
  }
  if (
    $target.CanonicalHost -ne $app.CanonicalHost -or
    $target.Port -ne $app.Port -or
    $target.Database.ToLowerInvariant() -ne $app.Database.ToLowerInvariant()
  ) {
    throw "RESTORE_DATABASE_URL does not name the same database as DATABASE_URL."
  }
}

$interactive = [Environment]::UserInteractive -and -not [Console]::IsInputRedirected
if ([string]::IsNullOrEmpty($ConfirmHost)) {
  if (-not $interactive) { throw "Non-interactive restore requires -ConfirmHost." }
  $ConfirmHost = Read-Host "Confirm target host ($($target.CanonicalHost))"
}
if ([string]::IsNullOrEmpty($ConfirmPort)) {
  if (-not $interactive) { throw "Non-interactive restore requires -ConfirmPort." }
  $ConfirmPort = Read-Host "Confirm target port ($($target.Port))"
}
if ([string]::IsNullOrEmpty($ConfirmDatabase)) {
  if (-not $interactive) { throw "Non-interactive restore requires -ConfirmDatabase." }
  $ConfirmDatabase = Read-Host "Confirm target database ($($target.Database))"
}

if (
  $ConfirmHost.Trim().ToLowerInvariant() -ne $target.CanonicalHost -or
  $ConfirmPort.Trim() -ne $target.Port -or
  $ConfirmDatabase.Trim().ToLowerInvariant() -ne $target.Database.ToLowerInvariant()
) {
  throw "The confirmation values do not match the target database identity."
}

if (-not (Test-Path -LiteralPath $File)) {
  throw "Backup file not found: $File"
}

if ($ValidateOnly) {
  Write-Host "Validation complete: $File -> $($target.Database) on $($target.CanonicalHost):$($target.Port)"
  exit 0
}

if (-not $Yes) {
  if (-not $interactive) {
    throw "Non-interactive restore requires -Yes after the target identity confirmations."
  }
  Write-Host "WARNING: this will DESTROY the current contents of '$($target.Database)' on" -ForegroundColor Red
  Write-Host "$($target.CanonicalHost):$($target.Port) and replace it with: $File" -ForegroundColor Red
  $answer = Read-Host "Type YES to confirm"
  if ($answer -ne "YES") {
    Write-Host "Restore cancelled."
    exit 0
  }
}

$pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
if (-not $pgRestore) { throw "pg_restore not found on PATH (install PostgreSQL client tools)" }

$pgArgs = @(
  "--clean", "--if-exists", "--no-owner", "--no-privileges",
  "--exit-on-error", "--single-transaction",
  "--port", $target.Port, "--dbname", $target.Database, $File
)
if ($target.CanonicalHost) { $pgArgs = @("--host", $target.CanonicalHost) + $pgArgs }
if ($target.User) { $pgArgs = @("--username", $target.User) + $pgArgs }

$previousPgPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = $target.Password
  & $pgRestore.Source @pgArgs
  if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE" }
} finally {
  $env:PGPASSWORD = $previousPgPassword
}

Write-Host "Restore complete: $File -> $($target.Database)"
