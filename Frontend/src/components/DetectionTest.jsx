import React, { useState, useRef, useEffect } from 'react';
import FocusDetectionService from '../services/focusDetectionService';
import ObjectDetectionService from '../services/objectDetectionService';

const DetectionTest = () => {
  const [testResults, setTestResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [detectionActive, setIsDetectionActive] = useState(false);
  
  const videoRef = useRef(null);
  const focusCanvasRef = useRef(null);
  const objectCanvasRef = useRef(null);
  const focusServiceRef = useRef(new FocusDetectionService());
  const objectServiceRef = useRef(new ObjectDetectionService());

  const addTestResult = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setTestResults(prev => [...prev, { message, type, timestamp }]);
    console.log(`[${type.toUpperCase()}] ${message}`);
  };

  const initializeCamera = async () => {
    try {
      addTestResult('🎥 Requesting camera access...', 'info');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false
      });
      
      videoRef.current.srcObject = stream;
      setCameraReady(true);
      addTestResult('✅ Camera access granted', 'success');
      
      return true;
    } catch (error) {
      addTestResult(`❌ Camera access failed: ${error.message}`, 'error');
      return false;
    }
  };

  const initializeDetectionServices = async () => {
    try {
      addTestResult('🔍 Initializing Focus Detection Service...', 'info');
      
      await focusServiceRef.current.initialize(videoRef.current, focusCanvasRef.current);
      focusServiceRef.current.addEventListener((event) => {
        addTestResult(`👁️ Focus Event: ${event.type} - ${event.message}`, 'focus');
      });
      
      addTestResult('✅ Focus Detection Service initialized', 'success');
      
      addTestResult('📱 Initializing Object Detection Service...', 'info');
      
      await objectServiceRef.current.initialize(videoRef.current, objectCanvasRef.current);
      objectServiceRef.current.addEventListener((event) => {
        addTestResult(`📦 Object Event: ${event.type} - ${event.message}`, 'object');
      });
      
      addTestResult('✅ Object Detection Service initialized', 'success');
      
      setIsDetectionActive(true);
      addTestResult('🎉 All detection services are now active!', 'success');
      
    } catch (error) {
      addTestResult(`❌ Detection service initialization failed: ${error.message}`, 'error');
    }
  };

  const runFullTest = async () => {
    setIsRunning(true);
    setTestResults([]);
    
    addTestResult('🚀 Starting Detection System Test...', 'info');
    
    // Test 1: Camera Access
    const cameraSuccess = await initializeCamera();
    if (!cameraSuccess) {
      addTestResult('❌ Test failed: Camera not available', 'error');
      setIsRunning(false);
      return;
    }
    
    // Wait for video to load
    await new Promise(resolve => {
      videoRef.current.onloadedmetadata = resolve;
    });
    
    // Test 2: Detection Services
    await initializeDetectionServices();
    
    if (detectionActive) {
      addTestResult('✅ All tests passed! Detection system is working properly.', 'success');
      addTestResult('💡 Try moving your face around or showing objects to test detection', 'info');
    } else {
      addTestResult('❌ Test failed: Detection services not active', 'error');
    }
    
    setIsRunning(false);
  };

  const stopTest = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
    focusServiceRef.current?.stop();
    objectServiceRef.current?.stop();
    setIsDetectionActive(false);
    setCameraReady(false);
    addTestResult('🛑 Test stopped', 'info');
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const getResultStyle = (type) => {
    const styles = {
      info: { color: '#3498db', backgroundColor: '#ebf3fd' },
      success: { color: '#27ae60', backgroundColor: '#d5f4e6' },
      error: { color: '#e74c3c', backgroundColor: '#fadbd8' },
      focus: { color: '#8e44ad', backgroundColor: '#f4ecf7' },
      object: { color: '#d68910', backgroundColor: '#fef9e7' }
    };
    return styles[type] || styles.info;
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h2>🧪 Detection System Test</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={runFullTest}
          disabled={isRunning}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: isRunning ? '#95a5a6' : '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: isRunning ? 'not-allowed' : 'pointer'
          }}
        >
          {isRunning ? '🔄 Running Test...' : '🚀 Start Test'}
        </button>
        
        <button
          onClick={stopTest}
          style={{
            padding: '10px 20px',
            marginRight: '10px',
            backgroundColor: '#e74c3c',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          🛑 Stop Test
        </button>
        
        <button
          onClick={clearResults}
          style={{
            padding: '10px 20px',
            backgroundColor: '#95a5a6',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer'
          }}
        >
          🗑️ Clear Results
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Video Section */}
        <div>
          <h3>📹 Live Video Feed</h3>
          <div style={{ position: 'relative', border: '2px solid #ddd', borderRadius: '8px', overflow: 'hidden' }}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', height: 'auto' }}
            />
            <canvas
              ref={focusCanvasRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none'
              }}
            />
            <canvas
              ref={objectCanvasRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                opacity: 0.7
              }}
            />
          </div>
          
          <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '5px' }}>
            <div><strong>Camera Status:</strong> {cameraReady ? '✅ Ready' : '❌ Not Ready'}</div>
            <div><strong>Detection Status:</strong> {detectionActive ? '✅ Active' : '❌ Inactive'}</div>
          </div>
        </div>

        {/* Test Results */}
        <div>
          <h3>📋 Test Results</h3>
          <div style={{ 
            height: '400px', 
            overflowY: 'auto', 
            border: '1px solid #ddd', 
            borderRadius: '5px',
            padding: '10px',
            backgroundColor: '#f8f9fa'
          }}>
            {testResults.length === 0 ? (
              <div style={{ color: '#7f8c8d', textAlign: 'center', marginTop: '50px' }}>
                Click "Start Test" to begin testing the detection system
              </div>
            ) : (
              testResults.map((result, index) => (
                <div
                  key={index}
                  style={{
                    padding: '8px 12px',
                    margin: '5px 0',
                    borderRadius: '4px',
                    fontSize: '14px',
                    ...getResultStyle(result.type)
                  }}
                >
                  <span style={{ fontWeight: 'bold' }}>[{result.timestamp}]</span> {result.message}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#e8f4fd', borderRadius: '8px' }}>
        <h4>📝 Test Instructions:</h4>
        <ol>
          <li>Click "Start Test" to initialize the detection system</li>
          <li>Allow camera access when prompted</li>
          <li>Wait for detection services to load (may take 10-30 seconds)</li>
          <li>Test focus detection by looking away from the camera</li>
          <li>Test object detection by showing a phone, book, or other objects</li>
          <li>Check the test results panel for detection events</li>
          <li>Click "Stop Test" to end the test and clean up resources</li>
        </ol>
      </div>
    </div>
  );
};

export default DetectionTest;
