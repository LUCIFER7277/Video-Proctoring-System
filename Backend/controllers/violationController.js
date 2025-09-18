const Violation = require('../models/Violation.js');
const Interview = require('../models/Interview.js');
const path = require('path');
const fs = require('fs').promises;

// Log a new violation
const logViolation = async (req, res) => {
  try {
    const {
      sessionId,
      type,
      description,
      confidence,
      timestamp,
      duration,
      severity = 'medium',
      metadata
    } = req.body;

    // Find the interview
    const interview = await Interview.findOne({ sessionId });
    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview session not found'
      });
    }

    // Create violation record
    const violation = new Violation({
      interviewId: interview._id,
      sessionId,
      type,
      description,
      confidence,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      duration,
      severity,
      metadata
    });

    // Handle screenshot if provided
    if (req.file) {
      violation.screenshotPath = `/uploads/evidence/${req.file.filename}`;
    }

    await violation.save();

    // Update interview violation count
    const violationCount = await Violation.countDocuments({ sessionId });
    const focusLostCount = await Violation.countDocuments({
      sessionId,
      type: { $in: ['focus_lost', 'looking_away', 'no_face_detected'] }
    });

    interview.violationCount = violationCount;
    interview.focusLostCount = focusLostCount;
    interview.calculateIntegrityScore();
    await interview.save();

    res.status(201).json({
      success: true,
      data: violation,
      integrityScore: interview.integrityScore
    });
  } catch (error) {
    console.error('Error logging violation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log violation',
      error: error.message
    });
  }
};

// Get violations for a session
const getViolations = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { page = 1, limit = 50, type } = req.query;

    const filter = { sessionId };
    if (type) filter.type = type;

    const violations = await Violation.find(filter)
      .sort({ timestamp: 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Violation.countDocuments(filter);

    res.json({
      success: true,
      data: violations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching violations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch violations',
      error: error.message
    });
  }
};

// Get violation summary
const getViolationSummary = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const interview = await Interview.findOne({ sessionId });
    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview session not found'
      });
    }

    const summary = await Violation.getViolationSummary(interview._id);

    // Get timeline data
    const timeline = await Violation.find({ sessionId })
      .select('type timestamp duration confidence severity')
      .sort({ timestamp: 1 });

    // Calculate statistics
    const stats = {
      totalViolations: await Violation.countDocuments({ sessionId }),
      focusViolations: await Violation.countDocuments({
        sessionId,
        type: { $in: ['focus_lost', 'looking_away', 'no_face_detected'] }
      }),
      objectViolations: await Violation.countDocuments({
        sessionId,
        type: { $in: ['phone_detected', 'book_detected', 'notes_detected', 'device_detected'] }
      }),
      behaviorViolations: await Violation.countDocuments({
        sessionId,
        type: { $in: ['multiple_faces', 'absence', 'eye_closure', 'background_voice'] }
      })
    };

    res.json({
      success: true,
      data: {
        summary,
        timeline,
        stats,
        integrityScore: interview.integrityScore
      }
    });
  } catch (error) {
    console.error('Error fetching violation summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch violation summary',
      error: error.message
    });
  }
};

// Bulk log violations (for batch processing)
const logBulkViolations = async (req, res) => {
  try {
    const { sessionId, violations } = req.body;

    // Find the interview
    const interview = await Interview.findOne({ sessionId });
    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview session not found'
      });
    }

    // Prepare violations for bulk insert
    const violationDocs = violations.map(v => ({
      ...v,
      interviewId: interview._id,
      sessionId,
      timestamp: v.timestamp ? new Date(v.timestamp) : new Date()
    }));

    const result = await Violation.insertMany(violationDocs);

    // Update interview counts
    const violationCount = await Violation.countDocuments({ sessionId });
    const focusLostCount = await Violation.countDocuments({
      sessionId,
      type: { $in: ['focus_lost', 'looking_away', 'no_face_detected'] }
    });

    interview.violationCount = violationCount;
    interview.focusLostCount = focusLostCount;
    interview.calculateIntegrityScore();
    await interview.save();

    res.status(201).json({
      success: true,
      message: `${result.length} violations logged successfully`,
      integrityScore: interview.integrityScore
    });
  } catch (error) {
    console.error('Error logging bulk violations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log violations',
      error: error.message
    });
  }
};

// Update violation (mark as resolved, etc.)
const updateViolation = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const violation = await Violation.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!violation) {
      return res.status(404).json({
        success: false,
        message: 'Violation not found'
      });
    }

    res.json({
      success: true,
      data: violation
    });
  } catch (error) {
    console.error('Error updating violation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update violation',
      error: error.message
    });
  }
};

module.exports = {
  logViolation,
  getViolations,
  getViolationSummary,
  logBulkViolations,
  updateViolation
};