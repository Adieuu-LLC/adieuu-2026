; Adieuu Windows (NSIS) — append-only installer log for support.
; See https://www.electron.build/nsis#custom-nsis-script
; Log path matches in-app copy: %LOCALAPPDATA%\Adieuu\logs\installer.log
;
; preInit: start of .onInit (BEFORE initMultiUser — INSTDIR is not final yet).
; customInit: after initMultiUser in .onInit (reliable INSTDIR, installMode).
; customUnInit: start of un.onInit after initMultiUser (uninstall diagnostics).
; customInstall: after main install steps, before finish.
;
; customCheckAppRunning: we wrap app-builder's _CHECK_APP_RUNNING and add a
; final taskkill /F /T /IM sweep. Electron uses several Adieuu.exe processes; the
; default NSIS KILL macro does not use /T, so process trees and stray PIDs are
; more likely to stay behind and block upgrades/uninstall. See allowOnlyOneInstallerInstance.nsh
; in app-builder. When defining customCheckAppRunning, we must include getProcessInfo + Var pid
; (app-builder only adds those when the macro is NOT defined).

!include "getProcessInfo.nsh"
Var pid

!macro AdieuuPostKillStrayAppProcesses
  DetailPrint "Adieuu: final taskkill /F /T for ${APP_EXECUTABLE_FILENAME} (Electron multi-process or stray PIDs)."
  !ifdef INSTALL_MODE_PER_ALL_USERS
    ; Match app-builder: exclude only the current NSIS/uninstaller process (not Adieuu, but safe).
    nsExec::Exec `taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}" /FI "PID ne $pid"`
  !else
    ; Per-user installs: only this user's processes (same as KILL_PROCESS in app-builder).
    nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"`
  !endif
  Pop $0
  Sleep 400
!macroend

!macro customCheckAppRunning
  !insertmacro _CHECK_APP_RUNNING
  !insertmacro AdieuuPostKillStrayAppProcesses
!macroend

!macro preInit
  ; Ensure directory exists (per-user, writable without admin in typical setups)
  CreateDirectory "$LOCALAPPDATA\Adieuu\logs"
  ClearErrors
  FileOpen $R9 "$LOCALAPPDATA\Adieuu\logs\installer.log" a
  IfErrors adieuu_preinit_log_done
  FileWrite $R9 "------------------------------------------------------------$\r$\n"
  FileWrite $R9 "Adieuu NSIS installer run start$\r$\n"
  FileWrite $R9 "Command line: $CMDLINE$\r$\n"
  FileWrite $R9 "EXEPATH: $EXEPATH$\r$\n"
  FileWrite $R9 "EXEDIR: $EXEDIR$\r$\n"
  ; Early environment (no INSTDIR yet)
  ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "DisplayVersion"
  FileWrite $R9 "OS DisplayVersion: $R0$\r$\n"
  ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuild"
  FileWrite $R9 "OS CurrentBuild: $R0$\r$\n"
  ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "ProductName"
  FileWrite $R9 "OS ProductName: $R0$\r$\n"
  System::Call "shell32::IsUserAnAdmin()i .r0"
  FileWrite $R9 "IsUserAnAdmin (0=no, nonzero=admin): $0$\r$\n"
  ReadEnvStr $R0 "PROCESSOR_ARCHITECTURE"
  FileWrite $R9 "PROCESSOR_ARCHITECTURE: $R0$\r$\n"
  ReadEnvStr $R0 "USERPROFILE"
  FileWrite $R9 "USERPROFILE: $R0$\r$\n"
  FileClose $R9
  adieuu_preinit_log_done:
!macroend

; Runs after initMultiUser: INSTDIR and $installMode are set. Same pattern as
; app-builder "install path resolved" (see app-builder templates/nsis/installer.nsi).
!macro customInit
  Call AdieuuLogCustomInitDiagnostics
!macroend

