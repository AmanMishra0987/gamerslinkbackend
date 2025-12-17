const mongoose = require('mongoose');

const connectionQueueSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: String,
  displayName: String,
  avatar: String,
  selectedGame: {
    type: String,
    required: true
  },
  videoEnabled: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['waiting', 'matched', 'cancelled'],
    default: 'waiting'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
  }
}, {
  timestamps: true
});

// Index for better query performance
connectionQueueSchema.index({ userId: 1 });
connectionQueueSchema.index({ status: 1, selectedGame: 1 });
connectionQueueSchema.index({ expiresAt: 1 });

// TTL index to automatically remove expired entries
connectionQueueSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ConnectionQueue', connectionQueueSchema);
