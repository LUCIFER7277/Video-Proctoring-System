const express = require('express');
const router = express.Router();
const {
  generateInterviewReport,
  generateBulkReport,
  downloadReport,
  getReportsList,
  deleteReport,
  getInterviewStats
} = require('../controllers/reportController');

// Generate PDF report for specific interview
router.post('/generate/:interviewId', generateInterviewReport);

// Generate bulk report for date range
router.post('/bulk', generateBulkReport);

// Download report file
router.get('/download/:filename', downloadReport);

// Get list of available reports
router.get('/list', getReportsList);

// Get interview statistics
router.get('/stats', getInterviewStats);

// Delete report file
router.delete('/:filename', deleteReport);

module.exports = router;