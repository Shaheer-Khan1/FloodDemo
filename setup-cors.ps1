# PowerShell script to configure CORS for Firebase Storage
# Requires Google Cloud SDK (gsutil) to be installed

Write-Host "Configuring CORS for Firebase Storage..." -ForegroundColor Cyan

# Replace with your Firebase Storage bucket name
$bucketName = "flowset-143fc.firebasestorage.app"

# Check if gsutil is available
$gsutilPath = Get-Command gsutil -ErrorAction SilentlyContinue

if (-not $gsutilPath) {
    Write-Host "ERROR: gsutil not found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Google Cloud SDK:" -ForegroundColor Yellow
    Write-Host "1. Download from: https://cloud.google.com/sdk/docs/install" -ForegroundColor Yellow
    Write-Host "2. Or install via: pip install gsutil" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "After installation, run this script again." -ForegroundColor Yellow
    exit 1
}

# Check if cors.json exists
if (-not (Test-Path "cors.json")) {
    Write-Host "ERROR: cors.json not found!" -ForegroundColor Red
    Write-Host "Please ensure cors.json exists in the current directory." -ForegroundColor Yellow
    exit 1
}

Write-Host "Applying CORS configuration to bucket: $bucketName" -ForegroundColor Green

# Apply CORS configuration
try {
    gsutil cors set cors.json "gs://$bucketName"
    Write-Host ""
    Write-Host "SUCCESS: CORS configuration applied!" -ForegroundColor Green
    Write-Host "Changes may take a few minutes to propagate." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To verify, run: gsutil cors get gs://$bucketName" -ForegroundColor Cyan
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to apply CORS configuration" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Alternative: Configure CORS manually in Firebase Console:" -ForegroundColor Yellow
    Write-Host "1. Go to Firebase Console > Storage" -ForegroundColor Yellow
    Write-Host "2. Click on Settings/Configuration" -ForegroundColor Yellow
    Write-Host "3. Look for CORS settings" -ForegroundColor Yellow
    exit 1
}

