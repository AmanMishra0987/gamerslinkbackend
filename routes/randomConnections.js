const express = require('express');
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const {
  joinQueue,
  leaveQueue,
  getCurrentConnection,
  disconnectConnection,
  sendMessage,
  getConnectionHistory,
  cleanupUserConnections,
  getQueueStatus,
  cleanupCurrentConnection
} = require('../controllers/randomConnectionController');

const ConnectionQueue = require('../models/ConnectionQueue');
const RandomConnection = require('../models/RandomConnection');

const router = express.Router();

// Test endpoint to check queue status (no auth required for testing)
router.get('/queue-status', async (req, res) => {
  try {
    const queueCount = await ConnectionQueue.countDocuments({ status: 'waiting' });
    const activeConnections = await RandomConnection.countDocuments({ status: 'active' });
    
    res.status(200).json({
      success: true,
      queueCount,
      activeConnections,
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get queue status',
      error: error.message
    });
  }
});

// Debug endpoint to get detailed queue status (no auth required for testing)
router.get('/debug-queue-status', async (req, res) => {
  try {
    const queueEntries = await ConnectionQueue.find({ status: 'waiting' }).sort({ createdAt: 1 });
    const activeConnections = await RandomConnection.find({ status: 'active' });
    
    res.status(200).json({
      success: true,
      queueEntries: queueEntries.map(entry => ({
        userId: entry.userId,
        username: entry.username,
        selectedGame: entry.selectedGame,
        videoEnabled: entry.videoEnabled,
        createdAt: entry.createdAt
      })),
      activeConnections: activeConnections.map(conn => ({
        roomId: conn.roomId,
        participants: conn.participants.map(p => ({
          userId: p.userId,
          username: p.username
        })),
        selectedGame: conn.selectedGame,
        createdAt: conn.createdAt
      })),
      queueCount: queueEntries.length,
      activeConnectionCount: activeConnections.length
    });
  } catch (error) {
    console.error('Get queue status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get queue status',
      error: error.message
    });
  }
});

// All routes require authentication except test endpoints
router.use(protect);

// Validation middleware
const joinQueueValidation = [
  body('selectedGame')
    .notEmpty()
    .withMessage('Game selection is required'),
  body('videoEnabled')
    .optional()
    .isBoolean()
    .withMessage('Video enabled must be a boolean')
];

const sendMessageValidation = [
  body('roomId')
    .notEmpty()
    .withMessage('Room ID is required'),
  body('message')
    .notEmpty()
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage('Message must be between 1 and 500 characters')
];

const disconnectValidation = [
  body('roomId')
    .notEmpty()
    .withMessage('Room ID is required')
];

// Routes
router.post('/join-queue', protect, joinQueueValidation, joinQueue);
router.delete('/leave-queue', protect, leaveQueue);
router.get('/current-connection', protect, getCurrentConnection);
router.post('/disconnect', protect, disconnectValidation, disconnectConnection);
router.post('/send-message', protect, sendMessageValidation, sendMessage);
router.get('/history', protect, getConnectionHistory);
router.post('/cleanup', protect, cleanupUserConnections);
router.post('/cleanup-current', protect, cleanupCurrentConnection);

module.exports = router;
