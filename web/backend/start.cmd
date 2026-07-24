@echo off
cd /d D:\projects\blade\web\backend
rem Set your API key in environment before running:
rem   set DEEPSEEK_API_KEY=sk-your-key
venv\Scripts\python -m uvicorn app:app --host 0.0.0.0 --port 8001
