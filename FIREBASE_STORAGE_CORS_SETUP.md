# Firebase Storage CORS Configuration

## Problem
When generating PDF reports, images from Firebase Storage are blocked by CORS policy, showing "Image not available" in the PDF.

## Quick Setup

### Option 1: Using the Provided Scripts (Recommended)

**Windows (PowerShell):**
```powershell
.\setup-cors.ps1
```

**Linux/Mac:**
```bash
chmod +x setup-cors.sh
./setup-cors.sh
```

### Option 2: Manual Setup

#### Step 1: Install Google Cloud SDK

**Windows:**
1. Download from: https://cloud.google.com/sdk/docs/install
2. Run the installer
3. Restart your terminal

**Linux/Mac:**
```bash
# Using pip
pip install gsutil

# Or download the SDK
curl https://sdk.cloud.google.com | bash
```

#### Step 2: Authenticate with Google Cloud

```bash
gcloud auth login
gcloud config set project flowset-143fc
```

#### Step 3: Apply CORS Configuration

The `cors.json` file is already created in the project root. Run:

```bash
gsutil cors set cors.json gs://flowset-143fc.firebasestorage.app
```

#### Step 4: Verify CORS is Applied

```bash
gsutil cors get gs://flowset-143fc.firebasestorage.app
```

### Option 3: Using Firebase Console (Alternative)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: **flowset-143fc**
3. Navigate to **Storage** in the left menu
4. Click on the **Settings** or **Configuration** tab
5. Look for **CORS** or **Cross-Origin Resource Sharing** settings
6. Add your domains:
   - `https://flooddemo.onrender.com`
   - `http://localhost:5173` (for local development)
   - Or use `*` for all origins (less secure but works for all domains)

### Step 5: Test CORS Configuration

After configuring CORS:
1. Wait 2-5 minutes for changes to propagate
2. Generate a PDF report from the ministry devices page
3. Check browser console (F12) - CORS errors should be gone
4. Images should now appear in the PDF

## Troubleshooting

### "gsutil: command not found"
- Install Google Cloud SDK (see Step 1 above)
- Make sure to restart your terminal after installation
- On Windows, you may need to add gsutil to PATH manually

### "Access Denied" or "Permission Denied"
- Make sure you're authenticated: `gcloud auth login`
- Verify you have Storage Admin permissions in the Firebase project
- Check that you're using the correct project: `gcloud config get-value project`

### CORS Still Not Working After Configuration
- Wait a few more minutes (can take up to 10 minutes to propagate)
- Clear browser cache and try again
- Verify the bucket name is correct: `flowset-143fc.firebasestorage.app`
- Check that the CORS config was applied: `gsutil cors get gs://flowset-143fc.firebasestorage.app`

### For More Secure Configuration

Edit `cors.json` to restrict to specific domains:

```json
[
  {
    "origin": [
      "https://flooddemo.onrender.com",
      "http://localhost:5173",
      "http://localhost:3000"
    ],
    "method": ["GET", "HEAD"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin", "Access-Control-Allow-Methods"]
  }
]
```

Then re-run the setup script or command.

## Important Notes

- CORS configuration applies to the entire storage bucket
- Changes may take 2-10 minutes to propagate globally
- Make sure to include all domains where your app is hosted
- For production, restrict origins to your actual domains (not `*`) for better security
- The `cors.json` file uses `*` (all origins) for simplicity - you can restrict it later

