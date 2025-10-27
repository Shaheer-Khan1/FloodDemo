# Firebase Setup Guide for FlowSet

Complete step-by-step guide to configure Firebase for FlowSet.

---

## 📋 Prerequisites

- Gmail account (for Firebase Console access)
- Node.js 18+ installed
- FlowSet source code downloaded

---

## 🔥 Firebase Project Setup

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Add project"** or **"Create a project"**
3. Enter project name: `flowset-production` (or your preferred name)
4. Click **Continue**
5. (Optional) Enable Google Analytics
6. Choose Analytics location and accept terms
7. Click **Create project**
8. Wait for project creation (30-60 seconds)
9. Click **Continue** when ready

---

## 🗄️ Enable Firestore Database

### Step 2: Set Up Cloud Firestore

1. In Firebase Console, navigate to **Build > Firestore Database**
2. Click **"Create database"**
3. Select **"Start in test mode"** (we'll add security rules later)
4. Click **Next**
5. Choose your **Firestore location** (e.g., `us-central`, `europe-west`, `asia-southeast1`)
   - ⚠️ **Important**: This cannot be changed later!
   - Choose closest to your users for best performance
6. Click **Enable**
7. Wait for database creation

### Step 3: Create Firestore Indexes (Optional but Recommended)

For better query performance, create composite indexes:

1. Go to **Firestore Database > Indexes** tab
2. Click **"Add index"**
3. Create the following indexes:

**Index 1: Installations by User and Status**
- Collection ID: `installations`
- Fields:
  - `installedBy` - Ascending
  - `status` - Ascending
  - `createdAt` - Descending
- Query scope: Collection

**Index 2: Installations by Team and Date**
- Collection ID: `installations`
- Fields:
  - `teamId` - Ascending
  - `createdAt` - Descending
- Query scope: Collection

**Index 3: Devices by Status and City**
- Collection ID: `devices`
- Fields:
  - `status` - Ascending
  - `cityOfDispatch` - Ascending
  - `createdAt` - Descending
- Query scope: Collection

---

## 📦 Enable Firebase Storage

### Step 4: Set Up Cloud Storage

1. In Firebase Console, navigate to **Build > Storage**
2. Click **"Get started"**
3. Start in **test mode** (we'll add security rules later)
4. Click **Next**
5. Choose your **Storage location** (same as Firestore for consistency)
6. Click **Done**
7. Wait for storage bucket creation

### Step 5: Create Storage Folder Structure

Storage folders are created automatically when files are uploaded, but you can verify:
- Installations folder: `/installations/{deviceId}/`

---

## 🔐 Enable Authentication

### Step 6: Set Up Firebase Authentication

1. In Firebase Console, navigate to **Build > Authentication**
2. Click **"Get started"**
3. Go to **"Sign-in method"** tab
4. Click on **"Email/Password"**
5. **Enable** the Email/Password provider
6. (Optional) Enable **"Email link (passwordless sign-in)"**
7. Click **Save**

### Optional: Add Additional Providers

You can also enable:
- Google Sign-In
- Microsoft
- Apple
- Facebook
- Twitter/X

---

## 🔑 Get Firebase Configuration

### Step 7: Create Web App and Get Credentials

1. In Firebase Console, go to **Project Overview** (click the Firebase logo)
2. Click the **Web icon** (`</>`) to add a web app
3. Register your app:
   - App nickname: `FlowSet Web`
   - (Optional) Enable Firebase Hosting
   - Click **Register app**
4. Copy the `firebaseConfig` object

Example config:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "flowset-12345.firebaseapp.com",
  projectId: "flowset-12345",
  storageBucket: "flowset-12345.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456",
  measurementId: "G-XXXXXXXXXX"
};
```

5. Click **Continue to console**

---

## 🔧 Configure FlowSet

### Step 8: Create Environment File

1. In your FlowSet project root, create a `.env` file
2. Add your Firebase configuration:

```env
VITE_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_FIREBASE_AUTH_DOMAIN=flowset-12345.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=flowset-12345
VITE_FIREBASE_STORAGE_BUCKET=flowset-12345.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

3. Save the file

⚠️ **Security Note**: Never commit `.env` to Git. It's already in `.gitignore`.

---

## 🛡️ Production Security Rules

### Step 9: Update Firestore Security Rules

1. Go to **Firestore Database > Rules** tab
2. Replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isSignedIn() {
      return request.auth != null;
    }
    
    function isAdmin() {
      return isSignedIn() && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
    
    function isVerifier() {
      return isSignedIn() && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "verifier";
    }
    
    function isOwner(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }
    
    // Users collection
    match /users/{userId} {
      allow read: if isSignedIn();
      allow create: if isOwner(userId);
      allow update: if isOwner(userId) || isAdmin();
      allow delete: if isAdmin();
    }
    
    // Teams collection
    match /teams/{teamId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
      allow update: if isAdmin() || resource.data.ownerId == request.auth.uid;
      allow delete: if isAdmin() || resource.data.ownerId == request.auth.uid;
    }
    
    // Team members collection
    match /teamMembers/{memberId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
      allow update, delete: if isAdmin();
    }
    
    // Teams subcollection members
    match /teams/{teamId}/members/{memberId} {
      allow read: if isSignedIn();
      allow write: if isAdmin() || 
        get(/databases/$(database)/documents/teams/$(teamId)).data.ownerId == request.auth.uid;
    }
    
    // Devices collection (Master device database)
    match /devices/{deviceId} {
      allow read: if isSignedIn();
      allow create, update, delete: if isAdmin();
    }
    
    // Installations collection
    match /installations/{installationId} {
      allow read: if isSignedIn();
      allow create: if isSignedIn() && 
        request.resource.data.installedBy == request.auth.uid;
      allow update: if isAdmin() || isVerifier();
      allow delete: if isAdmin();
    }
    
    // Server data collection
    match /serverData/{dataId} {
      allow read: if isSignedIn();
      allow create, update: if isAdmin();
      allow delete: if isAdmin();
    }
  }
}
```

3. Click **Publish**

### Step 10: Update Storage Security Rules

1. Go to **Storage > Rules** tab
2. Replace the default rules with:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Installation images
    match /installations/{deviceId}/{imageId} {
      // Anyone authenticated can upload images
      allow write: if request.auth != null &&
        request.resource.size < 5 * 1024 * 1024 && // Max 5MB
        request.resource.contentType.matches('image/.*'); // Images only
      
      // Anyone authenticated can read images
      allow read: if request.auth != null;
    }
    
    // User profile photos
    match /profiles/{userId}/{imageId} {
      allow write: if request.auth != null && 
        (request.auth.uid == userId || 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true) &&
        request.resource.size < 2 * 1024 * 1024; // Max 2MB
      
      allow read: if request.auth != null;
    }
  }
}
```

