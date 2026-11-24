# start-dev.ps1 - Lance backend et frontend en parallèle

Write-Host "Demarrage de Saamaya Releves..." -ForegroundColor Cyan

# Creer le script backend temporaire
$backendScript = @"
cd '$PWD\backend'
Write-Host 'Backend FastAPI - Port 8000' -ForegroundColor Green
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
"@
$backendScript | Out-File -FilePath "$PWD\run-backend.ps1" -Encoding utf8

# Creer le script frontend temporaire
$frontendScript = @"
cd '$PWD\frontend'
Write-Host 'Frontend Vite React - Port 5173' -ForegroundColor Magenta
npm run dev
"@
$frontendScript | Out-File -FilePath "$PWD\run-frontend.ps1" -Encoding utf8

# Lancer les deux dans des fenetres separees
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "$PWD\run-backend.ps1"
Start-Sleep -Seconds 3
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "$PWD\run-frontend.ps1"

Write-Host ""
Write-Host "Les deux serveurs sont lances :" -ForegroundColor Green
Write-Host "   Backend  : http://localhost:8000" -ForegroundColor White
Write-Host "   Frontend : http://localhost:5173" -ForegroundColor White
Write-Host ""
Write-Host "Fermez les fenetres PowerShell pour arreter les serveurs." -ForegroundColor Gray