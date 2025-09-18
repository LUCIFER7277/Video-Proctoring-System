import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const SystemCheck = () => {
  const navigate = useNavigate();
  const [checks, setChecks] = useState({
    browser: { status: 'checking', message: 'Checking browser compatibility...' },
    camera: { status: 'checking', message: 'Testing camera access...' },
    microphone: { status: 'checking', message: 'Testing microphone access...' },
    webgl: { status: 'checking', message: 'Checking WebGL support...' },
    tensorflow: { status: 'checking', message: 'Loading TensorFlow.js...' },
    models: { status: 'checking', message: 'Loading AI models...' },
    performance: { status: 'checking', message: 'Checking system performance...' }
  });

  const [overallStatus, setOverallStatus] = useState('running');
  const [videoStream, setVideoStream] = useState(null);
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    runSystemChecks();
    return () => {
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const runSystemChecks = async () => {
    const results = { ...checks };

    try {
      // Browser Check
      results.browser = await checkBrowser();
      setChecks({ ...results });

      // WebGL Check
      results.webgl = await checkWebGL();
      setChecks({ ...results });

      // TensorFlow Check
      results.tensorflow = await checkTensorFlow();
      setChecks({ ...results });

      // Camera Check
      results.camera = await checkCamera();
      setChecks({ ...results });

      // Microphone Check
      results.microphone = await checkMicrophone();
      setChecks({ ...results });

      // AI Models Check
      results.models = await checkAIModels();
      setChecks({ ...results });

      // Performance Check
      results.performance = await checkPerformance();
      setChecks({ ...results });

      // Determine overall status
      const allPassed = Object.values(results).every(check => check.status === 'pass');
      const anyFailed = Object.values(results).some(check => check.status === 'fail');

      if (allPassed) {
        setOverallStatus('pass');
      } else if (anyFailed) {
        setOverallStatus('fail');
      } else {
        setOverallStatus('warning');
      }

    } catch (error) {
      console.error('System check failed:', error);
      setOverallStatus('fail');
    }
  };

  const checkBrowser = async () => {
    const userAgent = navigator.userAgent;
    const issues = [];

    if (userAgent.includes('Chrome/')) {
      const version = parseInt(userAgent.match(/Chrome\/(\d+)/)?.[1] || '0');
      if (version < 80) issues.push('Chrome version too old');
    } else if (userAgent.includes('Firefox/')) {
      const version = parseInt(userAgent.match(/Firefox\/(\d+)/)?.[1] || '0');
      if (version < 75) issues.push('Firefox version too old');
    } else if (userAgent.includes('Safari/')) {
      const version = parseInt(userAgent.match(/Version\/(\d+)/)?.[1] || '0');
      if (version < 13) issues.push('Safari version too old');
    } else {
      issues.push('Unsupported browser');
    }

    // Check APIs
    if (!navigator.mediaDevices?.getUserMedia) issues.push('getUserMedia not supported');
    if (!window.MediaRecorder) issues.push('MediaRecorder not supported');

    return {
      status: issues.length === 0 ? 'pass' : 'fail',
      message: issues.length === 0 ? 'Browser fully compatible' : `Issues: ${issues.join(', ')}`
    };
  };

  const checkWebGL = async () => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

      if (!gl) {
        return { status: 'fail', message: 'WebGL not supported' };
      }

      const renderer = gl.getParameter(gl.RENDERER);
      const vendor = gl.getParameter(gl.VENDOR);

      return {
        status: 'pass',
        message: `WebGL supported (${renderer})`
      };
    } catch (error) {
      return { status: 'fail', message: 'WebGL check failed' };
    }
  };

  const checkTensorFlow = async () => {
    try {
      const tf = await import('@tensorflow/tfjs');
      await tf.ready();

      const backend = tf.getBackend();
      return {
        status: 'pass',
        message: `TensorFlow.js ready (${backend} backend)`
      };
    } catch (error) {
      return { status: 'fail', message: 'TensorFlow.js failed to load' };
    }
  };

  const checkCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 }
      });

      setVideoStream(stream);
      setShowVideo(true);

      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();

      return {
        status: 'pass',
        message: `Camera working (${settings.width}x${settings.height})`
      };
    } catch (error) {
      return {
        status: 'fail',
        message: `Camera access denied: ${error.message}`
      };
    }
  };

  const checkMicrophone = async () => {
    try {
      if (!videoStream) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      }

      return {
        status: 'pass',
        message: 'Microphone access granted'
      };
    } catch (error) {
      return {
        status: 'fail',
        message: `Microphone access denied: ${error.message}`
      };
    }
  };

  const checkAIModels = async () => {
    try {
      // Test loading face detection model
      const blazeface = await import('@tensorflow-models/blazeface');
      await blazeface.load();

      // Test loading object detection model
      const cocoSsd = await import('@tensorflow-models/coco-ssd');
      await cocoSsd.load();

      return {
        status: 'pass',
        message: 'AI models loaded successfully'
      };
    } catch (error) {
      return {
        status: 'fail',
        message: `AI models failed to load: ${error.message}`
      };
    }
  };

  const checkPerformance = async () => {
    try {
      const start = performance.now();

      // Simulate some processing
      for (let i = 0; i < 1000000; i++) {
        Math.random();
      }

      const duration = performance.now() - start;
      const memory = performance.memory ? performance.memory.usedJSHeapSize / (1024 * 1024) : 0;

      let status = 'pass';
      let message = 'System performance good';

      if (duration > 100) {
        status = 'warning';
        message = 'System performance slow';
      }

      if (memory > 500) {
        status = 'warning';
        message = 'High memory usage detected';
      }

      return {
        status,
        message: `${message} (${duration.toFixed(1)}ms, ${memory.toFixed(1)}MB)`
      };
    } catch (error) {
      return {
        status: 'warning',
        message: 'Performance check inconclusive'
      };
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pass': return '✅';
      case 'fail': return '❌';
      case 'warning': return '⚠️';
      case 'checking': return '⏳';
      default: return '❓';
    }
  };

  const getOverallStatusMessage = () => {
    switch (overallStatus) {
      case 'pass':
        return {
          title: '🎉 System Ready!',
          message: 'All systems are working perfectly. You can proceed with the video proctoring session.',
          color: '#27ae60'
        };
      case 'warning':
        return {
          title: '⚠️ System Ready with Warnings',
          message: 'The system is functional but some features may not work optimally.',
          color: '#f39c12'
        };
      case 'fail':
        return {
          title: '❌ System Check Failed',
          message: 'Critical issues detected. Please resolve them before proceeding.',
          color: '#e74c3c'
        };
      default:
        return {
          title: '🔄 Running System Checks...',
          message: 'Please wait while we verify your system compatibility.',
          color: '#3498db'
        };
    }
  };

  const handleProceed = () => {
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
    }
    navigate('/precheck');
  };

  const overallStatusInfo = getOverallStatusMessage();

  return (
    <div style={styles.container}>
      <div style={styles.checkBox}>
        <div style={styles.header}>
          <h1 style={styles.title}>System Compatibility Check</h1>
          <p style={styles.subtitle}>
            Verifying your system meets the requirements for video proctoring
          </p>
        </div>

        {/* Overall Status */}
        <div style={{
          ...styles.overallStatus,
          borderColor: overallStatusInfo.color,
          backgroundColor: `${overallStatusInfo.color}15`
        }}>
          <h2 style={{ color: overallStatusInfo.color }}>
            {overallStatusInfo.title}
          </h2>
          <p style={{ color: overallStatusInfo.color }}>
            {overallStatusInfo.message}
          </p>
        </div>

        {/* Individual Checks */}
        <div style={styles.checksContainer}>
          {Object.entries(checks).map(([key, check]) => (
            <div key={key} style={styles.checkItem}>
              <div style={styles.checkIcon}>
                {getStatusIcon(check.status)}
              </div>
              <div style={styles.checkContent}>
                <div style={styles.checkName}>
                  {key.charAt(0).toUpperCase() + key.slice(1)} Check
                </div>
                <div style={styles.checkMessage}>
                  {check.message}
                </div>
              </div>
              <div style={styles.checkStatus}>
                <span style={{
                  ...styles.statusBadge,
                  backgroundColor:
                    check.status === 'pass' ? '#27ae60' :
                    check.status === 'fail' ? '#e74c3c' :
                    check.status === 'warning' ? '#f39c12' : '#3498db'
                }}>
                  {check.status.toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Video Preview */}
        {showVideo && videoStream && (
          <div style={styles.videoContainer}>
            <h3 style={styles.videoTitle}>Camera Preview</h3>
            <video
              ref={(video) => {
                if (video && videoStream) {
                  video.srcObject = videoStream;
                }
              }}
              autoPlay
              muted
              playsInline
              style={styles.video}
            />
            <p style={styles.videoNote}>
              This is how you will appear during the proctoring session
            </p>
          </div>
        )}

        {/* Actions */}
        <div style={styles.actions}>
          <button
            style={styles.retryButton}
            onClick={runSystemChecks}
            disabled={overallStatus === 'running'}
          >
            🔄 Run Checks Again
          </button>

          {overallStatus === 'pass' && (
            <button style={styles.proceedButton} onClick={handleProceed}>
              ✅ Proceed to Interview Setup
            </button>
          )}

          {(overallStatus === 'warning' || overallStatus === 'fail') && (
            <button
              style={styles.proceedAnywayButton}
              onClick={handleProceed}
            >
              ⚠️ Proceed Anyway (Not Recommended)
            </button>
          )}
        </div>

        {/* Help Section */}
        <div style={styles.helpSection}>
          <h3>Need Help?</h3>
          <div style={styles.helpGrid}>
            <div style={styles.helpItem}>
              <h4>🔧 Technical Issues</h4>
              <ul>
                <li>Update your browser</li>
                <li>Enable hardware acceleration</li>
                <li>Close other tabs/applications</li>
              </ul>
            </div>
            <div style={styles.helpItem}>
              <h4>📹 Camera Problems</h4>
              <ul>
                <li>Check camera permissions</li>
                <li>Ensure camera isn't used by other apps</li>
                <li>Try a different USB port</li>
              </ul>
            </div>
            <div style={styles.helpItem}>
              <h4>🔊 Audio Issues</h4>
              <ul>
                <li>Check microphone permissions</li>
                <li>Test microphone in system settings</li>
                <li>Use headphones to avoid feedback</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  checkBox: {
    maxWidth: '800px',
    margin: '0 auto',
    background: 'white',
    borderRadius: '16px',
    padding: '40px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.1)'
  },
  header: {
    textAlign: 'center',
    marginBottom: '30px'
  },
  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: '8px'
  },
  subtitle: {
    fontSize: '16px',
    color: '#7f8c8d',
    margin: 0
  },
  overallStatus: {
    border: '2px solid',
    borderRadius: '12px',
    padding: '20px',
    textAlign: 'center',
    marginBottom: '30px'
  },
  checksContainer: {
    marginBottom: '30px'
  },
  checkItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px',
    background: '#f8f9fa',
    borderRadius: '8px',
    marginBottom: '12px',
    transition: 'all 0.3s ease'
  },
  checkIcon: {
    fontSize: '24px',
    marginRight: '16px',
    width: '30px',
    textAlign: 'center'
  },
  checkContent: {
    flex: 1
  },
  checkName: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: '4px'
  },
  checkMessage: {
    fontSize: '14px',
    color: '#7f8c8d'
  },
  checkStatus: {
    marginLeft: '16px'
  },
  statusBadge: {
    color: 'white',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 'bold'
  },
  videoContainer: {
    textAlign: 'center',
    marginBottom: '30px',
    background: '#f8f9fa',
    borderRadius: '12px',
    padding: '20px'
  },
  videoTitle: {
    marginBottom: '16px',
    color: '#2c3e50'
  },
  video: {
    width: '300px',
    height: '225px',
    borderRadius: '8px',
    border: '2px solid #e9ecef'
  },
  videoNote: {
    fontSize: '14px',
    color: '#7f8c8d',
    marginTop: '12px'
  },
  actions: {
    display: 'flex',
    gap: '16px',
    justifyContent: 'center',
    marginBottom: '30px',
    flexWrap: 'wrap'
  },
  retryButton: {
    background: 'linear-gradient(135deg, #3498db, #2980b9)',
    color: 'white',
    border: 'none',
    padding: '14px 24px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  proceedButton: {
    background: 'linear-gradient(135deg, #27ae60, #2ecc71)',
    color: 'white',
    border: 'none',
    padding: '14px 24px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  proceedAnywayButton: {
    background: 'linear-gradient(135deg, #f39c12, #e67e22)',
    color: 'white',
    border: 'none',
    padding: '14px 24px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  helpSection: {
    background: '#f8f9fa',
    borderRadius: '12px',
    padding: '24px'
  },
  helpGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
    marginTop: '16px'
  },
  helpItem: {
    background: 'white',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #e9ecef'
  }
};

export default SystemCheck;