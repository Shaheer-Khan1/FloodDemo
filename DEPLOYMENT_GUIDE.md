# FlowSet Deployment Guide

## Overview
This guide explains how to deploy the FlowSet IoT Installation Management system in your own data center or on your infrastructure.

## Current Architecture
- **Frontend**: React + Vite (runs on Vercel/any static host)
- **Backend**: Firebase (Firestore, Authentication, Storage, Functions)
- **Domain**: Currently deployed at `flood-demo.vercel.app`

## Deployment Options

### Option 1: Keep Firebase, Deploy Frontend Only (Recommended for Quick Setup)

#### Pros:
- No backend changes needed
- Firebase handles scaling automatically
- Fastest deployment
- Same Firebase project, new frontend URL

#### Process:

1. **Build the frontend:**
   ```bash
   npm run build
   ```
   This creates a `dist` folder with static files.

2. **Configure environment variables:**
   Create a `.env.production` file:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

3. **Deploy to your hosting:**
   - Upload `dist` folder contents to your web server
   - Configure your web server to serve index.html for all routes (SPA routing)
   - Configure SSL certificate (HTTPS required for camera access)

4. **Update Firebase Console:**
   - Add your new domain to Firebase Authentication authorized domains
   - Configure CORS in Firebase Storage if needed

#### Hosting Options:
- **Apache/Nginx**: Traditional web server
- **Docker**: Containerize the app
- **CDN**: CloudFlare, AWS CloudFront

---

### Option 2: Full Self-Hosted (Replace Firebase with Custom Backend)

#### Pros:
- Complete data sovereignty
- Custom infrastructure
- No Firebase costs
- Full control

#### Cons:
- Requires significant development
- Need to build:
  - Authentication system
  - File storage system
  - Real-time database (Firestore replacement)
  - Push notifications (optional)

#### Process:

1. **Backend Stack Suggestions:**
   - **Authentication**: Keycloak, Auth0, or custom JWT
   - **Database**: PostgreSQL + Redis for real-time
   - **Storage**: MinIO (S3-compatible) or local filesystem
   - **API**: Node.js/Express, Python/FastAPI, or Go

2. **Migration Steps:**
   - Export all Firebase data (Firestore + Auth users)
   - Create matching schema in PostgreSQL
   - Build authentication system
   - Implement file storage
   - Replace Firebase SDK calls in frontend
   - Update all API calls

3. **Frontend changes needed:**
   - Replace `@/lib/firebase.ts` with your API client
   - Replace `@/lib/auth-context.tsx` with your auth system
   - Update all Firestore queries to API calls
   - Update file uploads to your storage system

4. **Build and Deploy:**
   ```bash
   npm run build
   # Deploy frontend + backend
   ```

---

## Docker Deployment (Recommended for Self-Hosted)

### Dockerfile for Frontend:

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### nginx.conf:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Enable gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

### docker-compose.yml:

```yaml
version: '3.8'

services:
  frontend:
    build: .
    ports:
      - "80:80"
    restart: unless-stopped
    
  # Add your backend services here
  # database:
  #   image: postgres:15
  #   volumes:
  #     - ./data:/var/lib/postgresql/data
```

---

## Self-Hosted Backend Migration

### Step 1: Replace Firebase Auth

**Option A - Keycloak:**
```bash
docker run -d \
  -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin \
  -e KEYCLOAK_ADMIN_PASSWORD=admin \
  quay.io/keycloak/keycloak:latest
```

**Option B - Simple JWT Auth:**
- Node.js + Express
- PostgreSQL for user storage
- JWT token generation

### Step 2: Replace Firestore

**Schema in PostgreSQL:**
```sql
-- Devices table
CREATE TABLE devices (
    id VARCHAR PRIMARY KEY,
    product_id VARCHAR,
    device_serial_id VARCHAR,
    device_imei VARCHAR,
    iccid VARCHAR,
    timestamp VARCHAR,
    box_number VARCHAR,
    status VARCHAR DEFAULT 'pending',
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- User profiles table
CREATE TABLE user_profiles (
    uid VARCHAR PRIMARY KEY,
    email VARCHAR,
    display_name VARCHAR,
    role VARCHAR,
    team_id VARCHAR,
    location VARCHAR,
    is_admin BOOLEAN,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Teams table
CREATE TABLE teams (
    id VARCHAR PRIMARY KEY,
    name VARCHAR,
    owner_id VARCHAR,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);

-- Installations table
CREATE TABLE installations (
    id VARCHAR PRIMARY KEY,
    device_id VARCHAR,
    location_id VARCHAR,
    latitude DECIMAL,
    longitude DECIMAL,
    sensor_reading DECIMAL,
    image_urls JSONB, -- Array of strings
    video_url VARCHAR,
    installed_by VARCHAR,
    installed_by_name VARCHAR,
    team_id VARCHAR,
    status VARCHAR,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```

