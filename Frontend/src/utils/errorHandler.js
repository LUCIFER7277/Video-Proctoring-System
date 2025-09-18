class ErrorHandler {
  constructor() {
    this.errorCallbacks = [];
    this.errorHistory = [];
    this.maxHistorySize = 100;
    this.retryAttempts = new Map();
    this.maxRetries = 3;

    // Set up global error handlers
    this.setupGlobalHandlers();
  }

  setupGlobalHandlers() {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      this.handleError(new Error(`Unhandled promise rejection: ${event.reason}`), {
        type: 'unhandled_promise',
        source: 'global'
      });
    });

    // Handle JavaScript errors
    window.addEventListener('error', (event) => {
      console.error('JavaScript error:', event.error);
      this.handleError(event.error || new Error(event.message), {
        type: 'javascript_error',
        source: 'global',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    });

    // Handle resource loading errors
    window.addEventListener('error', (event) => {
      if (event.target !== window) {
        console.error('Resource loading error:', event.target);
        this.handleError(new Error(`Failed to load resource: ${event.target.src || event.target.href}`), {
          type: 'resource_error',
          source: 'global',
          element: event.target.tagName
        });
      }
    }, true);
  }

  handleError(error, context = {}) {
    const errorInfo = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      message: error.message || 'Unknown error',
      stack: error.stack,
      name: error.name || 'Error',
      context,
      userAgent: navigator.userAgent,
      url: window.location.href,
      retry_count: this.retryAttempts.get(error.message) || 0
    };

    // Add to history
    this.errorHistory.unshift(errorInfo);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(0, this.maxHistorySize);
    }

    // Log to console
    console.error('Error handled:', errorInfo);

    // Notify callbacks
    this.errorCallbacks.forEach(callback => {
      try {
        callback(errorInfo);
      } catch (callbackError) {
        console.error('Error in error callback:', callbackError);
      }
    });

    return errorInfo;
  }

  // Service-specific error handlers
  handleDetectionError(error, service, context = {}) {
    return this.handleError(error, {
      ...context,
      type: 'detection_error',
      service,
      source: 'detection_service'
    });
  }

  handleNetworkError(error, endpoint, method = 'GET', context = {}) {
    return this.handleError(error, {
      ...context,
      type: 'network_error',
      endpoint,
      method,
      source: 'network'
    });
  }

  handleMediaError(error, mediaType, context = {}) {
    return this.handleError(error, {
      ...context,
      type: 'media_error',
      mediaType,
      source: 'media'
    });
  }

  handleValidationError(error, field, value, context = {}) {
    return this.handleError(error, {
      ...context,
      type: 'validation_error',
      field,
      value,
      source: 'validation'
    });
  }

  // Retry mechanism
  async retryOperation(operation, operationName, maxRetries = null) {
    const retries = maxRetries || this.maxRetries;
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await operation();
        // Reset retry count on success
        this.retryAttempts.delete(operationName);
        return result;
      } catch (error) {
        lastError = error;
        this.retryAttempts.set(operationName, attempt);

        this.handleError(error, {
          type: 'retry_attempt',
          operationName,
          attempt,
          maxRetries: retries,
          source: 'retry_mechanism'
        });

        if (attempt < retries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    throw this.handleError(lastError, {
      type: 'operation_failed',
      operationName,
      totalAttempts: retries,
      source: 'retry_mechanism'
    });
  }

  // Browser compatibility check
  checkBrowserCompatibility() {
    const issues = [];

    // Check for required APIs
    const requiredAPIs = [
      { name: 'getUserMedia', check: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) },
      { name: 'MediaRecorder', check: () => !!window.MediaRecorder },
      { name: 'WebGL', check: () => !!window.WebGLRenderingContext },
      { name: 'IndexedDB', check: () => !!window.indexedDB },
      { name: 'WebWorkers', check: () => !!window.Worker },
      { name: 'Canvas', check: () => !!document.createElement('canvas').getContext },
      { name: 'WebAssembly', check: () => !!window.WebAssembly }
    ];

    requiredAPIs.forEach(api => {
      try {
        if (!api.check()) {
          issues.push(`${api.name} not supported`);
        }
      } catch (error) {
        issues.push(`Error checking ${api.name}: ${error.message}`);
      }
    });

    // Check browser version
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome/')) {
      const version = parseInt(userAgent.match(/Chrome\/(\d+)/)[1]);
      if (version < 80) {
        issues.push('Chrome version too old (minimum: 80)');
      }
    } else if (userAgent.includes('Firefox/')) {
      const version = parseInt(userAgent.match(/Firefox\/(\d+)/)[1]);
      if (version < 75) {
        issues.push('Firefox version too old (minimum: 75)');
      }
    } else if (userAgent.includes('Safari/')) {
      const version = parseInt(userAgent.match(/Version\/(\d+)/)?.[1] || '0');
      if (version < 13) {
        issues.push('Safari version too old (minimum: 13)');
      }
    }

    if (issues.length > 0) {
      const error = new Error(`Browser compatibility issues: ${issues.join(', ')}`);
      this.handleError(error, {
        type: 'compatibility_error',
        issues,
        userAgent,
        source: 'compatibility_check'
      });
      return { compatible: false, issues };
    }

    return { compatible: true, issues: [] };
  }

  // Performance monitoring
  monitorPerformance(operationName, operation) {
    return async (...args) => {
      const startTime = performance.now();
      const startMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;

      try {
        const result = await operation(...args);

        const endTime = performance.now();
        const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
        const duration = endTime - startTime;
        const memoryDelta = endMemory - startMemory;

        // Log performance metrics
        console.log(`Performance: ${operationName}`, {
          duration: `${duration.toFixed(2)}ms`,
          memory: memoryDelta > 0 ? `+${(memoryDelta / 1024 / 1024).toFixed(2)}MB` : 'N/A'
        });

        // Alert if performance is poor
        if (duration > 5000) { // 5 seconds
          this.handleError(new Error(`Slow operation detected: ${operationName}`), {
            type: 'performance_warning',
            operationName,
            duration,
            memoryDelta,
            source: 'performance_monitor'
          });
        }

        return result;
      } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;

        this.handleError(error, {
          type: 'operation_error',
          operationName,
          duration,
          source: 'performance_monitor'
        });

        throw error;
      }
    };
  }

  // Error recovery suggestions
  getRecoverySuggestions(error) {
    const suggestions = [];

    switch (error.context?.type) {
      case 'media_error':
        suggestions.push(
          'Check camera/microphone permissions',
          'Ensure no other applications are using the camera',
          'Try refreshing the page',
          'Check browser settings for media access'
        );
        break;

      case 'network_error':
        suggestions.push(
          'Check internet connection',
          'Verify server is accessible',
          'Try again in a few moments',
          'Contact technical support if issue persists'
        );
        break;

      case 'detection_error':
        suggestions.push(
          'Ensure adequate lighting',
          'Position camera properly',
          'Close other resource-intensive applications',
          'Try using a different browser'
        );
        break;

      case 'compatibility_error':
        suggestions.push(
          'Update your browser to the latest version',
          'Try using Chrome or Firefox',
          'Enable hardware acceleration in browser settings',
          'Clear browser cache and cookies'
        );
        break;

      default:
        suggestions.push(
          'Refresh the page and try again',
          'Clear browser cache',
          'Disable browser extensions temporarily',
          'Contact support with error details'
        );
    }

    return suggestions;
  }

  // Error reporting
  async reportError(errorInfo, userFeedback = '') {
    try {
      const report = {
        ...errorInfo,
        userFeedback,
        browserInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          cookieEnabled: navigator.cookieEnabled,
          onLine: navigator.onLine
        },
        pageInfo: {
          url: window.location.href,
          referrer: document.referrer,
          title: document.title
        },
        systemInfo: {
          screen: {
            width: screen.width,
            height: screen.height,
            colorDepth: screen.colorDepth
          },
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          },
          memory: performance.memory ? {
            usedJSHeapSize: performance.memory.usedJSHeapSize,
            totalJSHeapSize: performance.memory.totalJSHeapSize,
            jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
          } : null
        }
      };

      // In a real application, send this to your error reporting service
      console.log('Error report generated:', report);

      // For now, just save to localStorage as a fallback
      const reports = JSON.parse(localStorage.getItem('error_reports') || '[]');
      reports.unshift(report);
      localStorage.setItem('error_reports', JSON.stringify(reports.slice(0, 50)));

      return { success: true, reportId: errorInfo.id };
    } catch (error) {
      console.error('Failed to report error:', error);
      return { success: false, error: error.message };
    }
  }

  // Event listeners
  addEventListener(callback) {
    this.errorCallbacks.push(callback);
  }

  removeEventListener(callback) {
    const index = this.errorCallbacks.indexOf(callback);
    if (index > -1) {
      this.errorCallbacks.splice(index, 1);
    }
  }

  // Utility methods
  getErrorHistory() {
    return [...this.errorHistory];
  }

  clearErrorHistory() {
    this.errorHistory = [];
  }

  getErrorStats() {
    const now = Date.now();
    const last24h = this.errorHistory.filter(e =>
      now - new Date(e.timestamp).getTime() < 24 * 60 * 60 * 1000
    );

    const byType = {};
    const bySource = {};

    last24h.forEach(error => {
      const type = error.context?.type || 'unknown';
      const source = error.context?.source || 'unknown';

      byType[type] = (byType[type] || 0) + 1;
      bySource[source] = (bySource[source] || 0) + 1;
    });

    return {
      total: this.errorHistory.length,
      last24h: last24h.length,
      byType,
      bySource,
      mostCommon: Object.entries(byType).sort(([,a], [,b]) => b - a)[0]
    };
  }
}

