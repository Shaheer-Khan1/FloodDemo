import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import admin from 'firebase-admin';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Firebase Admin
let firebaseInitialized = false;
try {
  // Try to parse service account from env variable
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseInitialized = true;
    console.log('✅ Firebase Admin initialized with service account');
  } else if (process.env.FIREBASE_PROJECT_ID) {
    // Alternative: use individual env variables
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      })
    });
    firebaseInitialized = true;
    console.log('✅ Firebase Admin initialized with individual credentials');
  } else {
    console.warn('⚠️  Firebase credentials not found in environment variables');
  }
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin:', error.message);
}

const db = firebaseInitialized ? admin.firestore() : null;

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:5173'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    firebaseInitialized 
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

    // Query parameters for filtering
    const { 
      teamId, 
      status, 
      limit, 
      offset,
      startDate,
      endDate,
      deviceId,
      locationId
    } = req.query;

    let query = db.collection('installations');

    // Apply filters
    if (teamId) {
      query = query.where('teamId', '==', teamId);
    }
    if (status) {
      query = query.where('status', '==', status);
    }
    if (deviceId) {
      query = query.where('deviceId', '==', deviceId);
    }
    if (locationId) {
      query = query.where('locationId', '==', locationId);
    }

    // Get the data
    const snapshot = await query.get();
    
    let installations = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        // Convert Firestore timestamps to ISO strings
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        verifiedAt: data.verifiedAt?.toDate?.()?.toISOString() || data.verifiedAt,
        systemPreVerifiedAt: data.systemPreVerifiedAt?.toDate?.()?.toISOString() || data.systemPreVerifiedAt,
        escalatedAt: data.escalatedAt?.toDate?.()?.toISOString() || data.escalatedAt
      };
    });

    // Apply date range filter (after fetching, since Firestore needs exact field for where clauses)
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
    const startIndex = offset ? parseInt(offset) : 0;
    const endIndex = limit ? startIndex + parseInt(limit) : installations.length;
    
    const paginatedInstallations = installations.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paginatedInstallations,
      metadata: {
        total: totalCount,
        returned: paginatedInstallations.length,
        offset: startIndex,
        limit: limit ? parseInt(limit) : null,
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
    const snapshot = await db.collection('installations')
      .where('deviceId', '==', deviceId)
      .get();
    
    if (snapshot.empty) {
      return res.json({
        success: true,
        data: [],
        message: `No installations found for device ${deviceId}`
      });
    }

    const installations = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        verifiedAt: data.verifiedAt?.toDate?.()?.toISOString() || data.verifiedAt,
        systemPreVerifiedAt: data.systemPreVerifiedAt?.toDate?.()?.toISOString() || data.systemPreVerifiedAt,
        escalatedAt: data.escalatedAt?.toDate?.()?.toISOString() || data.escalatedAt
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
    const doc = await db.collection('installations').doc(id).get();

    if (!doc.exists) {
      return res.status(404).json({ 
        error: 'Not found', 
        message: `Installation with ID ${id} not found` 
      });
    }

    const data = doc.data();
    const installation = {
      id: doc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      verifiedAt: data.verifiedAt?.toDate?.()?.toISOString() || data.verifiedAt,
      systemPreVerifiedAt: data.systemPreVerifiedAt?.toDate?.()?.toISOString() || data.systemPreVerifiedAt,
      escalatedAt: data.escalatedAt?.toDate?.()?.toISOString() || data.escalatedAt
    };

    res.json({
      success: true,
      data: installation
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

    const snapshot = await db.collection('installations').get();
    
    // Extract unique device IDs
    const deviceMap = new Map();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.deviceId && !deviceMap.has(data.deviceId)) {
        deviceMap.set(data.deviceId, {
          deviceId: data.deviceId,
          firstInstallation: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
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
    const teamsSnapshot = await db.collection('teams').get();
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
    const snapshot = await db.collection('installations')
      .where('teamId', '==', matchingTeamId)
      .get();
    
    const installations = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        verifiedAt: data.verifiedAt?.toDate?.()?.toISOString() || data.verifiedAt,
        systemPreVerifiedAt: data.systemPreVerifiedAt?.toDate?.()?.toISOString() || data.systemPreVerifiedAt,
        escalatedAt: data.escalatedAt?.toDate?.()?.toISOString() || data.escalatedAt
      };
    });

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

    // Get all installations
    const snapshot = await db.collection('installations').get();
    
    const installations = snapshot.docs
      .map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
          verifiedAt: data.verifiedAt?.toDate?.()?.toISOString() || data.verifiedAt,
          systemPreVerifiedAt: data.systemPreVerifiedAt?.toDate?.()?.toISOString() || data.systemPreVerifiedAt,
          escalatedAt: data.escalatedAt?.toDate?.()?.toISOString() || data.escalatedAt
        };
      })
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

    const snapshot = await db.collection('installations').get();
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

    // Group by team if teamId exists
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

// Export installations as JSON (full data dump)
app.get('/api/installations/export/json', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        error: 'Service unavailable', 
        message: 'Firebase is not initialized' 
      });
    }

    const snapshot = await db.collection('installations').get();
    const installations = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
        verifiedAt: data.verifiedAt?.toDate?.()?.toISOString() || data.verifiedAt,
        systemPreVerifiedAt: data.systemPreVerifiedAt?.toDate?.()?.toISOString() || data.systemPreVerifiedAt,
        escalatedAt: data.escalatedAt?.toDate?.()?.toISOString() || data.escalatedAt
      };
    });

    // Set headers for file download
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
  console.log(`🚀 FloodWatch Backend API running on http://localhost:${PORT}`);
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
});

