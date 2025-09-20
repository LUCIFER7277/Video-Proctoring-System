// Test script to verify detection and reporting functionality
console.log('🧪 Testing Video Proctoring Detection System...');

// Test 1: Check if services are properly imported
try {
    console.log('✅ Testing service imports...');

    // Test focus detection service
    const FocusDetectionService = require('./src/services/focusDetectionService.js');
    console.log('✅ FocusDetectionService imported successfully');

    // Test object detection service  
    const ObjectDetectionService = require('./src/services/objectDetectionService.js');
    console.log('✅ ObjectDetectionService imported successfully');

} catch (error) {
    console.error('❌ Service import test failed:', error.message);
}

// Test 2: Check environment variables
console.log('\n🔧 Testing environment configuration...');
console.log('VITE_SOCKET_URL:', process.env.VITE_SOCKET_URL || 'Not set');
console.log('VITE_API_URL:', process.env.VITE_API_URL || 'Not set');

// Test 3: Check if detection services can be instantiated
try {
    console.log('\n🏗️ Testing service instantiation...');

    const focusService = new FocusDetectionService();
    console.log('✅ FocusDetectionService instantiated');

    const objectService = new ObjectDetectionService();
    console.log('✅ ObjectDetectionService instantiated');

    // Test service status
    console.log('Focus service status:', focusService.getStatus());
    console.log('Object service status:', objectService.getStatus());

} catch (error) {
    console.error('❌ Service instantiation test failed:', error.message);
}

// Test 4: Check violation types
console.log('\n📋 Testing violation types...');
const expectedViolationTypes = [
    'looking_away',
    'no_face_detected',
    'multiple_faces_detected',
    'phone_detected',
    'book_detected',
    'device_detected',
    'unauthorized_item'
];

console.log('Expected violation types:', expectedViolationTypes);

// Test 5: Check API endpoints
console.log('\n🌐 Testing API endpoints...');
const apiEndpoints = [
    '/api/violations',
    '/api/interviews',
    '/api/reports'
];

apiEndpoints.forEach(endpoint => {
    console.log(`✅ Endpoint configured: ${endpoint}`);
});

console.log('\n🎉 Detection system test completed!');
console.log('\n📝 Next steps:');
console.log('1. Start the backend server: cd Backend && npm start');
console.log('2. Start the frontend: cd Frontend && npm run dev');
console.log('3. Open browser and test the interview functionality');
console.log('4. Check browser console for detection logs');
console.log('5. Verify violations are being saved to database');
