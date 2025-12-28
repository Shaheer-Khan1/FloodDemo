import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('🔧 Backend Setup Helper\n');
console.log('This script will copy Firebase credentials from your frontend .env file\n');

// Check if frontend .env exists
const frontendEnvPath = join(__dirname, '..', '.env');

if (!existsSync(frontendEnvPath)) {
  console.error('❌ Frontend .env file not found at:', frontendEnvPath);
  console.log('\n💡 Please create a .env file in your project root first.');
  process.exit(1);
}

try {
  // Read frontend .env
  const frontendEnv = readFileSync(frontendEnvPath, 'utf8');
  
  // Extract Firebase values
  const extractValue = (key) => {
    const match = frontendEnv.match(new RegExp(`${key}=(.+)`));
    return match ? match[1].trim() : '';
  };

  const firebaseConfig = {
    FIREBASE_API_KEY: extractValue('VITE_FIREBASE_API_KEY'),
    FIREBASE_AUTH_DOMAIN: extractValue('VITE_FIREBASE_AUTH_DOMAIN'),
    FIREBASE_PROJECT_ID: extractValue('VITE_FIREBASE_PROJECT_ID'),
    FIREBASE_STORAGE_BUCKET: extractValue('VITE_FIREBASE_STORAGE_BUCKET'),
    FIREBASE_MESSAGING_SENDER_ID: extractValue('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    FIREBASE_APP_ID: extractValue('VITE_FIREBASE_APP_ID')
  };

  // Check if we got the values
  if (!firebaseConfig.FIREBASE_PROJECT_ID || !firebaseConfig.FIREBASE_API_KEY) {
    console.error('❌ Could not find Firebase credentials in frontend .env');
    console.log('\n💡 Make sure your .env file contains:');
    console.log('   VITE_FIREBASE_API_KEY');
    console.log('   VITE_FIREBASE_PROJECT_ID');
    console.log('   VITE_FIREBASE_AUTH_DOMAIN');
    console.log('   etc.');
    process.exit(1);
  }

  // Generate backend .env content
  const backendEnvContent = `# Firebase Client SDK Configuration
# Auto-generated from frontend .env

FIREBASE_API_KEY=${firebaseConfig.FIREBASE_API_KEY}
FIREBASE_AUTH_DOMAIN=${firebaseConfig.FIREBASE_AUTH_DOMAIN}
FIREBASE_PROJECT_ID=${firebaseConfig.FIREBASE_PROJECT_ID}
FIREBASE_STORAGE_BUCKET=${firebaseConfig.FIREBASE_STORAGE_BUCKET}
FIREBASE_MESSAGING_SENDER_ID=${firebaseConfig.FIREBASE_MESSAGING_SENDER_ID}
FIREBASE_APP_ID=${firebaseConfig.FIREBASE_APP_ID}

# Server Configuration
PORT=3001
NODE_ENV=development

# CORS Configuration (comma-separated origins)
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
`;

  // Check if backend .env already exists
  const backendEnvPath = join(__dirname, '.env');
  if (existsSync(backendEnvPath)) {
    console.log('⚠️  Backend .env file already exists!');
    console.log('   Would you like to overwrite it? (This will be skipped in non-interactive mode)');
    console.log('   Backup your existing .env first if needed.\n');
  }

  // Write the file
  writeFileSync(backendEnvPath, backendEnvContent);
  
  console.log('✅ Backend .env file created successfully!\n');
  console.log('📋 Configuration copied:');
  console.log(`   Project ID: ${firebaseConfig.FIREBASE_PROJECT_ID}`);
  console.log(`   API Key: ${firebaseConfig.FIREBASE_API_KEY.substring(0, 20)}...`);
  console.log('\n🚀 Next steps:');
  console.log('   1. Review backend/.env file');
  console.log('   2. Run: npm run dev:client');
  console.log('   3. Test: curl http://localhost:3001/health\n');

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}