// Create singleton instance
const errorHandler = new ErrorHandler();

// Helper functions for common error scenarios
export const handleAsyncOperation = async (operation, operationName, context = {}) => {
  try {
    return await operation();
  } catch (error) {
    throw errorHandler.handleError(error, {
      ...context,
      operationName,
      type: 'async_operation_error'
    });
  }
};

export const validateRequired = (value, fieldName) => {
  if (value === null || value === undefined || value === '') {
    throw errorHandler.handleValidationError(
      new Error(`${fieldName} is required`),
      fieldName,
      value
    );
  }
  return true;
};

export const validateType = (value, expectedType, fieldName) => {
  if (typeof value !== expectedType) {
    throw errorHandler.handleValidationError(
      new Error(`${fieldName} must be of type ${expectedType}`),
      fieldName,
      value
    );
  }
  return true;
};

export const validateRange = (value, min, max, fieldName) => {
  if (value < min || value > max) {
    throw errorHandler.handleValidationError(
      new Error(`${fieldName} must be between ${min} and ${max}`),
      fieldName,
      value
    );
  }
  return true;
};

export const safeAsync = (operation, fallback = null) => {
  return async (...args) => {
    try {
      return await operation(...args);
    } catch (error) {
      errorHandler.handleError(error, {
        type: 'safe_async_error',
        operation: operation.name || 'anonymous'
      });
      return fallback;
    }
  };
};

export default errorHandler;