### Step 3: Replace Firebase Storage

**Option A - MinIO (S3-compatible):**
```bash
docker run -d \
  -p 9000:9000 \
  -p 9001:9001 \
  -e MINIO_ROOT_USER=admin \
  -e MINIO_ROOT_PASSWORD=password \
  minio/minio server /data --console-address ":9001"
```

**Option B - Local filesystem:**
```javascript
// Node.js example
app.post('/api/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  const url = `/uploads/${file.filename}`;
  res.json({ url });
});
```

---

## Database Migration from Firebase

### Export Firestore Data:

```javascript
const admin = require('firebase-admin');
const fs = require('fs');

async function exportData() {
  const collections = ['devices', 'userProfiles', 'teams', 'installations'];
  
  for (const collection of collections) {
    const snapshot = await admin.firestore().collection(collection).get();
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    fs.writeFileSync(
      `${collection}.json`, 
      JSON.stringify(data, null, 2)
    );
  }
}
```

### Import to PostgreSQL:

```javascript
const data = JSON.parse(fs.readFileSync('devices.json'));
for (const doc of data) {
  await db.query(`
    INSERT INTO devices (id, product_id, device_serial_id, ...)
    VALUES ($1, $2, $3, ...)
    ON CONFLICT (id) DO UPDATE SET ...
  `, [doc.id, doc.productId, doc.deviceSerialId, ...]);
}
```

---

## Environment Variables

### Frontend (.env.production):
```env
VITE_API_URL=https://api.yourdomain.com
VITE_FIREBASE_API_KEY=...
```

### Backend (.env):
```env
DATABASE_URL=postgresql://user:pass@db:5432/flowset
JWT_SECRET=your-secret-key
STORAGE_BACKEND=s3
S3_ENDPOINT=https://s3.amazonaws.com
S3_BUCKET=flowset-uploads
PORT=3000
```

---

## Security Checklist

- [ ] Enable HTTPS (Let's Encrypt certificate)
- [ ] Configure CORS properly
- [ ] Set up firewall rules
- [ ] Regular database backups
- [ ] Enable rate limiting
- [ ] Monitor logs for suspicious activity
- [ ] Keep dependencies updated
- [ ] Use environment variables for secrets
- [ ] Enable 2FA for admin accounts
- [ ] Audit file upload permissions

---

## Backup Strategy

### Automated Backups:

```bash
# Daily PostgreSQL backup
0 2 * * * pg_dump flowset > /backups/flowset_$(date +\%Y\%m\%d).sql

# Weekly full system backup
0 3 * * 0 tar -czf /backups/system_$(date +\%Y\%m\%d).tar.gz /app/data
```

---

## Monitoring

### Health Check Endpoint:
```javascript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    database: checkDatabaseConnection(),
    storage: checkStorageConnection(),
    timestamp: new Date()
  });
});
```

### Logging:
- Use Winston (Node.js) or similar
- Centralized logging (ELK, Loki)
- Error tracking (Sentry, Rollbar)

---

## Performance Optimization

- Enable gzip compression
- Use CDN for static assets
- Implement Redis caching
- Database query optimization
- Image compression (Sharp library)
- Lazy loading for large lists

---

## Cost Estimation

### Cloud Option (Keep Firebase):
- Firebase: ~$50-200/month (scales with usage)
- Hosting: Free (Vercel) or $20-100/month (AWS, Azure)

### Self-Hosted Option:
- VPS/Server: $50-200/month
- Domain: $10-20/year
- SSL: Free (Let's Encrypt)
- Monitoring: Optional ($20-50/month)

---

## Support

For deployment assistance, contact:
- Email: support@yourcompany.com
- Documentation: https://docs.yourdomain.com

---

## Quick Start Commands

```bash
# Development
npm run dev

# Production build
npm run build
npm run preview

# Docker
docker build -t flowset .
docker run -p 80:80 flowset

# Deploy to server
rsync -avz dist/ user@server:/var/www/flowset/
```

