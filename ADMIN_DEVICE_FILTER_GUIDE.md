# Admin Device Filter & CSV Export Guide

## Overview

The Admin Device Filter feature allows administrators to filter devices based on various criteria and export the results as CSV files for reporting and analysis.

## Features

### 1. Filter Options

- **Variance Threshold**: Filter devices with variance greater than or equal to a specified value
- **Specific Readings**: Filter devices that have specific reading types (comma-separated, e.g., "z,y,m")
- **No Server Data**: Filter devices that haven't reported any data to the server

### 2. CSV Export

Export filtered device data with the following columns:
- Device ID
- Installer Name
- Latitude & Longitude (prefers location_id relation, falls back to user-entered)
- Coordinate Source (location_relation, user_entered, or none)
- Location ID
- Has Server Data (Yes/No)
- Variance
- Data Points Count
- Status
- Installation Date

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
- `noServerData` (optional): Set to "true" to show only devices without server data
- `format` (optional): "json" (default) or "csv"

**Example Requests**:

```bash
# Get devices with variance >= 10 as JSON
GET http://localhost:3001/api/admin/devices/filter?variance=10&format=json

# Get devices with specific readings as CSV
GET http://localhost:3001/api/admin/devices/filter?readings=z,y,m&format=csv

# Get devices with no server data
GET http://localhost:3001/api/admin/devices/filter?noServerData=true&format=json

# Combined filters
GET http://localhost:3001/api/admin/devices/filter?variance=5&readings=z,y&noServerData=false&format=csv
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
   - Enter a variance threshold (e.g., 10)
   - Enter comma-separated readings (e.g., z,y,m)
   - Check "Show only devices with no server data" if needed

2. **View Results**:
   - Click **Filter Devices** to see results in a table
   - Results show device ID, installer, coordinates, and data statistics

3. **Export to CSV**:
   - Click **Export CSV** to download filtered results
   - CSV will include all device information with proper coordinate handling

## Coordinate Handling

The system prioritizes coordinates in the following order:

1. **Location Relation** (Preferred): Coordinates from the `locations` collection via `locationId`
2. **User-Entered**: Coordinates entered manually during installation
3. **None**: No coordinates available

The `coordinateSource` field in the response indicates which source was used.

## Notes

- The API assumes a `deviceData` collection exists for device readings/telemetry
- If the `deviceData` collection doesn't exist, all devices will show as having no server data
- Variance is calculated as the standard deviation of all numeric values in device data
- The frontend page is accessible at `/admin-device-filter` (admin users only)

## Data Collections

The feature interacts with these Firestore collections:

- **installations**: Device installation records
- **locations**: Location coordinates and metadata
- **deviceData**: Device telemetry and readings (may need to be created)

### Expected deviceData Document Structure

```json
{
  "deviceId": "device-001",
  "value": 123.45,
  "type": "z",  // or "y", "m", etc.
  "readingType": "z",  // alternative field name
  "timestamp": "2026-01-04T12:00:00.000Z"
}
```

## Troubleshooting

### No devices showing data

If all devices show "No Server Data":
1. Verify the `deviceData` collection exists in Firestore
2. Check that device data documents have a `deviceId` field matching installation records
3. Ensure the backend can access the collection (check Firebase rules)

### Variance shows "N/A"

This occurs when:
- Device has no data points
- Device has only one data point (variance requires 2+ values)
- Device data doesn't have numeric `value` fields

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

