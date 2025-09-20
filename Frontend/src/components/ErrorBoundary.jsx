import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0,
      errorCategory: 'unknown'
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorId: Date.now() + Math.random().toString(36).substr(2, 9),
      errorCategory: ErrorBoundary.categorizeError(error)
    };
  }

  static categorizeError(error) {
    const message = error.message?.toLowerCase() || '';
    const stack = error.stack?.toLowerCase() || '';

    if (message.includes('network') || message.includes('fetch')) {
      return 'network';
    }
    if (message.includes('chunk') || message.includes('loading')) {
      return 'chunk_load';
    }
    if (message.includes('permission') || message.includes('mediadevices')) {
      return 'permissions';
    }
    if (stack.includes('mediarecorder') || stack.includes('getusermedia')) {
      return 'media';
    }
    if (message.includes('webgl') || message.includes('canvas')) {
      return 'webgl';
    }
    return 'runtime';
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo
    });

    // In production, you would send this to your error reporting service
    this.reportError(error, errorInfo);
  }

  reportError = async (error, errorInfo) => {
    const errorReport = {
      id: this.state.errorId,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      category: this.state.errorCategory,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      userSession: this.getUserSessionInfo(),
      retryCount: this.state.retryCount
    };

    console.log('Error Report:', errorReport);

    // Try to send to backend first
    try {
      await fetch('/api/errors/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorReport)
      });
      console.log('Error reported to backend successfully');
    } catch (networkError) {
      console.warn('Failed to report error to backend:', networkError);
    }

    // Store in localStorage as fallback
    try {
      const existingReports = JSON.parse(localStorage.getItem('error_reports') || '[]');
      existingReports.unshift(errorReport);
      localStorage.setItem('error_reports', JSON.stringify(existingReports.slice(0, 10)));
    } catch (storageError) {
      console.error('Failed to store error report:', storageError);
    }
  };

  getUserSessionInfo = () => {
    try {
      const userInfo = sessionStorage.getItem('userInfo');
      const candidateInfo = sessionStorage.getItem('candidateInfo');

      return {
        userInfo: userInfo ? JSON.parse(userInfo) : null,
        candidateInfo: candidateInfo ? JSON.parse(candidateInfo) : null,
        sessionStorage: !!sessionStorage.length
      };
    } catch (error) {
      return { error: 'Failed to get session info' };
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: this.state.retryCount + 1
    });
  };

  handleRetryWithCleanup = () => {
    // Clear application state that might be causing issues
    try {
      // Clear potentially corrupted session data
      if (this.state.errorCategory === 'permissions' || this.state.errorCategory === 'media') {
        sessionStorage.removeItem('candidateInfo');
      }

      // Clear local storage caches
      const keysToRemove = Object.keys(localStorage).filter(key =>
        key.includes('cache') || key.includes('temp')
      );
      keysToRemove.forEach(key => localStorage.removeItem(key));

    } catch (error) {
      console.warn('Error during cleanup:', error);
    }

    this.handleReset();
  };

  getErrorMessage = () => {
    switch (this.state.errorCategory) {
      case 'network':
        return 'Network connection issue detected. Please check your internet connection and try again.';
      case 'permissions':
        return 'Camera or microphone permission issue. Please allow access and try again.';
      case 'media':
        return 'Media device error. Please ensure your camera and microphone are connected and try again.';
      case 'chunk_load':
        return 'Failed to load application resources. This may be due to a network issue or browser cache.';
      case 'webgl':
        return 'Graphics rendering issue. Your browser may not support the required features.';
      default:
        return 'The video proctoring system encountered an unexpected error.';
    }
  };

  getRecoverySteps = () => {
    switch (this.state.errorCategory) {
      case 'network':
        return [
          'Check your internet connection',
          'Try refreshing the page',
          'Disable VPN if using one',
          'Contact your network administrator'
        ];
      case 'permissions':
        return [
          'Click the camera/microphone icon in your browser address bar',
          'Allow access to camera and microphone',
          'Refresh the page',
          'Try using a different browser if issue persists'
        ];
      case 'media':
        return [
          'Ensure camera and microphone are connected',
          'Close other applications using camera/microphone',
          'Try unplugging and reconnecting devices',
          'Restart your browser'
        ];
      case 'chunk_load':
        return [
          'Clear your browser cache',
          'Disable browser extensions',
          'Try using an incognito/private window',
          'Use a different browser'
        ];
      default:
        return [
          'Try refreshing the page',
          'Clear your browser cache',
          'Disable browser extensions',
          'Contact technical support if the issue persists'
        ];
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.errorBox}>
            <div style={styles.icon}>
              {this.state.errorCategory === 'network' ? '🌐' :
               this.state.errorCategory === 'permissions' ? '🔒' :
               this.state.errorCategory === 'media' ? '📹' :
               this.state.errorCategory === 'chunk_load' ? '📦' :
               this.state.errorCategory === 'webgl' ? '🎨' : '💥'}
            </div>
            <h1 style={styles.title}>
              {this.state.errorCategory === 'network' ? 'Connection Issue' :
               this.state.errorCategory === 'permissions' ? 'Permission Required' :
               this.state.errorCategory === 'media' ? 'Device Error' :
               this.state.errorCategory === 'chunk_load' ? 'Loading Error' :
               this.state.errorCategory === 'webgl' ? 'Graphics Error' :
               'Oops! Something went wrong'}
            </h1>
            <p style={styles.message}>
              {this.getErrorMessage()}
              {this.state.retryCount > 0 && (
                <span style={styles.retryInfo}>
                  <br />Retry attempt: {this.state.retryCount}
                </span>
              )}
            </p>

            <div style={styles.actions}>
              <button style={styles.primaryButton} onClick={this.handleReload}>
                🔄 Reload Page
              </button>
              <button style={styles.secondaryButton} onClick={this.handleRetryWithCleanup}>
                🧹 Reset & Retry
              </button>
              <button style={styles.secondaryButton} onClick={this.handleReset}>
                ↩️ Try Again
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details style={styles.details}>
                <summary style={styles.summary}>
                  🐛 Technical Details (Development Mode)
                </summary>
                <div style={styles.errorDetails}>
                  <h3>Error Message:</h3>
                  <pre style={styles.pre}>{this.state.error.toString()}</pre>

                  <h3>Stack Trace:</h3>
                  <pre style={styles.pre}>{this.state.error.stack}</pre>

                  {this.state.errorInfo && (
                    <>
                      <h3>Component Stack:</h3>
                      <pre style={styles.pre}>{this.state.errorInfo.componentStack}</pre>
                    </>
                  )}
                </div>
              </details>
            )}

            <div style={styles.helpText}>
              <h3>Recovery Steps</h3>
              <ul style={styles.helpList}>
                {this.getRecoverySteps().map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  errorBox: {
    background: 'white',
    borderRadius: '16px',
    padding: '40px',
    maxWidth: '600px',
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
  },
  icon: {
    fontSize: '48px',
    marginBottom: '20px'
  },
  title: {
    color: '#2c3e50',
    fontSize: '28px',
    marginBottom: '16px',
    fontWeight: 'bold'
  },
  message: {
    color: '#7f8c8d',
    fontSize: '16px',
    lineHeight: '1.6',
    marginBottom: '30px'
  },
  actions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    marginBottom: '30px',
    flexWrap: 'wrap'
  },
  primaryButton: {
    background: 'linear-gradient(135deg, #3498db, #2980b9)',
    color: 'white',
    border: 'none',
    padding: '14px 24px',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'transform 0.2s ease',
    boxShadow: '0 4px 15px rgba(52, 152, 219, 0.3)'
  },
  secondaryButton: {
    background: 'linear-gradient(135deg, #95a5a6, #7f8c8d)',
    color: 'white',
    border: 'none',
    padding: '12px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'transform 0.2s ease',
    boxShadow: '0 4px 15px rgba(149, 165, 166, 0.3)'
  },
  details: {
    textAlign: 'left',
    background: '#f8f9fa',
    borderRadius: '8px',
    marginBottom: '20px',
    border: '1px solid #e9ecef'
  },
  summary: {
    padding: '16px',
    cursor: 'pointer',
    fontWeight: 'bold',
    color: '#495057',
    userSelect: 'none'
  },
  errorDetails: {
    padding: '0 16px 16px'
  },
  pre: {
    background: '#1a1a1a',
    color: '#00ff00',
    padding: '12px',
    borderRadius: '4px',
    fontSize: '12px',
    overflow: 'auto',
    maxHeight: '200px',
    fontFamily: 'Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  },
  helpText: {
    textAlign: 'left',
    background: '#e8f5e8',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #c3e6c3'
  },
  helpList: {
    margin: '12px 0 0 20px',
    lineHeight: '1.8'
  }
};

export default ErrorBoundary;