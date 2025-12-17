const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { createServer } = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const { handleValidationErrors } = require('./middleware/validation');
const { setIoInstance } = require('./utils/notificationEmitter');
const jwt = require('jsonwebtoken');

// Import routes
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const notificationRoutes = require('./routes/notifications');
const tournamentRoutes = require('./routes/tournaments');
const leaveRequestRoutes = require('./routes/leaveRequests');
const randomConnectionRoutes = require('./routes/randomConnections');
const recruitmentRoutes = require('./routes/recruitment');
const adminRoutes = require('./routes/admin');
const feedbackRoutes = require('./routes/feedback');

// Connect to database
connectDB();

const app = express();

// Database connection check middleware
app.use((req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: 'Database connection not ready. Please try again in a moment.'
    });
  }
  next();
});
const server = createServer(app);

// Simple Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:3001", 
      "http://127.0.0.1:3000",
      "http://192.168.1.8:3000",
      "http://192.168.0.0/16",
      "http://10.0.0.0/8",
      "http://172.16.0.0/12",
      "https://arc-frontend-fyahengy.g2frdjbb.centralindia-01.azurewebsites.net",
      "https://arc-frontend.azurewebsites.net",
      "https://arc.squadhunt.com",
      "http://arc.squadhunt.com"
    ],
    methods: ["GET", "POST"],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

// Socket authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    console.log('Socket connection attempt with token:', !!token);
    
    if (!token) {
      console.error('Socket connection attempt without token');
      return next(new Error('Authentication token required'));
    }

    console.log('Verifying token...');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token decoded successfully:', { id: decoded.id, username: decoded.username });
    
    if (!decoded.id) {
      console.error('Socket connection attempt with invalid token (no userId)');
      return next(new Error('Invalid token: no userId'));
    }
    
    socket.userId = decoded.id;
    socket.user = decoded;
    console.log(`Socket authenticated successfully for user: ${decoded.id}`);
    next();
  } catch (error) {
    console.error('Socket authentication error:', error.message);
    console.error('Error details:', error);
    next(new Error('Authentication failed'));
  }
});

// Set io instance for notification emitter
setIoInstance(io);

// Set io instance for message controller
const { setIoInstance: setMessageIoInstance } = require('./controllers/messageController');
setMessageIoInstance(io);

// Make io available to routes
app.set('io', io);

// Simple user tracking
const connectedUsers = new Map();

// Security middleware
app.use(helmet());

// Rate limiting - more lenient for production
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Further increased limit for production
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// CORS for production deployment
app.use(cors({
  origin: [
    "http://localhost:3000", 
    "http://localhost:3001", 
    "http://127.0.0.1:3000",
    "http://192.168.1.8:3000",
    "http://192.168.0.0/16",
    "http://10.0.0.0/8",
    "http://172.16.0.0/12",
    "https://arc-frontend-fyahengy.g2frdjbb.centralindia-01.azurewebsites.net",
    "https://arc-frontend.azurewebsites.net",
    "https://arc.squadhunt.com",
    "http://arc.squadhunt.com"
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files for tournament banners
app.use('/uploads', express.static('uploads'));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Gaming Social Platform API is running!',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    connectedUsers: connectedUsers.size
  });
});

