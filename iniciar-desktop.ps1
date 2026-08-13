$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendRoot = Join-Path $projectRoot "frontend"
$phpExecutable = "C:\xampp\php\php.exe"
$mysqlStarter = "C:\xampp\mysql_start.bat"

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

if (-not (Test-Path -LiteralPath $phpExecutable)) {
    throw "PHP do XAMPP nao encontrado em $phpExecutable."
}

if (-not (Test-LocalPort 3306)) {
    if (-not (Test-Path -LiteralPath $mysqlStarter)) {
        throw "Inicializador do MySQL nao encontrado em $mysqlStarter."
    }
    Start-Process -FilePath $mysqlStarter -WorkingDirectory "C:\xampp" -WindowStyle Hidden
    Wait-LocalPort 3306 20
}

if (-not (Test-LocalPort 8082)) {
    Start-Process `
        -FilePath $phpExecutable `
        -ArgumentList "-S", "127.0.0.1:8082" `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $projectRoot "php-desktop.log") `
        -RedirectStandardError (Join-Path $projectRoot "php-desktop-error.log")
    Wait-LocalPort 8082 15
}

if (-not (Test-Path -LiteralPath (Join-Path $frontendRoot "node_modules"))) {
    throw "Dependencias nao instaladas. Execute npm install dentro da pasta frontend."
}

Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList "run", "desktop:dev" `
    -WorkingDirectory $frontendRoot `
    -WindowStyle Hidden
