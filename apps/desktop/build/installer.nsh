; Adieuu Windows (NSIS) — append-only installer log for support.
; See https://www.electron.build/nsis#custom-nsis-script
; Log path matches in-app copy: %LOCALAPPDATA%\Adieuu\logs\installer.log
;
; preInit: start of .OnInit (including silent /S runs used by electron-updater).
; customInstall: after main install steps, before the installer finishes.

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
  FileClose $R9
  adieuu_preinit_log_done:
!macroend

!macro customInstall
  ; Install finished main application file copy step (may still be followed by
  ; other NSIS work; this line usually indicates progress past extraction).
  ClearErrors
  FileOpen $R9 "$LOCALAPPDATA\Adieuu\logs\installer.log" a
  IfErrors adieuu_custominstall_log_done
  FileWrite $R9 "Adieuu NSIS: customInstall (application files) completed (ok).$\r$\n"
  FileClose $R9
  adieuu_custominstall_log_done:
!macroend
