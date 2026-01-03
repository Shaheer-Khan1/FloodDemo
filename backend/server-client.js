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
    
    // Fetch all locations for coordinate lookup (with error handling)
    let locationsMap = new Map();
    try {
      const locationsSnapshot = await getDocs(collection(db, 'locations'));
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
    } catch (locError) {
      console.warn('Warning: Could not fetch locations:', locError.message);
      // Continue without location data
    }
    
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

    // Fetch all locations for coordinate lookup (with error handling)
    let locationsMap = new Map();
    try {
      const locationsSnapshot = await getDocs(collection(db, 'locations'));
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
    } catch (locError) {
      console.warn('Warning: Could not fetch locations:', locError.message);
      // Continue without location data
    }
    
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
    
    // Get location coordinates if locationId exists (with error handling)
    let locationCoordinates = null;
    if (installation.locationId) {
      try {
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
      } catch (locError) {
        console.warn(`Warning: Could not fetch location ${installation.locationId}:`, locError.message);
        // Continue without location data
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

// Get installations from a specific date/time until now
app.get('/api/installations/since/:timestamp', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        error: 'Service unavailable', 
        message: 'Firebase is not initialized' 
      });
    }

    const { timestamp } = req.params;
    
    // Parse the timestamp (supports ISO string or Unix timestamp in milliseconds)
    let startDate;
    try {
      if (timestamp.match(/^\d+$/)) {
        // Unix timestamp in milliseconds
        startDate = new Date(parseInt(timestamp));
      } else {
        // ISO string
        startDate = new Date(timestamp);
      }
      
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Invalid timestamp format. Use ISO string (2024-01-01T00:00:00Z) or Unix timestamp in milliseconds.'
        });
      }
    } catch (error) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Invalid timestamp format. Use ISO string (2024-01-01T00:00:00Z) or Unix timestamp in milliseconds.'
      });
    }

    const currentDate = new Date();
    
    // Convert to Firestore Timestamp for querying
    const startTimestamp = Timestamp.fromDate(startDate);
    
    // Query installations created after the given timestamp
    const q = query(
      collection(db, 'installations'),
      where('createdAt', '>=', startTimestamp),
      orderBy('createdAt', 'asc')
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return res.json({
        success: true,
        data: [],
        message: `No installations found since ${startDate.toISOString()}`,
        metadata: {
          startDate: startDate.toISOString(),
          endDate: currentDate.toISOString(),
          total: 0,
          timestamp: currentDate.toISOString()
        }
      });
    }

    // Fetch all locations for coordinate lookup (with error handling)
    let locationsMap = new Map();
    try {
      const locationsSnapshot = await getDocs(collection(db, 'locations'));
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
    } catch (locError) {
      console.warn('Warning: Could not fetch locations:', locError.message);
      // Continue without location data
    }

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
        startDate: startDate.toISOString(),
        endDate: currentDate.toISOString(),
        total: installations.length,
        timestamp: currentDate.toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching installations since timestamp:', error);
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

// ============================================================================
// ADMIN MENU - Device Filtering & CSV Export
// ============================================================================

