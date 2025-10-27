# FlowSet Role-Based Access Control Guide

## Overview

FlowSet now implements a comprehensive role-based access control (RBAC) system that automatically prompts users to select their role upon first login. This ensures each user has the appropriate permissions and sees only relevant features.

---

## 🎭 User Roles

### 1. **Administrator** (Admin)
**Badge:** Blue "Administrator" badge
**Access Level:** Full system access
**Auto-assigned:** No (must be manually set in Firestore)

#### Permissions:
- ✅ View and manage all devices
- ✅ Bulk import devices via CSV
- ✅ Create installations (can perform any role)
- ✅ Verify installations
- ✅ Access verification queue
- ✅ Manage users and teams
- ✅ View all submissions
- ✅ Access admin dashboard
- ✅ View master device list
- ✅ All system features

#### Dashboard Quick Actions:
- Master Device List
- Verification Queue
- Import Devices
- Admin Dashboard
- Teams

#### Navigation Menu Items:
- Dashboard
- Profile
- Teams
- Admin
- Devices
- Import Devices
- Verification
- New Installation
- My Submissions

---

### 2. **Installer** (Field Technician)
**Badge:** Gray "installer" badge
**Access Level:** Installation-focused
**Auto-assigned:** Yes (user selects on first login)

#### Permissions:
- ✅ Create new installations
- ✅ Validate device IDs
- ✅ Upload installation photos
- ✅ View own submissions
- ✅ Track installation status
- ✅ Manage teams (create/join)
- ❌ Cannot verify installations
- ❌ Cannot import devices
- ❌ Cannot access admin features
- ❌ Cannot view other users' submissions

#### Dashboard Quick Actions:
- New Installation
- My Submissions
- Teams

#### Navigation Menu Items:
- Dashboard
- Profile
- Teams
- New Installation
- My Submissions

---

### 3. **Verifier** (Quality Assurance / Group Lead)
**Badge:** Gray "verifier" badge
**Access Level:** Verification-focused
**Auto-assigned:** Yes (user selects on first login)

#### Permissions:
- ✅ Access verification queue
- ✅ Review pending installations
- ✅ Compare installer vs server data
- ✅ Approve installations
- ✅ Flag installations with reasons
- ✅ View master device list (read-only)
- ✅ Manage teams
- ❌ Cannot create installations
- ❌ Cannot import devices
- ❌ Cannot access admin features

#### Dashboard Quick Actions:
- Verification Queue
- Device List
- Teams

#### Navigation Menu Items:
- Dashboard
- Profile
- Teams
- Verification

---

## 🔄 Role Selection Flow

### First-Time Login Process

1. **User Signs Up**
   - Creates account via email/password
   - Redirected to Profile Setup page

2. **Profile Setup**
   - Fills in: Name, Location, Device ID, Height
   - Submits profile information
   - Redirected to Role Selection

3. **Role Selection**
   - Beautiful card-based interface
   - Two options: Installer or Verifier
   - Detailed description of each role
   - List of permissions for each role
   - One-click selection

4. **Post-Selection**
   - Role saved to user profile in Firestore
   - Automatic redirect to appropriate page:
     - **Installer** → New Installation page
     - **Verifier** → Verification Queue page
   - Dashboard updated with role-specific quick actions

### Admin Bypass

Administrators bypass role selection entirely:
- System detects `isAdmin: true` in profile
- Automatically redirects to Dashboard
- Full access granted immediately
- Can perform actions of all roles

---

## 🛠️ Technical Implementation

### Database Schema

**users collection:**
```typescript
{
  uid: string;
  email: string;
  displayName: string;
  isAdmin: boolean;          // Only true for admins
  role?: "installer" | "verifier";  // Set during role selection
  // ... other fields
}
```

### Protected Route Logic

```typescript
// Route protection flow:
1. Check if user is authenticated
   ❌ Not authenticated → Redirect to /login

2. Check if user has profile
   ❌ No profile → Redirect to /profile-setup

3. Check if user is admin
   ✅ Admin → Allow access to all routes
   
4. Check if user has role
   ❌ No role → Redirect to /role-selection
   ✅ Has role → Apply role-based restrictions
```

### Access Control Patterns

**Admin-Only Pages:**
```typescript
if (!userProfile?.isAdmin) {
  return <AccessDenied />;
}
```

**Admin or Verifier Pages:**
```typescript
if (!userProfile?.isAdmin && userProfile?.role !== "verifier") {
  return <AccessDenied />;
}
```

