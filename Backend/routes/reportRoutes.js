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

// Update candidate information for a session (for fixing placeholder data)
router.put('/update-candidate/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { candidateName, candidateEmail } = req.body;

    if (!candidateName || !candidateEmail) {
      return res.status(400).json({
        success: false,
        message: 'Candidate name and email are required'
      });
    }

    const Interview = require('../models/Interview');
    const interview = await Interview.findOne({ sessionId });

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview session not found'
      });
    }

    interview.candidateName = candidateName;
    interview.candidateEmail = candidateEmail;
    await interview.save();

    res.json({
      success: true,
      message: 'Candidate information updated successfully',
      data: {
        sessionId: interview.sessionId,
        candidateName: interview.candidateName,
        candidateEmail: interview.candidateEmail
      }
    });

  } catch (error) {
    console.error('Error updating candidate info:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update candidate information',
      error: error.message
    });
  }
});

module.exports = router;