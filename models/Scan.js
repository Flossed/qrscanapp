const mongoose = require('mongoose');

const scanSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false, // Make optional for existing scans
    index: true
  },
  content: {
    type: String,
    required: true
  },
  type: {
    type: String,
    default: 'text'
  },
  scannedAt: {
    type: Date,
    default: Date.now
  },
  deviceInfo: {
    type: String
  },
  isDuplicate: {
    type: Boolean,
    default: false
  },
  duplicateCount: {
    type: Number,
    default: 1
  },
  firstScannedAt: {
    type: Date,
    default: Date.now
  },
  verification: {
    isVerified: {
      type: Boolean,
      default: false
    },
    verifiedAt: {
      type: Date
    },
    verificationResult: {
      success: {
        type: Boolean
      },
      steps: [{
        name: String,
        size: Number,
        percentage: Number
      }],
      error: {
        message: String,
        step: String
      }
    },
    verificationCount: {
      type: Number,
      default: 0
    }
  }
});

module.exports = mongoose.model('Scan', scanSchema);