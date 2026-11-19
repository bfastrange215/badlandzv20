# Only launch once the expected SMOOTH FIGHTERS V15 server responds.
$address = 'http://localhost:3124'
$correct = $false
for ($i = 0; $i -lt 90; $i++) {
  try {
    $health = Invoke-RestMethod -Uri "$address/health" -TimeoutSec 1
    if ($health.version -eq 'V15-SMOOTH-ARCADE') { $correct = $true; break }
    if ($health.version) { Write-Host "Wrong game version at $address : $($health.version)"; exit 1 }
  } catch { }
  Start-Sleep -Milliseconds 300
}
if (-not $correct) { Write-Host 'No verified V15 server was found. The browser was not opened.'; exit 1 }
$edges = @(
 "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
 "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
 "$env:LocalAppData\Microsoft\Edge\Application\msedge.exe"
)
$exe = $edges | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($exe) {
  Start-Process -FilePath $exe -ArgumentList @('--new-window','--start-fullscreen', "$address/?build=V15-smooth-arcade")
} else {
  Start-Process "$address/?build=V15-smooth-arcade"
}
