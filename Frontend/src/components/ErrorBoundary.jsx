import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
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

  reportError = (error, errorInfo) => {
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    console.log('Error Report:', errorReport);

    // Store in localStorage as fallback
    try {
      const existingReports = JSON.parse(localStorage.getItem('error_reports') || '[]');
      existingReports.unshift(errorReport);
      localStorage.setItem('error_reports', JSON.stringify(existingReports.slice(0, 10)));
    } catch (storageError) {
      console.error('Failed to store error report:', storageError);
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={styles.container}>
          <div style={styles.errorBox}>
            <div style={styles.icon}>💥</div>
            <h1 style={styles.title}>Oops! Something went wrong</h1>
            <p style={styles.message}>
              The video proctoring system encountered an unexpected error.
              This has been automatically reported.
            </p>

            <div style={styles.actions}>
              <button style={styles.primaryButton} onClick={this.handleReload}>
                🔄 Reload Page
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
              <h3>Need Help?</h3>
              <ul style={styles.helpList}>
                <li>Try refreshing the page</li>
                <li>Check your internet connection</li>
                <li>Clear your browser cache</li>
                <li>Disable browser extensions</li>
                <li>Contact technical support if the issue persists</li>
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
    gap: '16px',
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
    padding: '14px 24px',
    borderRadius: '8px',
    fontSize: '16px',
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