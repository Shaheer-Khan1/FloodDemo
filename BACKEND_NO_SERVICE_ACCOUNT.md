# ✅ Backend API - NO Service Account Required!

## 🎉 Good News!

You can use the backend API **WITHOUT** a Firebase service account! Perfect for organization accounts where you can't access service accounts.

## 🚀 Super Quick Setup (3 Steps)

### Step 1: Navigate to backend folder
```bash
cd backend
```

### Step 2: Auto-copy credentials from frontend
```bash
npm run setup
```

This automatically copies your Firebase credentials from the frontend `.env` file to the backend!

### Step 3: Start the server
```bash
npm run dev:client
```

**That's it!** ✨

## 📍 Test It Works

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "firebaseInitialized": true,
  "sdkType": "client"  ← Using client SDK!
}
```

## 🎯 What Changed?

Instead of using **Firebase Admin SDK** (requires service account), we use **Firebase Client SDK** (uses your existing web credentials).

### Two Backend Options:

| File | SDK Type | Credentials Needed | Use When |
|------|----------|-------------------|----------|
| `server-client.js` | Client SDK | ✅ Web API Key (you have this) | Can't access service account |
| `server.js` | Admin SDK | ❌ Service account (you don't have) | Full admin access available |

## 📝 Manual Setup (If Auto-Setup Doesn't Work)

Create `backend/.env` file manually:

```env
# Copy these from your frontend .env file
FIREBASE_API_KEY=your-api-key-here
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your-sender-id
FIREBASE_APP_ID=your-app-id

PORT=3001
ALLOWED_ORIGINS=http://localhost:5173
```

## 🔒 Important: Update Firestore Rules

Since we're using the Client SDK, Firestore security rules apply!

Go to **Firebase Console** → **Firestore Database** → **Rules** and add:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow reading installations (for API access)
    match /installations/{document=**} {
      allow read: if true;  // Or add authentication check
    }
    
    // Keep your existing write rules
  }
}
```

## 📦 All Endpoints Work the Same!

```bash
# Get all installations
curl http://localhost:3001/api/installations

# Get statistics
curl http://localhost:3001/api/installations/stats/summary

# Filter by team
curl "http://localhost:3001/api/installations?teamId=team123"

# Export all data
curl http://localhost:3001/api/installations/export/json -o installations.json
```

## 🆚 Comparison: Client SDK vs Admin SDK

### Using Client SDK (Your Option) ✅

**Pros:**
- ✅ No service account needed
- ✅ Works with organization accounts
- ✅ Uses existing web credentials
- ✅ Easy setup (3 commands)
- ✅ All API endpoints work

**Cons:**
- ⚠️ Must configure Firestore security rules
- ⚠️ Subject to Firebase quotas

### Using Admin SDK (Alternative)

**Pros:**
- ✅ Bypasses security rules
- ✅ Full database access
- ✅ Better for production scale

**Cons:**
- ❌ Requires service account key
- ❌ Not accessible in your org

## 📚 Documentation

- **Quick Setup:** This file
- **Detailed Setup:** `backend/SETUP_NO_SERVICE_ACCOUNT.md`
- **API Reference:** `backend/README.md`
- **Integration Examples:** `backend/INTEGRATION.md`
- **Quick Reference:** `backend/QUICK_REFERENCE.md`

## 🛠️ Commands Reference

```bash
# Auto-setup from frontend
npm run setup

# Start server (client SDK)
npm run dev:client        # Development with auto-reload
npm run start:client      # Production mode

# Test API
npm test
```

## ⚠️ Troubleshooting

### "Firebase is not initialized"
**Fix:** Run `npm run setup` or check your `.env` file

### "Permission denied"
**Fix:** Update Firestore security rules (see above)

### "CORS error"
**Fix:** Add your frontend URL to `ALLOWED_ORIGINS` in `.env`

### Auto-setup fails
**Fix:** Manually create `.env` file (see Manual Setup above)

## ✨ Summary

**You're all set!** 🎉

1. ✅ No service account needed
2. ✅ Uses your existing Firebase credentials
3. ✅ 3-step setup
4. ✅ All endpoints work
5. ✅ Same API as before

Just run:
```bash
cd backend
npm run setup
npm run dev:client
```

Then test:
```bash
curl http://localhost:3001/api/installations
```

**Perfect for organization accounts where service account access is restricted!**

