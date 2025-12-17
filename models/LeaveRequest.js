const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema({
  team: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  staffMember: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reason: {
    type: String,
    maxlength: [500, 'Reason cannot exceed 500 characters'],
    default: ''
  },
  adminResponse: {
    type: String,
    maxlength: [500, 'Admin response cannot exceed 500 characters'],
    default: ''
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  respondedAt: {
    type: Date,
    default: null
  },
  respondedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  leftDate: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for better query performance
leaveRequestSchema.index({ team: 1, status: 1 });
leaveRequestSchema.index({ staffMember: 1, status: 1 });
leaveRequestSchema.index({ createdAt: -1 });

// Ensure only one pending request per staff member per team
leaveRequestSchema.index({ team: 1, staffMember: 1, status: 1 }, { unique: true });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
