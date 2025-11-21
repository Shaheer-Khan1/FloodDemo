# Bulk Location ID Update Guide

## Feature Overview
This feature allows administrators to bulk update `locationId` for installations matching specific criteria directly from the website, without needing service account keys.

## Location
Go to the **Admin Dashboard** page in your application.

## How to Use

### Step 1: Configure Search Criteria
In the "Bulk Update Location IDs" section, you'll find three input fields:

1. **Team ID** (default: `ttaMvVwJTIpXIJ5NTmee`)
   - The team ID to filter installations by

2. **Exclude Installer Name** (default: `Mitesh`)
   - Installations by this installer will be excluded
   - Leave empty to include all installers

3. **New Location ID** (default: `9999`)
   - The value you want to update the locationId to

### Step 2: Find Matching Installations
1. Click the **"Find Matching Installations"** button
2. The system will query Firestore for installations where:
   - `teamId` equals your specified team ID
   - `installedByName` is NOT equal to the excluded name
3. A count of matching installations will be displayed

### Step 3: Review Preview
- The system shows a preview of up to 10 matching installations
- For each installation, you'll see:
  - Installer name
  - Device ID
  - Current location ID
  - What the new location ID will be
  - Original location ID (if previously updated)

### Step 4: Bulk Update
1. Click the **"Update X Installation(s)"** button
2. Review the confirmation dialog showing:
   - Number of installations to be updated
   - The changes that will be made
3. Click **"Confirm Update"** to proceed

## What Gets Updated

For each matching installation:
- `locationId` is set to your specified value (e.g., "9999")
- `originalLocationId` stores the old `locationId` (only if not already saved)
- `updatedAt` timestamp is updated to current server time

## Important Notes

- ✅ The original `locationId` is preserved in `originalLocationId` field
- ✅ If an installation was already updated once, `originalLocationId` is NOT overwritten
- ✅ Changes are made in batches for efficient processing
- ✅ All updates are atomic - either all succeed or all fail
- ⚠️ This operation cannot be undone (but original values are preserved)
- ⚠️ Maximum 500 installations can be updated per batch operation

## Example Use Case

**Scenario:** You want to temporarily mark all installations for team `ttaMvVwJTIpXIJ5NTmee` (except those installed by Mitesh) with a placeholder location ID of `9999`.

**Steps:**
1. Team ID: `ttaMvVwJTIpXIJ5NTmee`
2. Exclude Installer: `Mitesh`
3. New Location ID: `9999`
4. Click "Find Matching Installations"
5. Review the preview
6. Click "Update X Installations"
7. Confirm the update

**Result:** All matching installations now have `locationId: "9999"`, while their original values are stored in `originalLocationId`.

## Troubleshooting

### No Matches Found
- Verify the team ID exists and is correct
- Check if there are installations by installers other than the excluded name
- Try removing the excluded name filter to see all installations for the team

### Update Failed
- Check your Firebase permissions
- Ensure you're logged in as an admin
- Check browser console for detailed error messages

### How to Revert Changes
To restore original location IDs, you would need to:
1. Query installations where `originalLocationId` exists
2. Set `locationId` back to the value in `originalLocationId`
3. You can use the same tool with appropriate filters

## Security

- ✅ Only accessible to users with `isAdmin: true` in their profile
- ✅ All operations use Firebase security rules
- ✅ No service account keys needed
- ✅ Operations use the logged-in user's credentials

## Technical Details

**Firestore Operations:**
- Query: `where("teamId", "==", targetTeamId)`
- Filter: Client-side filtering on `installedByName`
- Update: Batch write operations (max 500 per batch)

**Fields Modified:**
```javascript
{
  locationId: newLocationId,
  originalLocationId: installation.locationId, // only if not already set
  updatedAt: serverTimestamp()
}
```

**TypeScript Interface:**
```typescript
interface Installation {
  locationId: string;
  originalLocationId?: string; // New field
  // ... other fields
}
```

