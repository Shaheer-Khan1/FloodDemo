# Backend Setup WITHOUT Service Account

This guide is for when you **cannot access Firebase Service Account credentials** (e.g., organization restrictions).

## ✅ Solution: Use Firebase Client SDK

Instead of Firebase Admin SDK, we'll use the Firebase Client SDK which only needs your regular Firebase web credentials.

## 🚀 Quick Setup

### Step 1: Copy Your Frontend Firebase Config

You already have these values in your frontend `.env` file. Copy them!

### Step 2: Create Backend .env File

In the `backend` folder, create a `.env` file:

```bash
cd backend
```

Create `.env` with these values (copy from your frontend `.env`):

```env
# Copy these from your frontend .env file
FIREBASE_API_KEY=AIza...your-api-key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abc123

# Server settings
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173
```

### Step 3: Start the Server

```bash
npm run dev:client
```

That's it! The server will use the **client SDK** instead of admin SDK.

## 📍 Verify It's Working

Test the health endpoint:

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-12-28T...",
  "firebaseInitialized": true,
  "sdkType": "client"
}
```

Notice `"sdkType": "client"` - this confirms you're using the client SDK!

## 🔥 Get Your Firebase Credentials

### Option 1: From Your Frontend .env

Look at your project's `.env` file - it already has these values!

### Option 2: From Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** (⚙️ icon)
4. Scroll down to **"Your apps"** section
5. Find your web app
6. Copy the config values

Example config you'll see:
```javascript
const firebaseConfig = {
  apiKey: "AIza....",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

## 📝 Complete .env Example

Here's a filled example (use your actual values):

```env
FIREBASE_API_KEY=AIzaSyDd5K8x9YT_example_key_abc123xyz
FIREBASE_AUTH_DOMAIN=floodwatch-12345.firebaseapp.com
FIREBASE_PROJECT_ID=floodwatch-12345
FIREBASE_STORAGE_BUCKET=floodwatch-12345.appspot.com
FIREBASE_MESSAGING_SENDER_ID=987654321
FIREBASE_APP_ID=1:987654321:web:abc123def456

PORT=3001
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

## 🎯 NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run dev:client` | Start with client SDK (auto-reload) |
| `npm run start:client` | Start with client SDK (production) |
| `npm run dev` | Start with admin SDK (needs service account) |
| `npm run start` | Start with admin SDK (needs service account) |

## 🆚 Client SDK vs Admin SDK

### Client SDK (No Service Account) ✅
- ✅ Uses regular Firebase web credentials
- ✅ Works without service account access
- ✅ Perfect for organization accounts
- ✅ Same API endpoints
- ⚠️ Subject to Firestore security rules
- ⚠️ May have rate limits

### Admin SDK (Requires Service Account)
- ✅ Full database access
- ✅ No security rules apply
- ✅ Better for production
- ❌ Requires service account key
- ❌ Not available in some organizations

## 🔒 Important: Firestore Security Rules

Since you're using the **Client SDK**, your Firestore security rules apply!

### Make sure your rules allow reading:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Option 1: Allow read from anywhere (for public data)
    match /installations/{document=**} {
      allow read: if true;
    }
    
    // Option 2: Require authentication
    match /installations/{document=**} {
      allow read: if request.auth != null;
    }
  }
}
```

**To update rules:**
1. Go to Firebase Console
2. Firestore Database → Rules tab
3. Update the rules
4. Publish

## 🧪 Test the API

```bash
# Health check
curl http://localhost:3001/health

# Get all installations
curl http://localhost:3001/api/installations

# Get statistics  
curl http://localhost:3001/api/installations/stats/summary

# Export data
curl http://localhost:3001/api/installations/export/json -o data.json
```

## ⚠️ Troubleshooting

### "Permission Denied" Error

**Problem:** Firestore security rules are blocking access

**Solution:** Update your Firestore rules to allow read access (see above)

### "Firebase is not initialized"

**Problem:** Missing or incorrect credentials in `.env`

**Solution:** 
1. Check `.env` file exists in `backend/` folder
2. Verify all values are correct
3. Make sure no extra spaces or quotes

### "CORS Error"

**Problem:** Frontend URL not allowed

**Solution:** Add your frontend URL to `ALLOWED_ORIGINS` in `.env`:
```env
ALLOWED_ORIGINS=http://localhost:5173,https://your-domain.com
```

## 📚 API Documentation

All endpoints work the same! See:
- **API Reference:** `backend/README.md`
- **Integration Guide:** `backend/INTEGRATION.md`
- **Quick Reference:** `backend/QUICK_REFERENCE.md`

## 🚀 Deployment

When deploying, set these environment variables:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `PORT`
- `ALLOWED_ORIGINS`

Use `npm run start:client` as your start command.

## ✨ Summary

**You can use the backend API without a service account!**

Just use:
1. Your existing Firebase web credentials
2. The `server-client.js` file
3. `npm run dev:client` command

Same API, same endpoints, no service account needed! 🎉

