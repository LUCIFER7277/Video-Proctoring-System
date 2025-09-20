import React, { useState, useEffect, useRef } from 'react';

const LoadingScreen = ({ onComplete, duration = 6000 }) => {
  const [loadingStep, setLoadingStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);

  const loadingSteps = [
    { text: 'Initializing system...', icon: '🚀' },
    { text: 'Checking browser compatibility...', icon: '🔍' },
    { text: 'Loading AI models...', icon: '🧠' },
    { text: 'Setting up camera detection...', icon: '📹' },
    { text: 'Preparing video recording...', icon: '🎥' },
    { text: 'Initializing object detection...', icon: '👁️' },
    { text: 'Final system checks...', icon: '✅' }
  ];

  useEffect(() => {
    if (isComplete) return;

    const stepInterval = duration / loadingSteps.length;
    const progressInterval = duration / 100;

    // Update loading steps
    intervalRef.current = setInterval(() => {
      setLoadingStep(prev => {
        const next = prev + 1;
        if (next >= loadingSteps.length) {
          clearInterval(intervalRef.current);
          return loadingSteps.length - 1;
        }
        return next;
      });
    }, stepInterval);

    // Update progress more smoothly
    const progressTimer = setInterval(() => {
      setProgress(prev => {
        const increment = 100 / (duration / 50); // Update every 50ms
        const next = prev + increment;
        if (next >= 100) {
          clearInterval(progressTimer);
          return 100;
        }
        return next;
      });
    }, 50);

    // Complete loading after duration
    timeoutRef.current = setTimeout(() => {
      setIsComplete(true);
      if (onComplete) {
        onComplete();
      }
    }, duration);

    // Cleanup function
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (progressTimer) clearInterval(progressTimer);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [duration, loadingSteps.length, onComplete, isComplete]);

  // Helper functions for system info
  const getBrowserInfo = () => {
    try {
      const userAgent = navigator.userAgent;
      if (userAgent.includes('Chrome')) return 'Chrome';
      if (userAgent.includes('Firefox')) return 'Firefox';
      if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
      if (userAgent.includes('Edge')) return 'Edge';
      return 'Other';
    } catch (error) {
      return 'Unknown';
    }
  };

  const checkWebGLSupport = () => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return gl ? '✅ Supported' : '❌ Not Supported';
    } catch (error) {
      return '❌ Not Supported';
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.loadingBox}>
        {/* Animated Logo */}
        <div style={styles.logoContainer}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>🎯</div>
            <div style={styles.logoText}>Video Proctoring</div>
          </div>
        </div>

        {/* Loading Animation */}
        <div style={styles.animationContainer}>
          <div style={styles.spinner}></div>
          <div style={styles.spinnerRing}></div>
        </div>

        {/* Current Step */}
        <div style={styles.stepContainer}>
          <div style={styles.stepIcon}>
            {loadingSteps[loadingStep]?.icon}
          </div>
          <div style={styles.stepText}>
            {loadingSteps[loadingStep]?.text}
          </div>
        </div>

        {/* Progress Bar */}
        <div style={styles.progressContainer}>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${Math.min(progress, 100)}%`
              }}
            ></div>
          </div>
          <div style={styles.progressText}>
            {Math.round(Math.min(progress, 100))}%
            {isComplete && <span style={styles.completeText}> - Ready!</span>}
          </div>
        </div>

        {/* Loading Steps List */}
        <div style={styles.stepsList}>
          {loadingSteps.map((step, index) => (
            <div
              key={index}
              style={{
                ...styles.stepItem,
                opacity: index <= loadingStep ? 1 : 0.3,
                color: index < loadingStep ? '#27ae60' : index === loadingStep ? '#3498db' : '#7f8c8d'
              }}
            >
              <span style={styles.stepItemIcon}>
                {index < loadingStep ? '✅' : index === loadingStep ? step.icon : '⏳'}
              </span>
              <span>{step.text}</span>
            </div>
          ))}
        </div>

        {/* System Info */}
        <div style={styles.systemInfo}>
          <div style={styles.infoItem}>
            <span>Browser: </span>
            <span style={styles.infoValue}>
              {getBrowserInfo()}
            </span>
          </div>
          <div style={styles.infoItem}>
            <span>Platform: </span>
            <span style={styles.infoValue}>{navigator.platform || 'Unknown'}</span>
          </div>
          <div style={styles.infoItem}>
            <span>WebGL: </span>
            <span style={styles.infoValue}>
              {checkWebGLSupport()}
            </span>
          </div>
        </div>

        {/* Tips */}
        <div style={styles.tips}>
          <div style={styles.tipsTitle}>💡 Pro Tips</div>
          <div style={styles.tipsList}>
            <div>• Ensure good lighting for optimal face detection</div>
            <div>• Position camera at eye level</div>
            <div>• Remove distracting objects from view</div>
            <div>• Close unnecessary browser tabs for better performance</div>
          </div>
        </div>
      </div>

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          @keyframes pulse {
            0%, 100% { opacity: 0.8; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.05); }
          }

          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes shimmer {
            0% { background-position: -200px 0; }
            100% { background-position: 200px 0; }
          }
        `}
      </style>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  loadingBox: {
    background: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(20px)',
    borderRadius: '24px',
    padding: '40px',
    maxWidth: '500px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    animation: 'slideUp 0.6s ease-out'
  },
  logoContainer: {
    marginBottom: '30px'
  },
  logo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px'
  },
  logoIcon: {
    fontSize: '48px',
    animation: 'pulse 2s infinite'
  },
  logoText: {
    fontSize: '24px',
    fontWeight: 'bold',
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text'
  },
  animationContainer: {
    position: 'relative',
    width: '80px',
    height: '80px',
    margin: '0 auto 30px'
  },
  spinner: {
    position: 'absolute',
    width: '60px',
    height: '60px',
    border: '3px solid #f3f3f3',
    borderTop: '3px solid #3498db',
    borderRadius: '50%',
    top: '10px',
    left: '10px',
    animation: 'spin 1s linear infinite'
  },
  spinnerRing: {
    position: 'absolute',
    width: '80px',
    height: '80px',
    border: '2px solid rgba(116, 75, 162, 0.2)',
    borderTop: '2px solid #764ba2',
    borderRadius: '50%',
    animation: 'spin 2s linear infinite reverse'
  },
  stepContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    marginBottom: '20px',
    minHeight: '40px'
  },
  stepIcon: {
    fontSize: '24px',
    animation: 'pulse 1.5s infinite'
  },
  stepText: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#2c3e50'
  },
  progressContainer: {
    marginBottom: '30px'
  },
  progressBar: {
    width: '100%',
    height: '8px',
    background: '#ecf0f1',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '8px'
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3498db, #2980b9)',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
    backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.2) 75%, transparent 75%, transparent)',
    backgroundSize: '20px 20px',
    animation: 'shimmer 1s linear infinite'
  },
  progressText: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#7f8c8d'
  },
  completeText: {
    color: '#27ae60',
    fontWeight: 'bold'
  },
  stepsList: {
    textAlign: 'left',
    marginBottom: '30px',
    background: '#f8f9fa',
    borderRadius: '12px',
    padding: '20px'
  },
  stepItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px 0',
    fontSize: '14px',
    transition: 'all 0.3s ease'
  },
  stepItemIcon: {
    width: '20px',
    textAlign: 'center'
  },
  systemInfo: {
    background: '#e8f5e8',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '20px',
    fontSize: '12px'
  },
  infoItem: {
    display: 'flex',
    justifyContent: 'space-between',
    margin: '4px 0'
  },
  infoValue: {
    fontWeight: 'bold'
  },
  tips: {
    background: 'linear-gradient(135deg, rgba(52, 152, 219, 0.1), rgba(46, 204, 113, 0.1))',
    borderRadius: '12px',
    padding: '20px',
    textAlign: 'left',
    border: '1px solid rgba(52, 152, 219, 0.2)'
  },
  tipsTitle: {
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '12px',
    color: '#2c3e50'
  },
  tipsList: {
    fontSize: '12px',
    lineHeight: '1.6',
    color: '#7f8c8d'
  }
};

export default LoadingScreen;