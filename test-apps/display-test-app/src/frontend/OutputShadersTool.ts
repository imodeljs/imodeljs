/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DebugShaderFile, IModelApp, NotifyMessageDetails, OutputMessagePriority, Tool } from "@bentley/imodeljs-frontend";
import { DtaRpcInterface } from "../common/DtaRpcInterface";

// cspell:disable

const makeShadeBat = `

@echo off
rem Compiles *VS.hlsl and *FS.hlsl to .h  Also Outputs _WarningsList.txt, _ErrorFileList.txt, and _StatsList.txt
rem /Zi param is sometimes useful (see fxc /?)
rem asm reference https://docs.microsoft.com/en-us/windows/win32/direct3dhlsl/dx-graphics-hlsl-sm4-asm

echo:List of files with errors:> _ErrorFileList.txt
echo:> _WarningsList.txt
echo:> _StatsList.txt
set _temps=0
set _instr=0
set _fname=""
set /a "_totVert=0"
set /a "_errVert=0"
set /a "_tempsVert=0"
set /a "_instrVert=0"
set /a "_totFrag=0"
set /a "_errFrag=0"
set /a "_tempsFrag=0"
set /a "_instrFrag=0"
set /a "_tempsTot=0"
set /a "_instrTot=0"
set /a "_errTot=0"

rem find path to use for fxc.exe
set fxcPath=""
call :GetWin10SdkDir
if not exist %fxcPath% (
  echo: Error: fxc.exe not found on this machine, aborting
  echo: Is a Windows 10 SDK installed?
  exit /B 1
)
call :SetFxcShort %fxcPath%
echo:Using fxc.exe found at: %fxcPath%
echo:
%fxcshort%  /? | findstr Direct3D
echo:

setlocal enableDelayedExpansion
rem compile vertex shaders
rem qqq for /F %%G in ('dir *VS.hlsl /ON/B') do call :MakeVS4 %%G %1 %2 %3 %4
if exist _TmpBldCmds.txt del _TmpBldCmds.txt
echo:Prepping VS compile commands...
call :BuildVSCmdList
set _totShaders=%_totVert%
echo:Starting parallel VS compiles of %_totVert% shaders...
call :RunCmdsParallel
echo:Processing VS results...
call :CalcStats VS
set _errVert=%_errTot%
set _tempsVert=%_tempsTot%
set _instrVert=%_instrTot%

rem compile fragment shaders
set /a "_tempsTot=0"
set /a "_instrTot=0"
set /a "_errTot=0"
if exist _TmpBldCmds.txt del _TmpBldCmds.txt
echo:Prepping FS compile commands...
call :BuildFSCmdList
set _totShaders=%_totFrag%
echo:Starting parallel FS compiles of %_totFrag% shaders...
call :RunCmdsParallel
echo:Processing FS results...
call :CalcStats FS
set _errFrag=%_errTot%
set _tempsFrag=%_tempsTot%
set _instrFrag=%_instrTot%

call :OutputResults
echo:  See _ErrorFileList.txt for details, see _WarningsList.txt for any warnings or errors
call :OutputResults >> _ErrorFileList.txt
echo:  See _WarningsList.txt for any warnings or errors>> _ErrorFileList.txt
call :OutputResults >> _StatsList.txt
echo:  See _WarningsList.txt for any warnings or errors>> _StatsList.txt

endlocal
rem call :CleanupALL
goto :EOF

:CleanupALL
set _totVert=
set _errVert=
set _tempsVert=
set _instrVert=
set _totVert=
set _totFrag=
set _errFrag=
set _tempsFrag=
set _instrFrag=
set _temps=
set _instr=
set _fname=
set _totShaders=
set _tempsTot=
goto :EOF

:SetFxcShort
rem - Get short filename version of path
set fxcShort=%~s1
goto :EOF

:BuildVSCmdList
for /F %%G in ('dir *VS.hlsl /ON/B') do (
    set /a "_totVert=_totVert+1"
    if exist %%~nG.h del %%~nG.h
    echo %%~nG;%fxcshort% /nologo %1 %2 %3 %4 /T vs_4_0 /E main /Fc %%~nG.h %%~nG.hlsl>> _TmpBldCmds.txt
)
goto :EOF

:BuildFSCmdList
for /F %%G in ('dir *FS.hlsl /ON/B') do (
    set /a "_totFrag=_totFrag+1"
    if exist %%~nG.h del %%~nG.h
    echo %%~nG;%fxcshort% /nologo %1 %2 %3 %4 /T ps_4_0 /E main /Fc %%~nG.h %%~nG.hlsl>> _TmpBldCmds.txt
)
goto :EOF
rem to get preprocessor output (mainly indenting, and minus any defines) use something like this separately:
rem %fxcshort% /nologo /E main /P listings\\%%~nG.hlsl %%~nG.hlsl


:CalcStats
dir *%1.h /ON/B > _TmpBldCmds.txt
for /F "tokens=1-5 delims=: " %%G in ('findstr /F:_TmpBldCmds.txt "instruction dcl_temps"') do (
  if "%%~nG" NEQ "!_fname!" (
    set "_temps=   "
    set _instr=
    set _fname=%%~nG
  )
  if "%%H" EQU "dcl_temps" set _temps=    %%I
  if "%%K" EQU "instruction" (
    set _instr=    %%J
    set _temps=!_temps:~-3!
    set _instr=!_instr:~-4!
    rem echo:  !_temps! regs  !_instr! instructions  !_fname!
    echo:  !_temps! regs  !_instr! instructions  !_fname!>> _StatsList.txt
    set /a "_tempsTot=_tempsTot+_temps"
    set /a "_instrTot=_instrTot+_instr"
  )
)
del _TmpBldCmds.txt
for /F %%G in ('dir *%1.hlsl /ON/B') do (
  if not exist %%~nG.h (
  set /a "_errTot=_errTot+1"
  echo:%%G>>_ErrorFileList.txt
  echo:ERROR compiling %%G, no .h produced
  )
)
goto :EOF

:OutputResults
echo:
echo: --- Compiled %_totVert% vertex shaders with %_errVert% errors  Totals: %_tempsVert% regs  %_instrVert% instructions
echo:
echo: --- Compiled %_totFrag% fragment shaders with %_errfrag% errors  Totals: %_tempsFrag% regs  %_instrFrag% instructions
echo:
goto :EOF

:GetWin10SdkDir
  call :GetWin10SdkDirHelper HKLM\\SOFTWARE\\Wow6432Node > nul 2>&1
  if errorlevel 1 call :GetWin10SdkDirHelper HKCU\\SOFTWARE\\Wow6432Node > nul 2>&1
  if errorlevel 1 call :GetWin10SdkDirHelper HKLM\\SOFTWARE > nul 2>&1
  if errorlevel 1 call :GetWin10SdkDirHelper HKCU\\SOFTWARE > nul 2>&1
  if errorlevel 1 set fxcPath="c:\\Program Files (x86)\\Windows Kits\\10\\bin\\x64\\fxc.exe"
goto :EOF

:GetWin10SdkDirHelper
    setlocal enableDelayedExpansion
    rem Get Windows 10 SDK installed folder
    for /F "tokens=1,2*" %%i in ('reg query "%1\\Microsoft\\Microsoft SDKs\\Windows\\v10.0" /v "InstallationFolder"') DO (
        echo:   i [%%i] j [%%j]
        if "%%i"=="InstallationFolder" (
            set WindowsSdkDir=%%~k
        )
    )
    rem Due to SDK installer changes beginning 10.0.15063.0 (RS2 SDK), the SDK installed may not have required stuff
    rem Check for the existence of fxc since that is what is needed here
    set __check_file=fxc.exe
    if not "%WindowsSdkDir%"=="" for /f %%i IN ('dir "%WindowsSdkDir%bin\\" /b /ad-h /o-n') DO (
      if EXIST "%WindowsSdkDir%bin\\%%i\\x64\\%__check_file%" (
        set result=%%i
        if "!result:~0,3!"=="10." (
          endlocal
          set fxcPath="%WindowsSdkDir%bin\\%%i\\x64\\%__check_file%"
          goto :EOF
        )
      )
    )
exit /B 1
goto :EOF


:RunCmdsParallel
  rem Based on example code by @dbenham at https://stackoverflow.com/questions/672719/parallel-execution-of-shell-processes
  setlocal enableDelayedExpansion
  set "lockHandle=1"

:: Define the maximum number of parallel processes to run.
  set "maxProc=%NUMBER_OF_PROCESSORS%"
  rem set /a "maxProc=maxProc / 2"

:: Get a unique base lock name for this particular instantiation.
:: Incorporate a timestamp from WMIC if possible, but don't fail if WMIC not available.
:: Also incorporate a random number.  These are output to the env %temp% folder and removed at the end.
:: Example filenames: lock20200507001149.344000_15305_6, lock20200507001149.344000_15305_6_data
:: Also added lock20200507001149.344000_15305_Err_shaderName for this, for ordering stderr output.
  set "lock="
  for /f "skip=1 delims=-+ " %%T in ('2^>nul wmic os get localdatetime') do (
    set "lock=%%T"
    goto :RCP_break
  )
  :RCP_break
  set "lock=%temp%\\lock%lock%_%random%_"

:: Initialize the counters
  set /a "startCount=0, endCount=0, cCnt=1"

:: Clear any existing end flags
  for /l %%N in (1 1 %maxProc%) do set "endProc%%N="

:: Launch the commands in a loop
  set launch=1
  for /f "tokens=1,2* delims=;" %%A in (_TmpBldCmds.txt) do (
    if !startCount! lss %maxProc% (
      set /a "startCount+=1, nextProc=startCount"
    ) else (
      call :RCP_wait
    )
    set cmd!nextProc!=%%B
    rem echo !time! - proc!nextProc!: starting %%B
    2>nul del %lock%!nextProc!_data
	echo %%A>"%lock%!nextProc!_data"
    2>nul del %lock%!nextProc!
    2>nul del %lock%Err_%%A
    %= Redirect the lock handle to the lock file. The CMD process will     =%
    %= maintain an exclusive lock on the lock file until the process ends. =%
    start /b "" cmd /c %lockHandle%^>"%lock%!nextProc!" 2^>"%lock%Err_%%A" %%B
  )
  set "launch="

:RCP_wait
:: Wait for procs to finish in a loop
:: If still launching then return as soon as a proc ends, else wait for all procs to finish
:: redirect stderr to null to suppress any error message if redirection within the loop fails.
  for /l %%N in (1 1 %startCount%) do 2>nul (
    %= Redirect an unused file handle to the lock file. If the process is    =%
    %= still running then redirection will fail and the IF body will not run =%
    if not defined endProc%%N if exist "%lock%%%N" 9>>"%lock%%%N" (
      %= Made it inside the IF body so the process must have finished =%
      rem echo !time! - proc%%N: finished !cmd%%N!
      rem   these two options are just as fast as without them, but on a different line than the count
      rem   the first is the name of the file, 2nd is the result of the compile (including name)
      rem type "%lock%%%N_data"
      rem type "%lock%%%N"
      echo:  !cCnt! of %_totShaders%
      set /a "cCnt+=1"
      if defined launch (
        set nextProc=%%N
        exit /b
      )
      set /a "endCount+=1, endProc%%N=1"
    )
  )
  if %endCount% lss %startCount% (
    1>nul 2>nul ping /n 2 ::1
    goto :RCP_wait
  )

rem Process stderr outputs
dir %lock%Err_* /ON/B/S > _TmpBldCmds.txt
for /F "tokens=*" %%G in (_TmpBldCmds.txt) do (type "%%G" >> _WarningsList.txt)
del _TmpBldCmds.txt
echo:

2>nul del %lock%*
goto :EOF
`;

