const express = require('express');
const {
  logViolation,
  getViolations,
  getViolationSummary,
  logBulkViolations,
  updateViolation
} = require('../controllers/violationController.js');

// Import configurations
const { evidenceUpload, handleMulterError } = require('../config/multer.js');
const {
  validateViolation,
  validateBulkViolations,
  handleValidationErrors
} = require('../middleware/index.js');

const router = express.Router();

// Routes
router.post('/', evidenceUpload.single('screenshot'), validateViolation, handleValidationErrors, logViolation);
router.post('/bulk', validateBulkViolations, handleValidationErrors, logBulkViolations);
router.get('/session/:sessionId', getViolations);
router.get('/session/:sessionId/summary', getViolationSummary);
router.put('/:id', updateViolation);

// Error handling for multer
router.use(handleMulterError);

module.exports = router;