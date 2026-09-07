<#
.SYNOPSIS
  Restores a School Management System database from a `pg_dump --format=custom`
  backup created by db-backup.ps1.

.DESCRIPTION
  Reads DATABASE_URL from the environment, falling back to the root .env file
  (first non-comment line). Requires pg_restore on PATH. The password is passed
  only via the PGPASSWORD environment variable and is never printed.

  Restore DESTROYS the current contents of the target database: the dump is
  applied with --clean --if-exists (drop existing objects first). A
  confirmation prompt guards against accidental runs; pass -Yes to skip it.

.PARAMETER File
  Path to the .dump file to restore. Required.

.PARAMETER Yes
  Skip the destructive-command confirmation prompt.

.EXAMPLE
  ./scripts/db-restore.ps1 -File backups/school-management-school-20260901-060000.dump
  ./scripts/db-restore.ps1 -File (Get-ChildItem backups | Sort-Object Name -Descending | Select-Object -First 1).FullName -Yes
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$File,
  [switch]$Yes
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path -LiteralPath $File)) {
  throw "Backup file not found: $File"
}

function Resolve-EnvLine([string]$name) {
  $line = Get-Content "$repoRoot\.env" -ErrorAction SilentlyContinue |
    Where-Object { $_ -match "^\s*$name=.*" } | Select-Object -First 1
  if (-not $line) { return "" }
  $value = $line.Substring($line.IndexOf("$name=") + $name.Length + 1).Trim()
  if ($value.Length -ge 2 -and $value[0] -eq '"' -and $value[$value.Length - 1] -eq '"') {
    $value = $value.Substring(1, $value.Length - 2)
  }
  return $value
}

$url = $env:DATABASE_URL
if (-not $url) {
  $url = Resolve-EnvLine "DATABASE_URL"
}
if (-not $url) {
  throw "DATABASE_URL is not set and no DATABASE_URL= line was found in .env"
}

$rest = $url
if ($rest.StartsWith("postgresql://")) { $rest = $rest.Substring("postgresql://".Length) }
elseif ($rest.StartsWith("postgres://")) { $rest = $rest.Substring("postgres://".Length) }
else { throw "DATABASE_URL must start with postgresql:// or postgres://" }

if ($rest.Contains("@")) {
  $at = $rest.LastIndexOf("@")
  $auth = $rest.Substring(0, $at)
  $hostPart = $rest.Substring($at + 1)
} else {
  $auth = ""
  $hostPart = $rest
}

$user = ""
$password = ""
if ($auth -ne "") {
  $colon = $auth.IndexOf(":")
  if ($colon -ge 0) {
    $user = $auth.Substring(0, $colon)
    $password = $auth.Substring($colon + 1)
  } else {
    $user = $auth
  }
}

$slash = $hostPart.IndexOf("/")
if ($slash -ge 0) {
  $hostPort = $hostPart.Substring(0, $slash)
  $database = $hostPart.Substring($slash + 1)
} else {
  $hostPort = $hostPart
  $database = ""
}

$queryIndex = $database.IndexOf("?")
if ($queryIndex -ge 0) { $database = $database.Substring(0, $queryIndex) }

$hostName = $hostPort
$port = "5432"
$hostColon = $hostPort.LastIndexOf(":")
if ($hostColon -ge 0 -and $hostPort.IndexOf("]") -lt 0) {
  $hostName = $hostPort.Substring(0, $hostColon)
  $port = $hostPort.Substring($hostColon + 1)
}

if (-not $database) { throw "DATABASE_URL has no database name" }

$dec = { param($s) if ($s) { [uri]::UnescapeDataString($s) } else { $s } }
$user = & $dec $user
$password = & $dec $password
$database = & $dec $database

if (-not $Yes) {
  Write-Host "WARNING: this will DESTROY the current contents of '$database' on" -ForegroundColor Red
  Write-Host "${hostName}:${port} and replace it with: $File" -ForegroundColor Red
  $answer = Read-Host "Type YES to confirm"
  if ($answer -ne "YES") {
    Write-Host "Restore cancelled."
    exit 0
  }
}

$pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
if (-not $pgRestore) { throw "pg_restore not found on PATH (install PostgreSQL client tools)" }

$previousPgPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = $password
  & $pgRestore.Source --clean --if-exists --no-owner --no-privileges `
    --exit-on-error --host $hostName --port $port --username $user `
    --dbname $database --file $File
  if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE" }
} finally {
  $env:PGPASSWORD = $previousPgPassword
}

Write-Host "Restore complete: $File -> $database"