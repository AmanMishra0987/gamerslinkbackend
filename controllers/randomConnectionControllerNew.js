const User = require('../models/User');
const RandomConnection = require('../models/RandomConnection');
const ConnectionQueue = require('../models/ConnectionQueue');
const { v4: uuidv4 } = require('uuid');

// Join the random connection queue
const joinQueue = async (req, res) => {
  try {
    const { selectedGame, videoEnabled = true } = req.body;
    const userId = req.user._id;

    console.log(`User ${userId} joining queue for ${selectedGame}`);

    // Validate input
    if (!selectedGame) {
      return res.status(400).json({
        success: false,
        message: 'Game selection is required'
      });
    }

    // Clean up any existing connections first
    await cleanupExistingConnections(userId, req.app.get('io'));

    // Check if user is already in queue
    const existingInQueue = await ConnectionQueue.findOne({
      userId,
      status: 'waiting'
    });

    if (existingInQueue) {
      console.log(`User ${userId} already in queue, updating preferences`);
      existingInQueue.selectedGame = selectedGame;
      existingInQueue.videoEnabled = videoEnabled;
      existingInQueue.updatedAt = new Date();
      await existingInQueue.save();
    } else {
      // Add user to queue
      await ConnectionQueue.create({
        userId,
        username: req.user.username,
        displayName: req.user.profile.displayName,
        avatar: req.user.profile.avatar,
        selectedGame,
        videoEnabled
      });
      console.log(`User ${userId} added to queue for game ${selectedGame}`);
    }

    // Try to find a match immediately
    const match = await findMatch(userId, selectedGame);
    
    if (match) {
      console.log(`Instant match found for ${userId} with ${match.userId}`);
      
      // Create connection
      const roomId = uuidv4();
      const connection = await RandomConnection.create({
        roomId,
        participants: [
          {
            userId,
            username: req.user.username,
            displayName: req.user.profile.displayName,
            avatar: req.user.profile.avatar,
            videoEnabled
          },
          {
            userId: match.userId,
            username: match.username,
            displayName: match.displayName,
            avatar: match.avatar,
            videoEnabled: match.videoEnabled
          }
        ],
        selectedGame,
        status: 'active',
        createdBy: userId
      });

      // Remove both users from queue
      await ConnectionQueue.deleteMany({
        userId: { $in: [userId, match.userId] }
      });

      // Emit socket events
      const io = req.app.get('io');
      if (io) {
        const connectionData = {
          roomId: connection.roomId,
          participants: connection.participants,
          selectedGame
        };

        io.to(`user-${userId}`).emit('connection-matched', connectionData);
        io.to(`user-${match.userId}`).emit('connection-matched', connectionData);
      }

      return res.status(200).json({
        success: true,
        message: 'Connection established!',
        connection: connection,
        matched: true
      });
    }

    // No immediate match found, user is in queue
    res.status(200).json({
      success: true,
      message: 'Added to queue. Waiting for match...',
      matched: false
    });

  } catch (error) {
    console.error('Join queue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to join queue',
      error: error.message
    });
  }
};

// Clean up existing connections for a user
const cleanupExistingConnections = async (userId, io) => {
  try {
    // Check if user is already in an active connection
    const activeConnection = await RandomConnection.findOne({
      'participants.userId': userId,
      status: { $in: ['waiting', 'active'] }
    });

    if (activeConnection) {
      console.log(`Cleaning up existing connection for user ${userId}`);
      
      // Update connection status
      activeConnection.status = 'disconnected';
      activeConnection.endTime = new Date();
      activeConnection.duration = Math.floor((activeConnection.endTime - activeConnection.startTime) / 1000);
      
      // Mark user as left
      const participant = activeConnection.participants.find(p => p.userId.toString() === userId.toString());
      if (participant) {
        participant.leftAt = new Date();
      }

      await activeConnection.save();

      // Notify other participants
      if (io) {
        const otherParticipants = activeConnection.participants.filter(p => p.userId.toString() !== userId.toString());
        otherParticipants.forEach(participant => {
          io.to(`user-${participant.userId}`).emit('partner-disconnected', {
            roomId: activeConnection.roomId,
            disconnectedUserId: userId,
            reason: 'User left'
          });
        });
      }
    }

    // Remove user from any existing queue entries
    await ConnectionQueue.deleteMany({ userId });
    
  } catch (error) {
    console.error('Cleanup existing connections error:', error);
  }
};

