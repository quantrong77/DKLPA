@echo off
rem Chay ung dung Chuan bi cong tac o may nay (thay Render): CSDL Supabase that, tu build giao dien, tu chay lai khi loi.
rem Dong cua so nay = dung ung dung.
title Chuan bi cong tac (localhost)
cd /d "%~dp0standalone"
npm run local -- %*
pause
