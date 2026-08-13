@echo off
setlocal

REM ==============================================================
REM  Metalique Infinity - inicia o ambiente de desenvolvimento.
REM
REM  Sobe o backend PHP (porta 8082) e o frontend Vite (porta 5173)
REM  em duas janelas separadas e abre o navegador.
REM
REM  Se o seu XAMPP nao estiver em C:\xampp, altere a linha abaixo.
REM ==============================================================
set "PHP_EXE=C:\xampp\php\php.exe"

REM Volta para a pasta deste arquivo. O backend PRECISA rodar a
REM partir da raiz do projeto: o Vite faz proxy do prefixo /backend.
cd /d "%~dp0"

echo.
echo ==========================================
echo   Metalique Infinity
echo ==========================================
echo.

REM --------------------------------------------------------------
REM [1/4] O PHP do XAMPP esta no lugar esperado?
REM --------------------------------------------------------------
echo [1/4] Procurando o PHP do XAMPP...
if not exist "%PHP_EXE%" (
    echo.
    echo   ERRO: PHP nao encontrado em:
    echo   %PHP_EXE%
    echo.
    echo   Instale o XAMPP em C:\xampp, ou abra este arquivo em um
    echo   editor de texto e corrija o caminho na variavel PHP_EXE.
    echo.
    pause
    exit /b 1
)
echo       OK

REM --------------------------------------------------------------
REM [2/4] O MySQL esta rodando na porta 3306?
REM --------------------------------------------------------------
echo [2/4] Verificando o MySQL na porta 3306...
netstat -an | find ":3306" | find "LISTENING" >nul
if errorlevel 1 (
    echo.
    echo   ERRO: o MySQL nao esta rodando.
    echo.
    echo   Abra o painel de controle do XAMPP e clique em "Start"
    echo   na linha do MySQL. Depois execute este arquivo de novo.
    echo.
    pause
    exit /b 1
)
echo       OK

REM --------------------------------------------------------------
REM [3/4] As dependencias do frontend estao instaladas?
REM --------------------------------------------------------------
echo [3/4] Verificando as dependencias do frontend...
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo   ERRO: Node.js nao encontrado.
    echo.
    echo   Instale o Node.js em https://nodejs.org e execute
    echo   este arquivo de novo.
    echo.
    pause
    exit /b 1
)
if not exist "frontend\node_modules" (
    echo       Primeira execucao: instalando os pacotes com npm install.
    echo       Isso pode demorar alguns minutos. Aguarde.
    echo.
    pushd frontend
    call npm install
    popd
    if not exist "frontend\node_modules" (
        echo.
        echo   ERRO: o npm install nao concluiu.
        echo   Verifique as mensagens acima e tente de novo.
        echo.
        pause
        exit /b 1
    )
)
echo       OK

REM --------------------------------------------------------------
REM [4/4] Sobe os dois servidores em janelas separadas.
REM --------------------------------------------------------------
echo [4/4] Iniciando os servidores...

start "Backend PHP - porta 8082" cmd /k ""%PHP_EXE%" -S 127.0.0.1:8082"
start "Frontend Vite - porta 5173" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo       Aguardando o Vite subir...
timeout /t 6 /nobreak >nul
start "" http://127.0.0.1:5173

echo.
echo ==========================================
echo   Pronto.
echo.
echo   Sistema:  http://127.0.0.1:5173
echo   Backend:  http://127.0.0.1:8082
echo.
echo   Duas janelas foram abertas:
echo     - "Backend PHP - porta 8082"
echo     - "Frontend Vite - porta 5173"
echo.
echo   Para encerrar o sistema, feche as duas janelas.
echo ==========================================
echo.
pause
endlocal
