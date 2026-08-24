param(
    [string]$Url = "http://localhost:3000/chat"
)

$projectRoot = Split-Path -Parent $PSScriptRoot

function Test-ChatServerReady {
    try {
        $response = Invoke-WebRequest -Uri $Url -Method Head -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

if (-not (Test-ChatServerReady)) {
    $npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
    Start-Process -FilePath $npmPath `
        -ArgumentList @("run", "dev") `
        -WorkingDirectory $projectRoot `
        -WindowStyle Hidden

    $serverDeadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $serverDeadline -and -not (Test-ChatServerReady)) {
        Start-Sleep -Seconds 1
    }

    if (-not (Test-ChatServerReady)) {
        Write-Error "The chat server did not become ready within 60 seconds."
        exit 1
    }
}

$chromeCandidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

$chromePath = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $chromePath) {
    Write-Error "Google Chrome was not found in the default install paths."
    exit 1
}

# Chrome이 이미 실행 중이어도 키오스크 인쇄 옵션이 무시되지 않도록
# 이 프로젝트 전용 프로필로 별도 브라우저 프로세스를 실행합니다.
$chromeVersion = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($chromePath).FileVersion
$chromeMajorVersion = 0
$parsedChromeMajorVersion = [int]::TryParse(
    ($chromeVersion -split '\.')[0],
    [ref]$chromeMajorVersion
)

if ($parsedChromeMajorVersion -and $chromeMajorVersion -lt 135) {
    Write-Error "Chrome 135 or newer is required for AEC-backed Web Speech input. Installed: $chromeVersion"
    exit 1
}

if (-not $parsedChromeMajorVersion) {
    Write-Warning "Could not determine the installed Chrome version. Web Speech track input may be unavailable."
}
elseif ($chromeMajorVersion -lt 141) {
    Write-Warning "Chrome $chromeVersion supports track-backed recognition, but Chrome 141+ is recommended for echoCancellation=all."
}

$kioskProfilePath = Join-Path $env:LOCALAPPDATA "RealtimeEnglish\ChromeKioskProfile"
New-Item -ItemType Directory -Path $kioskProfilePath -Force | Out-Null

Start-Process -FilePath $chromePath -ArgumentList @(
    "--kiosk",
    "--kiosk-printing",
    "--no-first-run",
    "--autoplay-policy=no-user-gesture-required",
    "--user-data-dir=$kioskProfilePath",
    $Url
)
