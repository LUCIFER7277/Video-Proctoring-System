import errorHandler from './errorHandler.js';

class ValidationService {
  constructor() {
    this.rules = new Map();
    this.customValidators = new Map();
    this.setupDefaultRules();
  }

  setupDefaultRules() {
    // Basic validation rules
    this.addRule('required', (value) => {
      if (value === null || value === undefined || value === '') {
        throw new Error('This field is required');
      }
      return true;
    });

    this.addRule('string', (value) => {
      if (typeof value !== 'string') {
        throw new Error('Must be a string');
      }
      return true;
    });

    this.addRule('number', (value) => {
      if (typeof value !== 'number' || isNaN(value)) {
        throw new Error('Must be a valid number');
      }
      return true;
    });

    this.addRule('email', (value) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        throw new Error('Must be a valid email address');
      }
      return true;
    });

    this.addRule('url', (value) => {
      try {
        new URL(value);
        return true;
      } catch {
        throw new Error('Must be a valid URL');
      }
    });

    this.addRule('minLength', (value, minLength) => {
      if (value.length < minLength) {
        throw new Error(`Must be at least ${minLength} characters long`);
      }
      return true;
    });

    this.addRule('maxLength', (value, maxLength) => {
      if (value.length > maxLength) {
        throw new Error(`Must be no more than ${maxLength} characters long`);
      }
      return true;
    });

    this.addRule('min', (value, min) => {
      if (value < min) {
        throw new Error(`Must be at least ${min}`);
      }
      return true;
    });

    this.addRule('max', (value, max) => {
      if (value > max) {
        throw new Error(`Must be no more than ${max}`);
      }
      return true;
    });

    this.addRule('pattern', (value, pattern) => {
      const regex = new RegExp(pattern);
      if (!regex.test(value)) {
        throw new Error('Does not match required pattern');
      }
      return true;
    });

    // Video proctoring specific validations
    this.addRule('sessionId', (value) => {
      if (!/^[a-zA-Z0-9-_]{8,}$/.test(value)) {
        throw new Error('Invalid session ID format');
      }
      return true;
    });

    this.addRule('mediaStream', (value) => {
      if (!(value instanceof MediaStream)) {
        throw new Error('Must be a valid MediaStream');
      }
      if (value.getTracks().length === 0) {
        throw new Error('MediaStream has no tracks');
      }
      return true;
    });

    this.addRule('videoElement', (value) => {
      if (!(value instanceof HTMLVideoElement)) {
        throw new Error('Must be a valid video element');
      }
      if (value.readyState < 2) {
        throw new Error('Video element not ready');
      }
      return true;
    });

    this.addRule('canvasElement', (value) => {
      if (!(value instanceof HTMLCanvasElement)) {
        throw new Error('Must be a valid canvas element');
      }
      return true;
    });

    this.addRule('detectionResult', (value) => {
      if (!value || typeof value !== 'object') {
        throw new Error('Invalid detection result');
      }
      if (!value.hasOwnProperty('timestamp')) {
        throw new Error('Detection result missing timestamp');
      }
      return true;
    });

    this.addRule('violationData', (value) => {
      const required = ['type', 'timestamp', 'description'];
      for (const field of required) {
        if (!value.hasOwnProperty(field)) {
          throw new Error(`Violation data missing required field: ${field}`);
        }
      }
      return true;
    });

    this.addRule('confidenceScore', (value) => {
      if (typeof value !== 'number' || value < 0 || value > 1) {
        throw new Error('Confidence score must be a number between 0 and 1');
      }
      return true;
    });
  }

  addRule(name, validator) {
    this.rules.set(name, validator);
  }

  validate(value, rules, fieldName = 'Field') {
    const errors = [];

    if (!Array.isArray(rules)) {
      rules = [rules];
    }

    for (const rule of rules) {
      try {
        if (typeof rule === 'string') {
          // Simple rule name
          if (this.rules.has(rule)) {
            this.rules.get(rule)(value);
          } else {
            throw new Error(`Unknown validation rule: ${rule}`);
          }
        } else if (typeof rule === 'object') {
          // Rule with parameters
          const { name, params } = rule;
          if (this.rules.has(name)) {
            this.rules.get(name)(value, ...params);
          } else {
            throw new Error(`Unknown validation rule: ${name}`);
          }
        } else if (typeof rule === 'function') {
          // Custom function
          rule(value);
        }
      } catch (error) {
        errors.push(`${fieldName}: ${error.message}`);

        // Log validation error
        errorHandler.handleValidationError(error, fieldName, value);
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    return true;
  }

  validateObject(obj, schema) {
    const errors = [];

    for (const [fieldName, rules] of Object.entries(schema)) {
      try {
        const value = obj[fieldName];
        this.validate(value, rules, fieldName);
      } catch (error) {
        errors.push(error.message);
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    return true;
  }

  // Specific validation methods for the proctoring system
  validateInterviewSession(sessionData) {
    const schema = {
      sessionId: ['required', 'string', 'sessionId'],
      candidateId: ['required', 'string'],
      interviewerId: ['required', 'string'],
      startTime: ['required'],
      settings: ['required']
    };

    return this.validateObject(sessionData, schema);
  }

  validateViolationSubmission(violationData) {
    const schema = {
      sessionId: ['required', 'string', 'sessionId'],
      type: ['required', 'string'],
      description: ['required', 'string', { name: 'minLength', params: [5] }],
      timestamp: ['required'],
      severity: ['required', 'string'],
      confidence: ['confidenceScore']
    };

    return this.validateObject(violationData, schema);
  }

  validateMediaConfiguration(config) {
    const schema = {
      video: ['required'],
      audio: []
    };

    this.validateObject(config, schema);

    // Additional checks for video constraints
    if (config.video && typeof config.video === 'object') {
      if (config.video.width && config.video.width < 640) {
        throw new Error('Video width must be at least 640 pixels');
      }
      if (config.video.height && config.video.height < 480) {
        throw new Error('Video height must be at least 480 pixels');
      }
    }

    return true;
  }

  validateDetectionSettings(settings) {
    const schema = {
      focusThreshold: [{ name: 'min', params: [1000] }, { name: 'max', params: [60000] }],
      noFaceThreshold: [{ name: 'min', params: [5000] }, { name: 'max', params: [120000] }],
      confidenceThreshold: ['confidenceScore']
    };

    return this.validateObject(settings, schema);
  }

  validateBrowserCapabilities(capabilities) {
    const required = [
      'getUserMedia',
      'MediaRecorder',
      'WebGL',
      'Canvas'
    ];

    for (const capability of required) {
      if (!capabilities[capability]) {
        throw new Error(`Browser missing required capability: ${capability}`);
      }
    }

    return true;
  }

  // Sanitization methods
  sanitizeString(str) {
    if (typeof str !== 'string') return str;

    return str
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: URLs
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  sanitizeObject(obj, allowedFields = []) {
    const sanitized = {};

    for (const [key, value] of Object.entries(obj)) {
      if (allowedFields.length > 0 && !allowedFields.includes(key)) {
        continue; // Skip fields not in allowed list
      }

      if (typeof value === 'string') {
        sanitized[key] = this.sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeObject(value, allowedFields);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  // File validation
  validateImageFile(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!file) {
      throw new Error('No file provided');
    }

    if (!allowedTypes.includes(file.type)) {
      throw new Error('File must be a JPEG, PNG, or WebP image');
    }

    if (file.size > maxSize) {
      throw new Error('File size must be less than 10MB');
    }

    return true;
  }

  validateVideoFile(file) {
    const allowedTypes = ['video/webm', 'video/mp4'];
    const maxSize = 500 * 1024 * 1024; // 500MB

    if (!file) {
      throw new Error('No file provided');
    }

    if (!allowedTypes.includes(file.type)) {
      throw new Error('File must be WebM or MP4 video');
    }

    if (file.size > maxSize) {
      throw new Error('Video file size must be less than 500MB');
    }

    return true;
  }

  // Security validation
  validateCSRFToken(token, expectedToken) {
    if (!token || token !== expectedToken) {
      throw new Error('Invalid CSRF token');
    }
    return true;
  }

  validateOrigin(origin, allowedOrigins) {
    if (!allowedOrigins.includes(origin)) {
      throw new Error('Request from unauthorized origin');
    }
    return true;
  }

  // Rate limiting validation
  validateRateLimit(key, maxRequests = 100, timeWindow = 60000) {
    const now = Date.now();
    const windowKey = `${key}_${Math.floor(now / timeWindow)}`;

    let requests = parseInt(localStorage.getItem(windowKey) || '0');

    if (requests >= maxRequests) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    localStorage.setItem(windowKey, (requests + 1).toString());

    // Clean up old entries
    setTimeout(() => {
      localStorage.removeItem(windowKey);
    }, timeWindow);

    return true;
  }

  // Utility methods
  isValidJSON(str) {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  isValidTimestamp(timestamp) {
    const date = new Date(timestamp);
    return !isNaN(date.getTime()) && date.getTime() > 0;
  }

  isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  // Form validation helper
  validateForm(formData, validationRules) {
    const errors = {};
    let isValid = true;

    for (const [fieldName, rules] of Object.entries(validationRules)) {
      try {
        const value = formData.get ? formData.get(fieldName) : formData[fieldName];
        this.validate(value, rules, fieldName);
      } catch (error) {
        errors[fieldName] = error.message;
        isValid = false;
      }
    }

    return { isValid, errors };
  }
}

// Create singleton instance
const validationService = new ValidationService();

// Export convenience functions
export const validate = (value, rules, fieldName) =>
  validationService.validate(value, rules, fieldName);

export const validateObject = (obj, schema) =>
  validationService.validateObject(obj, schema);

export const sanitizeString = (str) =>
  validationService.sanitizeString(str);

export const sanitizeObject = (obj, allowedFields) =>
  validationService.sanitizeObject(obj, allowedFields);

export const validateImageFile = (file) =>
  validationService.validateImageFile(file);

export const validateVideoFile = (file) =>
  validationService.validateVideoFile(file);

export const validateForm = (formData, rules) =>
  validationService.validateForm(formData, rules);

export default validationService;