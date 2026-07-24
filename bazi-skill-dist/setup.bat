@echo off
chcp 65001 > nul
REM 八字 + 紫微斗数 命理 Skill - Windows 安装脚本
REM 自动检测 Claude Code / Codex CLI / OpenCode 并安装
REM Mac/Linux 用户请用 setup.sh

setlocal enabledelayedexpansion

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "SKILL_NAME=bazi-ziwei-mingli"

echo ==========================================
echo  八字 + 紫微斗数 命理 Skill - Windows 安装
echo ==========================================
echo.

REM ====== 检测已安装的 AI Agent ======
set "TARGETS_COUNT=0"
set "TARGET_1="
set "TARGET_2="
set "TARGET_3="
set "LABEL_1="
set "LABEL_2="
set "LABEL_3="

REM Claude Code
if exist "%USERPROFILE%\.claude" (
    set /a TARGETS_COUNT+=1
    set "TARGET_!TARGETS_COUNT!=%USERPROFILE%\.claude\skills"
    set "LABEL_!TARGETS_COUNT!=Claude Code (~/.claude/skills/)"
)

REM Codex CLI
if exist "%USERPROFILE%\.agents" (
    set /a TARGETS_COUNT+=1
    set "TARGET_!TARGETS_COUNT!=%USERPROFILE%\.agents\skills"
    set "LABEL_!TARGETS_COUNT!=Codex CLI (~/.agents/skills/)"
)

REM OpenCode
if exist "%USERPROFILE%\.config\opencode" (
    set /a TARGETS_COUNT+=1
    set "TARGET_!TARGETS_COUNT!=%USERPROFILE%\.config\opencode\skills"
    set "LABEL_!TARGETS_COUNT!=OpenCode (~/.config/opencode/skills/)"
)

REM 默认 Claude Code
if "!TARGETS_COUNT!"=="0" (
    set "TARGETS_COUNT=1"
    set "TARGET_1=%USERPROFILE%\.claude\skills"
    set "LABEL_1=Claude Code (~/.claude/skills/) [默认]"
    echo 未检测到已安装的 AI Agent 工具，默认装到 Claude Code 路径。
    echo.
)

echo 检测到以下 AI Agent 工具：
for /L %%i in (1,1,!TARGETS_COUNT!) do (
    echo   %%i. !LABEL_%%i!
)
echo.
echo 选择安装模式：
echo   1) Level 1: 轻量模式（推荐，零依赖）
echo   2) Level 2: 高级模式（含 LightRAG 知识图谱）
echo.
set /p mode="选择 [1/2]: "

REM ====== Level 1: 装到所有检测到的工具 ======
echo.
echo [1/3] 复制 skill 到所有检测到的工具

for /L %%i in (1,1,!TARGETS_COUNT!) do (
    set "TARGET_DIR=!TARGET_%%i!"
    set "TARGET_PATH=!TARGET_DIR!\%SKILL_NAME%"
    if not exist "!TARGET_DIR!" mkdir "!TARGET_DIR!"
    if exist "!TARGET_PATH!" (
        echo    !TARGET_PATH! 已存在，备份为 .bak
        if exist "!TARGET_PATH!.bak" rmdir /s /q "!TARGET_PATH!.bak" 2>nul
        move /y "!TARGET_PATH!" "!TARGET_PATH!.bak" > nul
    )
    xcopy "%SCRIPT_DIR%" "!TARGET_PATH!\" /E /I /Q /Y > nul
    if !errorlevel! neq 0 (
        echo    ERROR: 复制到 !TARGET_PATH! 失败
        exit /b 1
    )
    echo    已复制: !TARGET_PATH!
)

echo.
echo [2/3] 验证安装
for /L %%i in (1,1,!TARGETS_COUNT!) do (
    set "TARGET_DIR=!TARGET_%%i!"
    if exist "!TARGET_DIR!\%SKILL_NAME%\SKILL.md" (
        echo    [OK] !TARGET_DIR!\%SKILL_NAME%\SKILL.md
    ) else (
        echo    [FAIL] !TARGET_DIR!\%SKILL_NAME%\SKILL.md
        exit /b 1
    )
)

if "%mode%"=="1" (
    echo.
    echo [3/3] Level 1 安装完成
    echo.
    echo 重启你的 AI Agent 后，在对话中说：
    echo   ^> 帮我排八字 阳历 1990年5月15日 上午10点 男 北京
    echo   ^> 帮我看 2026 年的流年流月
    echo.
    pause
    exit /b 0
)

REM ====== Level 2: LightRAG ======
echo.
echo [3/5] 检查 LightRAG 依赖

where uv > nul 2>&1
if %errorlevel% neq 0 (
    echo    ERROR: uv 未安装
    echo    请先安装: powershell -c "irm https://astral.sh/uv/install.ps1 ^| iex"
    exit /b 1
)
echo    [OK] uv 已安装

where python3.12 > nul 2>&1
if %errorlevel% neq 0 (
    where py > nul 2>&1
    if %errorlevel% neq 0 (
        echo    [WARNING] 未找到 Python 3.12
        echo    knowledge-mcp 仅支持 Python 3.12.x
        echo    安装方式: uv python install 3.12
    )
)

echo.
echo [4/5] 安装 knowledge-mcp
uv tool list 2>nul | findstr /C:"knowledge-mcp" > nul
if %errorlevel% neq 0 (
    uv tool install knowledge-mcp
    echo    [OK] knowledge-mcp 已安装
) else (
    echo    [OK] knowledge-mcp 已存在
)

echo.
echo [5/5] 注入知识图谱
echo.
echo 请先确认配置已就绪：
echo   %USERPROFILE%\knowledge-bases\.env 含 LLM_API_KEY=xxx
echo   %USERPROFILE%\knowledge-bases\config.yaml 已配置好
echo.
set /p confirm="配置已就绪，开始注入？[y/N]: "

if /i "%confirm%"=="y" (
    cd /d "%SCRIPT_DIR%\scripts"
    python inject_kg.py
    echo.
    echo Level 2 安装完成
    echo 知识库位置: %USERPROFILE%\knowledge-bases\kbs\bazi-mingli
)

pause
endlocal
