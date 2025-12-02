$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"

function Start-App($name, $path, $cmd) {
    $fullCmd = "Write-Host '[{0}]' -ForegroundColor Cyan; Set-Location `"{1}`"; {2}" -f $name, $path, $cmd
    Start-Process -FilePath "powershell" -ArgumentList "-NoExit","-Command",$fullCmd | Out-Null
}

Start-App "backend-api" $backend "npm run dev"
Start-App "worker" $backend "npm run worker"
Start-App "frontend" $frontend "npm start"
