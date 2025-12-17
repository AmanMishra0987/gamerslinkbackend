const { protect } = require('./auth');

// Require admin access
const requireAdmin = (req, res, next) => {
  // First check if user is authenticated
  protect(req, res, (err) => {
    if (err) return next(err);
    
    // Check if user is admin
    if (req.user.userType !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required. Only administrators can access this resource.'
      });
    }
    
    next();
  });
};

// Require super admin access (for critical operations)
const requireSuperAdmin = (req, res, next) => {
  requireAdmin(req, res, (err) => {
    if (err) return next(err);
    
    // Check for super admin role
    if (!req.user.isSuperUser) {
      return res.status(403).json({
        success: false,
        message: 'Super admin access required for this operation.'
      });
    }
    
    next();
  });
};

// Log admin actions for audit
const auditLog = (action) => {
  return (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log admin action
      console.log(`[ADMIN ACTION] ${action} - User: ${req.user?.username} (${req.user?._id}) - IP: ${req.ip} - Time: ${new Date().toISOString()}`);
      
      // Call original send
      originalSend.call(this, data);
    };
    
    next();
  };
};

module.exports = { 
  requireAdmin, 
  requireSuperAdmin, 
  auditLog 
};
