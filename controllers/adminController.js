const User = require('../models/User');
const Post = require('../models/Post');
const { Message } = require('../models/Message');
const Tournament = require('../models/Tournament');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');

// Get dashboard stats
const getDashboardStats = async (req, res) => {
  try {
    console.log('Getting dashboard stats...');
    
    // Get basic counts with error handling (excluding deleted items)
    // Only count users with isActive: true (treating isActive: false as deleted for all types)
    const totalUsers = await User.countDocuments({ isActive: true }).catch(() => 0);
    
    const totalPosts = await Post.countDocuments().catch(() => 0);
    const totalMessages = await Message.countDocuments({ isDeleted: { $ne: true } }).catch(() => 0);
    const totalTournaments = await Tournament.countDocuments().catch(() => 0);
    const totalNotifications = await Notification.countDocuments().catch(() => 0);
    
    // Get active users (last 24 hours, excluding deleted users)
    const activeUsers = await User.countDocuments({ 
      isActive: true,
      lastSeen: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
    }).catch(() => 0);
    
    // Get new items today (excluding deleted users)
    const newUsersToday = await User.countDocuments({ 
      isActive: true,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
    }).catch(() => 0);
    
    const newPostsToday = await Post.countDocuments({ 
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
    }).catch(() => 0);
    
    const newTournamentsToday = await Tournament.countDocuments({ 
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } 
    }).catch(() => 0);

    // Get user type breakdown (excluding deleted users)
    const userTypeStats = await User.aggregate([
      {
        $match: { isActive: true }
      },
      {
        $group: {
          _id: '$userType',
          count: { $sum: 1 }
        }
      }
    ]).catch(() => []);

    // Get post type breakdown
    const postTypeStats = await Post.aggregate([
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]).catch(() => []);

    // Get tournament status breakdown
    const tournamentStats = await Tournament.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]).catch(() => []);

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalPosts,
          totalMessages,
          totalTournaments,
          totalNotifications,
          activeUsers,
          newUsersToday,
          newPostsToday,
          newTournamentsToday
        },
        breakdowns: {
          userTypes: userTypeStats,
          postTypes: postTypeStats,
          tournamentStatuses: tournamentStats
        },
        server: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          timestamp: new Date()
        }
      }
    });
  } catch (error) {
    console.error('Admin dashboard stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch dashboard stats',
      error: error.message 
    });
  }
};

// Get user analytics
const getUserAnalytics = async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 1;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const userStats = await User.aggregate([
      {
        $match: { createdAt: { $gte: startDate } }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 },
          players: {
            $sum: { $cond: [{ $eq: ['$userType', 'player'] }, 1, 0] }
          },
          teams: {
            $sum: { $cond: [{ $eq: ['$userType', 'team'] }, 1, 0] }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ success: true, data: userStats });
  } catch (error) {
    console.error('User analytics error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch user analytics',
      error: error.message 
    });
  }
};

// Get system health
const getSystemHealth = async (req, res) => {
  try {
    // Test database connection
    const dbStatus = await mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    const health = {
      status: 'healthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      database: dbStatus,
      services: {
        api: 'running',
        socket: 'running',
        database: dbStatus
      },
      environment: process.env.NODE_ENV || 'development'
    };

    res.json({ success: true, data: health });
  } catch (error) {
    console.error('System health error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch system health',
      error: error.message 
    });
  }
};

// Get recent activities
const getRecentActivities = async (req, res) => {
  try {
    const activities = await Promise.all([
      User.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select('username profile.displayName createdAt userType isActive'),
      Post.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('author', 'username profile.displayName')
        .select('content type createdAt author'),
      Tournament.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('host', 'username profile.displayName')
        .select('name game status createdAt host')
    ]);

    res.json({
      success: true,
      data: {
        recentUsers: activities[0],
        recentPosts: activities[1],
        recentTournaments: activities[2]
      }
    });
  } catch (error) {
    console.error('Recent activities error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch recent activities',
      error: error.message 
    });
  }
};

// Get all users with pagination
const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const userType = req.query.userType || '';
    const isActive = req.query.isActive;

    const query = {
      // Exclude duo teams (temporary teams created for tournaments)
      username: { $not: /^duo_/ }
    };
    
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { 'profile.displayName': { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (userType) {
      query.userType = userType;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch users',
      error: error.message 
    });
  }
};

// Update user status
const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { isActive },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: user
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update user status',
      error: error.message 
    });
  }
};

// Delete user
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete user and related data
    await Promise.all([
      User.findByIdAndDelete(userId),
      Post.deleteMany({ author: userId }),
      Message.deleteMany({ $or: [{ sender: userId }, { receiver: userId }] }),
      Notification.deleteMany({ user: userId })
    ]);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete user',
      error: error.message 
    });
  }
};

// Get posts with pagination
const getPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const author = req.query.author || '';
    const isActive = req.query.isActive;

    const query = {};
    
    if (search) {
      query.$or = [
        { content: { $regex: search, $options: 'i' } },
        { 'author.username': { $regex: search, $options: 'i' } },
        { 'author.profile.displayName': { $regex: search, $options: 'i' } }
      ];
    }
    
    if (author) {
      query['author.userType'] = author;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const posts = await Post.find(query)
      .populate('author', 'username email profile.displayName profile.avatar userType')
      .select('content images likes comments createdAt updatedAt isActive author')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Post.countDocuments(query);

    res.json({
      success: true,
      data: {
        posts,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch posts',
      error: error.message 
    });
  }
};

// Delete post
const deletePost = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findByIdAndDelete(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    res.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete post',
      error: error.message 
    });
  }
};

// Tournament Management
const getTournaments = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query;
    
    let query = {};
    
    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { game: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Status filter
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const tournaments = await Tournament.find(query)
      .select('name description game startDate endDate totalSlots participants prizePool status isActive createdAt updatedAt host')
      .populate('host', 'username profile.displayName')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Tournament.countDocuments(query);

    res.json({
      success: true,
      tournaments,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get tournaments error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const deleteTournament = async (req, res) => {
  try {
    const { tournamentId } = req.params;
    
    const tournament = await Tournament.findByIdAndDelete(tournamentId);
    if (!tournament) {
      return res.status(404).json({ success: false, message: 'Tournament not found' });
    }

    res.json({ success: true, message: 'Tournament deleted successfully' });
  } catch (error) {
    console.error('Delete tournament error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = {
  getDashboardStats,
  getUserAnalytics,
  getSystemHealth,
  getRecentActivities,
  getUsers,
  updateUserStatus,
  deleteUser,
  getPosts,
  deletePost,
  getTournaments,
  deleteTournament
};
