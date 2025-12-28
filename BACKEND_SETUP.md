# Backend API Setup Guide

This project includes a separate backend API server for exposing installation data to external applications.

## Quick Start

### 1. Navigate to Backend Folder

```bash
cd backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Firebase Credentials

#### Get Your Firebase Service Account Key:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** → **Service Accounts**
4. Click **"Generate New Private Key"**
5. Download the JSON file

#### Create Environment File:

```bash
# Copy the template
cp env.template .env
```

Then edit `.env` and add your Firebase credentials:

**Option 1: Complete JSON (Recommended)**
```env
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project",...entire JSON...}
```

**Option 2: Individual Fields**
```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 4. Start the Server

**Development (with auto-reload):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

The server will start on `http://localhost:3001`

### 5. Test the API

Open your browser or use curl:

```bash
# Health check
curl http://localhost:3001/health

# Get all installations
curl http://localhost:3001/api/installations

# Get statistics
curl http://localhost:3001/api/installations/stats/summary
```

## Available Endpoints

### 📋 Main Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server health check |
| `/api/installations` | GET | Get all installations (with filters) |
| `/api/installations/:id` | GET | Get single installation by ID |
| `/api/installations/stats/summary` | GET | Get aggregate statistics |
| `/api/installations/export/json` | GET | Export all data as JSON file |

### 🔍 Query Parameters for `/api/installations`

- `teamId` - Filter by team
- `status` - Filter by status (pending/verified/flagged)
- `deviceId` - Filter by device ID
- `locationId` - Filter by location ID
- `startDate` - Filter by date range (ISO format)
- `endDate` - Filter by date range (ISO format)
- `limit` - Pagination limit
- `offset` - Pagination offset

### 📝 Example Requests

```bash
# Get verified installations
curl "http://localhost:3001/api/installations?status=verified"

# Get installations for a specific team
curl "http://localhost:3001/api/installations?teamId=team123"

# Get with pagination
curl "http://localhost:3001/api/installations?limit=20&offset=0"

# Get installations in date range
curl "http://localhost:3001/api/installations?startDate=2025-01-01&endDate=2025-12-31"

# Export all data
curl "http://localhost:3001/api/installations/export/json" -o installations.json
```

## Frontend Integration

See [`backend/INTEGRATION.md`](./backend/INTEGRATION.md) for detailed frontend integration examples including:
- React/TypeScript API client
- Pagination examples
- Statistics dashboard
- Error handling
- Python integration
- Excel/Power BI integration

## Deployment

### Deploy to Render

1. Create a new Web Service
2. Connect your repository
3. Configure:
   - **Build Command:** `cd backend && npm install`
   - **Start Command:** `cd backend && npm start`
   - **Environment Variables:** Add your Firebase credentials

### Deploy to Railway

1. Create new project from GitHub
2. Set root directory to `backend`
3. Add environment variables
4. Deploy

### Deploy to Heroku

```bash
cd backend
git init
heroku create your-app-name
heroku config:set FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
git add .
git commit -m "Initial commit"
git push heroku main
```

## CORS Configuration

By default, the API allows requests from `http://localhost:5173` (Vite dev server).

To add more origins, update `.env`:

```env
ALLOWED_ORIGINS=http://localhost:5173,https://your-domain.com
```

To allow all origins (development only):
```env
ALLOWED_ORIGINS=*
```

## Security Considerations

1. ✅ Never commit `.env` or service account files
2. ✅ Use HTTPS in production
3. ✅ Restrict CORS to specific domains
4. ⚠️ Consider adding API authentication for production
5. ⚠️ Set up rate limiting for public APIs
6. ⚠️ Monitor API usage and set quotas

## Troubleshooting

### Firebase Not Initialized

**Error:** "Firebase is not initialized"

**Solution:**
- Check if `.env` file exists
- Verify Firebase credentials are correct
- Ensure the service account has proper permissions

### CORS Errors

**Error:** "blocked by CORS policy"

**Solution:**
- Add your frontend URL to `ALLOWED_ORIGINS` in `.env`
- Restart the backend server

### Port Already in Use

**Error:** "Port 3001 is already in use"

**Solution:**
```bash
# Change port in .env
PORT=3002
```

### Empty Response

**Solution:**
- Verify Firebase credentials
- Check if Firestore has data
- Review server console logs

## Documentation

- **README:** [`backend/README.md`](./backend/README.md) - Full API documentation
- **Integration:** [`backend/INTEGRATION.md`](./backend/INTEGRATION.md) - Frontend integration guide
- **Main Project:** [`README.md`](./README.md) - Main project documentation

## Support

For issues or questions:
1. Check server logs for errors
2. Verify Firebase credentials
3. Test endpoints with curl
4. Review the documentation

## Project Structure

```
backend/
├── server.js           # Main API server
├── package.json        # Dependencies
├── .gitignore         # Git ignore rules
├── env.template       # Environment template
├── README.md          # API documentation
├── INTEGRATION.md     # Integration guide
├── test-api.js        # Test script
└── start-dev.bat/sh   # Startup scripts
```

