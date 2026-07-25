@echo off
REM serve-lightrag.bat - Windows 版:一键起 LightRAG server + 灌 merged.json 索引
REM
REM 用途:熟人内测期间给后端喂真实 RAG,让 /four-school 和 /dayun-full 有古籍引证。
REM
REM 用法:
REM   cd bazi-skill-dist
REM   set OPENAI_API_KEY=sk-xxx
REM   scripts\serve-lightrag.bat
REM
REM 依赖:
REM   - docker(镜像 ghcr.io/hkuds/lightrag:latest)
REM   - python(若装了 uv 则优先用 uv run;否则直接 python)
REM
REM 副作用:
REM   - 创建 lightrag-data\ 目录,挂载到 docker /app/data/bazi_kg
REM   - 灌 45895 entities + 108184 relations
REM   - 启动容器 lightrag-bazi,占用 9621

setlocal EnableDelayedExpansion

REM ---------- 默认值 ----------
set SCRIPT_DIR=%~dp0
set BAZI_DIST_DIR=%SCRIPT_DIR%..
set KG_DATA_DIR=%KG_DATA_DIR%
if "%KG_DATA_DIR%"=="" set KG_DATA_DIR=%BAZI_DIST_DIR%\lightrag-data
set MERGED_PATH=%MERGED_PATH%
if "%MERGED_PATH%"=="" set MERGED_PATH=%BAZI_DIST_DIR%\lightrag\merged.json
set CONTAINER_NAME=lightrag-bazi
set PORT=9621
set RESET=0
set INJECT_ONLY=0

REM ---------- 参数解析 ----------
:parse_args
if "%~1"=="" goto after_args
if /i "%~1"=="--reset" set RESET=1
if /i "%~1"=="--inject-only" set INJECT_ONLY=1
if /i "%~1"=="--help" goto help
if /i "%~1"=="-h" goto help
shift
goto parse_args

:after_args
REM ---------- 前置检查 ----------
if "%INJECT_ONLY%"=="0" (
    docker --version >nul 2>&1
    if errorlevel 1 (
        echo ERROR: docker 未安装。装 docker 后再跑,或用 --inject-only。
        exit /b 1
    )
)

where python >nul 2>&1
if errorlevel 1 (
    where python3 >nul 2>&1
    if errorlevel 1 (
        echo ERROR: 需要 python 或 python3。
        exit /b 1
    )
)

if not exist "%MERGED_PATH%" (
    echo ERROR: 找不到 %MERGED_PATH%
    exit /b 1
)

REM ---------- 起 docker ----------
if "%INJECT_ONLY%"=="0" (
    if "%RESET%"=="1" (
        if exist "%KG_DATA_DIR%" (
            echo [reset] 删除 %KG_DATA_DIR%
            rmdir /s /q "%KG_DATA_DIR%"
        )
    )
    if not exist "%KG_DATA_DIR%" mkdir "%KG_DATA_DIR%"

    REM 复用 / 起容器
    docker ps -a --format "{{.Names}}" | findstr /b /c:"%CONTAINER_NAME%" >nul 2>&1
    if not errorlevel 1 (
        echo [docker] 容器 %CONTAINER_NAME% 已存在,启动它
        docker start %CONTAINER_NAME% >nul
    ) else (
        if "%OPENAI_API_KEY%"=="" (
            echo ERROR: 请先 set OPENAI_API_KEY=sk-...
            exit /b 1
        )
        echo [docker] 拉镜像 + 起容器 %CONTAINER_NAME%
        docker run -d ^
            --name %CONTAINER_NAME% ^
            -p %PORT%:9621 ^
            -e OPENAI_API_KEY=%OPENAI_API_KEY% ^
            -e WORKING_DIR=/app/data/bazi_kg ^
            -v "%KG_DATA_DIR%:/app/data/bazi_kg" ^
            ghcr.io/hkuds/lightrag:latest
    )

    REM 等 health
    echo [docker] 等 /health ...
    set /a i=0
    :wait_loop
    set /a i+=1
    curl -sf "http://127.0.0.1:%PORT%/health" >nul 2>&1
    if not errorlevel 1 (
        echo [docker] LightRAG ready at http://127.0.0.1:%PORT%
        goto inject
    )
    if !i! geq 30 (
        echo ERROR: 30s 内未就绪,查 docker logs %CONTAINER_NAME%
        exit /b 1
    )
    timeout /t 1 /nobreak >nul
    goto wait_loop
)

:inject
REM ---------- 灌 merged.json ----------
echo [inject] 灌 %MERGED_PATH% ^> %KG_DATA_DIR%
cd /d "%BAZI_DIST_DIR%"
set BAZI_KB_DIR=%KG_DATA_DIR%
set BAZI_MERGED_PATH=%MERGED_PATH%

where uv >nul 2>&1
if not errorlevel 1 (
    uv run python scripts\inject_kg.py
) else (
    python scripts\inject_kg.py
)

echo.
echo === LightRAG 已就绪 ===
echo   HTTP:    http://127.0.0.1:%PORT%
echo   数据目录: %KG_DATA_DIR%
echo   测试:    curl -X POST http://127.0.0.1:%PORT%/query -H "Content-Type: application/json" -d "{\"query\":\"子平真诠 甲木\",\"mode\":\"mix\",\"top_k\":3}"
echo.
echo 后端 .env 需设: LIGHTRAG_URL=http://127.0.0.1:%PORT%
exit /b 0

:help
echo 用法: set OPENAI_API_KEY=sk-xxx ^&^& %~nx0 [--reset] [--inject-only]
echo   --reset         清空 %KG_DATA_DIR% 后重建
echo   --inject-only   不起 docker,只灌索引(假设 server 已在 9621 跑)
exit /b 0