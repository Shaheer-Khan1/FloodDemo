# User Profile & Users Collection - Deep Search Analysis

## Overview
This document details all locations where `users` collection and `userProfile` are used throughout the FloodWatch Console application.

---

## 1. Users Collection Access

### Files that directly access `users` collection:

#### **src/lib/auth-context.tsx**
- **Purpose**: Fetches user profile on authentication
- **Code**: `getDoc(doc(db, 'users', uid))`
- **Notes**: 
  - Auto-grants admin access to emails in `adminEmails` array
  - Currently includes: `user@smart.com`

#### **src/pages/create-user.tsx**
- **Purpose**: Creates new user in users collection
- **Code**: `setDoc(doc(db, "users", newUser.uid), userData)`
- **Notes**: Saves user data for auth-context compatibility

#### **src/pages/profile-setup.tsx**
- **Purpose**: Updates user profile on initial setup
- **Code**: `setDoc(doc(db, "users", user.uid), profileData, { merge: true })`
- **Notes**: Syncs with both userProfiles and users collections

#### **src/pages/role-selection.tsx**
- **Purpose**: Updates user role selection
- **Code**: `updateDoc(doc(db, "users", userProfile.uid), { role, updatedAt })`
- **Notes**: Updates role for auth-context compatibility

#### **src/pages/profile.tsx**
- **Purpose**: Updates user profile information
- **Code**: `updateDoc(doc(db, "users", user.uid), { displayName, photoURL, ... })`
- **Notes**: Updates display name, photo, and other profile fields

---

## 2. UserProfile Usage by File

### Files using userProfile (281 total matches across 28 files):

#### **Core Authentication**
1. **src/lib/auth-context.tsx** (3 matches)
   - Manages userProfile state
   - Fetches from Firestore
   - Auto-grants admin to Smart LPG users

2. **src/components/protected-route.tsx** (8 matches)
   - Checks authentication status
   - Validates user roles
   - Redirects based on permissions

3. **src/App.tsx**
   - Routes and authentication checks

#### **Navigation & Layout**
4. **src/components/app-layout.tsx** (21 matches)
   - Uses: `userProfile.isAdmin`, `userProfile.role`, `userProfile.displayName`
   - Dynamic menu based on user role
   - Admin, installer, verifier, manager, ministry role handling

#### **Admin Pages**
5. **src/pages/admin.tsx** (13 matches)
   - Admin-only page
   - Uses users collection query

6. **src/pages/admin-management.tsx** (2 matches)
   - User management
   - Role administration

7. **src/pages/device-management.tsx** (2 matches)
   - Device administration

8. **src/pages/device-import.tsx** (3 matches)
   - Bulk device import (admin only)

9. **src/pages/create-user.tsx** (26 matches)
   - User creation interface

#### **Device & Installation Pages**
10. **src/pages/devices.tsx** (9 matches)
    - Uses: `userProfile.isAdmin`
    - **NOW UPDATED**: Uses Smart LPG detection for data display

11. **src/pages/verification.tsx** (57 matches)
    - Uses: `userProfile.isAdmin`, `userProfile.role`, `userProfile.teamId`, `userProfile.displayName`
    - **UPDATED**: Fetches from smartLPG collection for Smart LPG users
    - Filters by team for non-admins
    - Records verifier name in updates

12. **src/pages/installation-verification.tsx** (6 matches)
    - Installation review system

13. **src/pages/installation-management.tsx** (6 matches)
    - Installation administration

14. **src/pages/my-submissions.tsx** (6 matches)
    - User's own submissions

15. **src/pages/new-installation.tsx** (8 matches)
    - Create new installation

#### **Team Management**
16. **src/pages/teams.tsx** (20 matches)
    - Team/Amanah management
    - Uses: `userProfile.uid`, `userProfile.teamId`

17. **src/pages/dashboard.tsx** (24 matches)
    - Uses: `userProfile.uid`, `userProfile.displayName`, `userProfile.role`
    - Query: `where("userId", "==", userProfile.uid)`
    - Fetches team memberships

#### **Box/Cylinder Management**
18. **src/pages/box-management.tsx** (4 matches)
    - Box/cylinder tracking

19. **src/pages/box-status.tsx** (2 matches)
    - Box status monitoring

20. **src/pages/box-import.tsx** (8 matches)
    - Bulk box import

21. **src/pages/open-boxes.tsx** (8 matches)
    - Open box tracking

#### **Ministry/External Views**
22. **src/pages/ministry-devices.tsx** (2 matches)
    - Ministry view of devices

23. **src/pages/ministry-stats.tsx** (2 matches)
    - Ministry statistics

24. **src/pages/installations-map.tsx** (2 matches)
    - Map view of installations

#### **User Profile Pages**
25. **src/pages/profile.tsx** (10 matches)
    - User profile editing
    - Updates users collection

26. **src/pages/profile-setup.tsx** (12 matches)
    - Initial profile setup
    - Syncs to users collection

27. **src/pages/role-selection.tsx** (9 matches)
    - Role selection on first login
    - Updates users collection

