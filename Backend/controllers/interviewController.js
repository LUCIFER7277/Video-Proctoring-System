const Interview = require('../models/Interview');
const Violation = require('../models/Violation');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs').promises;

const createInterview = async (req, res) => {
  try {
    const { candidateName, candidateEmail, interviewerName } = req.body;

    const sessionId = uuidv4();

    const interview = new Interview({
      candidateName,
      candidateEmail,
      interviewerName,
      sessionId,
      startTime: new Date(),
      status: 'scheduled'
    });

    await interview.save();

    res.status(201).json({
      success: true,
      data: interview,
      sessionId
    });
  } catch (error) {
    console.error('Error creating interview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create interview session',
      error: error.message
    });
  }
};

const startInterview = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const interview = await Interview.findOne({ sessionId });
    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview session not found'
      });
    }

    interview.status = 'in_progress';
    interview.startTime = new Date();
    await interview.save();

    res.json({
      success: true,
      data: interview
    });
  } catch (error) {
    console.error('Error starting interview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start interview',
      error: error.message
    });
  }
};

const endInterview = async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log('Ending interview for sessionId:', sessionId);
    console.log('Request method:', req.method);
    console.log('Request headers:', req.headers);

    const interview = await Interview.findOne({ sessionId });
    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview session not found'
      });
    }

    // Add a small delay to ensure any pending violations are saved
    // This prevents race conditions during interview ending
    await new Promise(resolve => setTimeout(resolve, 1000));

    const endTime = new Date();
    const duration = Math.round((endTime - interview.startTime) / (1000 * 60));

    const violationCount = await Violation.countDocuments({ sessionId });
    const focusLostCount = await Violation.countDocuments({
      sessionId,
      type: { $in: ['focus_lost', 'looking_away', 'no_face_detected'] }
    });

    interview.endTime = endTime;
    interview.duration = duration;
    interview.status = 'completed';
    interview.violationCount = violationCount;
    interview.focusLostCount = focusLostCount;

    interview.calculateIntegrityScore();

    await interview.save();

    res.json({
      success: true,
      data: interview
    });
  } catch (error) {
    console.error('Error ending interview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to end interview',
      error: error.message
    });
  }
};

const getInterview = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const interview = await Interview.findOne({ sessionId });
    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview session not found'
      });
    }

    const violations = await Violation.find({ sessionId }).sort({ timestamp: 1 });
    const violationSummary = await Violation.getViolationSummary(interview._id);

    res.json({
      success: true,
      data: {
        interview,
        violations,
        violationSummary
      }
    });
  } catch (error) {
    console.error('Error fetching interview:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch interview data',
      error: error.message
    });
  }
};

const uploadRecording = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No video file uploaded'
      });
    }

    const interview = await Interview.findOne({ sessionId });
    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Interview session not found'
      });
    }

    const videoPath = `/uploads/recordings/${req.file.filename}`;
    interview.videoRecordingPath = videoPath;
    await interview.save();

    res.json({
      success: true,
      message: 'Video uploaded successfully',
      videoPath
    });
  } catch (error) {
    console.error('Error uploading video:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload video',
      error: error.message
    });
  }
};

const getAllInterviews = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const filter = {};
    if (status) filter.status = status;

    const interviews = await Interview.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Interview.countDocuments(filter);

    res.json({
      success: true,
      data: interviews,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching interviews:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch interviews',
      error: error.message
    });
  }
};

module.exports = {
  createInterview,
  startInterview,
  endInterview,
  getInterview,
  uploadRecording,
  getAllInterviews
};