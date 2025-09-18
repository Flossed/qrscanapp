const mongoose = require('mongoose');

const referenceSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true
  },
  name: {
    type: String,
    default: 'Reference QR Code'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

module.exports = mongoose.model('Reference', referenceSchema);