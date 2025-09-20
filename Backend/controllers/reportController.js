const ReportGenerator = require('../services/reportGenerator');
const Interview = require('../models/Interview');
const path = require('path');
const fs = require('fs');

const reportGenerator = new ReportGenerator();

// Test endpoint to check if report generation is working
const testReportGeneration = async (req, res) => {
  try {
    console.log('Test report generation endpoint called');

    // Find any interview to test with
    const interview = await Interview.findOne().sort({ createdAt: -1 });
    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'No interviews found to test with'
      });
    }

    console.log('Testing with interview:', interview._id);

    // Test the report generation
    const result = await reportGenerator.generateInterviewReport(interview._id);

    res.json({
      success: true,
      message: 'Test completed',
      result: result,
      interviewId: interview._id,
      candidateName: interview.candidateName
    });
  } catch (error) {
    console.error('Test report generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Test failed',
      error: error.message,
      stack: error.stack
    });
  }
};

// Generate PDF report for a specific interview
const generateInterviewReport = async (req, res) => {
  try {
    const { interviewId } = req.params;

    console.log('Report generation request received for interviewId:', interviewId);

    // Validate interview exists
    const interview = await Interview.findById(interviewId);
    if (!interview) {
      console.log('Interview not found for ID:', interviewId);
      return res.status(404).json({
        success: false,
        message: 'Interview not found'
      });
    }

    console.log('Interview found:', {
      id: interview._id,
      sessionId: interview.sessionId,
      candidateName: interview.candidateName,
      status: interview.status,
      startTime: interview.startTime,
      endTime: interview.endTime,
      integrityScore: interview.integrityScore,
      violationCount: interview.violationCount,
      focusLostCount: interview.focusLostCount,
      objectViolationCount: interview.objectViolationCount
    });

    // Generate report
    const result = await reportGenerator.generateInterviewReport(interviewId);

    if (result.success) {
      console.log('Report generated successfully:', result.filename);
      res.json({
        success: true,
        message: 'Report generated successfully',
        reportPath: result.reportPath,
        filename: result.filename,
        downloadUrl: `/api/reports/download/${result.filename}`
      });
    } else {
      console.error('Report generation failed:', result.error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate report',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error in generateInterviewReport:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Generate bulk report for multiple interviews
const generateBulkReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    // Validate dates
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start date cannot be after end date'
      });
    }

    // Generate report
    const result = await reportGenerator.generateBulkReport(startDate, endDate);

    if (result.success) {
      res.json({
        success: true,
        message: 'Bulk report generated successfully',
        reportPath: result.reportPath,
        filename: result.filename,
        totalInterviews: result.totalInterviews,
        downloadUrl: `/api/reports/download/${result.filename}`
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to generate bulk report',
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error in generateBulkReport:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Download report file
const downloadReport = async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../../reports', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Report file not found'
      });
    }

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      res.status(500).json({
        success: false,
        message: 'Error downloading file'
      });
    });

  } catch (error) {
    console.error('Error in downloadReport:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get list of available reports
const getReportsList = async (req, res) => {
  try {
    const reportsDir = path.join(__dirname, '../../reports');

    if (!fs.existsSync(reportsDir)) {
      return res.json({
        success: true,
        reports: []
      });
    }

    const files = fs.readdirSync(reportsDir);
    const reports = files
      .filter(file => file.endsWith('.pdf'))
      .map(file => {
        const filePath = path.join(reportsDir, file);
        const stats = fs.statSync(filePath);

        return {
          filename: file,
          size: stats.size,
          createdAt: stats.birthtime,
          downloadUrl: `/api/reports/download/${file}`
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      success: true,
      reports: reports
    });

  } catch (error) {
    console.error('Error in getReportsList:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Delete report file
const deleteReport = async (req, res) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(__dirname, '../../reports', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Report file not found'
      });
    }

    // Delete the file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: 'Report deleted successfully'
    });

  } catch (error) {
    console.error('Error in deleteReport:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get interview statistics for dashboard
const getInterviewStats = async (req, res) => {
  try {
    const { period = '30' } = req.query; // Default to last 30 days
    const daysBack = parseInt(period);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const interviews = await Interview.find({
      startTime: { $gte: startDate }
    });

    const stats = {
      totalInterviews: interviews.length,
      completedInterviews: interviews.filter(i => i.status === 'completed').length,
      inProgressInterviews: interviews.filter(i => i.status === 'in_progress').length,
      averageIntegrityScore: interviews.length > 0
        ? interviews.reduce((sum, i) => sum + i.integrityScore, 0) / interviews.length
        : 0,
      totalViolations: interviews.reduce((sum, i) => sum + i.violationCount, 0),
      averageViolationsPerInterview: interviews.length > 0
        ? interviews.reduce((sum, i) => sum + i.violationCount, 0) / interviews.length
        : 0,
      periodDays: daysBack
    };

    res.json({
      success: true,
      stats: stats
    });

  } catch (error) {
    console.error('Error in getInterviewStats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

module.exports = {
  testReportGeneration,
  generateInterviewReport,
  generateBulkReport,
  downloadReport,
  getReportsList,
  deleteReport,
  getInterviewStats
};