// Find a suitable match
const findMatch = async (userId, selectedGame) => {
  try {
    const potentialMatches = await ConnectionQueue.find({
      userId: { $ne: userId },
      selectedGame,
      status: 'waiting'
    }).sort({ createdAt: 1 });

    if (potentialMatches.length > 0) {
      const match = potentialMatches[0];
      console.log(`Matched user ${userId} with ${match.userId} for ${selectedGame}`);
      
      return {
        userId: match.userId,
        username: match.username,
        displayName: match.displayName,
        avatar: match.avatar,
        videoEnabled: match.videoEnabled
      };
    }

    return null;
  } catch (error) {
    console.error('Find match error:', error);
    return null;
  }
};

// Leave the queue
const leaveQueue = async (req, res) => {
  try {
    const userId = req.user._id;

    console.log(`User ${userId} leaving queue`);

    // Remove user from queue
    const result = await ConnectionQueue.deleteOne({
      userId,
      status: 'waiting'
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'You are not in the queue'
      });
    }

    console.log(`User ${userId} successfully left queue`);

    res.status(200).json({
      success: true,
      message: 'Left the queue successfully'
    });

  } catch (error) {
    console.error('Leave queue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to leave queue',
      error: error.message
    });
  }
};

// Get current connection
const getCurrentConnection = async (req, res) => {
  try {
    const userId = req.user._id;

    const connection = await RandomConnection.findOne({
      'participants.userId': userId,
      status: { $in: ['waiting', 'active'] }
    }).populate('participants.userId', 'username profile.displayName profile.avatar');

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'No active connection found'
      });
    }

    res.status(200).json({
      success: true,
      connection
    });

  } catch (error) {
    console.error('Get current connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get current connection',
      error: error.message
    });
  }
};

// Disconnect from current connection
const disconnectConnection = async (req, res) => {
  try {
    const userId = req.user._id;
    const { roomId } = req.body;

    console.log(`User ${userId} disconnecting from room ${roomId}`);

    const connection = await RandomConnection.findOne({
      roomId,
      'participants.userId': userId,
      status: { $in: ['waiting', 'active'] }
    });

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: 'Connection not found'
      });
    }

    // Update connection status
    connection.status = 'disconnected';
    connection.endTime = new Date();
    connection.duration = Math.floor((connection.endTime - connection.startTime) / 1000);
    
    // Mark user as left
    const participant = connection.participants.find(p => p.userId.toString() === userId.toString());
    if (participant) {
      participant.leftAt = new Date();
    }

    await connection.save();

    // Get other participants
    const otherParticipants = connection.participants.filter(p => p.userId.toString() !== userId.toString());

    // Notify other participants
    const io = req.app.get('io');
    if (io) {
      otherParticipants.forEach(participant => {
        io.to(`user-${participant.userId}`).emit('partner-disconnected', {
          roomId,
          disconnectedUserId: userId,
          reason: 'User disconnected'
        });
      });
    }

    console.log(`User ${userId} disconnected from room ${roomId}`);

    res.status(200).json({
      success: true,
      message: 'Disconnected successfully'
    });

  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect',
      error: error.message
    });
  }
};

// Cleanup user's current connection
const cleanupCurrentConnection = async (req, res) => {
  try {
    const userId = req.user._id;
    console.log(`Cleaning up current connection for user ${userId}`);

    // Find and cleanup any active connections
    const activeConnection = await RandomConnection.findOne({
      'participants.userId': userId,
      status: { $in: ['waiting', 'active'] }
    });

    if (activeConnection) {
      console.log(`Found active connection ${activeConnection.roomId} for user ${userId}`);
      
      // Update connection status
      activeConnection.status = 'disconnected';
      activeConnection.endTime = new Date();
      activeConnection.duration = Math.floor((activeConnection.endTime - activeConnection.startTime) / 1000);
      
      // Mark user as left
      const participant = activeConnection.participants.find(p => p.userId.toString() === userId.toString());
      if (participant) {
        participant.leftAt = new Date();
      }

      await activeConnection.save();

      // Notify other participants
      const io = req.app.get('io');
      if (io) {
        const otherParticipants = activeConnection.participants.filter(p => p.userId.toString() !== userId.toString());
        otherParticipants.forEach(participant => {
          io.to(`user-${participant.userId}`).emit('partner-disconnected', {
            roomId: activeConnection.roomId,
            disconnectedUserId: userId,
            reason: 'User left'
          });
        });
      }

      console.log(`Connection ${activeConnection.roomId} cleaned up for user ${userId}`);
    }

    // Remove user from any queue
    await ConnectionQueue.deleteMany({ userId });

    res.status(200).json({
      success: true,
      message: 'Connection cleaned up successfully'
    });

  } catch (error) {
    console.error('Cleanup current connection error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup connection',
      error: error.message
    });
  }
};

module.exports = {
  joinQueue,
  leaveQueue,
  getCurrentConnection,
  disconnectConnection,
  cleanupCurrentConnection
};
