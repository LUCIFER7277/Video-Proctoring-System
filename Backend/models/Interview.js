const mongoose = require('mongoose');

const interviewSchema = new mongoose.Schema({
  candidateName: {
    type: String,
    required: true
  },
  candidateEmail: {
    type: String,
    required: true
  },
  interviewerName: {
    type: String,
    required: true
  },
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date
  },
  duration: {
    type: Number // in minutes
  },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'terminated'],
    default: 'scheduled'
  },
  videoRecordingPath: {
    type: String
  },
  audioRecordingPath: {
    type: String
  },
  integrityScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 100
  },
  focusLostCount: {
    type: Number,
    default: 0
  },
  violationCount: {
    type: Number,
    default: 0
  },
  reportPath: {
    type: String
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

interviewSchema.methods.calculateIntegrityScore = function() {
  let score = 100;

  // Deduct 5 points for each focus loss
  score -= this.focusLostCount * 5;

  // Deduct 10 points for each violation
  score -= this.violationCount * 10;

  // Ensure score doesn't go below 0
  score = Math.max(0, score);

  this.integrityScore = score;
  return score;
};

module.exports = mongoose.model('Interview', interviewSchema);