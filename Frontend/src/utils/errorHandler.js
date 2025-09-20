class ErrorHandler {
  constructor() {
    this.errorCallbacks = [];
    this.errorHistory = [];
    this.maxHistorySize = 100;
    this.retryAttempts = new Map();
    this.maxRetries = 3;
    this.isDisposed = false;
    this.activeTimeouts = new Set();
    this.eventListeners = new Map();
    this.lastErrorTime = new Map();
    this.errorRateLimit = 5000; // 5 seconds
    this.maxErrorsPerMinute = 10;
    this.errorCounts = new Map();

    // Set up global error handlers
    this.setupGlobalHandlers();
  }

  setupGlobalHandlers() {
    if (this.isDisposed) return;

    // Handle unhandled promise rejections
    const unhandledRejectionHandler = (event) => {
      if (this.isDisposed) return;
      const sanitizedReason = this.sanitizeErrorData(event.reason);
      console.error('Unhandled promise rejection:', sanitizedReason);
      this.handleError(new Error(`Unhandled promise rejection: ${sanitizedReason}`), {
        type: 'unhandled_promise',
        source: 'global'
      });
    };

    // Handle JavaScript errors
    const jsErrorHandler = (event) => {
      if (this.isDisposed) return;
      const sanitizedError = this.sanitizeErrorData(event.error);
      console.error('JavaScript error:', sanitizedError);
      this.handleError(event.error || new Error(event.message), {
        type: 'javascript_error',
        source: 'global',
        filename: this.sanitizeString(event.filename),
        lineno: event.lineno,
        colno: event.colno
      });
    };

    // Handle resource loading errors (using capture phase to avoid duplicate listeners)
    const resourceErrorHandler = (event) => {
      if (this.isDisposed || event.target === window) return;
      const sanitizedSrc = this.sanitizeString(event.target.src || event.target.href);
      console.error('Resource loading error:', event.target);
      this.handleError(new Error(`Failed to load resource: ${sanitizedSrc}`), {
        type: 'resource_error',
        source: 'global',
        element: event.target.tagName
      });
    };

    // Add event listeners and track them for cleanup
    window.addEventListener('unhandledrejection', unhandledRejectionHandler);
    window.addEventListener('error', jsErrorHandler);
    window.addEventListener('error', resourceErrorHandler, true);

    // Store references for cleanup
    this.eventListeners.set('unhandledrejection', unhandledRejectionHandler);
    this.eventListeners.set('error', jsErrorHandler);
    this.eventListeners.set('resourceerror', resourceErrorHandler);
  }

  handleError(error, context = {}) {
    if (this.isDisposed) return null;

    // Rate limiting - prevent spam
    const errorKey = `${error.name}:${error.message}`;
    const now = Date.now();
    const lastTime = this.lastErrorTime.get(errorKey) || 0;

    if (now - lastTime < this.errorRateLimit) {
      return null; // Skip if too recent
    }

    // Check error frequency
    const minuteAgo = now - 60000;
    this.errorCounts.set(errorKey, (this.errorCounts.get(errorKey) || []).filter(time => time > minuteAgo));
    const recentErrors = this.errorCounts.get(errorKey);

    if (recentErrors.length >= this.maxErrorsPerMinute) {
      return null; // Rate limited
    }

    recentErrors.push(now);
    this.errorCounts.set(errorKey, recentErrors);
    this.lastErrorTime.set(errorKey, now);

    const errorInfo = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      message: this.sanitizeString(error.message) || 'Unknown error',
      stack: this.sanitizeStack(error.stack),
      name: this.sanitizeString(error.name) || 'Error',
      context: this.sanitizeErrorData(context),
      userAgent: this.sanitizeString(navigator.userAgent),
      url: this.sanitizeString(window.location.href),
      retry_count: this.retryAttempts.get(this.sanitizeString(error.message)) || 0
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

  // Retry mechanism with timeout handling
  async retryOperation(operation, operationName, maxRetries = null, timeout = 30000) {
    if (this.isDisposed) throw new Error('ErrorHandler is disposed');

    const retries = maxRetries || this.maxRetries;
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Add timeout to operation
        const result = await this.withTimeout(operation(), timeout);
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
          source: 'retry_mechanism',
          timeout
        });

        if (attempt < retries) {
          // Exponential backoff with jitter
          const baseDelay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          const jitter = Math.random() * 1000;
          const delay = baseDelay + jitter;
          await this.delay(delay);
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

    // Check browser version with safe parsing
    try {
      const userAgent = navigator.userAgent;
      if (userAgent.includes('Chrome/')) {
        const match = userAgent.match(/Chrome\/(\d+)/);
        if (match && match[1]) {
          const version = parseInt(match[1], 10);
          if (!isNaN(version) && version < 80) {
            issues.push('Chrome version too old (minimum: 80)');
          }
        }
      } else if (userAgent.includes('Firefox/')) {
        const match = userAgent.match(/Firefox\/(\d+)/);
        if (match && match[1]) {
          const version = parseInt(match[1], 10);
          if (!isNaN(version) && version < 75) {
            issues.push('Firefox version too old (minimum: 75)');
          }
        }
      } else if (userAgent.includes('Safari/')) {
        const match = userAgent.match(/Version\/(\d+)/);
        if (match && match[1]) {
          const version = parseInt(match[1], 10);
          if (!isNaN(version) && version < 13) {
            issues.push('Safari version too old (minimum: 13)');
          }
        }
      }
    } catch (parseError) {
      issues.push('Unable to parse browser version');
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

  // Performance monitoring with safe memory access
  monitorPerformance(operationName, operation) {
    return async (...args) => {
      if (this.isDisposed) throw new Error('ErrorHandler is disposed');

      const startTime = performance.now();
      const startMemory = this.getMemoryUsage();

      try {
        const result = await operation(...args);

        const endTime = performance.now();
        const endMemory = this.getMemoryUsage();
        const duration = endTime - startTime;
        const memoryDelta = endMemory && startMemory ? endMemory - startMemory : 0;

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

  // Secure error reporting with data filtering
  async reportError(errorInfo, userFeedback = '') {
    if (this.isDisposed) return { success: false, error: 'Handler disposed' };

    try {
      // Sanitize all data before reporting
      const report = {
        ...this.sanitizeErrorData(errorInfo),
        userFeedback: this.sanitizeString(userFeedback),
        browserInfo: {
          userAgent: this.sanitizeString(navigator.userAgent),
          platform: this.sanitizeString(navigator.platform),
          language: this.sanitizeString(navigator.language),
          cookieEnabled: Boolean(navigator.cookieEnabled),
          onLine: Boolean(navigator.onLine)
        },
        pageInfo: {
          url: this.sanitizeString(window.location.href),
          referrer: this.sanitizeString(document.referrer),
          title: this.sanitizeString(document.title)
        },
        systemInfo: {
          screen: {
            width: screen.width || 0,
            height: screen.height || 0,
            colorDepth: screen.colorDepth || 0
          },
          viewport: {
            width: window.innerWidth || 0,
            height: window.innerHeight || 0
          },
          memory: this.getMemoryInfo()
        }
      };

      // In a real application, send this to your error reporting service
      console.log('Error report generated:', report);

      // Safe localStorage handling with quota management
      await this.saveErrorReport(report);

      return { success: true, reportId: errorInfo.id };
    } catch (error) {
      console.error('Failed to report error:', error);
      return { success: false, error: this.sanitizeString(error.message) };
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

  // Security helper methods
  sanitizeString(str) {
    if (typeof str !== 'string') return String(str || '');

    // Remove potential XSS and sensitive data patterns
    return str
      .replace(/(<script[^>]*>.*?<\/script>)/gi, '[SCRIPT_REMOVED]')
      .replace(/javascript:/gi, '[JS_REMOVED]')
      .replace(/on\w+\s*=/gi, '[EVENT_REMOVED]')
      .replace(/password|token|key|secret|auth/gi, '[SENSITIVE_DATA]')
      .substring(0, 1000); // Limit length
  }

  sanitizeStack(stack) {
    if (!stack) return null;

    // Remove sensitive file paths and keep only relative paths
    return this.sanitizeString(stack)
      .replace(/file:\/\/\/[^:\s]+/g, '[FILE_PATH]')
      .replace(/https?:\/\/[^:\s]+/g, '[URL]')
      .split('\n')
      .slice(0, 10) // Limit stack depth
      .join('\n');
  }

  sanitizeErrorData(data) {
    if (!data || typeof data !== 'object') return data;

    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeErrorData(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  // Memory helper methods
  getMemoryUsage() {
    try {
      return performance.memory?.usedJSHeapSize || null;
    } catch (error) {
      return null;
    }
  }

  getMemoryInfo() {
    try {
      if (!performance.memory) return null;

      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize || 0,
        totalJSHeapSize: performance.memory.totalJSHeapSize || 0,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit || 0
      };
    } catch (error) {
      return null;
    }
  }

  // Storage helper methods with quota management
  async saveErrorReport(report) {
    const storageKey = 'error_reports';

    try {
      // Try localStorage first
      const reports = JSON.parse(localStorage.getItem(storageKey) || '[]');
      reports.unshift(report);
      const trimmedReports = reports.slice(0, 50);

      const reportData = JSON.stringify(trimmedReports);

      // Check if we're approaching localStorage quota
      if (reportData.length > 4.5 * 1024 * 1024) { // 4.5MB threshold
        // Keep only the most recent 25 reports
        const reducedReports = trimmedReports.slice(0, 25);
        localStorage.setItem(storageKey, JSON.stringify(reducedReports));
      } else {
        localStorage.setItem(storageKey, reportData);
      }
    } catch (storageError) {
      if (storageError.name === 'QuotaExceededError') {
        // Try to recover by clearing old data
        try {
          localStorage.removeItem(storageKey);
          localStorage.setItem(storageKey, JSON.stringify([report]));
        } catch (fallbackError) {
          // If localStorage is completely unavailable, use sessionStorage
          try {
            sessionStorage.setItem(`${storageKey}_fallback`, JSON.stringify([report]));
          } catch (sessionError) {
            console.warn('Unable to store error report:', sessionError);
          }
        }
      }
    }
  }

  // Utility methods for async operations
  async withTimeout(promise, timeout) {
    const timeoutId = setTimeout(() => {
      throw new Error(`Operation timed out after ${timeout}ms`);
    }, timeout);

    this.activeTimeouts.add(timeoutId);

    try {
      const result = await promise;
      clearTimeout(timeoutId);
      this.activeTimeouts.delete(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      this.activeTimeouts.delete(timeoutId);
      throw error;
    }
  }

  async delay(ms) {
    return new Promise(resolve => {
      const timeoutId = setTimeout(resolve, ms);
      this.activeTimeouts.add(timeoutId);
      setTimeout(() => this.activeTimeouts.delete(timeoutId), ms);
    });
  }

  // Cleanup and disposal methods
  dispose() {
    if (this.isDisposed) return;

    console.log('🧹 Disposing ErrorHandler...');
    this.isDisposed = true;

    // Clear all active timeouts
    for (const timeoutId of this.activeTimeouts) {
      clearTimeout(timeoutId);
    }
    this.activeTimeouts.clear();

    // Remove global event listeners
    for (const [eventType, handler] of this.eventListeners) {
      try {
        if (eventType === 'resourceerror') {
          window.removeEventListener('error', handler, true);
        } else {
          window.removeEventListener(eventType, handler);
        }
      } catch (error) {
        console.warn(`Failed to remove ${eventType} listener:`, error);
      }
    }
    this.eventListeners.clear();

    // Clear all data structures
    this.errorCallbacks.length = 0;
    this.errorHistory.length = 0;
    this.retryAttempts.clear();
    this.lastErrorTime.clear();
    this.errorCounts.clear();

    console.log('✅ ErrorHandler disposed successfully');
  }

  cleanup() {
    this.dispose();
  }

  destroy() {
    this.dispose();
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