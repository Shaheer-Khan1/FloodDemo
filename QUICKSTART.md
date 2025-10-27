# FlowSet Quick Start Guide

Get FlowSet up and running in 5 minutes!

## 🚀 Quick Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Firebase

#### Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" and follow the wizard
3. Enable Google Analytics (optional)

#### Enable Required Services

**Firestore Database:**
1. Navigate to Build > Firestore Database
2. Click "Create database"
3. Start in **test mode** (we'll add security rules later)
4. Choose your preferred location

**Firebase Storage:**
1. Navigate to Build > Storage
2. Click "Get started"
3. Start in **test mode**

**Authentication:**
1. Navigate to Build > Authentication
2. Click "Get started"
3. Enable **Email/Password** sign-in method

#### Get Firebase Configuration
1. Go to Project Settings (gear icon)
2. Scroll to "Your apps" section
3. Click the web icon (`</>`) to create a web app
4. Register your app with a nickname (e.g., "FlowSet")
5. Copy the `firebaseConfig` object values

### 3. Set Environment Variables
```bash
# Copy the example file
cp .env.example .env

# Edit .env with your Firebase credentials
# Use values from Firebase console
```

Example `.env` file:
```env
VITE_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
VITE_FIREBASE_AUTH_DOMAIN=flowset-12345.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=flowset-12345
VITE_FIREBASE_STORAGE_BUCKET=flowset-12345.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef123456
```

### 4. Start Development Server
```bash
npm run dev
```

The app will open at `http://localhost:5173`

## 👤 First User Setup

### Create Your First Admin User

1. Open the app and click **"Sign up"**
2. Enter your email and password
3. Complete the profile setup form
4. **Important**: Make yourself an admin in Firestore:
   - Go to Firebase Console > Firestore Database
   - Find your user document in the `users` collection
   - Edit the document
   - Set `isAdmin: true`
   - Set `role: "admin"` (optional, for explicit role)
   - Click **Update**

### Login and Explore

1. Log in with your credentials
2. You should now see all admin menu items:
   - Dashboard
   - Profile
   - Teams
   - **Admin** (user management)
   - **Devices** (master device list)
   - **Import Devices** (bulk import)
   - **Verification** (verification queue)
   - New Installation
   - My Submissions

## 📊 Quick Feature Tour

### 1. Import Devices (Admin Only)

Navigate to **Import Devices** to bulk import your device inventory:

1. Click **"Download CSV Template"**
2. Fill in device data (Device ID, Batch ID, City, Manufacturer, Description)
3. Save as `.csv` file
4. Upload the file
5. Click **"Import Devices"**
6. View import results

Sample CSV content:
```csv
Device ID,Batch ID,City of Dispatch,Manufacturer,Description
"DEV001","BATCH001","New York","Acme Corp","Temperature Sensor"
"DEV002","BATCH001","Los Angeles","Acme Corp","Humidity Sensor"
"DEV003","BATCH002","Chicago","TechFlow Inc","Pressure Sensor"
```

### 2. View Master Device List

Navigate to **Devices** to see all imported devices:

- Filter by status (Pending, Installed, Verified, Flagged)
- Filter by city
- Search by Device ID, Batch ID, Manufacturer, or Description
- View KPI statistics
- See consolidated data (device + installation + server data)

### 3. Create an Installation (All Users)

Navigate to **New Installation** to record a device installation:

1. **Step 1: Validate Device**
   - Enter Device ID
   - Click "Validate"
   - Confirm device exists and is pending

2. **Step 2: Installation Details**
   - Enter Location ID
   - Enter Sensor Reading (numeric value)

3. **Step 3: Upload Images**
   - Upload mandatory installation photo
   - (Optional) Upload additional photo
   - Preview images before submission

4. Click **"Submit Installation"**

### 4. Track Your Submissions

Navigate to **My Submissions** to see all your installations:

- View submission status (Pending, Verified, Flagged)
- See KPI statistics
- Click "View Details" to see full information
- View uploaded photos
- See flagged reasons (if rejected)

### 5. Verify Installations (Admin/Verifier Only)

Navigate to **Verification** to review pending installations:

1. See pending installations queue
2. View high variance alerts (>5% difference)
3. Click **"Review"** on any installation
4. Compare installer data vs. server data
5. View installation photos
6. Either:
   - **Approve** if everything looks good
   - **Flag** if there are issues (provide reason)

## 🧪 Testing with Sample Data

### Add Server Data Manually (for Testing)

To test the verification flow, you need server data:

1. Go to Firebase Console > Firestore Database
2. Create a new collection: `serverData`
3. Add a document with:
   ```json
   {
     "id": "auto-generated",
     "deviceId": "DEV001",
     "sensorData": 23.5,
     "createdAt": "Current timestamp",
     "receivedAt": "Current timestamp"
   }
   ```

### Complete Workflow Test

1. **Import** a device (e.g., DEV001)
2. **Create** an installation for DEV001 with sensor reading 25.0
3. **Add** server data for DEV001 with sensor value 23.5
4. Go to **Verification** queue
5. You should see the installation with 6% variance highlighted
6. **Review** and either approve or flag

## 🔐 Production Security Rules

Before going to production, update Firestore security rules:

Go to Firebase Console > Firestore Database > Rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper function to check if user is admin
    function isAdmin() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
    
    // Helper function to check if user is verifier
    function isVerifier() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "verifier";
    }
    
    // Users can read their own profile
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == userId || isAdmin();
    }
    
    // Teams
    match /teams/{teamId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if isAdmin() || 
        resource.data.ownerId == request.auth.uid;
    }
    
    // Team members
    match /teamMembers/{memberId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    // Devices - Admins only can write
    match /devices/{deviceId} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
    
    // Installations - Users can create, admins/verifiers can update
    match /installations/{installationId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && 
        request.resource.data.installedBy == request.auth.uid;
      allow update: if isAdmin() || isVerifier();
      allow delete: if isAdmin();
    }
    
    // Server data - read for all, write for admins only
    match /serverData/{dataId} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
  }
}
```

Update Storage rules:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /installations/{deviceId}/{imageId} {
      // Allow authenticated users to upload
      allow write: if request.auth != null && 
        request.resource.size < 5 * 1024 * 1024 && // 5MB max
        request.resource.contentType.matches('image/.*');
      
      // Allow authenticated users to read
      allow read: if request.auth != null;
    }
  }
}
```

