const { verifyToken, extractToken } = require('../utils/jwt');
const User = require('../models/User');
const mongoose = require('mongoose');

// Protect routes - require authentication
const protect = async (req, res, next) => {
  try {
    // Check if database is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database connection not ready. Please try again in a moment.'
      });
    }

    const token = extractToken(req);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = verifyToken(token);
    
    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format.'
      });
    }

    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token is valid but user no longer exists.'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User account is deactivated.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }
};

// Role-based access control
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Please login first.'
      });
    }

    if (!roles.includes(req.user.userType)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. This resource is only available to ${roles.join(', ')} users.`
      });
    }

    next();
  };
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    
    if (token) {
      try {
        const decoded = verifyToken(token);
        if (decoded && decoded.id) {
          const user = await User.findById(decoded.id).select('-password');
          
          if (user && user.isActive) {
            req.user = user;
          }
        }
      } catch (tokenError) {
        // Continue without authentication if token is invalid
        console.log('Optional auth: Invalid token, continuing without auth');
      }
    }
    
    next();
  } catch (error) {
    console.error('Optional auth error:', error);
    // Continue without authentication on error
    next();
  }
};

// Check if user owns the resource
const checkOwnership = (resourceModel, resourceIdParam = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdParam];
      
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: 'Resource ID is required.'
        });
      }

      const resource = await resourceModel.findById(resourceId);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Resource not found.'
        });
      }

      // Check if user owns the resource
      const ownerId = resource.author || resource.sender || resource.user || resource._id;
      
      if (!ownerId) {
        return res.status(500).json({
          success: false,
          message: 'Resource ownership cannot be determined.'
        });
      }

      if (ownerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only access your own resources.'
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking resource ownership.',
        error: error.message
      });
    }
  };
};

module.exports = {
  protect,
  authorize,
  optionalAuth,
  checkOwnership
};
