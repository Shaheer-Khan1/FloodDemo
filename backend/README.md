# FloodWatch Backend API

Backend API server for exposing FloodWatch installation data.

## Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Configure Firebase

You need Firebase Admin SDK credentials. Get them from:
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** > **Service Accounts**
4. Click **Generate New Private Key**
5. Download the JSON file

### 3. Environment Variables

Create a `.env` file in the `backend` folder:

```bash
cp .env.example .env
```

Then edit `.env` and add your Firebase credentials. You have two options:

**Option A: Single JSON string (recommended for production)**
```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project-id",...}
```

**Option B: Individual fields (easier for development)**
```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour-Private-Key\n-----END PRIVATE KEY-----\n"
```

### 4. Start the Server

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on `http://localhost:3001` (or the port specified in `.env`)

## API Endpoints

### Health Check
```
GET /health
```
Returns server status and Firebase connection status.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-28T12:00:00.000Z",
  "firebaseInitialized": true
}
```

---

### Get All Installations
```
GET /api/installations
```

**Query Parameters:**
- `teamId` - Filter by team ID
- `status` - Filter by status (pending, verified, flagged)
- `deviceId` - Filter by device ID
- `locationId` - Filter by location ID
- `startDate` - Filter installations created after this date (ISO format)
- `endDate` - Filter installations created before this date (ISO format)
- `limit` - Number of results to return
- `offset` - Number of results to skip (for pagination)

**Example:**
```bash
# Get all installations
curl http://localhost:3001/api/installations

# Get installations for a specific team
curl http://localhost:3001/api/installations?teamId=team123

# Get verified installations with pagination
curl http://localhost:3001/api/installations?status=verified&limit=50&offset=0

# Get installations in date range
curl http://localhost:3001/api/installations?startDate=2025-01-01&endDate=2025-12-31
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "inst123",
      "deviceId": "device123",
      "locationId": "loc123",
      "status": "verified",
      "sensorReading": 45.5,
      "latitude": 33.5138,
      "longitude": 36.2765,
      "imageUrls": ["url1", "url2"],
      "installedBy": "user123",
      "installedByName": "John Doe",
      "teamId": "team123",
      "createdAt": "2025-12-28T12:00:00.000Z",
      "updatedAt": "2025-12-28T12:30:00.000Z"
    }
  ],
  "metadata": {
    "total": 150,
    "returned": 50,
    "offset": 0,
    "limit": 50,
    "timestamp": "2025-12-28T12:00:00.000Z"
  }
}
```

---

### Get Single Installation
```
GET /api/installations/:id
```

**Example:**
```bash
curl http://localhost:3001/api/installations/inst123
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "inst123",
    "deviceId": "device123",
    "locationId": "loc123",
    "status": "verified",
    ...
  }
}
```

---

### Get Installation Statistics
```
GET /api/installations/stats/summary
```

Returns aggregate statistics about installations.

**Example:**
```bash
curl http://localhost:3001/api/installations/stats/summary
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total": 500,
    "byStatus": {
      "pending": 120,
      "verified": 350,
      "flagged": 30
    },
    "systemPreVerified": 280,
    "withImages": 480,
    "withVideo": 150,
    "byTeam": {
      "team1": 200,
      "team2": 300
    },
    "timestamp": "2025-12-28T12:00:00.000Z"
  }
}
```

---

### Export All Installations
```
GET /api/installations/export/json
```

Downloads all installation data as a JSON file.

**Example:**
```bash
curl http://localhost:3001/api/installations/export/json -o installations.json
```

**Response:**
```json
{
  "exportedAt": "2025-12-28T12:00:00.000Z",
  "totalRecords": 500,
  "data": [...]
}
```

---

## CORS Configuration

By default, the API allows requests from:
- `http://localhost:5173` (Vite dev server)

To allow additional origins, update the `ALLOWED_ORIGINS` variable in `.env`:

```env
ALLOWED_ORIGINS=http://localhost:5173,https://your-production-domain.com
```

To allow all origins (not recommended for production):
```env
ALLOWED_ORIGINS=*
```

## Deployment

### Deploy to Render, Railway, or similar platforms:

1. Set environment variables in your platform's dashboard
2. Use `npm start` as the start command
3. Expose the port (default: 3001)

### Example Render configuration:
- **Build Command:** `npm install`
- **Start Command:** `npm start`
- **Environment Variables:** Add `FIREBASE_SERVICE_ACCOUNT`, `PORT`, `ALLOWED_ORIGINS`

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

Common HTTP status codes:
- `200` - Success
- `404` - Resource not found
- `500` - Internal server error
- `503` - Service unavailable (Firebase not initialized)

## Security Notes

1. **Never commit `.env` or service account JSON files to git**
2. Use environment variables for sensitive data
3. In production, restrict CORS to specific domains
4. Consider adding authentication/API keys for production use
5. Use HTTPS in production environments

## Usage Examples

### JavaScript/Fetch
```javascript
// Fetch all installations
const response = await fetch('http://localhost:3001/api/installations');
const { data, metadata } = await response.json();
console.log(`Fetched ${data.length} installations`);

// Fetch with filters
const url = new URL('http://localhost:3001/api/installations');
url.searchParams.set('status', 'verified');
url.searchParams.set('limit', '10');
const response = await fetch(url);
const result = await response.json();
```

### Python
```python
import requests

# Get all installations
response = requests.get('http://localhost:3001/api/installations')
data = response.json()

# Get with filters
params = {'status': 'verified', 'limit': 10}
response = requests.get('http://localhost:3001/api/installations', params=params)
installations = response.json()['data']
```

### cURL
```bash
# Get installations with pretty print
curl -s http://localhost:3001/api/installations | jq .

# Get stats
curl -s http://localhost:3001/api/installations/stats/summary | jq .

# Export to file
curl http://localhost:3001/api/installations/export/json -o installations.json
```

