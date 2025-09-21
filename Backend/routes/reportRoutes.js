const express = require('express');
const router = express.Router();
const {
  testReportGeneration,
  generateInterviewReport,
  generateBulkReport,
  downloadReport,
  getReportsList,
  deleteReport,
  getInterviewStats
} = require('../controllers/reportController');

// Test report generation
router.get('/test', testReportGeneration);

// Generate PDF report for specific interview
router.post('/generate/:interviewId', generateInterviewReport);
router.get('/generate/:interviewId', generateInterviewReport);
router.get('/generate/interview/:interviewId', generateInterviewReport);

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