import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import CandidateRoom from './pages/CandidateRoom';
import InterviewerDashboard from './pages/InterviewerDashboard';
import WebRTCTest from './pages/WebRTCTest';
import PreCheck from './pages/PreCheck';
import Interview from './pages/Interview';
import ReportView from './pages/ReportView';
import EnhancedInterview from './pages/EnhancedInterview';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingScreen from './components/LoadingScreen';
import SystemCheck from './components/SystemCheck';
import ProtectedRoute from './components/ProtectedRoute';
import ReportGenerator from './components/ReportGenerator';
import DetectionTest from './components/DetectionTest';

function App() {
  const [systemReady, setSystemReady] = useState(false);
  const [systemError, setSystemError] = useState(null);
  const [appMode, setAppMode] = useState('enhanced'); // 'basic' or 'enhanced'

  useEffect(() => {
    initializeSystem();
  }, []);

  const initializeSystem = async () => {
    try {
      // Check browser compatibility
      const compatibility = checkBrowserCompatibility();
      if (!compatibility.compatible) {
        throw new Error(`Browser not compatible: ${compatibility.issues.join(', ')}`);
      }

      // Initialize TensorFlow.js backend
      await import('@tensorflow/tfjs').then(tf => tf.ready());

      // Skip media permissions check for communication-only system
      console.log('✅ Skipping media permissions check - communication-only mode');

      console.log('✅ System initialized successfully');
      setSystemReady(true);
    } catch (error) {
      console.error('❌ System initialization failed:', error);
      setSystemError(error.message);
    }
  };

  const checkBrowserCompatibility = () => {
    const issues = [];

    // Check required APIs for communication
    if (!window.WebSocket && !window.io) issues.push('WebSocket not supported');

    // Check browser versions
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome/')) {
      const version = parseInt(userAgent.match(/Chrome\/(\d+)/)?.[1] || '0');
      if (version < 80) issues.push('Chrome version too old (minimum: 80)');
    } else if (userAgent.includes('Firefox/')) {
      const version = parseInt(userAgent.match(/Firefox\/(\d+)/)?.[1] || '0');
      if (version < 75) issues.push('Firefox version too old (minimum: 75)');
    } else if (userAgent.includes('Safari/')) {
      const version = parseInt(userAgent.match(/Version\/(\d+)/)?.[1] || '0');
      if (version < 13) issues.push('Safari version too old (minimum: 13)');
    }

    return { compatible: issues.length === 0, issues };
  };


  if (systemError) {
    return (
      <div style={styles.errorContainer}>
        <div style={styles.errorBox}>
          <h1 style={styles.errorTitle}>⚠️ System Error</h1>
          <p style={styles.errorMessage}>{systemError}</p>
          <div style={styles.errorSuggestions}>
            <h3>Troubleshooting Steps:</h3>
            <ul>
              <li>Update your browser to the latest version</li>
              <li>Enable camera and microphone permissions</li>
              <li>Use Chrome, Firefox, or Safari</li>
              <li>Ensure stable internet connection</li>
              <li>Disable browser extensions temporarily</li>
            </ul>
          </div>
          <button
            style={styles.retryButton}
            onClick={() => {
              setSystemError(null);
              setSystemReady(false);
              initializeSystem();
            }}
          >
            🔄 Retry System Check
          </button>
        </div>
      </div>
    );
  }

  if (!systemReady) {
    return <LoadingScreen />;
  }

  return (
    <ErrorBoundary>
      <Router>
        <div className="App" style={styles.app}>
          {/* System Status Bar */}
          <div style={styles.statusBar}>
            <div style={styles.statusLeft}>
              <span style={styles.statusDot}>🟢</span>
              <span>Video Proctoring System Active</span>
            </div>
            <div style={styles.statusRight}>
              <button
                style={styles.modeToggle}
                onClick={() => setAppMode(appMode === 'basic' ? 'enhanced' : 'basic')}
              >
                Mode: {appMode === 'enhanced' ? '🚀 Enhanced AI' : '📹 Basic'}
              </button>
            </div>
          </div>

          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />

            {/* Role-based routes */}
            <Route path="/candidate/:sessionId" element={
              <ProtectedRoute requiredRole="candidate">
                <CandidateRoom />
              </ProtectedRoute>
            } />
            <Route path="/interviewer/:sessionId" element={
              <ProtectedRoute requiredRole="interviewer">
                <InterviewerDashboard />
              </ProtectedRoute>
            } />

            {/* Legacy routes for backward compatibility */}
            <Route path="/precheck" element={<PreCheck />} />
            <Route
              path="/interview/:sessionId"
              element={appMode === 'enhanced' ? <EnhancedInterview /> : <Interview />}
            />
            <Route path="/report/:sessionId" element={<ReportView />} />
            <Route path="/reports" element={<ReportGenerator />} />
            <Route path="/system-check" element={<SystemCheck />} />
            <Route path="/webrtc-test" element={<WebRTCTest />} />
            <Route path="/detection-test" element={<DetectionTest />} />

            <Route path="*" element={
              <div style={styles.notFound}>
                <h1>404 - Page Not Found</h1>
                <p>The requested page does not exist.</p>
                <Navigate to="/" replace />
              </div>
            } />
          </Routes>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

const styles = {
  app: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
  },
  statusBar: {
    background: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(10px)',
    padding: '8px 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid rgba(0, 0, 0, 0.1)',
    fontSize: '14px',
    zIndex: 1000,
    position: 'sticky',
    top: 0
  },
  statusLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontWeight: '500'
  },
  statusDot: {
    fontSize: '12px'
  },
  statusRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  modeToggle: {
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    color: 'white',
    border: 'none',
    padding: '6px 12px',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  errorContainer: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
    padding: '20px'
  },
  errorBox: {
    background: 'white',
    borderRadius: '16px',
    padding: '40px',
    maxWidth: '600px',
    textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
  },
  errorTitle: {
    color: '#e74c3c',
    fontSize: '32px',
    marginBottom: '20px'
  },
  errorMessage: {
    fontSize: '18px',
    color: '#2c3e50',
    marginBottom: '30px',
    lineHeight: '1.6'
  },
  errorSuggestions: {
    textAlign: 'left',
    background: '#f8f9fa',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '30px'
  },
  retryButton: {
    background: 'linear-gradient(135deg, #3498db, #2980b9)',
    color: 'white',
    border: 'none',
    padding: '14px 28px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },
  notFound: {
    textAlign: 'center',
    color: 'white',
    padding: '100px 20px'
  }
};

export default App;