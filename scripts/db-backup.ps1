<#
.SYNOPSIS
  Backs up the School Management System PostgreSQL database to a timestamped
  custom-format dump and prunes old backups.

.DESCRIPTION
  Reads DATABASE_URL from the environment, falling back to the root .env file
  (first non-comment line). Requires pg_dump on PATH (PostgreSQL client tools).
  The password is passed only via the PGPASSWORD environment variable for the
  pg_dump child process and is never printed.

.PARAMETER OutDir
  Directory to write dumps into. Defaults to "backups" relative to the repo
  root when run from anywhere.

.PARAMETER Retain
  Number of most recent dumps to keep. Older files matching the dump prefix in
  OutDir are deleted. Defaults to 14.

.EXAMPLE
  ./scripts/db-backup.ps1
  ./scripts/db-backup.ps1 -OutDir "C:\ops\db-backups" -Retain 30
#>
[CmdletBinding()]
param(
  [string]$OutDir = "backups",
  [int]$Retain = 14
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

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

function New-DbUrl {
  $url = $env:DATABASE_URL
  if (-not $url) {
    $url = Resolve-EnvLine "DATABASE_URL"
  }
  if (-not $url) {
    throw "DATABASE_URL is not set and no DATABASE_URL= line was found in .env"
  }

  $rest = $url
  $prefix = "postgres://"
  if ($rest.StartsWith("postgresql://")) { $rest = $rest.Substring("postgresql://".Length); $prefix = "postgresql://" }
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
  return @{
    User = & $dec $user
    Password = & $dec $password
    Host = $hostName
    Port = $port
    Database = $database
  }
}

$db = New-DbUrl

# Password must never be echoed; PGPASSWORD is scoped to this process for pg_dump.
$previousPgPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = $db.Password

  $pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
  if (-not $pgDump) { throw "pg_dump not found on PATH (install PostgreSQL client tools)" }

  $outDir = if ([System.IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $repoRoot $OutDir }
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $file = Join-Path $outDir ("school-management-{0}-{1}.dump" -f $db.Database, $stamp)

  & $pgDump.Source --format=custom --no-owner --no-privileges `
    --host $db.Host --port $db.Port --username $db.User `
    --dbname $db.Database --file $file
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }

  $size = (Get-Item $file).Length
  Write-Host "Backup written: $file ($([math]::Round($size / 1KB, 1)) KB)"
} catch {
  if ($file -and (Test-Path -LiteralPath $file)) { Remove-Item -LiteralPath $file -Force }
  throw
} finally {
  $env:PGPASSWORD = $previousPgPassword
}

# Retention: keep the newest $Retain dumps for this database.
$prefix = "school-management-$($db.Database)-"
$stale = Get-ChildItem -LiteralPath $outDir -Filter "$prefix*.dump" -File |
  Sort-Object Name -Descending | Select-Object -Skip $Retain
foreach ($old in $stale) {
  Remove-Item -LiteralPath $old.FullName -Force
  Write-Host "Pruned: $($old.Name)"
}