## 📱 Mobile Responsive

FlowSet is fully responsive and works great on:
- Desktop browsers (Chrome, Firefox, Safari, Edge)
- Tablets
- Mobile phones

Perfect for field technicians using phones!

## 🆘 Troubleshooting

### App won't start
- Check that `.env` file exists and has correct Firebase credentials
- Run `npm install` to ensure all dependencies are installed
- Check console for error messages

### Can't log in
- Verify Firebase Authentication is enabled
- Check that Email/Password provider is enabled
- Verify your credentials are correct

### Images won't upload
- Check Firebase Storage is enabled
- Verify image is under 5MB
- Check browser console for errors
- Ensure storage rules allow uploads

### Real-time updates not working
- Check Firestore is enabled
- Verify security rules allow reads
- Check browser console for permission errors
- Try refreshing the page

### Import fails
- Ensure CSV format matches template
- Check for duplicate Device IDs
- Verify all required fields are present
- Check console for specific error messages

## 🎯 Next Steps

1. **Create User Roles**: Add installers and verifiers
2. **Import Production Data**: Bulk import your device inventory
3. **Set Up Teams**: Organize users into teams
4. **Test Workflow**: Complete end-to-end installation and verification
5. **Customize Branding**: Update colors, logo, and branding
6. **Deploy**: Deploy to Firebase Hosting or your preferred platform

## 📚 Additional Resources

- [Full Implementation Documentation](./FLOWSET_IMPLEMENTATION.md)
- [Firebase Documentation](https://firebase.google.com/docs)
- [React Documentation](https://react.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com)
- [shadcn/ui Components](https://ui.shadcn.com)

## 🤝 Need Help?

Contact the Smarttive development team for support and questions.

---

**Happy Installing! 🚀**

