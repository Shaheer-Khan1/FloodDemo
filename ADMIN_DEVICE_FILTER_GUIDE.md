# Admin Device Filter & CSV Export Guide

## Overview

The Admin Device Filter feature allows administrators to filter devices based on various criteria and export the results as CSV files for reporting and analysis.

## Features

### 1. Filter Options

- **Variance Threshold**: Filter devices with variance greater than or equal to a specified value
- **Specific Readings**: Filter devices that have specific reading types (comma-separated, e.g., "z,y,m")
- **Team/Amanah**: Filter devices by specific team or amanah assignment
- **No Server Data**: Filter devices that haven't reported any data to the server

### 2. CSV Export

Export filtered device data with the following columns:
- Device ID
- Installer Name
- Coordinates - Latitude and longitude combined as "lat,long" (prefers location_id relation, falls back to user-entered)
- User Reading (cm) - The sensor reading entered by the installer
- Server Reading (cm) - The latest reading from the server (latestDisCm)
- Variance (%) - Percentage difference between user and server readings

### 3. Device Statistics

View real-time statistics including:
- Total number of devices
- Devices with server data
- Devices without server data

## API Endpoints

### Filter Devices

**Endpoint**: `GET /api/admin/devices/filter`

**Query Parameters**:
- `variance` (optional): Minimum variance threshold (e.g., "10")
- `readings` (optional): Comma-separated reading types (e.g., "z,y,m")
- `teamId` (optional): Filter by specific team/amanah ID
- `noServerData` (optional): Set to "true" to show only devices without server data
- `format` (optional): "json" (default) or "csv"

**Example Requests**:

```bash
# Get devices with variance >= 10 as JSON
GET http://localhost:3001/api/admin/devices/filter?variance=10&format=json

# Get devices with specific readings as CSV
GET http://localhost:3001/api/admin/devices/filter?readings=z,y,m&format=csv

# Get devices for a specific team
GET http://localhost:3001/api/admin/devices/filter?teamId=team123&format=json

# Get devices with no server data
GET http://localhost:3001/api/admin/devices/filter?noServerData=true&format=json

# Combined filters
GET http://localhost:3001/api/admin/devices/filter?variance=5&readings=z,y&teamId=team123&noServerData=false&format=csv
```

### Device Statistics

**Endpoint**: `GET /api/admin/devices/stats`

**Example Request**:

```bash
GET http://localhost:3001/api/admin/devices/stats
```

**Response**:

```json
{
  "success": true,
  "data": {
    "totalDevices": 150,
    "devicesWithData": 120,
    "devicesWithoutData": 30,
    "devicesWithoutDataList": ["device-001", "device-042", ...],
    "timestamp": "2026-01-04T12:00:00.000Z"
  }
}
```

## Frontend Usage

### Accessing the Admin Device Filter Page

1. Log in as an admin user
2. Navigate to **Device Filter** from the admin menu
3. The page will automatically load device statistics

### Using the Filter Interface

1. **Set Filter Criteria**:
   - Enter a variance threshold (e.g., 10) - filters devices WITH server data
   - Enter comma-separated readings (e.g., z,y,m)
   - Select a specific team/amanah from the dropdown (optional)
   - Check "Show only devices with no server data" to exclude devices with server data

2. **View Results**:
   - Click **Filter Devices** to see results in a table
   - **Important**: Devices WITHOUT server data are ALWAYS included in results (unless the checkbox is checked)
   - Variance filter only applies to devices WITH server data
   - Results show device ID, installer, team/amanah, readings, variance, and coordinates

3. **Export to CSV**:
   - Click **Export CSV** to download filtered results
   - CSV includes: Device ID, Installer Name, Coordinates, User Reading, Server Reading, Variance
   - Coordinates are combined as "lat,long" in one column
   - Includes both devices with and without server data

## Coordinate Handling

The system prioritizes coordinates in the following order:

1. **Location Relation** (Preferred): Coordinates from the `locations` collection via `locationId`
2. **User-Entered**: Coordinates entered manually during installation
3. **None**: No coordinates available

The `coordinateSource` field in the response indicates which source was used.

## Notes

- Server data is read directly from the `installations` collection (`latestDisCm` field)
- User reading is the installer's sensor reading (`sensorReading` field)
- Variance is calculated as the percentage difference: `((|serverReading - userReading|) / userReading) × 100`
- Devices with variance > 10% are highlighted in red in the results table
- **Important**: Devices without server data are ALWAYS included in filter results (unless "Show only devices with no server data" is checked)
- Variance filter only applies to devices WITH server data - devices without server data pass through all filters
- The frontend page is accessible at `/admin-device-filter` (admin users only)

## Data Collections

The feature interacts with these Firestore collections:

- **installations**: Device installation records (contains both user and server readings)
- **locations**: Location coordinates and metadata
- **teams**: Team/amanah information for filtering

### Installation Document Fields Used

```json
{
  "deviceId": "device-001",
  "sensorReading": 125.5,  // User reading in cm
  "latestDisCm": 123.0,    // Server reading in cm
  "latestDisTimestamp": "2026-01-04T12:00:00.000Z",
  "locationId": "location-xyz",
  "teamId": "team-abc",
  "installedByName": "John Doe",
  "status": "verified",
  "latitude": 12.345678,
  "longitude": 98.765432
}
```

## Troubleshooting

### No devices showing server data

If all devices show "No Server Data":
1. Check if installations have the `latestDisCm` field populated
2. Verify that the server data sync process is running
3. Look in the browser console for any fetch errors

### Variance shows "N/A"

This occurs when:
- Device has no server reading (`latestDisCm` is null)
- Device has no user reading (`sensorReading` is null)
- User reading is 0 (division by zero protection)

### Coordinates missing

This occurs when:
- No `locationId` is set in the installation
- The location document doesn't exist
- No user-entered coordinates (latitude/longitude) in the installation

To fix, either:
- Link installations to proper locations via `locationId`
- Ensure latitude/longitude fields are populated during installation

## Future Enhancements

Potential improvements:
- Add date range filtering
- Filter by installer/team
- Add more statistical measures (mean, median, etc.)
- Real-time data refresh
- Scheduled CSV exports
- Email notifications for devices without data