**Role-Specific Navigation:**
```typescript
const menuItems = [
  // Common items
  { title: "Dashboard", icon: LayoutDashboard, url: "/dashboard" },
  
  // Admin-only items
  ...(userProfile?.isAdmin ? [
    { title: "Admin", icon: Shield, url: "/admin" },
    { title: "Devices", icon: Package, url: "/devices" },
  ] : []),
  
  // Installer/Verifier items
  { title: "New Installation", icon: Plus, url: "/new-installation" },
  { title: "My Submissions", icon: List, url: "/my-submissions" },
  
  // Verifier-specific items
  ...(userProfile?.role === "verifier" ? [
    { title: "Verification", icon: CheckSquare, url: "/verification" },
  ] : []),
];
```

---

## 📱 User Experience Features

### Role Selection Page

**Visual Design:**
- Full-screen centered card layout
- Large role cards with icons
- Hover effects and animations
- Selected state indication
- Loading states during save

**Role Cards Include:**
- Large icon (Wrench for Installer, ClipboardCheck for Verifier)
- Role title and subtitle
- Badge with role type
- Description of role purpose
- Bulleted list of permissions
- "Select" button with loading state

**Installer Card:**
- Blue theme
- Wrench icon
- Lists: Create installations, validate IDs, upload photos, track submissions

**Verifier Card:**
- Green theme
- ClipboardCheck icon
- Lists: Review installations, compare data, approve, flag, monitor quality

### Dashboard Personalization

**Welcome Message:**
- "Admin Dashboard - Full system access" (Admins)
- "Installer Dashboard - Record installations" (Installers)
- "Verifier Dashboard - Review submissions" (Verifiers)

**Role Badge Display:**
- Shown next to welcome message
- Color-coded (blue for admin, gray for roles)
- Capitalized role name

**Quick Actions:**
- Dynamically generated based on role
- Most relevant actions shown first
- Clear icons and descriptions

---

## 🔐 Security Considerations

### Firestore Security Rules

```javascript
// Recommended Firestore rules for role-based access

// Helper functions
function isAdmin() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
}

function isVerifier() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "verifier";
}

function isInstaller() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "installer";
}

// Devices - Admins write, Verifiers/Admins read
match /devices/{deviceId} {
  allow read: if isAdmin() || isVerifier();
  allow write: if isAdmin();
}

// Installations - All authenticated can read, Installers create, Admins/Verifiers update
match /installations/{installationId} {
  allow read: if request.auth != null;
  allow create: if isInstaller() || isAdmin();
  allow update: if isAdmin() || isVerifier();
  allow delete: if isAdmin();
}

// Server data - Admins only
match /serverData/{dataId} {
  allow read: if isAdmin() || isVerifier();
  allow write: if isAdmin();
}

// Users - Own profile + admins
match /users/{userId} {
  allow read: if request.auth != null;
  allow create: if request.auth.uid == userId;
  allow update: if request.auth.uid == userId || isAdmin();
  allow delete: if isAdmin();
}
```

### Frontend Access Control

**Page-Level Protection:**
- All pages wrapped in `<ProtectedRoute>`
- Automatic redirect to login if not authenticated
- Automatic redirect to role selection if no role set
- Role checks at component render level

**Action-Level Protection:**
- Buttons hidden/disabled based on permissions
- API calls validated on both client and server
- Error handling for unauthorized actions

**Data-Level Protection:**
- Firestore queries filtered by user permissions
- Real-time listeners respect user role
- Only relevant data fetched from database

---

## 🎯 Common Workflows

### Workflow 1: New Installer Onboarding

1. User signs up with email/password
2. Completes profile setup
3. Sees role selection page
4. Selects "Installer"
5. Redirected to "New Installation" page
6. Can immediately start creating installations
7. Dashboard shows installer-specific quick actions

### Workflow 2: New Verifier Onboarding

1. User signs up with email/password
2. Completes profile setup
3. Sees role selection page
4. Selects "Verifier"
5. Redirected to "Verification Queue"
6. Can immediately start reviewing installations
7. Dashboard shows verifier-specific quick actions

### Workflow 3: Making User Admin

**Method 1: Firestore Console**
1. Go to Firebase Console
2. Navigate to Firestore Database
3. Open `users` collection
4. Find user document
5. Edit document
6. Set `isAdmin: true`
7. User refreshes app
8. Full admin access granted

**Method 2: Admin UI (Future Enhancement)**
- Admin page with user management
- Toggle admin status with button
- Automatic permission update

---

## 📊 Role Comparison Matrix

