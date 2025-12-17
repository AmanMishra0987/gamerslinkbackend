const express = require('express');
const { requireAdmin, requireSuperAdmin, auditLog } = require('../middleware/adminAuth');
const { 
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
} = require('../controllers/adminController');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(requireAdmin);

// Dashboard routes
router.get('/dashboard', auditLog('VIEW_DASHBOARD'), getDashboardStats);
router.get('/analytics/users', auditLog('VIEW_USER_ANALYTICS'), getUserAnalytics);
router.get('/health', auditLog('VIEW_SYSTEM_HEALTH'), getSystemHealth);
router.get('/activities', auditLog('VIEW_RECENT_ACTIVITIES'), getRecentActivities);

// User management routes
router.get('/users', auditLog('VIEW_USERS'), getUsers);
router.put('/users/:userId/status', auditLog('UPDATE_USER_STATUS'), updateUserStatus);
router.delete('/users/:userId', auditLog('DELETE_USER'), requireSuperAdmin, deleteUser);

// Post management routes
router.get('/posts', auditLog('VIEW_POSTS'), getPosts);
router.delete('/posts/:postId', auditLog('DELETE_POST'), deletePost);

// Tournament management routes
router.get('/tournaments', auditLog('VIEW_TOURNAMENTS'), getTournaments);
router.delete('/tournaments/:tournamentId', auditLog('DELETE_TOURNAMENT'), deleteTournament);

// Add X-Robots-Tag header to prevent indexing
router.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

module.exports = router;
