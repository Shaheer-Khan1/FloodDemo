# Backend API Quick Reference

## 🚀 Quick Start

```bash
cd backend
npm install
cp env.template .env
# Edit .env with your Firebase credentials
npm run dev
```

Server runs at: `http://localhost:3001`

## 📍 API Endpoints

| Endpoint | Description | Example |
|----------|-------------|---------|
| `GET /health` | Health check | `curl http://localhost:3001/health` |
| `GET /api/installations` | Get all installations | `curl http://localhost:3001/api/installations` |
| `GET /api/installations/device/:deviceId` | Get installations by device | `curl http://localhost:3001/api/installations/device/device123` |
| `GET /api/installations/:id` | Get single installation | `curl http://localhost:3001/api/installations/abc123` |
| `GET /api/installations/stats/summary` | Get statistics | `curl http://localhost:3001/api/installations/stats/summary` |
| `GET /api/installations/export/json` | Export all data | `curl http://localhost:3001/api/installations/export/json -o data.json` |

## 🔍 Query Parameters

Filter installations using:

```bash
# By team
?teamId=team123

# By status
?status=verified

# By device
?deviceId=device456

# By location
?locationId=loc789

# Date range
?startDate=2025-01-01&endDate=2025-12-31

# Pagination
?limit=50&offset=0

# Combine filters
?teamId=team123&status=verified&limit=20
```

## 💻 Code Examples

### JavaScript/TypeScript
```javascript
const response = await fetch('http://localhost:3001/api/installations?status=verified&limit=10');
const { data, metadata } = await response.json();
```

### Python
```python
import requests
data = requests.get('http://localhost:3001/api/installations').json()['data']
```

### cURL
```bash
curl "http://localhost:3001/api/installations?status=verified" | jq .
```

## ⚙️ Environment Setup

Create `.env` file:

```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173
```

Get Firebase credentials:
1. Firebase Console → Project Settings
2. Service Accounts → Generate New Private Key
3. Copy JSON content to `.env`

## 📊 Response Format

```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "deviceId": "...",
      "locationId": "...",
      "status": "verified",
      "createdAt": "2025-12-28T..."
    }
  ],
  "metadata": {
    "total": 100,
    "returned": 10,
    "offset": 0,
    "limit": 10
  }
}
```

## 🛠️ Troubleshooting

| Issue | Solution |
|-------|----------|
| Firebase not initialized | Check `.env` file and credentials |
| CORS error | Add your URL to `ALLOWED_ORIGINS` |
| Port in use | Change `PORT` in `.env` |
| Empty response | Verify Firestore has data |

## 📚 Full Documentation

- **Complete API Docs**: `backend/README.md`
- **Integration Guide**: `backend/INTEGRATION.md`
- **Setup Guide**: `BACKEND_SETUP.md`
- **Implementation Summary**: `BACKEND_IMPLEMENTATION_SUMMARY.md`

## 🎯 Common Tasks

### Export all data
```bash
curl http://localhost:3001/api/installations/export/json -o backup.json
```

### Get team statistics
```bash
curl http://localhost:3001/api/installations/stats/summary | jq '.data.byTeam'
```

### Paginate through results
```bash
# Page 1
curl "http://localhost:3001/api/installations?limit=50&offset=0"
# Page 2
curl "http://localhost:3001/api/installations?limit=50&offset=50"
```

### Filter by date
```bash
curl "http://localhost:3001/api/installations?startDate=2025-12-01&endDate=2025-12-31"
```

## 🔐 Security Checklist

- ✅ `.env` file created and not committed
- ✅ Firebase credentials configured
- ✅ CORS origins restricted
- ✅ HTTPS enabled in production
- ⚠️ Consider adding API authentication for production

## 📞 Need Help?

1. Check if server is running: `curl http://localhost:3001/health`
2. View server logs for errors
3. Verify `.env` configuration
4. See detailed docs: `backend/README.md`

