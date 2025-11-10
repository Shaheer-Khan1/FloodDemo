#!/bin/bash
# Bash script to configure CORS for Firebase Storage
# Requires Google Cloud SDK (gsutil) to be installed

echo "Configuring CORS for Firebase Storage..."

# Replace with your Firebase Storage bucket name
BUCKET_NAME="flowset-143fc.firebasestorage.app"

# Check if gsutil is available
if ! command -v gsutil &> /dev/null; then
    echo "ERROR: gsutil not found!"
    echo ""
    echo "Please install Google Cloud SDK:"
    echo "1. Download from: https://cloud.google.com/sdk/docs/install"
    echo "2. Or install via: pip install gsutil"
    echo ""
    echo "After installation, run this script again."
    exit 1
fi

# Check if cors.json exists
if [ ! -f "cors.json" ]; then
    echo "ERROR: cors.json not found!"
    echo "Please ensure cors.json exists in the current directory."
    exit 1
fi

echo "Applying CORS configuration to bucket: $BUCKET_NAME"

# Apply CORS configuration
if gsutil cors set cors.json "gs://$BUCKET_NAME"; then
    echo ""
    echo "SUCCESS: CORS configuration applied!"
    echo "Changes may take a few minutes to propagate."
    echo ""
    echo "To verify, run: gsutil cors get gs://$BUCKET_NAME"
else
    echo ""
    echo "ERROR: Failed to apply CORS configuration"
    echo ""
    echo "Alternative: Configure CORS manually in Firebase Console:"
    echo "1. Go to Firebase Console > Storage"
    echo "2. Click on Settings/Configuration"
    echo "3. Look for CORS settings"
    exit 1
fi

