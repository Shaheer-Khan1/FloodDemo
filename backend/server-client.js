import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, query, where, limit as firestoreLimit, startAfter, orderBy } from 'firebase/firestore';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Firebase Client SDK (no service account needed!)
let db = null;
let firebaseInitialized = false;

try {
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID
  };

  // Check if we have the minimum required config
  if (firebaseConfig.projectId && firebaseConfig.apiKey) {
    const firebaseApp = initializeApp(firebaseConfig);
    db = getFirestore(firebaseApp);
    firebaseInitialized = true;
    console.log('✅ Firebase Client SDK initialized successfully');
  } else {
    console.warn('⚠️  Firebase configuration incomplete. Check your .env file.');
  }
} catch (error) {
  console.error('❌ Failed to initialize Firebase:', error.message);
}

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());

// Helper function to convert Firestore timestamp to ISO string
function convertTimestamp(timestamp) {
  if (!timestamp) return null;
  if (timestamp.toDate) return timestamp.toDate().toISOString();
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000).toISOString();
  return timestamp;
}

// Helper to convert document to plain object
function docToObject(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    createdAt: convertTimestamp(data.createdAt),
    updatedAt: convertTimestamp(data.updatedAt),
    verifiedAt: convertTimestamp(data.verifiedAt),
    systemPreVerifiedAt: convertTimestamp(data.systemPreVerifiedAt),
    escalatedAt: convertTimestamp(data.escalatedAt)
  };
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    firebaseInitialized,
    sdkType: 'client'
  });
});

