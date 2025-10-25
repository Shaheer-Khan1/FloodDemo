# Flood Warning Management Console

## Project Overview
A comprehensive flood warning management system built with React and Firebase. The application enables emergency response coordination through user profiles, team management, and admin oversight capabilities.

## Architecture

### Frontend (React + TypeScript)
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **Styling**: Tailwind CSS with Shadcn UI components
- **State Management**: React Query for server state, Context API for auth
- **Forms**: React Hook Form with Zod validation

### Backend (Firebase)
- **Authentication**: Firebase Auth (Email/Password + Google OAuth)
- **Database**: Firestore (NoSQL real-time database)
- **Storage**: Firebase Storage for profile/team member photos
- **Security**: Custom Firestore and Storage security rules

## Key Features

1. **Authentication System**
   - Email/password registration and login
   - Google OAuth integration
   - Protected routes with automatic redirection
   - Persistent auth state across sessions

2. **User Profile Management**
   - Multi-step profile setup wizard
   - Location auto-detection using Geolocation API
   - Device ID tracking for flood monitoring equipment
   - Height measurements with unit conversion (cm/ft)
   - Profile photo upload with Firebase Storage
   - Profile editing capabilities

3. **Team Management**
   - Create and manage multiple teams
   - Add team members with full details
   - Team member photos and information
   - Team ownership and permissions
   - Real-time team updates

4. **Admin Dashboard**
   - View all users and their profiles
   - Access all teams and member data
   - Search and filter capabilities
   - Expandable user details view
   - Admin-only access control

## File Structure

```
client/
├── src/
│   ├── components/
│   │   ├── ui/           # Shadcn UI components
│   │   ├── app-layout.tsx
│   │   ├── protected-route.tsx
│   │   └── team-member-dialog.tsx
│   ├── lib/
│   │   ├── firebase.ts        # Firebase initialization
│   │   ├── auth-context.tsx   # Auth state management
│   │   └── queryClient.ts
│   ├── pages/
│   │   ├── login.tsx
│   │   ├── profile-setup.tsx
│   │   ├── dashboard.tsx
│   │   ├── profile.tsx
│   │   ├── teams.tsx
│   │   └── admin.tsx
│   ├── App.tsx
│   └── index.css
shared/
└── schema.ts             # TypeScript types and Zod schemas
```

## Firebase Configuration

### Required Secrets
- `VITE_FIREBASE_PROJECT_ID`: Firebase project ID
- `VITE_FIREBASE_APP_ID`: Firebase app ID
- `VITE_FIREBASE_API_KEY`: Firebase API key

### Firestore Collections

**users/**
- User profiles with location, device info, and admin status
- Security: Users can read/write own profile, admins can read all

**teams/**
- Team information with owner details
- Security: Owner and admins can access

**teams/{teamId}/members/**
- Team member details as subcollection
- Security: Team owner and admins can manage

### Security Rules
- Firestore rules in `firestore.rules`
- Storage rules in `storage.rules`
- Role-based access control (admin vs regular users)
- Ownership validation for teams

## Design System

### Colors
- Primary: Blue (#1d4ed8) - for actions and highlights
- Background: Light gray (#fafafa) / Dark (#141414)
- Cards: Slightly elevated from background
- Text hierarchy: Default, muted, and tertiary levels

### Typography
- Font: Inter
- Hierarchy: 3xl (headers) → xl (card titles) → base (content) → sm/xs (metadata)

### Layout
- Max-width containers (7xl for dashboards)
- Responsive grid systems
- Sidebar navigation (desktop) / drawer (mobile)
- Consistent spacing: 4, 6, 8 units

### Components
- Shadcn UI for consistency
- Custom elevation system (hover-elevate, active-elevate-2)
- Avatar system with fallbacks
- Progress indicators for multi-step forms

## User Flows

### New User Registration
1. Land on login page
2. Choose signup mode
3. Create account (email/password or Google)
4. Complete 4-step profile setup:
   - Name & Location (with auto-detect)
   - Device ID
   - Photo upload (optional)
   - Height measurement
5. Redirected to dashboard

### Team Management
1. Navigate to Teams page
2. Create new team
3. Add team members with details
4. View team overview with member cards
5. Edit/delete teams and members

### Admin Operations
1. Access admin dashboard (admin users only)
2. View all users in expandable list
3. Search/filter users
4. View user details and teams
5. Monitor system-wide statistics

## Firebase Best Practices

### Authentication
- `onAuthStateChanged` for persistent auth
- Automatic profile fetching on auth change
- Protected routes check both auth and profile existence

### Firestore
- Real-time listeners for live updates
- Batch operations for efficiency
- Proper indexing for queries
- Timestamp using `serverTimestamp()`

### Storage
- Organized folder structure
- 5MB file size limit
- Image type validation
- Unique filenames to prevent conflicts

## Development Notes

### Running Locally
```bash
npm install
npm run dev
```

### Making Users Admin
Admins must be set manually in Firestore:
1. Go to Firebase Console → Firestore
2. Find user in `users` collection
3. Set `isAdmin: true`

### Common Issues
- **Auth redirect loops**: Check profile setup completion
- **Permission denied**: Verify Firestore/Storage rules deployed
- **Location not working**: HTTPS required for geolocation
- **Images not loading**: Check CORS and storage rules

## Future Enhancements
- Real-time flood alerts and notifications
- Map visualization of team locations
- Device status monitoring
- Team chat/communication
- Alert history and reporting
- Multi-language support
- Mobile app (React Native)
