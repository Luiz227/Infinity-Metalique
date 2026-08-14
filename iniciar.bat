@echo off
setlocal

REM ==============================================================
REM  Metalique Infinity - inicia o ambiente de desenvolvimento.
REM
REM  O backend Laravel e servido pelo Apache do XAMPP na porta 82.
REM  O frontend Vite roda na porta 5173 e encaminha as APIs ao Apache.
REM ==============================================================
set "PHP_EXE=C:\xampp\php\php.exe"
set "APACHE_START=C:\xampp\apache_start.bat"
set "BACKEND_PORT=82"

REM O Artisan precisa rodar na raiz, onde ficam artisan e .env.
cd /d "%~dp0"

echo.
echo ==========================================
echo   Metalique Infinity
echo ==========================================
echo.

REM --------------------------------------------------------------
REM [1/7] Verifica o PHP do XAMPP.
REM --------------------------------------------------------------
echo [1/7] Procurando o PHP do XAMPP...
if not exist "%PHP_EXE%" (
    echo.
    echo   ERRO: PHP nao encontrado em %PHP_EXE%.
    echo   Ajuste PHP_EXE neste arquivo se o XAMPP estiver em outro local.
    echo.
    pause
    exit /b 1
)
echo       OK

REM --------------------------------------------------------------
REM [2/7] Verifica o MySQL.
REM --------------------------------------------------------------
echo [2/7] Verificando o MySQL na porta 3306...
netstat -an | find ":3306 " | find "LISTENING" >nul
if errorlevel 1 (
    echo.
    echo   ERRO: o MySQL nao esta rodando.
    echo   Inicie o MySQL no painel do XAMPP e tente novamente.
    echo.
    pause
    exit /b 1
)
echo       OK

REM --------------------------------------------------------------
REM [3/7] Verifica o Apache na porta exclusiva deste projeto.
REM --------------------------------------------------------------
echo [3/7] Verificando o Apache na porta %BACKEND_PORT%...
netstat -an | find ":%BACKEND_PORT% " | find "LISTENING" >nul
if not errorlevel 1 goto apache_ready

REM Se a porta 80 esta ativa, o Apache ja esta aberto com configuracao antiga.
netstat -an | find ":80 " | find "LISTENING" >nul
if not errorlevel 1 (
    echo.
    echo   ERRO: o Apache esta ativo na porta 80, mas nao na %BACKEND_PORT%.
    echo   Reinicie o Apache pelo painel do XAMPP para carregar o novo VirtualHost.
    echo.
    pause
    exit /b 1
)

if not exist "%APACHE_START%" (
    echo.
    echo   ERRO: inicializador do Apache nao encontrado em %APACHE_START%.
    echo.
    pause
    exit /b 1
)

echo       Iniciando o Apache do XAMPP...
start "Apache XAMPP" /min cmd /c call "%APACHE_START%"
for /l %%I in (1,1,20) do (
    netstat -an | find ":%BACKEND_PORT% " | find "LISTENING" >nul && goto apache_ready
    timeout /t 1 /nobreak >nul
)

echo.
echo   ERRO: o Apache nao abriu a porta %BACKEND_PORT%.
echo   Confira o painel e os logs do Apache no XAMPP.
echo.
pause
exit /b 1

:apache_ready
echo       OK

REM --------------------------------------------------------------
REM [4/7] Verifica as dependencias do Laravel e o ambiente.
REM --------------------------------------------------------------
echo [4/7] Verificando o Laravel...
if not exist "vendor\autoload.php" (
    echo.
    echo   ERRO: a pasta vendor nao existe. Rode composer install na raiz.
    echo.
    pause
    exit /b 1
)
if not exist ".env" (
    echo.
    echo   ERRO: o arquivo .env nao existe. Execute:
    echo       copy .env.example .env
    echo       "%PHP_EXE%" artisan key:generate
    echo.
    pause
    exit /b 1
)
echo       OK

REM --------------------------------------------------------------
REM [5/7] Aplica migrations pendentes no mesmo banco.
REM --------------------------------------------------------------
echo [5/7] Aplicando migrations do Laravel...
"%PHP_EXE%" artisan migrate --force
if errorlevel 1 (
    echo.
    echo   ERRO: nao foi possivel aplicar as migrations.
    echo   Confira as credenciais DB_* no arquivo .env.
    echo.
    pause
    exit /b 1
)
echo       OK

REM --------------------------------------------------------------
REM [6/7] Verifica as dependencias do frontend.
REM --------------------------------------------------------------
echo [6/7] Verificando o frontend...
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   ERRO: Node.js nao encontrado. Instale-o e tente novamente.
    echo.
    pause
    exit /b 1
)
if not exist "frontend\node_modules" (
    echo       Primeira execucao: instalando os pacotes do frontend...
    pushd frontend
    call npm install
    popd
    if not exist "frontend\node_modules" (
        echo.
        echo   ERRO: o npm install nao concluiu.
        echo.
        pause
        exit /b 1
    )
)
echo       OK

REM --------------------------------------------------------------
REM [7/7] Inicia somente o Vite; o backend ja esta no Apache.
REM --------------------------------------------------------------
echo [7/7] Iniciando o frontend...
start "Frontend Vite - porta 5173" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo       Aguardando o Vite subir...
timeout /t 6 /nobreak >nul
start "" http://127.0.0.1:5173

echo.
echo ==========================================
echo   Pronto.
echo.
echo   Sistema:  http://127.0.0.1:5173
echo   Backend:  http://127.0.0.1:%BACKEND_PORT%
echo.
echo   O backend usa o Apache do XAMPP.
echo   Para encerrar o frontend, feche a janela do Vite.
echo   O Apache e o MySQL continuam controlados pelo XAMPP.
echo ==========================================
echo.
pause
endlocal
