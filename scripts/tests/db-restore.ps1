$ErrorActionPreference = "Stop"

$restoreScript = Join-Path (Split-Path -Parent $PSScriptRoot) "db-restore.ps1"
$executable = if ($PSVersionTable.PSEdition -eq "Core") {
  Join-Path $PSHOME "pwsh"
} else {
  Join-Path $PSHOME "powershell.exe"
}
$backup = [IO.Path]::GetTempFileName()
$argsFile = [IO.Path]::GetTempFileName()
$fakeBin = Join-Path ([IO.Path]::GetTempPath()) ("sms-fake-pg-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $fakeBin | Out-Null
$runningOnWindows = [Environment]::OSVersion.Platform -eq [PlatformID]::Win32NT
if ($runningOnWindows) {
  $fakePgRestore = Join-Path $fakeBin "pg_restore.cmd"
  $fakeScript = "@echo off`r`n:loop`r`nif `"%~1`"==`"`" goto end`r`necho %~1>>`"%PG_RESTORE_ARGS_FILE%`"`r`nshift`r`ngoto loop`r`n:end`r`n"
} else {
  $fakePgRestore = Join-Path $fakeBin "pg_restore"
  $fakeScript = "#!/usr/bin/env bash`nprintf '%s\n' `"`$@`" > `"`$PG_RESTORE_ARGS_FILE`"`nexit 0`n"
}
[IO.File]::WriteAllText($fakePgRestore, $fakeScript)
if (-not $runningOnWindows) {
  & chmod +x $fakePgRestore
  if ($LASTEXITCODE -ne 0) { throw "failed to make the fake pg_restore executable" }
}
$failures = 0

function Invoke-Restore([string[]]$Arguments) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $executable -NoProfile -NonInteractive -File $restoreScript @Arguments 2>&1 | Out-String
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
  } finally {
    $ErrorActionPreference = $previous
  }
}

function Assert-Exit([string]$name, $result, [int]$expected, [string]$messagePattern = "") {
  if ($result.ExitCode -ne $expected) {
    Write-Host "FAIL ${name}: expected exit $expected, got $($result.ExitCode)"
    Write-Host $result.Output
    $script:failures += 1
    return
  }
  if ($messagePattern -ne "" -and $result.Output -notmatch $messagePattern) {
    Write-Host "FAIL ${name}: output did not match '$messagePattern'"
    Write-Host $result.Output
    $script:failures += 1
    return
  }
  if ($result.Output -match "secret-password") {
    Write-Host "FAIL ${name}: output leaked a password"
    $script:failures += 1
    return
  }
  Write-Host "PASS $name"
}

function Reset-Environment() {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:RESTORE_DATABASE_URL -ErrorAction SilentlyContinue
}