// Connection test route
app.get('/api/test-connection', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Connection test successful',
    timestamp: new Date().toISOString(),
    connectedUsers: connectedUsers.size
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/leave-requests', leaveRequestRoutes);
app.use('/api/random-connections', randomConnectionRoutes);
app.use('/api/recruitment', recruitmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/feedback', feedbackRoutes);

// Socket handling with duplicate connection management
io.on('connection', (socket) => {
  console.log('New socket connection:', socket.id);
  
  const userId = socket.userId;
  if (!userId) {
    console.log('No userId, disconnecting');
    socket.disconnect();
    return;
  }
  
// Track unique users and their connections
const userConnections = new Map(); // userId -> Set of socketIds

// Add this connection to user's connection set
if (!userConnections.has(userId)) {
  userConnections.set(userId, new Set());
}
userConnections.get(userId).add(socket.id);

// Track all connections
connectedUsers.set(socket.id, userId);

// Count unique users
const uniqueUserCount = userConnections.size;
console.log(`User ${userId} connected. Total connections: ${connectedUsers.size}, Unique users: ${uniqueUserCount}`);

  // Join user room
  socket.on('join-user-room', (userId) => {
    if (userId) {
      socket.join(`user-${userId}`);
      console.log(`User ${userId} joined their room`);
    }
  });

  // Handle ping
  socket.on('ping', () => {
    socket.emit('pong');
  });

  // Random Connect Events
  socket.on('join-random-queue', (data) => {
    try {
      const { selectedGame, videoEnabled } = data;
      
      if (!selectedGame) {
        console.error('Attempted to join random queue without selected game');
        return;
      }
      
      socket.join(`random-queue-${selectedGame}`);
    } catch (error) {
      console.error('Error joining random queue:', error);
    }
  });

  socket.on('leave-random-queue', (data) => {
    try {
      const { selectedGame } = data;
      
      if (!selectedGame) {
        console.error('Attempted to leave random queue without selected game');
        return;
      }
      
      socket.leave(`random-queue-${selectedGame}`);
    } catch (error) {
      console.error('Error leaving random queue:', error);
    }
  });

  socket.on('join-random-room', (roomId) => {
    try {
      if (!roomId) {
        console.error('Attempted to join random room without roomId');
        return;
      }
      
      socket.join(`random-room-${roomId}`);
      
      // Send confirmation back to the user
      socket.emit('room-joined', { roomId });
      
      // Notify other users in the room that someone joined
      socket.to(`random-room-${roomId}`).emit('user-joined-room', { 
        roomId, 
        userId 
      });
    } catch (error) {
      console.error('Error joining random room:', error);
    }
  });

  socket.on('leave-random-room', (roomId) => {
    try {
      if (!roomId) {
        console.error('Attempted to leave random room without roomId');
        return;
      }
      
      socket.leave(`random-room-${roomId}`);
    } catch (error) {
      console.error('Error leaving random room:', error);
    }
  });

  socket.on('random-connection-message', (data) => {
    try {
      const { roomId, message } = data;
      
      if (!roomId || !message) {
        console.error('Missing data for random connection message');
        return;
      }
      
      // Forward message to other users in the room
      socket.to(`random-room-${roomId}`).emit('random-connection-message', {
        sender: userId,
        message,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error handling random connection message:', error);
    }
  });

  socket.on('webrtc-signal', (data) => {
    try {
      const { roomId, signal, targetUserId } = data;
      
      if (!roomId || !targetUserId || !signal) {
        console.error('Missing data for WebRTC signal');
        return;
      }
      
      
      // Forward WebRTC signaling to target user
      io.to(`user-${targetUserId}`).emit('webrtc-signal', {
        signal,
        fromUserId: userId,
        roomId
      });
    } catch (error) {
      console.error('Error handling WebRTC signal:', error);
    }
  });

  socket.on('video-state-change', (data) => {
    try {
      const { roomId, videoEnabled, targetUserId } = data;
      
      if (!roomId || !targetUserId) {
        console.error('Missing data for video state change');
        return;
      }
      
      
      // Forward video state change to target user
      io.to(`user-${targetUserId}`).emit('video-state-change', {
        fromUserId: userId,
        videoEnabled
      });
    } catch (error) {
      console.error('Error handling video state change:', error);
    }
  });

  // Disconnect handling
  socket.on('disconnect', (reason) => {
    // Only log and cleanup if it's not a manual disconnect
    if (!socket._manualDisconnect) {
      console.log(`User ${userId} disconnected: ${reason}`);
    }
    
    // Remove from user connections
    if (userConnections.has(userId)) {
      userConnections.get(userId).delete(socket.id);
      // If no more connections for this user, remove the user entirely
      if (userConnections.get(userId).size === 0) {
        userConnections.delete(userId);
      }
    }
    
    // Remove from all connections
    connectedUsers.delete(socket.id);
    
    const uniqueUserCount = userConnections.size;
    console.log(`Remaining connections: ${connectedUsers.size}, Unique users: ${uniqueUserCount}`);
  });
});

// Validation error handler
app.use(handleValidationErrors);

// Global error handler
app.use(errorHandler);

// Additional comprehensive error handler for any unhandled errors
app.use((err, req, res, next) => {
  console.error('Express error handler caught:', err);
  
  // Don't crash the server, just send error response
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      message: 'Internal server error occurred',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Cleanup stale connections every 5 minutes
setInterval(() => {
  let cleanedCount = 0;
  for (const [socketId, userId] of connectedUsers.entries()) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket || !socket.connected) {
      connectedUsers.delete(socketId);
      
      // Also clean up userConnections
      if (userConnections.has(userId)) {
        userConnections.get(userId).delete(socketId);
        if (userConnections.get(userId).size === 0) {
          userConnections.delete(userId);
        }
      }
      
      cleanedCount++;
    }
  }
  if (cleanedCount > 0) {
    console.log(`Cleaned up ${cleanedCount} stale connections. Active: ${connectedUsers.size}, Unique users: ${userConnections.size}`);
  }
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 API Health: http://localhost:${PORT}/api/health`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.log('Unhandled Promise Rejection:', err.message);
  // Don't exit, just log
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log('Uncaught Exception:', err.message);
  // Don't exit, just log
});

module.exports = { app, io };
