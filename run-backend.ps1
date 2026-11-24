cd 'C:\Users\Arelle\desktop\saamaya-releves\backend'
Write-Host 'Backend FastAPI - Port 8000' -ForegroundColor Green
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
