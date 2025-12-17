const express = require('express');
const { protect, optionalAuth } = require('../middleware/auth');
const {
  getUsers,
  getUser,
  toggleFollow,
  getFollowers,
  getFollowing,
  getUserPosts,
  addPlayerToRoster,
  addStaffMember,
  addStaffMemberByUsername,
  removePlayerFromRoster,
  removeStaffMember,
  addTeamToPlayer,
  getTeamPendingInvites,
  cancelRosterInvite,
  cancelStaffInvite,
  cancelStaffInviteByUsername,
  leaveTeam,
  addGamingStat,
  updateGamingStat,
  deleteGamingStat,
  getGamingStats,
  createTeam
} = require('../controllers/userController');

const router = express.Router();

// Routes
router.get('/', optionalAuth, getUsers);
router.get('/search', optionalAuth, getUsers); // Add search route
router.post('/create-team', protect, createTeam); // Create team route
router.get('/:identifier', optionalAuth, getUser);
router.post('/:id/follow', protect, toggleFollow);
router.delete('/:id/follow', protect, toggleFollow);
router.get('/:id/followers', optionalAuth, getFollowers);
router.get('/:id/following', optionalAuth, getFollowing);
router.get('/:id/posts', optionalAuth, getUserPosts);

// Team management routes
router.post('/:teamId/roster/add', protect, addPlayerToRoster);
router.delete('/:teamId/roster/:game/leave', protect, leaveTeam);
router.delete('/:teamId/roster/:game/:playerId', protect, removePlayerFromRoster);
router.post('/:teamId/staff/add', protect, addStaffMember);
router.post('/:teamId/staff/add-by-username', protect, addStaffMemberByUsername);
router.delete('/:teamId/staff/:playerId', protect, removeStaffMember);
router.post('/:playerId/add-team/:teamId', protect, addTeamToPlayer);
router.get('/:teamId/pending-invites', protect, getTeamPendingInvites);
router.delete('/roster-invite/:inviteId', protect, cancelRosterInvite);
router.delete('/staff-invite/:inviteId', protect, cancelStaffInvite);
router.delete('/:teamId/staff/cancel-by-username', protect, cancelStaffInviteByUsername);

// Gaming Stats routes
router.get('/gaming-stats', protect, getGamingStats);
router.post('/gaming-stats', protect, addGamingStat);
router.put('/gaming-stats/:statId', protect, updateGamingStat);
router.delete('/gaming-stats/:statId', protect, deleteGamingStat);

module.exports = router;
