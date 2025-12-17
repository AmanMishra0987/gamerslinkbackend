const User = require('../models/User');
const RandomConnection = require('../models/RandomConnection');
const ConnectionQueue = require('../models/ConnectionQueue');
const { v4: uuidv4 } = require('uuid');

// Join the random connection queue
const joinQueue = async (req, res) => {
  try {
    const { selectedGame, videoEnabled = true } = req.body;
    const userId = req.user._id;

    // Validate input
    if (!selectedGame) {
      return res.status(400).json({
        success: false,
        message: 'Game selection is required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    console.log(`User ${userId} attempting to join queue for ${selectedGame}`);

    // Clean up any existing connections first
    await cleanupExistingConnections(userId, req.app.get('io'));

    // Check if user is already in queue
    const existingInQueue = await ConnectionQueue.findOne({
      userId,
      status: 'waiting'
    });

    if (existingInQueue) {
      console.log(`User ${userId} already in queue, updating preferences`);
      // Update existing queue entry
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
      
      // Create connection immediately
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

      console.log(`Connection created with room ID: ${roomId}`);

      // Remove both users from queue
      await ConnectionQueue.deleteMany({
        userId: { $in: [userId, match.userId] }
      });

      // Emit socket events for both users
      const io = req.app.get('io');
      if (io) {
        // Emit to specific user rooms
        io.to(`user-${userId}`).emit('connection-matched', {
          roomId: connection.roomId,
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
          selectedGame
        });
        
        io.to(`user-${match.userId}`).emit('connection-matched', {
          roomId: connection.roomId,
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
          selectedGame
        });
        
        // Join both users to the room
        const userSocket1 = Array.from(io.sockets.sockets.values()).find(s => 
          s.userId === userId
        );
        const userSocket2 = Array.from(io.sockets.sockets.values()).find(s => 
          s.userId === match.userId
        );
        
        if (userSocket1) {
          userSocket1.join(`random-room-${connection.roomId}`);
        }
        
        if (userSocket2) {
          userSocket2.join(`random-room-${connection.roomId}`);
        }
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
    }).sort({ createdAt: 1 }); // FIFO order

    if (potentialMatches.length > 0) {
      // Return the first available match (FIFO)
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
    console.log(`Connection ${roomId} marked as disconnected for user ${userId}`);

    // Get other participants before cleanup
    const otherParticipants = connection.participants.filter(p => p.userId.toString() !== userId.toString());

    // Notify other participants immediately
    const io = req.app.get('io');
    if (io) {
      otherParticipants.forEach(participant => {
        console.log(`Notifying user ${participant.userId} about disconnect`);
        io.to(`user-${participant.userId}`).emit('partner-disconnected', {
          roomId,
          disconnectedUserId: userId,
          reason: 'User disconnected'
        });

        // Auto-rejoin remaining user to queue with better error handling
        setTimeout(async () => {
          try {
            console.log(`Auto-rejoining user ${participant.userId} to queue after disconnect`);
            
            // Check if user is already in queue to prevent duplicates
            const existingQueueEntry = await ConnectionQueue.findOne({
              userId: participant.userId,
              status: 'waiting'
            });
            
            if (existingQueueEntry) {
              console.log(`User ${participant.userId} already in queue, skipping auto-rejoin`);
              return;
            }
            
            // Get user data for re-queue
            const user = await User.findById(participant.userId);
            if (!user) {
              console.error(`User ${participant.userId} not found for auto-rejoin`);
              return;
            }

            // Add user back to queue with camera OFF by default
            await ConnectionQueue.create({
              userId: participant.userId,
              username: user.username,
              displayName: user.profile.displayName,
              avatar: user.profile.avatar,
              selectedGame: connection.selectedGame,
              videoEnabled: false // Camera off by default after disconnect
            });

            console.log(`User ${participant.userId} automatically added back to queue for ${connection.selectedGame}`);

            // Try to find a new match immediately
            const newMatch = await findMatch(participant.userId, connection.selectedGame);
            
            if (newMatch) {
              console.log(`Auto-match found for ${participant.userId} with ${newMatch.userId}`);
              
              // Create new connection
              const newRoomId = uuidv4();
              const newConnection = await RandomConnection.create({
                roomId: newRoomId,
                participants: [
                  {
                    userId: participant.userId,
                    username: user.username,
                    displayName: user.profile.displayName,
                    avatar: user.profile.avatar,
                    videoEnabled: participant.videoEnabled
                  },
                  {
                    userId: newMatch.userId,
                    username: newMatch.username,
                    displayName: newMatch.displayName,
                    avatar: newMatch.avatar,
                    videoEnabled: newMatch.videoEnabled
                  }
                ],
                selectedGame: connection.selectedGame,
                status: 'active',
                startTime: new Date()
              });

              // Remove both users from queue
              await ConnectionQueue.deleteMany({
                userId: { $in: [participant.userId, newMatch.userId] }
              });

              // Notify both users about new connection
              io.to(`user-${participant.userId}`).emit('connection-matched', {
                roomId: newConnection.roomId,
                participants: [
                  {
                    userId: participant.userId,
                    username: user.username,
                    displayName: user.profile.displayName,
                    avatar: user.profile.avatar,
                    videoEnabled: participant.videoEnabled
                  },
                  {
                    userId: newMatch.userId,
                    username: newMatch.username,
                    displayName: newMatch.displayName,
                    avatar: newMatch.avatar,
                    videoEnabled: newMatch.videoEnabled
                  }
                ],
                selectedGame: connection.selectedGame
              });

              io.to(`user-${newMatch.userId}`).emit('connection-matched', {
                roomId: newConnection.roomId,
                participants: [
                  {
                    userId: participant.userId,
                    username: user.username,
                    displayName: user.profile.displayName,
                    avatar: user.profile.avatar,
                    videoEnabled: participant.videoEnabled
                  },
                  {
                    userId: newMatch.userId,
                    username: newMatch.username,
                    displayName: newMatch.displayName,
                    avatar: newMatch.avatar,
                    videoEnabled: newMatch.videoEnabled
                  }
                ],
                selectedGame: connection.selectedGame
              });

              console.log(`Auto-connection ${newConnection.roomId} created successfully for ${participant.userId} and ${newMatch.userId}`);
            } else {
              console.log(`No immediate match found for ${participant.userId}, added to queue for future matching`);
              
              // Notify user they're back in queue
              io.to(`user-${participant.userId}`).emit('rejoined-queue', {
                selectedGame: connection.selectedGame,
                message: 'Looking for next random user...'
              });
            }
          } catch (autoRejoinError) {
            console.error(`Error during auto-rejoin for user ${participant.userId}:`, autoRejoinError);
            // Don't retry auto-rejoin to prevent infinite loops
          }
        }, 2000); // Increased delay to ensure disconnect event is processed first
      });
    }

    console.log(`User ${userId} disconnected from room ${roomId}, auto-queue initiated for remaining users`);

    res.status(200).json({
      success: true,
      message: 'Disconnected successfully, remaining users automatically queued for new matches'
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

// Auto-rejoin queue for remaining user when partner disconnects
const autoRejoinQueue = async (userId, selectedGame, videoEnabled, io) => {
  try {
    console.log(`Auto-rejoining user ${userId} to queue for ${selectedGame}`);
    
    // Check if user is already in queue to prevent duplicates
    const existingQueueEntry = await ConnectionQueue.findOne({
      userId,
      status: 'waiting'
    });
    
    if (existingQueueEntry) {
      console.log(`User ${userId} already in queue, skipping auto-rejoin`);
      return;
    }
    
    // Get user data first
    const user = await User.findById(userId);
    if (!user) {
      console.error(`User ${userId} not found for auto-rejoin`);
      return;
    }
    
    // Add user back to queue with camera OFF by default
    await ConnectionQueue.create({
      userId,
      username: user.username,
      displayName: user.profile.displayName,
      avatar: user.profile.avatar,
      selectedGame,
      videoEnabled: false // Camera off by default after disconnect
    });

    // Try to find a new match immediately
    const match = await findMatch(userId, selectedGame);
    
    if (match) {
      console.log(`Auto-match found for ${userId} with ${match.userId}`);
      
      // Create new connection
      const roomId = uuidv4();
      const connection = await RandomConnection.create({
        roomId,
        participants: [
          {
            userId,
            username: user.username,
            displayName: user.profile.displayName,
            avatar: user.profile.avatar,
            videoEnabled: false // Camera off by default after disconnect
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
      if (io) {
        console.log(`Auto-rejoin: Emitting connection-matched to user ${userId} and ${match.userId}`);
        
        io.to(`user-${userId}`).emit('connection-matched', {
          roomId: connection.roomId,
          participants: [
            {
              userId,
              username: user.username,
              displayName: user.profile.displayName,
              avatar: user.profile.avatar,
              videoEnabled: false
            },
            {
              userId: match.userId,
              username: match.username,
              displayName: match.displayName,
              avatar: match.avatar,
              videoEnabled: match.videoEnabled
            }
          ],
          selectedGame
        });
        
        io.to(`user-${match.userId}`).emit('connection-matched', {
          roomId: connection.roomId,
          participants: [
            {
              userId,
              username: user.username,
              displayName: user.profile.displayName,
              avatar: user.profile.avatar,
              videoEnabled: false
            },
            {
              userId: match.userId,
              username: match.username,
              displayName: match.displayName,
              avatar: match.avatar,
              videoEnabled: match.videoEnabled
            }
          ],
          selectedGame
        });
        
        // Join both users to the room
        const userSocket1 = Array.from(io.sockets.sockets.values()).find(s => 
          s.userId === userId
        );
        const userSocket2 = Array.from(io.sockets.sockets.values()).find(s => 
          s.userId === match.userId
        );
        
        if (userSocket1) {
          userSocket1.join(`random-room-${connection.roomId}`);
          console.log(`Auto-rejoin: User ${userId} joined room ${connection.roomId}`);
        }
        
        if (userSocket2) {
          userSocket2.join(`random-room-${connection.roomId}`);
          console.log(`Auto-rejoin: User ${match.userId} joined room ${connection.roomId}`);
        }
      }
    } else {
      // No immediate match, notify user they're back in queue
      if (io) {
        console.log(`Notifying user ${userId} they're back in queue`);
        io.to(`user-${userId}`).emit('rejoined-queue', {
          selectedGame,
          message: 'Looking for next random user...'
        });
      }
    }
    
  } catch (error) {
    console.error('Auto-rejoin queue error:', error);
    // Don't retry to prevent infinite loops
  }
};

// Send message in random connection
const sendMessage = async (req, res) => {
  try {
    const userId = req.user._id;
    const { roomId, message } = req.body;

    if (!message || !roomId) {
      return res.status(400).json({
        success: false,
        message: 'Room ID and message are required'
      });
    }

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

    // Add message to connection
    connection.messages.push({
      sender: userId,
      message,
      timestamp: new Date()
    });

    await connection.save();

    // Emit message to other participants
    const io = req.app.get('io');
    if (io) {
      const otherParticipants = connection.participants.filter(p => p.userId.toString() !== userId.toString());
      otherParticipants.forEach(participant => {
        io.to(`user-${participant.userId}`).emit('random-connection-message', {
          roomId,
          sender: userId,
          message,
          timestamp: new Date()
        });
      });
    }

    res.status(200).json({
      success: true,
      message: 'Message sent successfully'
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
};

// Get connection history
const getConnectionHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10 } = req.query;

    const connections = await RandomConnection.find({
      'participants.userId': userId,
      status: { $in: ['ended', 'disconnected'] }
    })
    .populate('participants.userId', 'username profile.displayName profile.avatar')
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);

    const total = await RandomConnection.countDocuments({
      'participants.userId': userId,
      status: { $in: ['ended', 'disconnected'] }
    });

    res.status(200).json({
      success: true,
      connections,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });

  } catch (error) {
    console.error('Get connection history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get connection history',
      error: error.message
    });
  }
};

// Cleanup all active connections for a user (used on logout)
const cleanupUserConnections = async (req, res) => {
  try {
    const userId = req.user.id;

    // Find all active connections for the user
    const activeConnections = await RandomConnection.find({
      'participants.userId': userId,
      status: { $in: ['waiting', 'active'] }
    });

    // Update each connection and notify other participants
    for (const connection of activeConnections) {
      connection.status = 'disconnected';
      connection.endTime = new Date();
      connection.duration = Math.floor((connection.endTime - connection.startTime) / 1000);
      
      // Mark user as left
      const participant = connection.participants.find(p => p.userId.toString() === userId.toString());
      if (participant) {
        participant.leftAt = new Date();
      }

      await connection.save();

      // Notify other participants
      const io = req.app.get('io');
      if (io) {
        const otherParticipants = connection.participants.filter(p => p.userId.toString() !== userId.toString());
        otherParticipants.forEach(participant => {
          io.to(`user-${participant.userId}`).emit('partner-disconnected', {
            roomId: connection.roomId,
            disconnectedUserId: userId,
            reason: 'User logged out'
          });
        });
      }
    }

    // Remove user from any queue
    await ConnectionQueue.deleteMany({ userId });

    res.status(200).json({
      success: true,
      message: 'All connections cleaned up successfully',
      cleanedConnections: activeConnections.length
    });

  } catch (error) {
    console.error('Cleanup connections error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup connections'
    });
  }
};

// Debug endpoint to check queue status
const getQueueStatus = async (req, res) => {
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
};

// Cleanup user's current connection (used when user refreshes or navigates away)
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
  sendMessage,
  getConnectionHistory,
  cleanupUserConnections,
  autoRejoinQueue,
  getQueueStatus,
  cleanupCurrentConnection
};
