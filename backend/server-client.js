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
    
    let installations = snapshot.docs.map(doc => docToObject(doc));

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

    const installations = snapshot.docs.map(doc => docToObject(doc));

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

    res.json({
      success: true,
      data: docToObject(docSnap)
    });

  } catch (error) {
    console.error('Error fetching installation:', error);
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
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📦 Installations API: http://localhost:${PORT}/api/installations`);
  console.log(`🔍 By Device: http://localhost:${PORT}/api/installations/device/:deviceId`);
  console.log(`📈 Stats API: http://localhost:${PORT}/api/installations/stats/summary`);
  console.log(`💾 Export API: http://localhost:${PORT}/api/installations/export/json`);
  console.log(`\n💡 Note: Using Firebase Client SDK (no service account required)`);
});