| Feature | Admin | Installer | Verifier |
|---------|-------|-----------|----------|
| View Dashboard | ✅ | ✅ | ✅ |
| Edit Profile | ✅ | ✅ | ✅ |
| Manage Teams | ✅ | ✅ | ✅ |
| Import Devices | ✅ | ❌ | ❌ |
| View All Devices | ✅ | ❌ | ✅ (Read-only) |
| Create Installation | ✅ | ✅ | ❌ |
| View Own Submissions | ✅ | ✅ | ❌ |
| Access Verification Queue | ✅ | ❌ | ✅ |
| Approve Installations | ✅ | ❌ | ✅ |
| Flag Installations | ✅ | ❌ | ✅ |
| View All Submissions | ✅ | ❌ | ✅ |
| User Management | ✅ | ❌ | ❌ |
| Admin Dashboard | ✅ | ❌ | ❌ |

---

## 🔄 Changing User Roles

### Current Method (Manual)

**To change a user's role:**
1. Go to Firebase Console → Firestore
2. Navigate to `users` collection
3. Find the user document
4. Edit the `role` field
5. Change value to `"installer"` or `"verifier"`
6. Save the document
7. User must log out and log back in

### Future Enhancement

**Planned features:**
- [ ] Admin UI for role management
- [ ] Role change history tracking
- [ ] Email notification when role changes
- [ ] User can request role change
- [ ] Multi-role support (user has multiple roles)
- [ ] Temporary role elevation

---

## 🧪 Testing Role-Based Access

### Test Scenario 1: Installer Flow

```
✓ Sign up new user
✓ Complete profile setup
✓ See role selection page
✓ Select "Installer"
✓ Redirected to New Installation
✓ Dashboard shows installer actions
✓ Navigation menu shows installer items
✓ Cannot access /verification (blocked)
✓ Cannot access /device-import (blocked)
✓ Cannot access /admin (blocked)
```

### Test Scenario 2: Verifier Flow

```
✓ Sign up new user
✓ Complete profile setup
✓ See role selection page
✓ Select "Verifier"
✓ Redirected to Verification Queue
✓ Dashboard shows verifier actions
✓ Navigation menu shows verifier items
✓ Cannot access /new-installation (shown but can be accessed)
✓ Cannot access /device-import (blocked)
✓ Cannot access /admin (blocked)
✓ Can view devices (read-only)
```

### Test Scenario 3: Admin Flow

```
✓ Sign up new user
✓ Complete profile setup
✓ Manually set isAdmin: true in Firestore
✓ Log back in
✓ Bypass role selection
✓ Redirected directly to Dashboard
✓ Dashboard shows all actions
✓ Navigation menu shows all items
✓ Can access all pages
✓ Can perform all operations
```

---

## 📝 Notes & Best Practices

### For Developers

1. **Always check role before rendering actions**
   - Don't just hide UI elements
   - Enforce permissions on backend

2. **Use TypeScript types**
   - Role is type-safe: `"installer" | "verifier"`
   - Benefits from autocomplete and type checking

3. **Handle missing roles gracefully**
   - Check `userProfile?.role` existence
   - Provide fallback UI for edge cases

4. **Keep role logic centralized**
   - Define permissions in one place
   - Reuse permission checks across components

### For Administrators

1. **Set admin status immediately**
   - New admins need `isAdmin: true` set manually
   - Regular users get role from UI selection

2. **Document role assignments**
   - Keep track of who has which role
   - Audit role changes regularly

3. **Monitor role-based access**
   - Check Firestore logs for access attempts
   - Ensure security rules are enforced

### For Users

1. **Choose role carefully**
   - Role selection is permanent (without admin intervention)
   - Contact admin to change role later

2. **Report access issues**
   - If you can't access expected features
   - Admin may need to update your role

---

## 🚀 Future Enhancements

### Planned Features

1. **Multi-Role Support**
   - Users can have multiple roles
   - Switch between roles dynamically
   - Context-aware interface

2. **Role Management UI**
   - Admin page for managing user roles
   - Bulk role assignment
   - Role change requests

3. **Permission Granularity**
   - Custom permissions beyond roles
   - Feature flags per user
   - Temporary access grants

4. **Audit Logging**
   - Track all role-based actions
   - Export audit reports
   - Compliance monitoring

5. **Team-Based Roles**
   - Roles assigned per team
   - Different roles in different teams
   - Team admin capabilities

---

## 📞 Support

For questions about role-based access control:
- Review this documentation
- Check Firebase Console for current role assignments
- Contact Smarttive development team for issues
- See `FLOWSET_IMPLEMENTATION.md` for technical details

---

**Role-Based Access Control v1.0**  
*Part of FlowSet IoT Installation Management System*  
*Built by Smarttive*

