param(
    [string]$Url = "http://localhost:3000/chat"
)

$chromeCandidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

$chromePath = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $chromePath) {
    Write-Error "Google Chrome was not found in the default install paths."
    exit 1
}

Start-Process -FilePath $chromePath -ArgumentList @(
    "--kiosk",
    "--kiosk-printing",
    $Url
)
