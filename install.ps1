# PowerShell installation script for Enkryptify CLI
param(
    [string]$Version = "latest"
)

$ErrorActionPreference = "Stop"
$REPO = "Enkryptify/cli"
$BIN_NAME = "ek"

Write-Host "🔍 Detecting system..." -ForegroundColor Cyan

# Get version if not specified
if ($Version -eq "latest") {
    try {
        # First try latest release (stable)
        $response = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO/releases/latest"
        $Version = $response.tag_name
        Write-Host "📌 Using latest version: $Version" -ForegroundColor Green
    } catch {
        # If no stable release, try to get latest prerelease
        Write-Host "⚠️  No stable release found, checking for prereleases..." -ForegroundColor Yellow
        try {
            $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/$REPO/releases"
            if ($releases.Count -gt 0) {
                $Version = $releases[0].tag_name
                Write-Host "📌 Using latest prerelease: $Version" -ForegroundColor Yellow
            } else {
                throw "No releases found"
            }
        } catch {
            Write-Host "❌ Could not fetch latest version from GitHub." -ForegroundColor Red
            Write-Host "   Please specify a version manually: .\install.ps1 -Version v0.2.0" -ForegroundColor Red
            exit 1
        }
    }
} else {
    Write-Host "📌 Using specified version: $Version" -ForegroundColor Cyan
}

$ARCH = "x86_64"  # Windows only supports x86_64 currently
$ZIP = "enkryptify_Windows_${ARCH}.zip"
$URL = "https://github.com/$REPO/releases/download/$Version/$ZIP"

Write-Host "📦 Installing ek for Windows ($ARCH)" -ForegroundColor Cyan
Write-Host "🔖 Version: $Version" -ForegroundColor Cyan

# Create temp directory
$TMP_DIR = New-TemporaryFile | ForEach-Object { Remove-Item $_; New-Item -ItemType Directory -Path $_ }
$ZIP_PATH = Join-Path $TMP_DIR $ZIP

Write-Host "⬇️  Downloading $URL" -ForegroundColor Cyan
try {
    Invoke-WebRequest -Uri $URL -OutFile $ZIP_PATH -UseBasicParsing
} catch {
    Write-Host "❌ Failed to download: $_" -ForegroundColor Red
    exit 1
}

Write-Host "📦 Extracting archive" -ForegroundColor Cyan
$EXTRACT_DIR = Join-Path $TMP_DIR "extract"
New-Item -ItemType Directory -Path $EXTRACT_DIR -Force | Out-Null
Expand-Archive -Path $ZIP_PATH -DestinationPath $EXTRACT_DIR -Force

# Determine install directory
$INSTALL_DIR = "$env:USERPROFILE\.local\bin"
if (-not (Test-Path $INSTALL_DIR)) {
    New-Item -ItemType Directory -Path $INSTALL_DIR -Force | Out-Null
}

Write-Host "🚀 Installing ek to $INSTALL_DIR" -ForegroundColor Cyan
$EK_EXE = Join-Path $EXTRACT_DIR "ek.exe"
if (-not (Test-Path $EK_EXE)) {
    Write-Host "❌ ek.exe not found in archive" -ForegroundColor Red
    exit 1
}
Copy-Item -Path $EK_EXE -Destination (Join-Path $INSTALL_DIR "ek.exe") -Force

# Install PowerShell module for completion
$MODULE_DIR = Join-Path $EXTRACT_DIR "enkryptify-completion"
$PS_MODULE_PATH = Join-Path $env:USERPROFILE "Documents\PowerShell\Modules\enkryptify-completion"
if (Test-Path $MODULE_DIR) {
    Write-Host "🔧 Installing PowerShell completion module" -ForegroundColor Cyan
    if (-not (Test-Path $PS_MODULE_PATH)) {
        New-Item -ItemType Directory -Path $PS_MODULE_PATH -Force | Out-Null
    }
    Copy-Item -Path (Join-Path $MODULE_DIR "enkryptify-completion.psm1") -Destination $PS_MODULE_PATH -Force
    Write-Host "✔ PowerShell completion module installed" -ForegroundColor Green
}

# Add to PATH if not already there
$PATH_ENTRY = $INSTALL_DIR
$CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($CurrentPath -notlike "*$PATH_ENTRY*") {
    Write-Host "🔧 Adding $INSTALL_DIR to PATH" -ForegroundColor Cyan
    [Environment]::SetEnvironmentVariable("Path", "$CurrentPath;$PATH_ENTRY", "User")
    $env:Path += ";$PATH_ENTRY"
    Write-Host "✔ Added to PATH (restart your terminal for it to take effect)" -ForegroundColor Green
}

# Cleanup
Remove-Item -Path $TMP_DIR -Recurse -Force

Write-Host ""
Write-Host "✅ Enkryptify CLI installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "👉 Restart your PowerShell terminal or run:" -ForegroundColor Yellow
Write-Host "   Import-Module enkryptify-completion" -ForegroundColor Yellow
Write-Host ""
Write-Host "Try:" -ForegroundColor Yellow
Write-Host "   ek --help" -ForegroundColor Yellow

