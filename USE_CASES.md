# FloodWatch Console - Use Cases

This document describes common use cases and workflows for the FloodWatch Console system.

---

## Table of Contents

1. [Box Management](#box-management)
2. [Device Management](#device-management)
3. [Installation & Verification](#installation--verification)
4. [Admin Operations](#admin-operations)
5. [Team Management](#team-management)
6. [Reporting & Analytics](#reporting--analytics)

---

## Box Management

### UC-BOX-1: Assign New Box to Amanah

**Actor:** Manager, Admin

**Description:** Assign a newly received box of devices to a specific Amanah team.

**Prerequisites:**
- Box identifier/number is known (e.g., "2068", "2070")
- Devices in box are registered in system

**Steps:**
1. Navigate to "Assign Box" page
2. In "Assign Box to Amanah" section:
   - Enter box identifier in "Box Number or Code" field
   - Select Amanah from "Assign to Amanah" dropdown
3. Choose assignment scope:
   - **Option A:** Enter specific count in "Number of Devices"
   - **Option B:** Leave empty to assign all devices in box
4. Click "Assign Box" button
5. System confirms assignment

**System Actions:**
- Updates `teamId` for all selected devices
- Updates `boxNumber` or `boxCode` field
- Devices become visible to selected Amanah
- Available for installer assignment

**Example Scenarios:**
- Assign box 2068 with 24 devices to Jeddah Team
- Assign box 2070 with 50 devices to Riyadh Team
- Partial assignment: 10 devices from box 2071 to Taif Team

---

### UC-BOX-2: Transfer Entire Box Between Teams

**Actor:** Manager, Admin

**Description:** Move a complete box of devices from one Amanah to another.

**Prerequisites:**
- Source box must exist and be assigned to a team
- Destination team must be different from source

**Steps:**
1. Navigate to "Assign Box" page
2. Scroll to "Box Transfer Section"
3. In "Box to Transfer" dropdown:
   - Select box number (shows box number and device count)
   - Example: "2068 (Jeddah Team) - 24 devices"
4. System displays device table with:
   - Device ID, IMEI
   - Installation status
   - Transferable status (Yes/No)
   - Assigned installer
5. Select destination in "Transfer to Amanah" dropdown
6. Review transferable count (devices without installations)
7. Click "Transfer Box (X devices)" button
8. Confirm transfer

**System Behavior:**
- ✅ **Transfers:** Devices without installation submissions
- ❌ **Remains:** Devices with installations stay with current team
- Clears installer assignments for transferred devices
- Updates teamId for transferred devices

**Important Notes:**
- Only uninstalled devices can be transferred
- Devices with installations remain with source team
- Installer assignments are cleared on transfer
- Transfer is immediate and cannot be undone

**Example:**
```
Box 2068 has 24 devices:
- 20 devices: No installations → Will transfer
- 4 devices: Have installations → Will remain with Jeddah Team

Result: 20 devices move to new team, 4 stay with Jeddah Team
```

---

### UC-BOX-3: Selective Device Transfer from Box

**Actor:** Manager, Admin

**Description:** Transfer specific devices from a box instead of all transferable devices.

**Prerequisites:**
- Box must have multiple transferable devices
- User needs to select specific devices

**Steps:**
1. Navigate to "Assign Box" → "Box Transfer Section"
2. Select box to transfer
3. Review device table
4. **Select specific devices:**
   - Check individual device checkboxes for devices you want
   - Checkboxes disabled for devices with installations
   - Use "Select All Transferable" to quickly select all
   - Uncheck any you want to keep
5. "Selected: X" count appears in status section
6. Select destination Amanah
7. Click "Transfer Selected (X) devices" button
8. Confirm transfer

**Selection Priority:**
1. **Checked devices** (highest priority) → Only these transfer
2. Count in "Number of Devices" field → Transfer first X devices
3. Empty count & no selection → Transfer all transferable

**Use Cases:**
- Transfer only specific device models
- Keep certain devices for local team
- Split box between multiple teams (run transfer twice)
- Move devices with specific IMEI ranges

**Visual Feedback:**
- Selected count badge shows number checked
- Transfer button updates dynamically:
  - "Transfer Selected (5) devices"
  - "Transfer 10 devices" (when using count)
  - "Transfer All (20) devices" (when nothing specified)

---

### UC-BOX-4: Partial Box Assignment

**Actor:** Manager, Admin

**Description:** Assign only some devices from a box, leaving others unassigned.

**Steps:**
1. Navigate to "Assign Box" page
2. Enter box identifier
3. In "Number of Devices" field, enter count less than total
   - Example: Box has 50 devices, enter "20"
4. Select Amanah
5. Click "Assign Box"
6. System assigns first 20 devices, leaves 30 unassigned

**Use Cases:**
- Split large box across multiple teams
- Gradual team assignment
- Reserve devices for future assignment

---

### UC-BOX-5: Track Box Status and Contents

**Actor:** Manager, Admin

**Description:** View all devices in a specific box and their current status.

**Option A - Via Device List:**
1. Navigate to Master Device List (Admin) or Ministry Devices (Manager)
2. Use "Box Number" filter
3. Select specific box from dropdown
4. View all devices in that box with:
   - Current team assignment
   - Installation status
   - Assigned installer
   - Latest readings

**Option B - Via Transfer Preview:**
1. Navigate to "Assign Box" → "Box Transfer Section"
2. Select box in "Box to Transfer" dropdown
3. View comprehensive table showing:
   - All devices in box
   - Installation status
   - Transferable status
   - Current installer assignments
   - Team ownership

**Status Indicators:**
- 🟢 **Transferable: Yes** - No installation, can be moved
- 🔴 **Transferable: No** - Has installation, locked to team
- **Total/Transferable/With Installation** counts displayed

---

### UC-BOX-6: Export Box Inventory

**Actor:** Admin

**Description:** Generate report of uninstalled devices organized by box.

**Steps:**
1. Navigate to Admin Panel
2. Click "Export Uninstalled Devices"
3. Open CSV file
4. Sort by "Box Number" column
5. View devices grouped by box

**CSV Contains:**
- Device UID, IMEI, ICCID
- Box Number
- Assigned Amanah
- Assigned Installer
- Status
- Assignment Date

**Analysis Options:**
- Count devices per box
- Identify which boxes are fully deployed
- Track box distribution across teams
- Monitor installation progress by box

---

### UC-BOX-7: Handle Box Reassignment

**Actor:** Manager, Admin

**Description:** Reassign devices from one box identifier to another.

**Scenario:** Box labels were incorrect or boxes were consolidated.

**Steps:**
1. Navigate to Master Device List
2. Filter by old box number
3. Note device IDs
4. Use "Assign Box" function:
   - Enter new box identifier
   - Select current team (keep same team)
   - Enter device count or leave empty
5. Devices updated with new box number

**Alternative - Via Admin Bulk Update:**
1. Export devices with old box number
2. Prepare update list
3. Use appropriate admin bulk update tool

---

### UC-BOX-8: Split Box Between Multiple Teams

**Actor:** Manager, Admin

**Description:** Divide a single box's devices across multiple Amanahs.

**Scenario:** Box of 50 devices needs to be split between 3 teams.

**Steps:**
1. **First Team (20 devices):**
   - Navigate to "Assign Box"
   - Enter box number
   - Enter count: 20
   - Select Team 1
   - Assign

2. **Second Team (15 devices):**
   - Same box number
   - Enter count: 15
   - Select Team 2
   - Assign

3. **Third Team (15 devices):**
   - Same box number
   - Enter count: 15
   - Select Team 3
   - Assign

**Result:** Box 2068 now split across 3 teams with specified distribution.

---

### UC-BOX-9: Identify Boxes Ready for Transfer

**Actor:** Manager, Admin

**Description:** Find boxes where all devices are installed (ready to transfer box to another team).

**Steps:**
1. Navigate to "Assign Box" → "Box Transfer"
2. Review boxes in dropdown
3. Select a box
4. Check transfer status:
   - **All Transferable = 0** → All devices installed, box fully deployed
   - **Some Transferable > 0** → Partially installed
   - **All Transferable = Total** → No installations, ready to move

**Decision Making:**
- If all devices installed: Box ownership complete, no action needed
- If partially installed: Wait or transfer remaining devices
- If no installations: Safe to transfer entire box

---

## Box Management Best Practices

### 1. Box Naming Convention
- Use consistent box identifiers (numbers or codes)
- Example: "2068", "2070", "BOX-A-001"
- Avoid special characters that complicate filtering

### 2. Box Assignment Strategy
- **Assign complete boxes** to teams when possible
- Use partial assignments only when necessary
- Document box splits in external tracking system

### 3. Transfer Timing
- Transfer boxes before installation begins
- Avoid transferring boxes with partial installations
- Coordinate with installers before box transfers

### 4. Installation Tracking by Box
- Monitor installation progress by box number
- Use box filter to track team performance
- Export data regularly for progress reports

### 5. Box Consolidation
- When boxes are combined, update box numbers
- Keep one primary box identifier
- Document consolidations for audit trail

---

## Box Management Reference

### Box States

| State | Description | Can Transfer? | Can Reassign? |
|-------|-------------|---------------|---------------|
| **Unassigned** | Devices not assigned to any team | N/A | Yes |
| **Assigned, No Installations** | All devices assigned, none installed | Yes (all) | Yes |
| **Partially Installed** | Some devices installed | Yes (only uninstalled) | No (for installed) |
| **Fully Installed** | All devices have installations | No | No |

### Transfer Rules

1. ✅ **Can Transfer:**
   - Devices without installation submissions
   - Within same box or across boxes
   - To any team (including original team)

2. ❌ **Cannot Transfer:**
   - Devices with installation submissions
   - Devices marked as installed
   - Devices in verification/verified status

3. **Side Effects:**
   - Installer assignments cleared
   - teamId updated
   - Devices immediately available to new team

### Common Box Operations

| Operation | Page | Required Role | Notes |
|-----------|------|---------------|-------|
| Assign new box | Assign Box | Manager, Admin | Initial team assignment |
| Transfer box | Assign Box → Transfer | Manager, Admin | Between teams |
| View box contents | Device List / Transfer | Any | Filter by box number |
| Export box inventory | Admin Panel | Admin | CSV export |
| Split box | Assign Box | Manager, Admin | Multiple assignments |
| Track box status | Transfer Section | Manager, Admin | Real-time status |

---

## Device Management

### UC-1: Search for Devices by Partial ID

**Actor:** Admin, Manager, Verifier

**Description:** Find devices quickly by entering partial device IDs instead of complete UIDs.

**Steps:**
1. Navigate to Master Device List or Verification page
2. Locate the "Filter by Specific Device UIDs" section
3. Enter partial device IDs (one per line)
   - Example: Enter "E7583" to find all devices containing this string
   - Example: "E75832989D048709" for exact match
4. System displays all matching devices

**Benefits:**
- No need to type complete 16-character device IDs
- Faster device lookup
- Can search multiple partial IDs at once

---

### UC-2: Transfer Devices Between Teams

**Actor:** Manager, Admin

**Description:** Transfer specific devices from one Amanah (team) to another.

**Preconditions:** 
- Devices must not have installation submissions
- User must be a Manager or Admin

**Steps:**
1. Navigate to "Assign Box" page
2. Select the box number to transfer
3. Review the device list showing transferable status
4. **Option A - Transfer Specific Devices:**
   - Check the boxes next to specific devices you want to transfer
   - System shows "Selected: X" count
5. **Option B - Transfer by Count:**
   - Enter number of devices in "Number of Devices" field
6. **Option C - Transfer All:**
   - Leave count empty and no devices selected
7. Select destination Amanah from dropdown
8. Click "Transfer" button
9. Confirm the transfer

**System Behavior:**
- Only transferable devices (without installations) can be selected
- Checkboxes for devices with installations are disabled
- Installer assignments are cleared on transfer
- Transfer button shows exactly what will be transferred

**Notes:**
- Devices with installation submissions remain with current team
- Priority: Selected devices > Count > All devices

---

### UC-3: Export Uninstalled Devices Report

**Actor:** Admin

**Description:** Generate a CSV report of all devices that haven't been installed yet.

**Steps:**
1. Navigate to Admin Panel
2. Scroll to "Export Uninstalled Devices" section
3. Click "Export Uninstalled Devices" button
4. System generates CSV file with:
   - Device UID, IMEI, ICCID, Product ID
   - Assigned Amanah
   - Assigned Installer
   - Box Number
   - Status
   - Assignment Date (last updated)

**Use Cases:**
- Track inventory of uninstalled devices
- Identify which installers have pending assignments
- Monitor device distribution across Amanahs
- Plan installation schedules

---

## Installation & Verification

### UC-4: Filter Installations by Multiple Device UIDs

**Actor:** Verifier, Manager, Admin

**Description:** View installations for specific devices only.

**Steps:**
1. Navigate to Verification page
2. Expand the "Filters" card
3. Scroll to "Filter by Specific Device UIDs" section
4. Enter device UIDs or partial IDs (one per line)
5. System shows only matching installations
6. Badge displays count of UIDs entered

**Example Scenarios:**
- Verify installations for a specific box of devices
- Check status of devices from a specific batch
- Review installations for problem devices

---

### UC-5: Review and Verify Installation with Checklist

**Actor:** Verifier

**Description:** Systematically verify installation data using field-by-field checklist.

**Steps:**
1. Navigate to Verification page
2. Click on an installation to review
3. Review installation details dialog opens
4. Check each required field:
   - ☐ Device ID
   - ☐ Location ID
   - ☐ Sensor Reading
   - ☐ Coordinates
   - ☐ Sensor Data (if server data exists)
   - ☐ At least one installation image
5. System tracks checkbox states in real-time
6. All mandatory checks must be completed
7. Click "Verify Installation" (enabled when all checks complete)

**System Validations:**
- Cannot verify until all mandatory fields checked
- Image verification requires at least one image selected
- Checkbox states persist in database

---

### UC-6: Export Verification Report with Latest Data

**Actor:** Verifier, Manager, Admin

**Description:** Generate CSV report with installation details and latest sensor data timestamps.

**Steps:**
1. Navigate to Verification page
2. Apply filters (team, date, device IDs, etc.)
3. Click "Download CSV" button
4. System generates CSV with:
   - Device ID, Installer, Amanah
   - Location ID, Coordinates
   - Sensor Reading
   - **Latest Distance Date** (timestamp of last server reading)
   - **Installation Date** (when submitted)
   - **ICCID**

**Report Types:**
- **Filtered CSV:** Current view with filters applied
- **Daily CSV:** All installations for specific date

**Use Cases:**
- Track when devices last reported data
- Identify inactive devices
- Audit installation records
- Monitor sensor communication

---

## Admin Operations

### UC-7: Bulk Export Duplicate Installations

**Actor:** Admin

**Description:** Identify and export all devices with multiple installation records.

**Steps:**
1. Navigate to Admin Panel
2. Locate "Export Duplicate Device Installations"
3. Click "Export Duplicate Installations"
4. System analyzes all installations
5. CSV generated with all duplicate records
6. Results sorted by Device UID

**CSV Contents:**
- All installation data for devices with >1 installation
- Complete metadata and timestamps
- Installation IDs for reference

**Use Cases:**
- Data quality audits
- Identify installation errors
- Clean up duplicate records
- Enforce one-device-one-installation rule

---

### UC-8: Lookup Device by ICCID

**Actor:** Admin

**Description:** Find device UID(s) associated with specific ICCID numbers.

**Steps:**
1. Navigate to Admin Panel
2. Scroll to "ICCID Lookup" section
3. Enter ICCID numbers (one per line)
4. Click "Lookup ICCIDs"
5. System displays results table:
   - ICCID → Device UID mapping
   - Shows if ICCID not found

**Use Cases:**
- SIM card troubleshooting
- Device tracking by SIM
- Inventory reconciliation

---

### UC-9: Bulk Team Transfer by Device List

**Actor:** Admin

**Description:** Transfer multiple devices between teams using a list of device IDs.

**Steps:**
1. Navigate to Admin Panel
2. Locate "Bulk Team Change" section
3. Select source team (from)
4. Select target team (to)
5. Enter device IDs (one per line)
6. Click "Preview Matches"
7. System shows matching installations
8. Review the list
9. Click "Update Teams"
10. Confirm the bulk change

**Validations:**
- Devices must be in source team
- Only affects installations, not devices themselves

---

## Team Management

### UC-10: Assign Box to Amanah

**Actor:** Manager, Admin

**Description:** Assign an entire box of devices to an Amanah team.

**Steps:**
1. Navigate to "Assign Box" page
2. Enter box identifier (e.g., "2068")
3. Select Amanah from dropdown
4. Choose assignment method:
   - Select specific devices
   - Enter count
   - Assign all
5. Click "Assign Box"
6. Devices updated with team assignment

**Effects:**
- Devices assigned to team
- Available for installers in that team
- Visible in team's device inventory

---

### UC-11: View Ministry Devices by Team

**Actor:** Manager

**Description:** View all devices assigned to specific Amanah with filtering.

**Steps:**
1. Navigate to Ministry Devices page
2. Use filters:
   - Status (Pending/Verified/Flagged)
   - Product Type
   - Box Number
   - Installation Date
3. View device list with:
   - Installation status
   - Assigned location
   - Server data status
   - Installer information

**Actions Available:**
- Export filtered list to PDF/CSV
- Click device for details
- Monitor installation progress

---

## Reporting & Analytics

### UC-12: Generate Device Report by Amanah

**Actor:** Manager

**Description:** Create comprehensive PDF report for specific Amanah showing all devices and installations.

**Steps:**
1. Navigate to Ministry Devices page
2. Apply filters as needed
3. Click "Export as PDF"
4. System generates PDF with:
   - Device information
   - Installation details
   - GPS coordinates
   - Status indicators
   - Photos (if available)

**Report Sections:**
- Device inventory summary
- Installation status breakdown
- Device-by-device details
- Maps and coordinates

---

### UC-13: Daily Installation Report

**Actor:** Verifier, Manager

**Description:** Export all installations submitted on a specific date.

**Steps:**
1. Navigate to Verification page
2. Click "CSV by Date" button
3. Enter target date (YYYY-MM-DD)
4. System generates comprehensive CSV:
   - All installations for that date
   - Complete installation data
   - Server readings and timestamps
   - Variance calculations
   - GPS coordinates with Google Maps links

**Use Cases:**
- Daily progress reports
- Team performance tracking
- Installation quality monitoring

---

### UC-14: Track Device Installation Status

**Actor:** Admin, Manager

**Description:** Monitor which devices have been installed and which are still pending.

**Use "Export Uninstalled Devices":**
1. Admin Panel → Export Uninstalled Devices
2. View devices by:
   - Assigned team
   - Assigned installer
   - Assignment date
3. Identify bottlenecks
4. Follow up with installers

**Use Master Device List:**
1. Navigate to Master Device List (Admin only)
2. Filter by Status: "Not Installed"
3. View real-time status
4. Filter by team, box, or installer

---

## Special Workflows

### UC-15: Installation Escalation Workflow

**Actor:** Verifier → Manager

**Description:** Escalate problematic installations to manager for review.

**Steps:**
1. **Verifier:** Reviews installation in Verification page
2. Identifies issue (missing data, wrong location, etc.)
3. Clicks "Escalate to Manager"
4. Enters escalation reason
5. Confirms escalation
6. Installation tagged "escalated to manager"
7. **Manager:** Sees escalated items in their view
8. Reviews and takes appropriate action:
   - Verify if acceptable
   - Flag for re-installation
   - Contact installer for clarification

---

### UC-16: System Pre-Verification for Auto-Approved Installations

**Actor:** System (Automated)

**Description:** Automatically verify installations that meet quality criteria.

**Criteria:**
- Server data exists
- Variance ≤ 10% between user and server readings
- All required fields present

**Process:**
1. Installer submits installation
2. System fetches server data
3. Calculates variance
4. If criteria met:
   - Status: "pending" but marked `systemPreVerified: true`
   - Timestamp recorded
5. If variance > 10%:
   - Status: "flagged"
   - Flagged reason: "Auto-rejected: variance X% > 10%"

**Benefits:**
- Reduces verifier workload
- Faster approval for quality installations
- Automatic quality control

---

### UC-17: Handle Devices with No Location ID (9999)

**Actor:** Installer, Verifier

**Description:** Process installations where specific location ID is not available.

**Installer Steps:**
1. During installation, select Location ID "9999" or "999"
2. System prompts for manual GPS coordinates
3. Enter latitude and longitude
4. Complete installation

**Verifier Steps:**
1. Installation appears in verification queue
2. Coordinates shown from installer's entry
3. Verify GPS coordinates are reasonable
4. Check against Google Maps if needed
5. Approve or flag

**System Behavior:**
- Location ID "9999" or "999" triggers manual coordinate entry
- Coordinates stored directly in installation record
- CSV exports use installer-entered coordinates
- Google Maps links generated automatically

---

## Quick Reference

### Filter Priorities in Verification

When multiple filters applied:
1. Active Filter (Pending/Verified/Flagged/etc.)
2. Installer Name Filter
3. Device ID Filter
4. **Device UIDs Filter** (highest priority for device selection)
5. Team Filter
6. Date Filter

### Transfer Device Priorities

When transferring devices:
1. **Selected Checkboxes** (highest priority)
2. Count field
3. Transfer all (if nothing specified)

### CSV Export Columns Summary

**Verification CSV:**
- Device ID, Installer, Amanah, Location ID, Coordinates
- Sensor Reading, Latest Distance Date, Installation Date, ICCID

**Uninstalled Devices CSV:**
- Device UID, IMEI, ICCID, Product ID
- Assigned Amanah, Assigned Installer
- Box Number, Status, Assignment Date

**Daily Installation CSV:**
- Complete installation data with all fields
- Google Maps URLs, variance calculations
- Server data timestamps

---

## Best Practices

1. **Use Partial Device ID Search:** Save time by entering only part of device ID
2. **Check Installation Items Systematically:** Use the checkbox system to ensure nothing is missed
3. **Regular Uninstalled Device Reports:** Monitor which devices are pending installation
4. **Daily CSV Exports:** Track installation progress and quality
5. **Escalate When Uncertain:** Use manager escalation for problematic cases
6. **Filter Before Export:** Apply filters to get exactly the data you need
7. **Review System Pre-Verified:** Even auto-approved installations should be spot-checked

---

## Troubleshooting

### Can't Find Device
- Try partial ID search instead of full UID
- Check if device exists in system
- Verify device is in expected team/box

### Device Won't Transfer
- Check if device has installation submission
- Only devices without installations can transfer
- Verify user has Manager/Admin role

### Installation Missing from Verification
- Check active filter selection
- Verify date filter includes installation date
- Check team filter if applied
- Ensure device ID filter doesn't exclude it

### Export Shows No Data
- Verify filters aren't too restrictive
- Check date range includes expected records
- Ensure data exists in database

---

*Last Updated: February 2026*
