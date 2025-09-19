const express = require('express');
const path = require('path');
const {
  createInterview,
  startInterview,
  endInterview,
  getInterview,
  uploadRecording,
  getAllInterviews
} = require('../controllers/interviewController.js');
const PDFService = require('../services/pdfService.js');
const Interview = require('../models/Interview.js');
const Violation = require('../models/Violation.js');

// Import configurations
const { upload, handleMulterError } = require('../config/multer.js');
const { validateInterview, handleValidationErrors } = require('../middleware/index.js');

const router = express.Router();

// Routes
router.post('/', validateInterview, handleValidationErrors, createInterview);
router.get('/', getAllInterviews);
router.get('/:sessionId', getInterview);
router.post('/:sessionId/start', startInterview);
router.post('/:sessionId/end', endInterview);
router.post('/:sessionId/upload', upload.single('video'), uploadRecording);


// Generate proctoring report
router.get('/:sessionId/report', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const interview = await Interview.findOne({ sessionId });
    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview session not found'
      });
    }

    // Add a small delay to ensure all recent violations are saved
    // This prevents race conditions where violations are still being processed
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Fetch the most recent violations with a fresh query
    const violations = await Violation.find({ sessionId }).sort({ timestamp: 1 });

    // Update interview with latest violation counts before generating report
    const violationCount = await Violation.countDocuments({ sessionId });
    const focusLostCount = await Violation.countDocuments({
      sessionId,
      type: { $in: ['focus_lost', 'looking_away', 'no_face_detected'] }
    });

    interview.violationCount = violationCount;
    interview.focusLostCount = focusLostCount;
    interview.calculateIntegrityScore();
    await interview.save();

    const reportFilename = `proctoring-report-${sessionId}-${Date.now()}.pdf`;
    const reportPath = path.join(__dirname, '../uploads/reports/', reportFilename);

    // Ensure reports directory exists
    const fs = require('fs');
    const reportsDir = path.dirname(reportPath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    await PDFService.generateProctoringReport(interview, violations, reportPath);

    // Update interview with report path
    interview.reportPath = `/uploads/reports/${reportFilename}`;
    await interview.save();

    res.json({
      success: true,
      message: 'Report generated successfully',
      reportUrl: interview.reportPath
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate report',
      error: error.message
    });
  }
});

// Error handling for multer
router.use(handleMulterError);

module.exports = router;