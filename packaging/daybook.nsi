Unicode True
Name "Daybook"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Daybook"
InstallDirRegKey HKCU "Software\Daybook" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section
  SetOutPath "$INSTDIR"
  File "${PROJECT}/Daybook.html"
  File "${PROJECT}/Start Daybook.cmd"
  File "${PROJECT}/LICENSE"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateDirectory "$SMPROGRAMS\Daybook"
  CreateShortCut "$SMPROGRAMS\Daybook\Daybook.lnk" "$INSTDIR\Daybook.html"
  CreateShortCut "$SMPROGRAMS\Daybook\Uninstall Daybook.lnk" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\Daybook" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Daybook" "DisplayName" "Daybook"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Daybook" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Daybook" "Publisher" "Compiled Tech"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Daybook" "UninstallString" '"$INSTDIR\Uninstall.exe"'
SectionEnd

Section "Uninstall"
  Delete "$SMPROGRAMS\Daybook\Daybook.lnk"
  Delete "$SMPROGRAMS\Daybook\Uninstall Daybook.lnk"
  RMDir "$SMPROGRAMS\Daybook"
  Delete "$INSTDIR\Daybook.html"
  Delete "$INSTDIR\Start Daybook.cmd"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKCU "Software\Daybook"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Daybook"
SectionEnd
