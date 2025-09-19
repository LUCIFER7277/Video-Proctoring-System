const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const helmet = require('helmet');

// Common validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Interview validation middleware
const validateInterview = [
  body('candidateName')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Candidate name is required and must be between 1-100 characters'),
  body('candidateEmail')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('interviewerName')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Interviewer name is required and must be between 1-100 characters')
];

// Violation validation middleware
const validateViolation = [
  body('sessionId')
    .notEmpty()
    .withMessage('Session ID is required'),
  body('type')
    .isIn(['focus_lost', 'looking_away', 'no_face_detected', 'multiple_faces', 'phone_detected', 'book_detected', 'notes_detected', 'device_detected', 'absence', 'eye_closure'])
    .withMessage('Invalid violation type'),
  body('description')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Description is required and must be between 1-500 characters'),
  body('confidence')
    .isFloat({ min: 0, max: 1 })
    .withMessage('Confidence must be a number between 0 and 1'),
  body('severity')
    .isIn(['low', 'medium', 'high'])
    .withMessage('Severity must be low, medium, or high')
];

// Bulk violations validation middleware
const validateBulkViolations = [
  body('violations')
    .isArray({ min: 1 })
    .withMessage('Violations must be a non-empty array'),
  body('violations.*.sessionId')
    .notEmpty()
    .withMessage('Each violation must have a session ID'),
  body('violations.*.type')
    .isIn(['focus_lost', 'looking_away', 'no_face_detected', 'multiple_faces', 'phone_detected', 'book_detected', 'notes_detected', 'device_detected', 'absence', 'eye_closure'])
    .withMessage('Each violation must have a valid type'),
  body('violations.*.description')
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Each violation must have a description between 1-500 characters'),
  body('violations.*.confidence')
    .isFloat({ min: 0, max: 1 })
    .withMessage('Each violation confidence must be between 0 and 1'),
  body('violations.*.severity')
    .isIn(['low', 'medium', 'high'])
    .withMessage('Each violation severity must be low, medium, or high')
];

// Rate limiting middleware
const createRateLimit = (windowMs = 15 * 60 * 1000, max = 100) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
};

// Specific rate limiters for different endpoint types
const createViolationRateLimit = () => {
  return rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 200, // Allow up to 200 violation reports per minute (for real-time detection)
    message: {
      success: false,
      message: 'Too many violation reports. Please slow down.'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
};

const createGeneralAPIRateLimit = () => {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Increased from 100 to 500 for better usability
    message: {
      success: false,
      message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
  });
};

// CORS configuration
const getAllowedOrigins = () => {
  const defaultOrigins = [
  
    "https://video-proctoring-system01.netlify.app"
  ];

  // Add production frontend URL(s) from environment variable
  if (process.env.FRONTEND_URL) {
    const frontendUrls = process.env.FRONTEND_URL.split(',').map(url => url.trim());
    return [...frontendUrls, ...defaultOrigins];
  }

  return defaultOrigins;
};

const corsOptions = {
  origin: getAllowedOrigins(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Security middleware configuration
const securityMiddleware = [
  helmet(),
  cors(corsOptions)
];

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
};

// 404 handler
const notFoundHandler = (req, res) => {
  res.status(404).json({ message: 'Route not found' });
};

module.exports = {
  // Validation middleware
  handleValidationErrors,
  validateInterview,
  validateViolation,
  validateBulkViolations,

  // Security and rate limiting
  createRateLimit,
  createViolationRateLimit,
  createGeneralAPIRateLimit,
  securityMiddleware,
  corsOptions,

  // Error handling
  errorHandler,
  notFoundHandler
};