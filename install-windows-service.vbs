' GEO后端保活服务 - Windows服务安装脚本
Set WshShell = CreateObject("WScript.Shell")
Set oShell = CreateObject("WScript.Shell")

strPath = WScript.ScriptFullName
Set objFSO = CreateObject("Scripting.FileSystemObject")
Set objFile = objFSO.GetFile(strPath)
strFolder = objFSO.GetParentFolderName(objFile)

' 创建启动文件夹快捷方式
Set oShortcut = WshShell.CreateShortcut(WshShell.SpecialFolders("Startup") & "\GEO-Keepalive.lnk")
oShortcut.TargetPath = "cmd.exe"
oShortcut.Arguments = "/c cd /d """ & strFolder & """ && start-keepalive.bat"
oShortcut.WorkingDirectory = strFolder
oShortcut.Description = "GEO后端保活服务"
oShortcut.Save

WScript.Echo "✅ GEO后端保活服务已添加到开机启动项"
WScript.Echo "💡 重启电脑后会自动运行"
WScript.Echo "🔍 可以在任务管理器中查看进程"