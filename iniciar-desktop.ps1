$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendRoot = Join-Path $projectRoot "frontend"
$mysqlStarter = "C:\xampp\mysql_start.bat"

$phpCandidates = @("C:\xampp\php\php.exe", "C:\php\php.exe")
$phpExecutable = $null
foreach ($candidate in $phpCandidates) {
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    $version = & $candidate -r "echo PHP_MAJOR_VERSION.'.'.PHP_MINOR_VERSION;"
    if ([version]$version -ge [version]"8.3") {
        $phpExecutable = $candidate
        break
    }
}

function Test-LocalPort([int]$Port) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $client.Connect("127.0.0.1", $Port)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

function Wait-LocalPort([int]$Port, [int]$TimeoutSeconds) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        if (Test-LocalPort $Port) { return }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)

    throw "O servico da porta $Port nao iniciou dentro do tempo esperado."
}

if (-not $phpExecutable -or -not (Test-Path -LiteralPath $phpExecutable)) {
    throw "PHP 8.3 ou superior nao encontrado. Instale uma versao compativel para executar o Laravel."
}

$phpOptions = @()
foreach ($extension in @("openssl", "curl", "mbstring", "fileinfo", "pdo_mysql", "zip")) {
    & $phpExecutable -r "exit(extension_loaded('$extension') ? 0 : 1);"
    if ($LASTEXITCODE -ne 0) {
        $phpOptions += @("-d", "extension=$extension")
    }
}

if (-not (Test-LocalPort 3306)) {
    if (-not (Test-Path -LiteralPath $mysqlStarter)) {
        throw "Inicializador do MySQL nao encontrado em $mysqlStarter."
    }
    Start-Process -FilePath $mysqlStarter -WorkingDirectory "C:\xampp" -WindowStyle Hidden
    Wait-LocalPort 3306 20
}

if (-not (Test-LocalPort 82)) {
    Start-Process `
        -FilePath $phpExecutable `
        -ArgumentList ($phpOptions + @("-S", "127.0.0.1:82", "server.php")) `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $projectRoot "laravel-desktop.log") `
        -RedirectStandardError (Join-Path $projectRoot "laravel-desktop-error.log")
    Wait-LocalPort 82 20
}

& $phpExecutable @phpOptions (Join-Path $projectRoot "artisan") migrate --force
if ($LASTEXITCODE -ne 0) {
    throw "Nao foi possivel aplicar as migrations do Laravel."
}

if (-not (Test-Path -LiteralPath (Join-Path $frontendRoot "node_modules"))) {
    throw "Dependencias nao instaladas. Execute npm install dentro da pasta frontend."
}

if (-not (Test-LocalPort 5173)) {
    Start-Process `
        -FilePath "npm.cmd" `
        -ArgumentList "run", "dev" `
        -WorkingDirectory $frontendRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $projectRoot "vite-desktop.log") `
        -RedirectStandardError (Join-Path $projectRoot "vite-desktop-error.log")
    Wait-LocalPort 5173 30
}

$installedDesktop = Join-Path $env:LOCALAPPDATA "Programs\Metalique Infinity\Metalique Infinity.exe"
if (Test-Path -LiteralPath $installedDesktop) {
    Start-Process -FilePath $installedDesktop
}
else {
    Start-Process `
        -FilePath "npm.cmd" `
        -ArgumentList "run", "desktop" `
        -WorkingDirectory $frontendRoot `
        -WindowStyle Hidden
}