3. Click **Publish**

---

## 👤 Create First Admin User

### Step 11: Sign Up and Make Admin

1. Start your FlowSet app: `npm run dev`
2. Open the app in browser
3. Click **"Sign up"**
4. Enter email and password
5. Complete profile setup
6. After registration, go to Firebase Console
7. Navigate to **Firestore Database > Data** tab
8. Click on `users` collection
9. Find your user document (click on the document ID)
10. Click **"Edit document"** (pencil icon)
11. Modify the following fields:
    - `isAdmin`: change to `true`
    - Add field `role`: set value to `"admin"`
12. Click **Update**
13. Refresh your FlowSet app
14. You should now see all admin menu items

---

## 📊 Seed Sample Data (Optional)

### Step 12: Add Test Devices

1. In Firestore Console, click **"Start collection"**
2. Collection ID: `devices`
3. Document ID: `DEV001`
4. Add fields:
   ```
   id: "DEV001"
   batchId: "BATCH001"
   cityOfDispatch: "New York"
   manufacturer: "Acme Corp"
   description: "Temperature Sensor"
   status: "pending"
   createdAt: [Current timestamp]
   updatedAt: [Current timestamp]
   ```
5. Click **Save**
6. Repeat for more test devices

### Step 13: Add Test Server Data (for Verification Testing)