// Admin: Get devices with filters and export as CSV
app.get('/api/admin/devices/filter', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        error: 'Service unavailable', 
        message: 'Firebase is not initialized' 
      });
    }

    const { 
      variance,           // Filter by variance threshold (e.g., "10" for devices with variance >= 10)
      readings,           // Comma-separated readings (e.g., "z,y,m")
      noServerData,       // "true" to filter devices with no server data
      format              // "csv" or "json"
    } = req.query;

    // Fetch all installations
    const installationsSnapshot = await getDocs(collection(db, 'installations'));
    
    // Fetch all locations for coordinate lookup
    let locationsMap = new Map();
    try {
      const locationsSnapshot = await getDocs(collection(db, 'locations'));
      locationsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        locationsMap.set(doc.id, {
          latitude: data.latitude,
          longitude: data.longitude,
          municipalityName: data.municipalityName
        });
        if (data.locationId && data.locationId !== doc.id) {
          locationsMap.set(data.locationId, {
            latitude: data.latitude,
            longitude: data.longitude,
            municipalityName: data.municipalityName
          });
        }
      });
    } catch (locError) {
      console.warn('Warning: Could not fetch locations:', locError.message);
    }

    // Fetch device readings/data (assuming there's a 'deviceData' or 'readings' collection)
    let deviceDataMap = new Map();
    try {
      // Try to fetch device data - adjust collection name as needed
      const deviceDataSnapshot = await getDocs(collection(db, 'deviceData'));
      deviceDataSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.deviceId) {
          if (!deviceDataMap.has(data.deviceId)) {
            deviceDataMap.set(data.deviceId, []);
          }
          deviceDataMap.get(data.deviceId).push(data);
        }
      });
    } catch (dataError) {
      console.warn('Warning: Could not fetch device data:', dataError.message);
    }

    // Process installations and build device list
    const deviceList = [];
    const processedDevices = new Set();

    installationsSnapshot.docs.forEach(doc => {
      const installation = docToObject(doc);
      const deviceId = installation.deviceId;

      // Skip if already processed
      if (processedDevices.has(deviceId)) return;
      processedDevices.add(deviceId);

      // Get location coordinates (prefer location relation, fallback to user-entered)
      let coordinates = null;
      if (installation.locationId) {
        const location = locationsMap.get(installation.locationId);
        if (location && location.latitude && location.longitude) {
          coordinates = {
            latitude: location.latitude,
            longitude: location.longitude,
            source: 'location_relation'
          };
        }
      }
      
      // Fallback to user-entered coordinates
      if (!coordinates && installation.latitude && installation.longitude) {
        coordinates = {
          latitude: installation.latitude,
          longitude: installation.longitude,
          source: 'user_entered'
        };
      }

      // Get device data
      const deviceData = deviceDataMap.get(deviceId) || [];
      
      // Calculate variance if data exists
      let calculatedVariance = null;
      if (deviceData.length > 0) {
        const values = deviceData
          .filter(d => d.value !== undefined && d.value !== null)
          .map(d => parseFloat(d.value));
        
        if (values.length > 1) {
          const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
          const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
          calculatedVariance = Math.sqrt(squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length);
        }
      }

      // Get latest readings
      const latestReadings = deviceData.length > 0 
        ? deviceData.sort((a, b) => {
            const timeA = a.timestamp ? new Date(convertTimestamp(a.timestamp)).getTime() : 0;
            const timeB = b.timestamp ? new Date(convertTimestamp(b.timestamp)).getTime() : 0;
            return timeB - timeA;
          }).slice(0, 10)
        : [];

      const device = {
        deviceId: deviceId,
        installerName: installation.installerName || installation.teamId || 'Unknown',
        latitude: coordinates?.latitude || '',
        longitude: coordinates?.longitude || '',
        coordinateSource: coordinates?.source || 'none',
        locationId: installation.locationId || '',
        hasServerData: deviceData.length > 0,
        variance: calculatedVariance !== null ? calculatedVariance.toFixed(2) : 'N/A',
        dataPointsCount: deviceData.length,
        latestReadings: latestReadings,
        installationDate: installation.createdAt || '',
        status: installation.status || ''
      };

      deviceList.push(device);
    });

    // Apply filters
    let filteredDevices = deviceList;

    // Filter by variance
    if (variance) {
      const varianceThreshold = parseFloat(variance);
      filteredDevices = filteredDevices.filter(device => {
        if (device.variance === 'N/A') return false;
        return parseFloat(device.variance) >= varianceThreshold;
      });
    }

    // Filter by specific readings
    if (readings) {
      const targetReadings = readings.split(',').map(r => r.trim().toLowerCase());
      filteredDevices = filteredDevices.filter(device => {
        return device.latestReadings.some(reading => {
          const readingType = (reading.type || reading.readingType || '').toLowerCase();
          return targetReadings.includes(readingType);
        });
      });
    }

    // Filter by no server data
    if (noServerData === 'true') {
      filteredDevices = filteredDevices.filter(device => !device.hasServerData);
    }

    // Return as CSV or JSON
    if (format === 'csv') {
      // Generate CSV
      const csvRows = [];
      csvRows.push(['Device ID', 'Installer Name', 'Latitude', 'Longitude', 'Coordinate Source', 'Location ID', 'Has Server Data', 'Variance', 'Data Points', 'Status', 'Installation Date']);
      
      filteredDevices.forEach(device => {
        csvRows.push([
          device.deviceId,
          device.installerName,
          device.latitude,
          device.longitude,
          device.coordinateSource,
          device.locationId,
          device.hasServerData ? 'Yes' : 'No',
          device.variance,
          device.dataPointsCount,
          device.status,
          device.installationDate
        ]);
      });

      const csvContent = csvRows.map(row => 
        row.map(cell => {
          // Escape cells containing commas, quotes, or newlines
          const cellStr = String(cell);
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(',')
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=devices_filtered_${Date.now()}.csv`);
      res.send(csvContent);
    } else {
      // Return as JSON
      res.json({
        success: true,
        data: filteredDevices,
        metadata: {
          total: filteredDevices.length,
          filters: {
            variance: variance || null,
            readings: readings || null,
            noServerData: noServerData === 'true'
          },
          timestamp: new Date().toISOString()
        }
      });
    }

  } catch (error) {
    console.error('Error filtering devices:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
    });
  }
});

// Admin: Get device statistics
app.get('/api/admin/devices/stats', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        error: 'Service unavailable', 
        message: 'Firebase is not initialized' 
      });
    }

    // Fetch all installations
    const installationsSnapshot = await getDocs(collection(db, 'installations'));
    
    // Fetch device data
    let deviceDataMap = new Map();
    try {
      const deviceDataSnapshot = await getDocs(collection(db, 'deviceData'));
      deviceDataSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.deviceId) {
          if (!deviceDataMap.has(data.deviceId)) {
            deviceDataMap.set(data.deviceId, 0);
          }
          deviceDataMap.set(data.deviceId, deviceDataMap.get(data.deviceId) + 1);
        }
      });
    } catch (dataError) {
      console.warn('Warning: Could not fetch device data:', dataError.message);
    }

    const uniqueDevices = new Set();
    installationsSnapshot.docs.forEach(doc => {
      const installation = doc.data();
      if (installation.deviceId) {
        uniqueDevices.add(installation.deviceId);
      }
    });

    const devicesWithData = Array.from(uniqueDevices).filter(deviceId => 
      deviceDataMap.has(deviceId) && deviceDataMap.get(deviceId) > 0
    );

    const devicesWithoutData = Array.from(uniqueDevices).filter(deviceId => 
      !deviceDataMap.has(deviceId) || deviceDataMap.get(deviceId) === 0
    );

    res.json({
      success: true,
      data: {
        totalDevices: uniqueDevices.size,
        devicesWithData: devicesWithData.length,
        devicesWithoutData: devicesWithoutData.length,
        devicesWithoutDataList: devicesWithoutData,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error fetching device stats:', error);
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
  console.log(`\n🔐 Admin Endpoints:`);
  console.log(`   🔍 Filter Devices: http://localhost:${PORT}/api/admin/devices/filter`);
  console.log(`      Query params: ?variance=10&readings=z,y,m&noServerData=true&format=csv`);
  console.log(`   📊 Device Stats: http://localhost:${PORT}/api/admin/devices/stats`);
  console.log(`\n💡 Note: Using Firebase Client SDK (no service account required)`);
});

