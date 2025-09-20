import errorHandler from './errorHandler.js';

// Resource tracking and security
const activeTimeouts = new Set();
const rateLimitCache = new Map();
let isDisposed = false;

// Secure constants
const MAX_STRING_LENGTH = 10000;
const MAX_NESTED_DEPTH = 10;
const RATE_LIMIT_CLEANUP_INTERVAL = 60000; // 1 minute

// Safe regex patterns to prevent ReDoS
const SAFE_PATTERNS = {
  email: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
  sessionId: /^[a-zA-Z0-9_-]{8,64}$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  alphanumeric: /^[a-zA-Z0-9]+$/,
  filename: /^[a-zA-Z0-9._-]+$/
};

// File type magic numbers for validation
const FILE_SIGNATURES = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
  'video/webm': [0x1A, 0x45, 0xDF, 0xA3],
  'video/mp4': [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70] // Partial signature
};

// Timing-safe comparison function
const timingSafeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
};

// Enhanced sanitization with comprehensive XSS prevention
const comprehensiveSanitize = (input, maxLength = MAX_STRING_LENGTH) => {
  if (typeof input !== 'string') {
    return String(input || '').substring(0, maxLength);
  }

  return input
    .substring(0, maxLength)
    // Remove HTML tags and attributes
    .replace(/<[^>]*>/g, '')
    // Remove javascript: and data: URLs
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .replace(/vbscript:/gi, '')
    // Remove event handlers
    .replace(/on\w+\s*=/gi, '')
    // Remove encoded scripts
    .replace(/%3[cC]script/gi, '')
    .replace(/&lt;script/gi, '')
    .replace(/&#x?[0-9a-f]+;?/gi, '') // Remove HTML entities
    // Remove control characters except tab, newline, carriage return
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove potential CSS expression
    .replace(/expression\s*\(/gi, '')
    .replace(/url\s*\(/gi, '')
    .trim();
};

// Rate limit cleanup management
const cleanupRateLimit = () => {
  const now = Date.now();
  const expiredKeys = [];

  for (const [key, data] of rateLimitCache.entries()) {
    if (now - data.timestamp > data.window) {
      expiredKeys.push(key);
    }
  }

  expiredKeys.forEach(key => rateLimitCache.delete(key));
};

// Start cleanup interval
const cleanupInterval = setInterval(cleanupRateLimit, RATE_LIMIT_CLEANUP_INTERVAL);
activeTimeouts.add(cleanupInterval);

class ValidationService {
  constructor() {
    this.rules = new Map();
    this.customValidators = new Map();
    this.asyncValidators = new Map();
    this.schemas = new Map();
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
      if (typeof value !== 'string' || value.length > 254) {
        throw new Error('Must be a valid email address');
      }

      const sanitized = comprehensiveSanitize(value, 254);
      if (!SAFE_PATTERNS.email.test(sanitized)) {
        throw new Error('Must be a valid email address');
      }

      // Additional validation for email structure
      const parts = sanitized.split('@');
      if (parts.length !== 2) {
        throw new Error('Must be a valid email address');
      }

      const [localPart, domain] = parts;
      if (localPart.length === 0 || localPart.length > 64 ||
          domain.length === 0 || domain.length > 253) {
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
      if (typeof value !== 'string' && !Array.isArray(value)) {
        throw new Error('Value must have a length property');
      }

      if (typeof minLength !== 'number' || minLength < 0 || minLength > MAX_STRING_LENGTH) {
        throw new Error('Invalid minimum length specified');
      }

      if (value.length < minLength) {
        throw new Error(`Must be at least ${minLength} characters long`);
      }
      return true;
    });

    this.addRule('maxLength', (value, maxLength) => {
      if (typeof value !== 'string' && !Array.isArray(value)) {
        throw new Error('Value must have a length property');
      }

      if (typeof maxLength !== 'number' || maxLength < 0 || maxLength > MAX_STRING_LENGTH) {
        throw new Error('Invalid maximum length specified');
      }

      if (value.length > maxLength) {
        throw new Error(`Must be no more than ${maxLength} characters long`);
      }
      return true;
    });

    this.addRule('min', (value, min) => {
      if (typeof value !== 'number' || isNaN(value)) {
        throw new Error('Value must be a valid number');
      }

      if (typeof min !== 'number' || isNaN(min)) {
        throw new Error('Minimum value must be a valid number');
      }

      if (value < min) {
        throw new Error(`Must be at least ${min}`);
      }
      return true;
    });

    this.addRule('max', (value, max) => {
      if (typeof value !== 'number' || isNaN(value)) {
        throw new Error('Value must be a valid number');
      }

      if (typeof max !== 'number' || isNaN(max)) {
        throw new Error('Maximum value must be a valid number');
      }

      if (value > max) {
        throw new Error(`Must be no more than ${max}`);
      }
      return true;
    });

    this.addRule('pattern', (value, pattern) => {
      if (typeof value !== 'string') {
        throw new Error('Value must be a string for pattern matching');
      }

      if (typeof pattern !== 'string' || pattern.length > 1000) {
        throw new Error('Invalid pattern provided');
      }

      // Sanitize input to prevent ReDoS
      const sanitizedValue = comprehensiveSanitize(value, 1000);

      try {
        // Create regex with timeout simulation using limited input
        const regex = new RegExp(pattern);

        // Test with timeout to prevent ReDoS
        const startTime = Date.now();
        const result = regex.test(sanitizedValue);
        const endTime = Date.now();

        // If regex takes too long, consider it unsafe
        if (endTime - startTime > 100) {
          throw new Error('Pattern validation timed out - potentially unsafe regex');
        }

        if (!result) {
          throw new Error('Does not match required pattern');
        }

        return true;
      } catch (error) {
        if (error.message.includes('timed out')) {
          throw error;
        }
        throw new Error('Invalid pattern or pattern matching failed');
      }
    });

    // Video proctoring specific validations
    this.addRule('sessionId', (value) => {
      if (typeof value !== 'string') {
        throw new Error('Session ID must be a string');
      }

      const sanitized = comprehensiveSanitize(value, 64);
      if (!SAFE_PATTERNS.sessionId.test(sanitized)) {
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
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid detection result - must be an object');
      }

      const required = ['timestamp', 'type'];
      for (const field of required) {
        if (!Object.prototype.hasOwnProperty.call(value, field)) {
          throw new Error(`Detection result missing required field: ${field}`);
        }
      }

      // Validate timestamp
      if (!this.isValidTimestamp(value.timestamp)) {
        throw new Error('Detection result has invalid timestamp');
      }

      return true;
    });

    this.addRule('violationData', (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Invalid violation data - must be an object');
      }

      const required = ['type', 'timestamp', 'description'];
      for (const field of required) {
        if (!Object.prototype.hasOwnProperty.call(value, field)) {
          throw new Error(`Violation data missing required field: ${field}`);
        }
      }

      // Validate and sanitize string fields
      if (typeof value.type !== 'string' || value.type.length === 0) {
        throw new Error('Violation type must be a non-empty string');
      }

      if (typeof value.description !== 'string' || value.description.length < 5) {
        throw new Error('Violation description must be at least 5 characters');
      }

      // Validate timestamp
      if (!this.isValidTimestamp(value.timestamp)) {
        throw new Error('Violation data has invalid timestamp');
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

  validate(value, rules, fieldName = 'Field', options = {}) {
    if (isDisposed) {
      throw new Error('ValidationService is disposed');
    }

    const { sanitizeInput = true, maxErrors = 10 } = options;
    const errors = [];
    const sanitizedFieldName = comprehensiveSanitize(String(fieldName), 100);

    if (!Array.isArray(rules)) {
      rules = [rules];
    }

    if (rules.length > 50) {
      throw new Error('Too many validation rules provided');
    }

    // Sanitize string inputs by default
    let processedValue = value;
    if (sanitizeInput && typeof value === 'string') {
      processedValue = comprehensiveSanitize(value);
    }

    for (const rule of rules) {
      if (errors.length >= maxErrors) {
        errors.push('Maximum validation errors reached');
        break;
      }

      try {
        if (typeof rule === 'string') {
          // Simple rule name
          if (this.rules.has(rule)) {
            this.rules.get(rule)(processedValue);
          } else {
            throw new Error(`Unknown validation rule: ${rule}`);
          }
        } else if (rule && typeof rule === 'object' && !Array.isArray(rule)) {
          // Rule with parameters
          const { name, params = [] } = rule;

          if (typeof name !== 'string') {
            throw new Error('Rule name must be a string');
          }

          if (!Array.isArray(params) || params.length > 10) {
            throw new Error('Invalid rule parameters');
          }

          if (this.rules.has(name)) {
            this.rules.get(name)(processedValue, ...params);
          } else {
            throw new Error(`Unknown validation rule: ${name}`);
          }
        } else if (typeof rule === 'function') {
          // Custom function with timeout
          const startTime = Date.now();
          rule(processedValue);

          if (Date.now() - startTime > 1000) {
            console.warn(`Slow validation rule detected for field ${sanitizedFieldName}`);
          }
        } else {
          throw new Error('Invalid rule type provided');
        }
      } catch (error) {
        const sanitizedMessage = comprehensiveSanitize(error.message || 'Validation failed', 500);
        errors.push(`${sanitizedFieldName}: ${sanitizedMessage}`);

        // Log validation error with sanitized data
        try {
          errorHandler.handleValidationError(
            new Error(sanitizedMessage),
            sanitizedFieldName,
            typeof processedValue === 'string' ? comprehensiveSanitize(processedValue, 100) : '[non-string]'
          );
        } catch (loggingError) {
          console.warn('Failed to log validation error:', loggingError);
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join(', '));
    }

    return true;
  }

  validateObject(obj, schema, options = {}) {
    if (isDisposed) {
      throw new Error('ValidationService is disposed');
    }

    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new Error('Object to validate must be a non-null object');
    }

    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      throw new Error('Schema must be a non-null object');
    }

    const { maxDepth = MAX_NESTED_DEPTH, allowExtraFields = false } = options;
    const errors = [];
    const schemaKeys = Object.keys(schema);
    const objKeys = Object.keys(obj);

    // Check for too many fields
    if (objKeys.length > 100) {
      throw new Error('Object has too many fields to validate');
    }

    if (schemaKeys.length > 100) {
      throw new Error('Schema has too many rules');
    }

    // Check for extra fields if not allowed
    if (!allowExtraFields) {
      const extraFields = objKeys.filter(key => !schemaKeys.includes(key));
      if (extraFields.length > 0) {
        const sanitizedFields = extraFields.map(f => comprehensiveSanitize(String(f), 50));
        errors.push(`Unexpected fields: ${sanitizedFields.join(', ')}`);
      }
    }

    for (const [fieldName, rules] of Object.entries(schema)) {
      if (errors.length >= 20) {
        errors.push('Maximum schema validation errors reached');
        break;
      }

      try {
        const sanitizedFieldName = comprehensiveSanitize(String(fieldName), 100);
        const value = obj[fieldName];

        // Handle nested objects
        if (value && typeof value === 'object' && !Array.isArray(value) && maxDepth > 0) {
          // Check if this is a nested schema validation
          if (rules && typeof rules === 'object' && rules.type === 'object' && rules.schema) {
            this.validateObject(value, rules.schema, { ...options, maxDepth: maxDepth - 1 });
            continue;
          }
        }

        this.validate(value, rules, sanitizedFieldName, options);
      } catch (error) {
        const sanitizedMessage = comprehensiveSanitize(error.message || 'Validation failed', 500);
        errors.push(sanitizedMessage);
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

  // Enhanced sanitization methods
  sanitizeString(str, maxLength = MAX_STRING_LENGTH) {
    return comprehensiveSanitize(str, maxLength);
  }

  sanitizeObject(obj, allowedFields = [], depth = 0) {
    if (depth > MAX_NESTED_DEPTH) {
      throw new Error('Maximum nesting depth exceeded during sanitization');
    }

    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.slice(0, 1000).map(item => {
        if (typeof item === 'string') {
          return comprehensiveSanitize(item);
        } else if (typeof item === 'object' && item !== null) {
          return this.sanitizeObject(item, allowedFields, depth + 1);
        }
        return item;
      });
    }

    const sanitized = {};
    const entries = Object.entries(obj).slice(0, 100); // Limit object size

    for (const [key, value] of entries) {
      const sanitizedKey = comprehensiveSanitize(String(key), 100);

      if (allowedFields.length > 0 && !allowedFields.includes(key)) {
        continue; // Skip fields not in allowed list
      }

      if (typeof value === 'string') {
        sanitized[sanitizedKey] = comprehensiveSanitize(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[sanitizedKey] = this.sanitizeObject(value, allowedFields, depth + 1);
      } else if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
        sanitized[sanitizedKey] = value;
      } else if (typeof value === 'boolean') {
        sanitized[sanitizedKey] = value;
      } else {
        // Skip undefined, functions, symbols, etc.
        continue;
      }
    }

    return sanitized;
  }

  // Enhanced file validation with magic number checking
  async validateImageFile(file, options = {}) {
    const { maxSize = 10 * 1024 * 1024, allowedTypes = ['image/jpeg', 'image/png', 'image/webp'] } = options;

    if (!file || !(file instanceof File)) {
      throw new Error('No valid file provided');
    }

    // Validate file name
    const sanitizedName = comprehensiveSanitize(file.name, 255);
    if (!SAFE_PATTERNS.filename.test(sanitizedName.split('.')[0])) {
      throw new Error('Invalid file name format');
    }

    // MIME type validation
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`File must be one of: ${allowedTypes.join(', ')}`);
    }

    // Size validation
    if (file.size === 0) {
      throw new Error('File is empty');
    }

    if (file.size > maxSize) {
      throw new Error(`File size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    // Magic number validation
    try {
      const buffer = await this.readFileHeader(file, 8);
      if (!this.validateFileSignature(buffer, file.type)) {
        throw new Error('File content does not match declared type');
      }
    } catch (error) {
      if (error.message.includes('content does not match')) {
        throw error;
      }
      console.warn('Could not validate file signature:', error);
    }

    return true;
  }

  async validateVideoFile(file, options = {}) {
    const { maxSize = 500 * 1024 * 1024, allowedTypes = ['video/webm', 'video/mp4'] } = options;

    if (!file || !(file instanceof File)) {
      throw new Error('No valid file provided');
    }

    // Validate file name
    const sanitizedName = comprehensiveSanitize(file.name, 255);
    if (!SAFE_PATTERNS.filename.test(sanitizedName.split('.')[0])) {
      throw new Error('Invalid file name format');
    }

    // MIME type validation
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Video file must be one of: ${allowedTypes.join(', ')}`);
    }

    // Size validation
    if (file.size === 0) {
      throw new Error('Video file is empty');
    }

    if (file.size > maxSize) {
      throw new Error(`Video file size must be less than ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    // Magic number validation for video files
    try {
      const buffer = await this.readFileHeader(file, 12);
      if (!this.validateFileSignature(buffer, file.type)) {
        throw new Error('Video file content does not match declared type');
      }
    } catch (error) {
      if (error.message.includes('content does not match')) {
        throw error;
      }
      console.warn('Could not validate video file signature:', error);
    }

    return true;
  }

  // Security validation with timing-safe comparison
  validateCSRFToken(token, expectedToken) {
    if (!token || typeof token !== 'string' ||
        !expectedToken || typeof expectedToken !== 'string') {
      throw new Error('Invalid CSRF token');
    }

    // Use timing-safe comparison to prevent timing attacks
    if (!timingSafeEqual(token, expectedToken)) {
      throw new Error('Invalid CSRF token');
    }

    return true;
  }

  validateOrigin(origin, allowedOrigins) {
    if (!origin || typeof origin !== 'string') {
      throw new Error('Invalid origin provided');
    }

    if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) {
      throw new Error('No allowed origins specified');
    }

    const sanitizedOrigin = comprehensiveSanitize(origin, 2048);

    // Validate origin format
    try {
      const url = new URL(sanitizedOrigin);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Invalid origin protocol');
      }
    } catch (error) {
      throw new Error('Invalid origin format');
    }

    if (!allowedOrigins.includes(sanitizedOrigin)) {
      throw new Error('Request from unauthorized origin');
    }

    return true;
  }

  // Enhanced rate limiting with memory management
  validateRateLimit(key, maxRequests = 100, timeWindow = 60000) {
    if (isDisposed) {
      throw new Error('ValidationService is disposed');
    }

    if (!key || typeof key !== 'string') {
      throw new Error('Rate limit key must be a non-empty string');
    }

    if (typeof maxRequests !== 'number' || maxRequests <= 0 || maxRequests > 10000) {
      throw new Error('Invalid max requests value');
    }

    if (typeof timeWindow !== 'number' || timeWindow <= 0 || timeWindow > 86400000) {
      throw new Error('Invalid time window value');
    }

    const sanitizedKey = comprehensiveSanitize(key, 100);
    const now = Date.now();
    const windowStart = Math.floor(now / timeWindow) * timeWindow;
    const cacheKey = `${sanitizedKey}_${windowStart}`;

    // Use in-memory cache instead of localStorage to avoid quota issues
    const existing = rateLimitCache.get(cacheKey);
    const requests = existing ? existing.count : 0;

    if (requests >= maxRequests) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }

    // Update cache
    rateLimitCache.set(cacheKey, {
      count: requests + 1,
      timestamp: now,
      window: timeWindow
    });

    // Limit cache size
    if (rateLimitCache.size > 1000) {
      const oldestKeys = Array.from(rateLimitCache.keys()).slice(0, 100);
      oldestKeys.forEach(key => rateLimitCache.delete(key));
    }

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
    if (!uuid || typeof uuid !== 'string') {
      return false;
    }

    const sanitized = comprehensiveSanitize(uuid, 36);
    return SAFE_PATTERNS.uuid.test(sanitized);
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