function skipThisShader(entry: DebugShaderFile, usedFlag: string, typeFlag: string, langFlag: string): boolean {
  return ("n" === usedFlag && entry.isUsed) || ("u" === usedFlag && !entry.isUsed) ||
    ("f" === typeFlag && entry.isVS) || ("v" === typeFlag && !entry.isVS) ||
    ("h" === langFlag && entry.isGL) || ("g" === langFlag && !entry.isGL);
}

async function outputShaders(dsf: DebugShaderFile[], usedFlag: string, typeFlag: string, langFlag: string, dir: string) {
  // output shader make file
  let fname = `${dir}_makeShade.bat`;
  await DtaRpcInterface.getClient().writeExternalFile(fname, makeShadeBat);

  // output output list
  fname = `${dir}_OutputList.txt`;
  let src = "";
  for (const entry of dsf) {
    if (!skipThisShader(entry, usedFlag, typeFlag, langFlag))
      src = `${src + entry.filename}  isUsed: ${entry.isUsed}\n`;
  }
  await DtaRpcInterface.getClient().writeExternalFile(fname, src);

  // output shader files
  for (const entry of dsf) {
    if (skipThisShader(entry, usedFlag, typeFlag, langFlag))
      continue;

    fname = dir + entry.filename;
    src = (entry.isGL ? "" : `// ${entry.filename}  isUsed: ${entry.isUsed}\n`) + entry.src;
    await DtaRpcInterface.getClient().writeExternalFile(fname, src);
  }

  IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, `Shaders output to directory ${dir}`));
}

