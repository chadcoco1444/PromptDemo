' start-hidden.vbs — Windows-only launcher that runs `pnpm demo start` with
' the console window hidden. Useful when launching via double-click or a
' Windows shortcut (where Node's windowsHide:true alone can't suppress the
' parent shell that opens the launcher itself).
'
' Usage:
'   double-click start-hidden.vbs
'     OR
'   wscript scripts\start-hidden.vbs
'
' This is a defense-in-depth supplement to the windowsHide:true flags in
' scripts/demo.mjs (commit a0b0d0d). For terminal-launched usage
' (`pnpm demo start` from a normal shell), the .mjs path is enough.
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Resolve the repo root (one level up from scripts/) so the launcher works
' regardless of where it's invoked from.
repoRoot = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))

' Quote the path so spaces in user profile paths don't break the cd.
cmd = "cmd /c cd /d """ & repoRoot & """ && pnpm demo start"

' Run hidden (window style = 0), don't wait for completion (false).
WshShell.Run cmd, 0, False
