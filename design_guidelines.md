# Flood Warning Management Console - Design Guidelines

## Design Approach

**System Selection**: Material Design principles with emergency management adaptations
- **Justification**: Data-heavy dashboard requiring clear hierarchy, strong visual feedback for status indicators, and proven mobile responsiveness for field access during emergencies
- **Key Principle**: Clarity over decoration - every element serves a functional purpose in emergency scenarios

## Typography System

**Font Family**: Inter (via Google Fonts CDN)
- Primary: Inter (400, 500, 600, 700 weights)

**Hierarchy**:
- Page Headers: text-3xl font-bold (Dashboard titles, section headers)
- Card Headers: text-xl font-semibold (User profiles, team cards)
- Subsection Titles: text-lg font-medium (Form sections, data categories)
- Body Text: text-base font-normal (Form labels, descriptions, data values)
- Supporting Text: text-sm font-normal (Helper text, timestamps, metadata)
- Micro Text: text-xs (Status badges, device IDs, minor details)

## Layout System

**Spacing Primitives**: Tailwind units of 2, 4, 6, and 8
- Component padding: p-4, p-6, p-8
- Section margins: mb-6, mb-8
- Grid gaps: gap-4, gap-6
- Form spacing: space-y-4, space-y-6

**Container Strategy**:
- Full dashboard: max-w-7xl mx-auto px-4
- Auth pages: max-w-md mx-auto (centered login/signup)
- Admin dashboard: max-w-full (needs more horizontal space for data tables)
- Form containers: max-w-2xl

**Grid System**:
- Team member cards: grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6
- Admin user overview: grid grid-cols-1 lg:grid-cols-2 gap-8
- Profile stats: grid grid-cols-2 md:grid-cols-4 gap-4

## Component Library

### Authentication Pages

**Login Page**:
- Centered card (max-w-md) with elevated shadow
- Logo/app name at top (text-2xl font-bold mb-8)
- Email/password fields with clear labels
- "Login" primary button (full width)
- Divider with "OR" text
- Google Sign-In button with icon (full width, secondary style)
- "Don't have an account?" link at bottom

### Navigation

**Main Dashboard Navigation** (Post-login):
- Top navigation bar: sticky top-0, h-16, with app logo, user avatar dropdown (right)
- Sidebar (desktop): w-64, fixed left, pt-16 (below top nav)
  - Navigation items: py-3 px-4, with icons from Heroicons
  - Active state: subtle background treatment
  - Sections: "Dashboard", "My Profile", "My Teams", "Admin" (conditional)
- Mobile: Hamburger menu converting sidebar to drawer

### Profile Setup & Forms

**Initial Setup Flow**:
- Multi-step form with progress indicator (Step 1/4, 2/4, etc.)
- Step 1: Location (manual input field + "Auto-detect" button with icon)
- Step 2: Device ID input
- Step 3: Photo upload (drag-and-drop zone + file picker)
- Step 4: Height input (with unit selector: cm/ft)
- Navigation: "Back" + "Next"/"Submit" buttons

**Form Components**:
- Input fields: h-12, rounded border, px-4, with floating labels
- Photo upload: aspect-square preview area, 200x200 placeholder
- Buttons: h-12, px-6, rounded, font-medium
- Error states: red text-sm below fields

### Dashboard Components

**User Profile Card**:
- Card with profile photo (left), details (right)
- Photo: w-24 h-24 rounded-full
- Name: text-xl font-semibold
- Metadata grid: 2 columns
  - Labels: text-sm (Location, Device ID, Height)
  - Values: text-base font-medium
- "Edit Profile" button (top right of card)

**Team Card**:
- Header: Team name (text-lg font-semibold), member count badge
- Member list: Compact cards with avatar + name + key details
- Grid layout: grid-cols-1 md:grid-cols-2 gap-4 (for members)
- "Add Member" button (prominent, top right)
- "Manage Team" dropdown menu

**Add Team Member Modal**:
- Overlay: backdrop-blur-sm
- Modal: max-w-2xl, centered
- Form fields for: Email, Name, Device ID, Photo, Height
- Actions: "Cancel" (secondary), "Add Member" (primary)

### Admin Dashboard

**User List Table**:
- Responsive table with horizontal scroll on mobile
- Columns: Avatar, Name, Email, Location, Teams Count, Actions
- Row height: h-16
- Alternating row backgrounds for readability
- Click row to expand and view full details + teams
- Search/filter bar at top (h-12 input with icon)

**Expanded User Details**:
- Accordion-style expansion below table row
- Two-column layout: User Details (left), Teams (right)
- Teams displayed as compact cards within expanded section

### Data Display Patterns

**Stat Cards** (for dashboard overview):
- Compact cards in grid (grid-cols-2 md:grid-cols-4)
- Large number (text-3xl font-bold)
- Label below (text-sm)
- Icon (top-right, decorative)

**Status Badges**:
- Pill shape (rounded-full, px-3, py-1, text-xs font-medium)
- Usage: Team member count, online status, role indicators

**Empty States**:
- Centered icon + heading + description + CTA button
- For: No teams yet, No members, No data scenarios

## Icons

**Library**: Heroicons (outline for navigation, solid for actions)
- Navigation: HomeIcon, UsersIcon, UserGroupIcon, ChartBarIcon
- Actions: PlusIcon, PencilIcon, TrashIcon, CheckIcon, XMarkIcon
- Forms: PhotoIcon, MapPinIcon, DevicePhoneMobileIcon
- Status: ExclamationTriangleIcon, CheckCircleIcon

## Images

**Profile Photos**: 
- User avatars throughout (circular treatment)
- Placeholder: neutral background with user initials
- Upload size: 400x400px minimum

**Hero/Background**: No hero images - this is a utility dashboard focused on data and functionality

## Responsive Behavior

**Breakpoints**:
- Mobile: < 768px - Stack all grids to single column, hide sidebar (use drawer)
- Tablet: 768px - 1024px - 2-column grids, collapsible sidebar
- Desktop: > 1024px - Full multi-column layouts, persistent sidebar

**Mobile Priorities**:
- Critical actions accessible within thumb reach (bottom 1/3 of screen)
- Location auto-detect prominent on mobile (most likely use case)
- Swipeable team member cards
- Collapsible sections to reduce scrolling

## Accessibility & Usability

- All form inputs: aria-labels, proper label associations
- Keyboard navigation: Focus rings visible (ring-2 ring-offset-2)
- Touch targets: Minimum h-12 for all interactive elements
- Loading states: Skeleton screens for data fetching, spinner for actions
- Error handling: Inline validation with clear error messages

## Performance Considerations

- Lazy load team member photos
- Paginate admin user list (25-50 per page)
- Virtual scrolling for large team lists
- Optimize Firebase queries with proper indexing