export class OutputShadersTool extends Tool {
  public static override toolId = "OutputShaders";
  public static override get minArgs() { return 0; }
  public static override get maxArgs() { return 2; }

  public override run(compile: boolean, usedFlag: string, typeFlag: string, langFlag: string, outputDir: string): boolean {
    if (compile) {
      const compiled = IModelApp.renderSystem.debugControl?.compileAllShaders();
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(compiled ? OutputMessagePriority.Info : OutputMessagePriority.Error, `${compiled ? "No" : "Some"} compilation errors occurred.`));
    }
    const dsf = IModelApp.renderSystem.debugControl?.debugShaderFiles;
    if (undefined !== dsf && dsf.length > 0)
      outputShaders(dsf, usedFlag, typeFlag, langFlag, outputDir); // eslint-disable-line @typescript-eslint/no-floating-promises
    else
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "No shaders (did you define SVT_DEBUG_SHADERS?)"));

    return true;
  }

  public override parseAndRun(...args: string[]): boolean {
    let compile = false;
    let usedFlag;
    let typeFlag;
    let langFlag;
    let outputDir;

    for (const arg of args) {
      const parts = arg.split("=");
      if (1 === parts.length) {
        const lowerArgs = parts[0].toLowerCase();
        compile = lowerArgs.includes("c");
        usedFlag = lowerArgs.includes("u") ? "u" : (lowerArgs.includes("n") ? "n" : "");
        typeFlag = lowerArgs.includes("v") ? "v" : (lowerArgs.includes("f") ? "f" : "");
        langFlag = lowerArgs.includes("g") ? "g" : (lowerArgs.includes("h") ? "h" : "");
      } else if (2 === parts.length && "d" === parts[0].toLowerCase()) {
        outputDir = parts[1];
        if (-1 !== outputDir.indexOf("\\") && !outputDir.endsWith("\\"))
          outputDir += "\\";
        else if (-1 !== outputDir.indexOf("/") && !outputDir.endsWith("/"))
          outputDir += "/";
      }
    }

    return this.run(compile, usedFlag ?? "", typeFlag ?? "", langFlag ?? "", outputDir ?? "d:\\temp\\shaders\\");
  }
}
