const mongoose = require('mongoose');

const violationSchema = new mongoose.Schema({
  interviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Interview',
    required: true
  },
  sessionId: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: [
      'focus_lost',
      'no_face_detected',
      'multiple_faces',
      'multiple_faces_detected',
      'phone_detected',
      'book_detected',
      'notes_detected',
      'device_detected',
      'unauthorized_item',
      'unauthorized_item_detected',
      'looking_away',
      'absence',
      'eye_closure',
      'background_voice'
    ],
    required: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  description: {
    type: String,
    required: true
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1
  },
  timestamp: {
    type: Date,
    required: true
  },
  duration: {
    type: Number // in seconds
  },
  screenshotPath: {
    type: String
  },
  evidencePath: {
    type: String
  },
  resolved: {
    type: Boolean,
    default: false
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  source: {
    type: String,
    enum: ['candidate_detection', 'interviewer_detection', 'system_detection', 'manual', 'unknown'],
    default: 'unknown'
  }
}, {
  timestamps: true
});

// Index for efficient querying
violationSchema.index({ interviewId: 1, timestamp: 1 });
violationSchema.index({ sessionId: 1, type: 1 });

// Static method to get violation summary
violationSchema.statics.getViolationSummary = async function (interviewId) {
  return await this.aggregate([
    { $match: { interviewId: new mongoose.Types.ObjectId(interviewId) } },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        avgConfidence: { $avg: '$confidence' },
        totalDuration: { $sum: '$duration' }
      }
    }
  ]);
};

module.exports = mongoose.model('Violation', violationSchema);