28. **src/pages/login.tsx** (3 matches)
    - Login page

29. **src/pages/review-audit.tsx** (5 matches)
    - Audit review system

---

## 3. UserProfile Properties Used

### Common Properties:
- **userProfile.isAdmin** - Admin access check (most pages)
- **userProfile.role** - Role-based access ("installer", "verifier", "manager", "ministry")
- **userProfile.uid** - User unique identifier
- **userProfile.displayName** - User's display name
- **userProfile.email** - User's email address
- **userProfile.teamId** - Team/Amanah association

### Access Patterns:
```typescript
// Admin check
if (userProfile?.isAdmin) { ... }

// Role check
if (userProfile?.role === "verifier") { ... }

// Team filter
where("teamId", "==", userProfile.teamId)

// User identification
verifiedBy: userProfile.displayName
userId: userProfile.uid
```

---

## 4. Smart LPG User Detection

### Current Implementation:

#### **src/lib/user-utils.ts**
```typescript
const SMART_LPG_USER_EMAILS = ['user@smart.com'];

export function isSmartLPGUser(user: User | null): boolean {
  if (!user?.email) return false;
  return SMART_LPG_USER_EMAILS.includes(user.email.toLowerCase());
}
```

#### **Files Using Smart LPG Detection:**
1. **src/pages/devices.tsx** ✅
   - Dynamic table columns
   - Shows IoT sensor data for Smart LPG users

2. **src/pages/verification.tsx** ✅
   - Fetches from smartLPG collection
   - Different data structure

3. **src/pages/admin-device-filter.tsx** ✅
   - Conditional collection fetching
   - Dynamic field mapping

---

## 5. Data Collection Routing

### For Smart LPG Users (user@smart.com):
| Collection | Usage |
|------------|-------|
| `smartLPG` | Devices & installations data |
| `users` | User profile (same as others) |
| `teams` | Team data (same as others) |

### For Regular Users:
| Collection | Usage |
|------------|-------|
| `installations` | Installation records |
| `devices` | Device registry |
| `users` | User profile |
| `teams` | Team data |

---

## 6. Security Considerations

### Admin Auto-Grant:
- **Location**: `src/lib/auth-context.tsx`
- **Emails**: `['user@smart.com']`
- **Applied**: On user profile fetch
- **Note**: Client-side only - Firestore rules should also be updated

### Role-Based Access:
- **Roles**: admin, installer, verifier, manager, ministry
- **Enforcement**: Component-level checks
- **Admin Bypass**: Admins can access all features

---

## 7. Potential Issues & Recommendations

### Current State:
✅ **Smart LPG user detection working**
✅ **Data routing implemented** (devices, verification, filter pages)
✅ **Auto-admin grant working**
✅ **Dynamic UI labels implemented**

### Not Yet Implemented:
⚠️ **Other pages may need Smart LPG handling:**
   - `installation-verification.tsx` - May need smartLPG support
   - `my-submissions.tsx` - May need smartLPG filtering
   - `new-installation.tsx` - May need smartLPG form
   - `ministry-devices.tsx` - May need smartLPG data
   - `installations-map.tsx` - May need smartLPG mapping

### Recommendations:
1. ✅ Add Smart LPG detection to remaining pages as needed
2. ✅ Update Firestore security rules for Smart LPG collection
3. ✅ Consider adding Smart LPG role/flag to user profile instead of email check
4. ✅ Document Smart LPG data structure differences
5. ✅ Add Smart LPG-specific forms for data entry

---

## 8. Smart LPG Data Structure

### Actual Fields (from console log):
```typescript
{
  device_id: "TEK-00001",
  device_type: "Tekelek Ultrasonic Meter",
  manufacturer: "Tekelek",
  model: "TEK-811/TEK-871",
  level_cm: 194,
  level_percent: 97,
  battery_volt: 3.46,
  temp: 21.96,
  signal_rssi: -116,
  imei: "35987654321176",
  protocol: "NB-IoT/CAT-M1",
  timestamp_utc: "2026-01-19T19:15:03.072Z",
  created_at: "2026-01-19T19:15:03.072Z",
  alarm_flags: {
    high_level: false,
    low_level: false,
    overflow: false
  }
}
```

### vs Flood Sensor Structure:
```typescript
{
  id: "device-uid",
  boxCode: "box-code",
  boxNumber: "box-number",
  productId: "product-id",
  status: "pending|installed|verified|flagged",
  installation: {
    installedByName: "name",
    locationId: "location",
    sensorReading: 123,
    latestDisCm: 456
  }
}
```

---

## Summary

**Total Files Using UserProfile**: 28 files
**Total UserProfile References**: 281 matches
**Files Accessing Users Collection**: 5 files
**Files Updated for Smart LPG**: 3 files (devices, verification, admin-filter)

The system is now set up to:
1. ✅ Auto-detect Smart LPG users by email
2. ✅ Route to correct data collections
3. ✅ Display appropriate data fields
4. ✅ Maintain separate data structures

**Next Steps**: Consider updating remaining pages that may interact with installation/device data to support Smart LPG data structure.
