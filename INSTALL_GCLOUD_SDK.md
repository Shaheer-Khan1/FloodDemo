# Install Google Cloud SDK for CORS Configuration

## Quick Install (Windows)

### Method 1: Download Installer (Easiest)
1. Download Google Cloud SDK installer for Windows:
   https://cloud.google.com/sdk/docs/install-sdk#windows

2. Run the installer and follow the prompts

3. After installation, restart your terminal/PowerShell

4. Run these commands:
   ```powershell
   gcloud auth login
   gcloud config set project flowset-143fc
   gsutil cors set cors.json gs://flowset-143fc.firebasestorage.app
   ```

### Method 2: Using PowerShell (Alternative)
```powershell
# Download and install via PowerShell
(New-Object Net.WebClient).DownloadFile("https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe", "$env:Temp\GoogleCloudSDKInstaller.exe")
& $env:Temp\GoogleCloudSDKInstaller.exe
```

## After Installation

1. **Authenticate:**
   ```powershell
   gcloud auth login
   ```
   This will open a browser window for you to sign in with your Google account.

2. **Set the project:**
   ```powershell
   gcloud config set project flowset-143fc
   ```

3. **Apply CORS:**
   ```powershell
   gsutil cors set cors.json gs://flowset-143fc.firebasestorage.app
   ```

4. **Verify it worked:**
   ```powershell
   gsutil cors get gs://flowset-143fc.firebasestorage.app
   ```

## Alternative: Use Firebase Console (No Installation Needed)

If you prefer not to install the SDK, you can configure CORS via the web console:

1. Go to: https://console.cloud.google.com/storage/browser?project=flowset-143fc
2. Click on your storage bucket (should be `flowset-143fc.firebasestorage.app`)
3. Click on the **"Configuration"** tab
4. Scroll down to **"CORS configuration"**
5. Click **"Edit CORS configuration"**
6. Paste this JSON:
   ```json
   [
     {
       "origin": ["*"],
       "method": ["GET", "HEAD"],
       "maxAgeSeconds": 3600,
       "responseHeader": ["Content-Type", "Access-Control-Allow-Origin", "Access-Control-Allow-Methods"]
     }
   ]
   ```
7. Click **"Save"**