Function AdieuuLogCustomInitDiagnostics
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  Push $8
  ClearErrors
  FileOpen $8 "$LOCALAPPDATA\Adieuu\logs\installer.log" a
  IfErrors adieuu_custominit_log_done
  FileWrite $8 "---- customInit (path resolved) ----$\r$\n"
  FileWrite $8 "installMode: $installMode$\r$\n"
  FileWrite $8 "Shell context (SetShellVarContext): see installMode; CurrentUser=per-user, all=per-machine.$\r$\n"
  FileWrite $8 "INSTDIR: $INSTDIR$\r$\n"
  FileWrite $8 "Expected EXE: $INSTDIR\${APP_EXECUTABLE_FILENAME}$\r$\n"
  ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    FileWrite $8 "Main EXE present before install: yes (upgrade/repair over existing?)$\r$\n"
  ${Else}
    FileWrite $8 "Main EXE present before install: no (fresh or moved)$\r$\n"
  ${EndIf}
  ; Per-user: INSTDIR is writable in .onInit. Per-machine: target is under Program Files;
  ; elevation may happen only in the install Section — avoid false "write failed" here.
  ${if} $installMode == "CurrentUser"
    CreateDirectory "$INSTDIR"
    ClearErrors
    FileOpen $0 "$INSTDIR\adieuu_write_probe.deleteme" w
    IfErrors adieuu_write_probe_fail
    FileWrite $0 "ok"
    FileClose $0
    Delete "$INSTDIR\adieuu_write_probe.deleteme"
    FileWrite $8 "Write test: can create+delete a file in INSTDIR: ok (per-user)$\r$\n"
    Goto adieuu_custominit_tasklist
    adieuu_write_probe_fail:
    FileWrite $8 "Write test: FAILED (cannot create file in INSTDIR) — check permissions, AV, or controlled folder access.$\r$\n"
    ClearErrors
  ${else}
    FileWrite $8 "Write test: skipped in .onInit for per-machine (Program Files; elevation may apply during install).$\r$\n"
  ${endif}
  adieuu_custominit_tasklist:
  ; Process check (broad) — 0=tasklist success, 1/…=tasklist error
  nsExec::ExecToStack "cmd /c tasklist /FI IMAGENAME eq ${APP_EXECUTABLE_FILENAME} /NH 2^>^&1"
  Pop $0
  Pop $1
  FileWrite $8 "tasklist filter ${APP_EXECUTABLE_FILENAME} (tasklist exit=$0): $1$\r$\n"
  !ifndef nsProcess::FindProcess
    !include "nsProcess.nsh"
  !endif
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $0
  FileWrite $8 "nsProcess::FindProcess ${APP_EXECUTABLE_FILENAME} result: $0 (0=process still running per app-builder nsProcess; nonzero=not found; compare to tasklist line)$\r$\n"
  FileClose $8
  adieuu_custominit_log_done:
  Pop $8
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

!macro customUnInit
  Call un.AdieuuLogUninstallDiagnostics
!macroend

Function un.AdieuuLogUninstallDiagnostics
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $6
  Push $7
  Push $8
  ClearErrors
  FileOpen $8 "$LOCALAPPDATA\Adieuu\logs\installer.log" a
  IfErrors adieuu_uninit_log_done
  FileWrite $8 "---- customUnInit (uninstall; path from registry) ----$\r$\n"
  FileWrite $8 "Uninstall command line: $CMDLINE$\r$\n"
  FileWrite $8 "installMode: $installMode$\r$\n"
  FileWrite $8 "INSTDIR: $INSTDIR$\r$\n"
  ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    FileWrite $8 "Main EXE still present: yes$\r$\n"
  ${Else}
    FileWrite $8 "Main EXE still present: no$\r$\n"
  ${EndIf}
  ClearErrors
  FileOpen $0 "$INSTDIR\adieuu_uninst_write_probe.deleteme" w
  IfErrors adieuu_uninst_write_fail
  FileWrite $0 "x"
  FileClose $0
  Delete "$INSTDIR\adieuu_uninst_write_probe.deleteme"
  FileWrite $8 "Write test (uninstall): can write in INSTDIR: ok$\r$\n"
  Goto adieuu_uninit_tasklist
  adieuu_uninst_write_fail:
  FileWrite $8 "Write test (uninstall): cannot create file in INSTDIR (dir may be locked or read-only).$\r$\n"
  ClearErrors
  adieuu_uninit_tasklist:
  nsExec::ExecToStack "cmd /c tasklist /FI IMAGENAME eq ${APP_EXECUTABLE_FILENAME} /NH 2^>^&1"
  Pop $0
  Pop $1
  FileWrite $8 "tasklist filter ${APP_EXECUTABLE_FILENAME} (exit=$0): $1$\r$\n"
  FileClose $8
  adieuu_uninit_log_done:
  Pop $8
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd

!macro customInstall
  ; After main file copy, shortcuts, registry, etc. (per electron-builder order).
  ClearErrors
  FileOpen $R9 "$LOCALAPPDATA\Adieuu\logs\installer.log" a
  IfErrors adieuu_custominstall_log_done
  FileWrite $R9 "Adieuu NSIS: customInstall (application files) completed (ok).$\r$\n"
  FileWrite $R9 "INSTDIR (post-install): $INSTDIR$\r$\n"
  ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    FileWrite $R9 "Main EXE on disk: yes$\r$\n"
  ${Else}
    FileWrite $R9 "Main EXE on disk: NO (unexpected)$\r$\n"
  ${EndIf}
  FileClose $R9
  adieuu_custominstall_log_done:
!macroend
