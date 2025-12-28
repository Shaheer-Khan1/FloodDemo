// Simple test script to verify API endpoints
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3001';

async function testEndpoint(name, url, expectedStatus = 200) {
  try {
    console.log(`\n🧪 Testing: ${name}`);
    console.log(`   URL: ${url}`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (response.status === expectedStatus) {
      console.log(`   ✅ Status: ${response.status}`);
      console.log(`   📦 Response:`, JSON.stringify(data, null, 2).substring(0, 200) + '...');
      return true;
    } else {
      console.log(`   ❌ Expected status ${expectedStatus}, got ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🚀 FloodWatch API Test Suite\n');
  console.log('=' .repeat(50));
  
  const tests = [
    { name: 'Health Check', url: `${API_BASE}/health` },
    { name: 'Get All Installations', url: `${API_BASE}/api/installations` },
    { name: 'Get Installations Stats', url: `${API_BASE}/api/installations/stats/summary` },
    { name: 'Get Installations (filtered)', url: `${API_BASE}/api/installations?limit=5` },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const result = await testEndpoint(test.name, test.url);
    if (result) passed++;
    else failed++;
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Test Results:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Total: ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above.');
  }
}

// Check if server is running
console.log('Checking if server is running...');
fetch(`${API_BASE}/health`)
  .then(() => {
    console.log('✅ Server is running\n');
    runTests();
  })
  .catch(() => {
    console.error('❌ Server is not running!');
    console.error('Please start the server first: npm run dev');
    process.exit(1);
  });

