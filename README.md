# Flood Warning Management Console

A comprehensive flood warning management system with real-time monitoring, team coordination, and emergency response capabilities.

## Features

- **Authentication**: Email/password and Google OAuth login via Firebase
- **User Profiles**: Complete profile management with location tracking, device ID, and measurements
- **Team Management**: Create and manage flood response teams with member details
- **Admin Dashboard**: Comprehensive oversight of all users, teams, and data
- **Real-time Updates**: Firebase Firestore for instant data synchronization
- **Responsive Design**: Mobile-first design for field access during emergencies

## Firebase Setup

### 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Google Analytics (optional)

### 2. Enable Authentication

1. Navigate to **Authentication** → **Sign-in method**
2. Enable **Email/Password** provider
3. Enable **Google** provider
4. Add your domain to **Authorized domains**

### 3. Create Firestore Database

1. Navigate to **Firestore Database**
2. Click **Create database**
3. Start in **production mode**
4. Choose your region
5. Deploy the security rules from `firestore.rules`

### 4. Enable Storage

1. Navigate to **Storage**
2. Click **Get started**
3. Start in **production mode**
4. Deploy the security rules from `storage.rules`

### 5. Configure Web App

1. Go to **Project Settings** → **General**
2. Under **Your apps**, add a web app
3. Copy the Firebase config values
4. Add them as Replit secrets:
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_API_KEY`

### 6. Deploy Security Rules

**Firestore Rules:**
```bash
firebase deploy --only firestore:rules
```

**Storage Rules:**
```bash
firebase deploy --only storage:rules
```

Or manually copy the contents of `firestore.rules` and `storage.rules` to your Firebase Console.

## Admin Access

To make a user an admin:

1. Go to Firestore Database in Firebase Console
2. Find the user document in the `users` collection
3. Edit the document and set `isAdmin: true`

## Development

```bash
npm install
npm run dev
```

## Data Structure

### Users Collection
- `uid`: User ID (auto-generated)
- `email`: User email
- `displayName`: Full name
- `photoURL`: Profile picture URL
- `location`: Geographic location
- `deviceId`: Flood monitoring device ID
- `height`: User height measurement
- `heightUnit`: Unit (cm or ft)
- `isAdmin`: Admin flag
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp

### Teams Collection
- `id`: Team ID (auto-generated)
- `name`: Team name
- `ownerId`: User ID of team owner
- `ownerName`: Display name of owner
- `createdAt`: Creation timestamp
- `updatedAt`: Last update timestamp

### Team Members Subcollection (teams/{teamId}/members)
- `id`: Member ID (auto-generated)
- `email`: Member email
- `name`: Member full name
- `deviceId`: Device ID
- `photoURL`: Profile picture URL
- `height`: Height measurement
- `heightUnit`: Unit (cm or ft)
- `addedAt`: Timestamp when added

## Security

- Firebase Authentication for user management
- Firestore security rules for data access control
- Storage security rules for file uploads
- Role-based access (regular users vs admins)
- Team ownership validation

## License

MIT