// Get all installations
app.get('/api/installations', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        error: 'Service unavailable', 
        message: 'Firebase is not initialized' 
      });
    }

    const { 
      teamId, 
      status, 
      deviceId,
      locationId,
      startDate,
      endDate,
      limit: limitParam,
      offset: offsetParam
    } = req.query;

    // Build query
    let q = collection(db, 'installations');
    const constraints = [];

    // Apply filters
    if (teamId) {
      constraints.push(where('teamId', '==', teamId));
    }
    if (status) {
      constraints.push(where('status', '==', status));
    }
    if (deviceId) {
      constraints.push(where('deviceId', '==', deviceId));
    }
    if (locationId) {
      constraints.push(where('locationId', '==', locationId));
    }

    // Note: Client SDK has limitations with complex queries
    // For best results, use single where clause or indexed queries
    if (constraints.length > 0) {
      q = query(collection(db, 'installations'), ...constraints);
    }

    const snapshot = await getDocs(q);
    
    // Fetch all locations for coordinate lookup
    const locationsSnapshot = await getDocs(collection(db, 'locations'));
    const locationsMap = new Map();
    locationsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      locationsMap.set(doc.id, {
        latitude: data.latitude,
        longitude: data.longitude,
        municipalityName: data.municipalityName
      });
      // Also map by locationId field if it exists and differs from doc.id
      if (data.locationId && data.locationId !== doc.id) {
        locationsMap.set(data.locationId, {
          latitude: data.latitude,
          longitude: data.longitude,
          municipalityName: data.municipalityName
        });
      }
    });
    
    let installations = snapshot.docs.map(doc => {
      const installation = docToObject(doc);
      
      // Get location coordinates if locationId exists
      let locationCoordinates = null;
      if (installation.locationId) {
        const location = locationsMap.get(installation.locationId);
        if (location) {
          locationCoordinates = {
            latitude: location.latitude,
            longitude: location.longitude,
            municipalityName: location.municipalityName
          };
        }
      }
      
      return {
        ...installation,
        // User-entered coordinates (kept as is)
        userLatitude: installation.latitude,
        userLongitude: installation.longitude,
        // Location-based coordinates (from locations collection)
        locationCoordinates: locationCoordinates
      };
    });

    // Apply date filters client-side (since Firestore client SDK has limitations)
    if (startDate) {
      const start = new Date(startDate);
      installations = installations.filter(inst => 
        inst.createdAt && new Date(inst.createdAt) >= start
      );
    }
    if (endDate) {
      const end = new Date(endDate);
      installations = installations.filter(inst => 
        inst.createdAt && new Date(inst.createdAt) <= end
      );
    }

    // Apply pagination
    const totalCount = installations.length;
    const offset = offsetParam ? parseInt(offsetParam) : 0;
    const limitValue = limitParam ? parseInt(limitParam) : installations.length;
    
    const paginatedInstallations = installations.slice(offset, offset + limitValue);

    res.json({
      success: true,
      data: paginatedInstallations,
      metadata: {
        total: totalCount,
        returned: paginatedInstallations.length,
        offset: offset,
        limit: limitParam ? parseInt(limitParam) : null,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching installations:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Get installations by device ID
app.get('/api/installations/device/:deviceId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        error: 'Service unavailable', 
        message: 'Firebase is not initialized' 
      });
    }

    const { deviceId } = req.params;
    
    // Query installations by deviceId
    const q = query(
      collection(db, 'installations'), 
      where('deviceId', '==', deviceId)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return res.json({
        success: true,
        data: [],
        message: `No installations found for device ${deviceId}`
      });
    }

    // Fetch all locations for coordinate lookup
    const locationsSnapshot = await getDocs(collection(db, 'locations'));
    const locationsMap = new Map();
    locationsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      locationsMap.set(doc.id, {
        latitude: data.latitude,
        longitude: data.longitude,
        municipalityName: data.municipalityName
      });
      // Also map by locationId field if it exists and differs from doc.id
      if (data.locationId && data.locationId !== doc.id) {
        locationsMap.set(data.locationId, {
          latitude: data.latitude,
          longitude: data.longitude,
          municipalityName: data.municipalityName
        });
      }
    });
    
    const installations = snapshot.docs.map(doc => {
      const installation = docToObject(doc);
      
      // Get location coordinates if locationId exists
      let locationCoordinates = null;
      if (installation.locationId) {
        const location = locationsMap.get(installation.locationId);
        if (location) {
          locationCoordinates = {
            latitude: location.latitude,
            longitude: location.longitude,
            municipalityName: location.municipalityName
          };
        }
      }
      
      return {
        ...installation,
        // User-entered coordinates (kept as is)
        userLatitude: installation.latitude,
        userLongitude: installation.longitude,
        // Location-based coordinates (from locations collection)
        locationCoordinates: locationCoordinates
      };
    });

    res.json({
      success: true,
      data: installations,
      metadata: {
        deviceId: deviceId,
        total: installations.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching installations by device:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Get single installation by ID
app.get('/api/installations/:id', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        error: 'Service unavailable', 
        message: 'Firebase is not initialized' 
      });
    }

    const { id } = req.params;
    const docRef = doc(db, 'installations', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return res.status(404).json({ 
        error: 'Not found', 
        message: `Installation with ID ${id} not found` 
      });
    }

    const installation = docToObject(docSnap);
    
    // Get location coordinates if locationId exists
    let locationCoordinates = null;
    if (installation.locationId) {
      const locationRef = doc(db, 'locations', installation.locationId);
      const locationSnap = await getDoc(locationRef);
      if (locationSnap.exists()) {
        const locationData = locationSnap.data();
        locationCoordinates = {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          municipalityName: locationData.municipalityName
        };
      }
    }

    res.json({
      success: true,
      data: {
        ...installation,
        // User-entered coordinates (kept as is)
        userLatitude: installation.latitude,
        userLongitude: installation.longitude,
        // Location-based coordinates (from locations collection)
        locationCoordinates: locationCoordinates
      }
    });

  } catch (error) {
    console.error('Error fetching installation:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Get list of all installed devices (devices that have installations)
app.get('/api/devices/installed', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        error: 'Service unavailable', 
        message: 'Firebase is not initialized' 
      });
    }

    const snapshot = await getDocs(collection(db, 'installations'));
    
    // Extract unique device IDs
    const deviceMap = new Map();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.deviceId && !deviceMap.has(data.deviceId)) {
        deviceMap.set(data.deviceId, {
          deviceId: data.deviceId,
          firstInstallation: convertTimestamp(data.createdAt),
          status: data.status,
          locationId: data.locationId,
          teamId: data.teamId
        });
      }
    });

    const installedDevices = Array.from(deviceMap.values());

    res.json({
      success: true,
      data: installedDevices,
      metadata: {
        total: installedDevices.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching installed devices:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Get installations by team/amanah name
app.get('/api/installations/amanah/:teamName', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        error: 'Service unavailable', 
        message: 'Firebase is not initialized' 
      });
    }

    const { teamName } = req.params;
    
    // First, get all teams to find the matching team ID
    const teamsSnapshot = await getDocs(collection(db, 'teams'));
    let matchingTeamId = null;
    let matchingTeamFullName = null;
    
    teamsSnapshot.docs.forEach(doc => {
      const teamData = doc.data();
      // Case-insensitive search
      if (teamData.name && teamData.name.toLowerCase().includes(teamName.toLowerCase())) {
        matchingTeamId = doc.id;
        matchingTeamFullName = teamData.name;
      }
    });

    if (!matchingTeamId) {
      return res.status(404).json({
        error: 'Not found',
        message: `No team/amanah found matching: ${teamName}`
      });
    }

    // Now get installations for this team
    const q = query(
      collection(db, 'installations'),
      where('teamId', '==', matchingTeamId)
    );
    
    const snapshot = await getDocs(q);
    const installations = snapshot.docs.map(doc => docToObject(doc));

    res.json({
      success: true,
      data: installations,
      metadata: {
        teamId: matchingTeamId,
        teamName: matchingTeamFullName,
        searchTerm: teamName,
        total: installations.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching installations by amanah:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Get installations by creation date
app.get('/api/installations/date/:date', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        error: 'Service unavailable', 
        message: 'Firebase is not initialized' 
      });
    }

    const { date } = req.params;
    
    // Parse the date (expects YYYY-MM-DD format)
    let targetDate;
    try {
      targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        throw new Error('Invalid date');
      }
    } catch (err) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Invalid date format. Please use YYYY-MM-DD format (e.g., 2025-12-28)'
      });
    }

    // Get start and end of the day
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all installations (Client SDK limitation - filtering dates client-side)
    const snapshot = await getDocs(collection(db, 'installations'));
    
    const installations = snapshot.docs
      .map(doc => docToObject(doc))
      .filter(inst => {
        if (!inst.createdAt) return false;
        const createdDate = new Date(inst.createdAt);
        return createdDate >= startOfDay && createdDate <= endOfDay;
      });

    res.json({
      success: true,
      data: installations,
      metadata: {
        date: date,
        startOfDay: startOfDay.toISOString(),
        endOfDay: endOfDay.toISOString(),
        total: installations.length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching installations by date:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Get installation statistics
app.get('/api/installations/stats/summary', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        error: 'Service unavailable', 
        message: 'Firebase is not initialized' 
      });
    }

    const snapshot = await getDocs(collection(db, 'installations'));
    const installations = snapshot.docs.map(doc => doc.data());

    const stats = {
      total: installations.length,
      byStatus: {
        pending: installations.filter(i => i.status === 'pending').length,
        verified: installations.filter(i => i.status === 'verified').length,
        flagged: installations.filter(i => i.status === 'flagged').length
      },
      systemPreVerified: installations.filter(i => i.systemPreVerified).length,
      withImages: installations.filter(i => i.imageUrls?.length > 0).length,
      withVideo: installations.filter(i => i.videoUrl).length,
      timestamp: new Date().toISOString()
    };

    // Group by team
    const teamStats = {};
    installations.forEach(inst => {
      if (inst.teamId) {
        teamStats[inst.teamId] = (teamStats[inst.teamId] || 0) + 1;
      }
    });
    stats.byTeam = teamStats;

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Export installations as JSON
app.get('/api/installations/export/json', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        error: 'Service unavailable', 
        message: 'Firebase is not initialized' 
      });
    }

    const snapshot = await getDocs(collection(db, 'installations'));
    const installations = snapshot.docs.map(doc => docToObject(doc));

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=installations_${Date.now()}.json`);
    
    res.json({
      exportedAt: new Date().toISOString(),
      totalRecords: installations.length,
      data: installations
    });

  } catch (error) {
    console.error('Error exporting installations:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found', 
    message: 'The requested endpoint does not exist' 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: err.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 FloodWatch Backend API (Client SDK) running on http://localhost:${PORT}`);
  console.log(`\n📍 Main Endpoints:`);
  console.log(`   📊 Health: http://localhost:${PORT}/health`);
  console.log(`   📦 All Installations: http://localhost:${PORT}/api/installations`);
  console.log(`   🔍 By Device: http://localhost:${PORT}/api/installations/device/:deviceId`);
  console.log(`   🏢 By Amanah: http://localhost:${PORT}/api/installations/amanah/:teamName`);
  console.log(`   📅 By Date: http://localhost:${PORT}/api/installations/date/:date`);
  console.log(`\n📊 Additional Endpoints:`);
  console.log(`   🖥️  Installed Devices: http://localhost:${PORT}/api/devices/installed`);
  console.log(`   📈 Statistics: http://localhost:${PORT}/api/installations/stats/summary`);
  console.log(`   💾 Export: http://localhost:${PORT}/api/installations/export/json`);
  console.log(`\n💡 Note: Using Firebase Client SDK (no service account required)`);
});