1. Create collection: `serverData`
2. Add document with auto-ID
3. Add fields:
   ```
   deviceId: "DEV001"
   sensorData: 23.5
   createdAt: [Current timestamp]
   receivedAt: [Current timestamp]
   ```
4. Click **Save**

---

## 🔍 Monitoring and Usage

### Check Firestore Usage

1. Go to **Firestore Database > Usage** tab
2. Monitor:
   - Document reads/writes
   - Storage size
   - Network bandwidth

Free tier limits:
- 50,000 document reads/day
- 20,000 document writes/day
- 20,000 document deletes/day
- 1 GiB stored data

### Check Storage Usage

1. Go to **Storage > Usage** tab
2. Monitor:
   - Stored data size
   - Download bandwidth
   - Upload bandwidth

Free tier limits:
- 5 GB stored
- 1 GB/day download
- Uploads are free

### Check Authentication Usage

1. Go to **Authentication > Usage** tab
2. Monitor:
   - Active users
   - Sign-ins

Free tier: Unlimited

---

## 🚀 Deploy to Firebase Hosting (Optional)

### Step 14: Deploy FlowSet

1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```

2. Login to Firebase:
   ```bash
   firebase login
   ```

3. Initialize Firebase Hosting:
   ```bash
   firebase init hosting
   ```
   - Select your Firebase project
   - Set public directory: `dist`
   - Configure as single-page app: `Yes`
   - Set up automatic builds: `No`

4. Build the app:
   ```bash
   npm run build
   ```

5. Deploy to Firebase:
   ```bash
   firebase deploy --only hosting
   ```

6. Your app will be live at: `https://flowset-12345.web.app`

---

## 🔧 Troubleshooting

### Issue: "Permission Denied" errors

**Solution**: Check Firestore security rules. Ensure user is authenticated and has proper roles.

### Issue: Images won't upload

**Solution**: 
- Check Storage security rules
- Verify image size is under 5MB
- Ensure file is an image type

### Issue: Real-time updates not working

**Solution**:
- Check internet connection
- Verify Firestore rules allow reads
- Check browser console for errors
- Refresh the page

### Issue: Can't make user admin

**Solution**:
- Ensure you're editing the correct user document in Firestore
- Check that `isAdmin` is set to boolean `true`, not string `"true"`
- Refresh the app after updating Firestore

---

## 📊 Cost Estimation

### Free Tier (Spark Plan)
- Firestore: 50K reads, 20K writes, 1GB storage daily
- Storage: 5GB stored, 1GB download daily
- Authentication: Unlimited
- Hosting: 10GB transfer monthly

**Estimated capacity**: 
- ~500-1000 installations per day
- ~50-100 active users
- Perfect for testing and small deployments

### Paid Plan (Blaze - Pay as you go)
- $0.06 per 100K document reads
- $0.18 per 100K document writes
- $0.18/GB/month for stored data
- $0.12/GB for storage downloads

**Estimated cost for 10K installations/month**:
- Firestore: ~$15-30/month
- Storage: ~$5-10/month
- Total: ~$20-40/month

---

## 🎯 Next Steps

1. ✅ Create your first admin user
2. ✅ Import sample devices via CSV
3. ✅ Test installation workflow
4. ✅ Test verification workflow
5. 📱 Share app with team members
6. 🚀 Deploy to production
7. 📊 Monitor usage and scale as needed

---

## 📞 Support

For Firebase-specific issues:
- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Support](https://firebase.google.com/support)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/firebase)

For FlowSet-specific issues:
- Contact Smarttive development team
- Check `FLOWSET_IMPLEMENTATION.md` for architecture details
- Review `QUICKSTART.md` for common issues

---

**Firebase setup complete! 🎉**

Your FlowSet application is now connected to Firebase and ready to use!

