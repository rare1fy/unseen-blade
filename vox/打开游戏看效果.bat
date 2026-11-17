@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo 正在启动游戏……浏览器会自己打开（镜头拉近跟着主角）。
echo 在 MagicaVoxel 里改完按 Ctrl+S 存盘，浏览器里的游戏会自动刷新。
echo 看完了直接关掉这个黑窗口。
start "" cmd /c "timeout /t 6 /nobreak >nul & start "" http://127.0.0.1:5237/?model"
npm run dev