try {
  Reset-Environment
  Assert-Exit "missing DATABASE_URL" (Invoke-Restore @("-File", $backup, "-ValidateOnly")) 1 "DATABASE_URL is not set"

  $env:DATABASE_URL = "postgresql://school:secret-password@127.0.0.1:5433"
  Assert-Exit "missing database name" (Invoke-Restore @(
    "-File", $backup, "-ValidateOnly",
    "-ConfirmHost", "127.0.0.1", "-ConfirmPort", "5433",
    "-ConfirmDatabase", "school_management"
  )) 1 "no database name"

  $env:DATABASE_URL = "postgresql:///school_management"
  Assert-Exit "empty host" (Invoke-Restore @("-File", $backup, "-ValidateOnly")) 1 "has no host"

  $env:DATABASE_URL = "postgresql://school:secret-password@127.0.0.1:5433/school_management"
  Assert-Exit "local validate-only" (Invoke-Restore @(
    "-File", $backup, "-ValidateOnly",
    "-ConfirmHost", "127.0.0.1", "-ConfirmPort", "5433",
    "-ConfirmDatabase", "school_management"
  )) 0 "Validation complete"
  Assert-Exit "wrong host" (Invoke-Restore @(
    "-File", $backup, "-ValidateOnly",
    "-ConfirmHost", "localhost", "-ConfirmPort", "5433",
    "-ConfirmDatabase", "school_management"
  )) 1 "do not match"
  Assert-Exit "wrong port" (Invoke-Restore @(
    "-File", $backup, "-ValidateOnly",
    "-ConfirmHost", "127.0.0.1", "-ConfirmPort", "5432",
    "-ConfirmDatabase", "school_management"
  )) 1 "do not match"
  Assert-Exit "wrong database" (Invoke-Restore @(
    "-File", $backup, "-ValidateOnly",
    "-ConfirmHost", "127.0.0.1", "-ConfirmPort", "5433",
    "-ConfirmDatabase", "other_database"
  )) 1 "do not match"
  Assert-Exit "missing confirmations" (Invoke-Restore @("-File", $backup, "-ValidateOnly")) 1 "Non-interactive"

  $env:DATABASE_URL = "postgresql://school:secret-password@[::1]:5433/school_management"
  Assert-Exit "bracketed IPv6" (Invoke-Restore @(
    "-File", $backup, "-ValidateOnly",
    "-ConfirmHost", "::1", "-ConfirmPort", "5433",
    "-ConfirmDatabase", "school_management"
  )) 0 "Validation complete"

  $env:DATABASE_URL = "postgresql:///school_management?host=/var/run/postgresql"
  Assert-Exit "socket host query parameter" (Invoke-Restore @(
    "-File", $backup, "-ValidateOnly",
    "-ConfirmHost", "/var/run/postgresql", "-ConfirmPort", "5432",
    "-ConfirmDatabase", "school_management"
  )) 0 "Validation complete"

  $env:DATABASE_URL = "postgresql://school:secret-password@ep-quiet-lab-pooler.neon.tech/neondb"
  Assert-Exit "pooled without direct URL" (Invoke-Restore @(
    "-File", $backup, "-ValidateOnly",
    "-ConfirmHost", "ep-quiet-lab.neon.tech", "-ConfirmPort", "5432",
    "-ConfirmDatabase", "neondb"
  )) 1 "RESTORE_DATABASE_URL"

  $env:RESTORE_DATABASE_URL = "postgresql://school:secret-password@ep-quiet-lab.neon.tech/neondb"
  Assert-Exit "pooled with equivalent direct URL" (Invoke-Restore @(
    "-File", $backup, "-ValidateOnly",
    "-ConfirmHost", "ep-quiet-lab.neon.tech", "-ConfirmPort", "5432",
    "-ConfirmDatabase", "neondb"
  )) 0 "Validation complete"

  $env:RESTORE_DATABASE_URL = "postgresql://school:secret-password@ep-quiet-lab.neon.tech/other"
  Assert-Exit "pooled with different database" (Invoke-Restore @(
    "-File", $backup, "-ValidateOnly",
    "-ConfirmHost", "ep-quiet-lab.neon.tech", "-ConfirmPort", "5432",
    "-ConfirmDatabase", "neondb"
  )) 1 "does not name the same database"

  $env:PATH = "$fakeBin$([IO.Path]::PathSeparator)$env:PATH"
  $env:PG_RESTORE_ARGS_FILE = $argsFile
  $env:DATABASE_URL = "postgresql://school:secret-password@127.0.0.1:5433/school_management"
  Assert-Exit "local restore invocation" (Invoke-Restore @(
    "-File", $backup, "-Yes",
    "-ConfirmHost", "127.0.0.1", "-ConfirmPort", "5433",
    "-ConfirmDatabase", "school_management"
  )) 0 "Restore complete"
  $recorded = @(Get-Content -LiteralPath $argsFile)
  foreach ($required in @("--single-transaction", "--exit-on-error", "--dbname", $backup)) {
    if ($recorded -notcontains $required) {
      Write-Host "FAIL local restore invocation: missing argument '$required'"
      $failures += 1
    }
  }
  if ($recorded -contains "--file") {
    Write-Host "FAIL local restore invocation: invalid --file input option was passed to pg_restore"
    $failures += 1
  }
  if (($recorded -join "`n") -match "secret-password") {
    Write-Host "FAIL local restore invocation: password was passed in pg_restore arguments"
    $failures += 1
  }

  $env:DATABASE_URL = "postgresql://school:secret-password@[::1]:5433/school_management"
  Assert-Exit "IPv6 restore invocation" (Invoke-Restore @(
    "-File", $backup, "-Yes",
    "-ConfirmHost", "::1", "-ConfirmPort", "5433",
    "-ConfirmDatabase", "school_management"
  )) 0 "Restore complete"
  $recorded = @(Get-Content -LiteralPath $argsFile)
  if ($recorded -notcontains "::1") {
    Write-Host "FAIL IPv6 restore invocation: pg_restore did not receive the canonical IPv6 host"
    $failures += 1
  }

  if ($failures -ne 0) {
    throw "$failures db-restore.ps1 behavior test(s) failed"
  }
  Write-Host "All db-restore.ps1 behavior tests passed"
} finally {
  Reset-Environment
  Remove-Item Env:PG_RESTORE_ARGS_FILE -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $backup -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $argsFile -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $fakeBin -Recurse -Force -ErrorAction SilentlyContinue
}
