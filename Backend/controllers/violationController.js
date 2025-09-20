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
      source = 'unknown',
      metadata
    } = req.body;

    console.log('📝 Logging violation:', {
      sessionId,
      type,
      description,
      severity,
      source,
      hasMetadata: !!metadata
    });

    // Find the interview
    const interview = await Interview.findOne({ sessionId });
    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview session not found'
      });
    }

    // Parse metadata if it's a string
    let parsedMetadata = metadata;
    if (typeof metadata === 'string') {
      try {
        parsedMetadata = JSON.parse(metadata);
      } catch (e) {
        console.warn('Failed to parse metadata JSON:', e.message);
        parsedMetadata = { raw: metadata };
      }
    }

    // Create violation record with enhanced data
    const violation = new Violation({
      interviewId: interview._id,
      sessionId,
      type,
      description,
      confidence: parseFloat(confidence) || 0.5,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      duration: parseFloat(duration) || 0,
      severity,
      source,
      metadata: parsedMetadata || {}
    });

    // Handle screenshot if provided
    if (req.file) {
      violation.screenshotPath = `/uploads/evidence/${req.file.filename}`;
      console.log('📸 Screenshot saved:', violation.screenshotPath);
    }

    await violation.save();
    console.log('✅ Violation saved to database:', violation._id);

    // Update interview violation count with more comprehensive tracking
    const violationCount = await Violation.countDocuments({ sessionId });
    const focusLostCount = await Violation.countDocuments({
      sessionId,
      type: { $in: ['focus_lost', 'looking_away', 'no_face_detected', 'multiple_faces_detected'] }
    });
    const objectViolations = await Violation.countDocuments({
      sessionId,
      type: { $in: ['unauthorized_item', 'phone_detected', 'book_detected', 'notes_detected', 'device_detected'] }
    });

    interview.violationCount = violationCount;
    interview.focusLostCount = focusLostCount;
    interview.objectViolationCount = objectViolations;
    interview.calculateIntegrityScore();
    await interview.save();

    console.log('📊 Interview stats updated:', {
      violationCount,
      focusLostCount,
      objectViolations,
      integrityScore: interview.integrityScore
    });

    res.status(201).json({
      success: true,
      data: violation,
      integrityScore: interview.integrityScore,
      stats: {
        totalViolations: violationCount,
        focusViolations: focusLostCount,
        objectViolations: objectViolations
      }
    });
  } catch (error) {
    console.error('❌ Error logging violation:', error);
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