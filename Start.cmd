@echo off
setlocal EnableExtensions DisableDelayedExpansion
cd /d "%~dp0"

where py.exe >nul 2>&1
if errorlevel 1 goto try_python
py -3 -c "import sys; sys.exit(sys.version_info < (3, 8))" >nul 2>&1
if errorlevel 1 goto try_python
py -3 "%~dp0server.py" %*
goto finished

:try_python
where python.exe >nul 2>&1
if errorlevel 1 goto try_fixed
python -c "import sys; sys.exit(sys.version_info < (3, 8))" >nul 2>&1
if errorlevel 1 goto try_fixed
python "%~dp0server.py" %*
goto finished

:try_fixed
if not exist "C:\Python313\python.exe" goto missing_python
"C:\Python313\python.exe" "%~dp0server.py" %*
goto finished

:missing_python
echo Python 3.8 or newer was not found. Install Python and try again.
pause
exit /b 1

:finished
set "rayneo_exit_code=%errorlevel%"
if "%rayneo_exit_code%"=="0" exit /b 0
echo The installer server stopped with an error. See the message above.
pause
exit /b %rayneo_exit_code%
