const express = require('express');
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');
const {
  sendDirectMessage,
  getDirectMessages,
  createChatRoom,
  getChatRooms,
  getRecentConversations,
  sendGroupMessage,
  getGroupMessages,
  addReaction,
  updateChatRoom,
  addMemberToChatRoom,
  removeMemberFromChatRoom,
  updateMemberRole,
  handleInviteResponse,
  markMessagesAsRead
} = require('../controllers/messageController');

const router = express.Router();

// Validation middleware
const sendDirectMessageValidation = [
  body('recipientId')
    .notEmpty()
    .withMessage('Recipient ID is required'),
  body('text')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Message cannot exceed 1000 characters')
];

const createChatRoomValidation = [
  body('name')
    .isLength({ min: 1, max: 50 })
    .withMessage('Chat room name must be between 1 and 50 characters'),
  body('description')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Description cannot exceed 200 characters'),
  body('memberIds')
    .optional()
    .isArray()
    .withMessage('Member IDs must be an array')
];

const updateChatRoomValidation = [
  body('name')
    .isLength({ min: 1, max: 50 })
    .withMessage('Chat room name must be between 1 and 50 characters'),
  body('description')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Description cannot exceed 200 characters')
];

const addMemberValidation = [
  body('memberId')
    .notEmpty()
    .withMessage('Member ID is required')
];

const updateMemberRoleValidation = [
  body('role')
    .isIn(['admin', 'member'])
    .withMessage('Role must be either admin or member')
];

const sendGroupMessageValidation = [
  body('chatRoomId')
    .notEmpty()
    .withMessage('Chat room ID is required'),
  body('text')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Message cannot exceed 1000 characters')
];

const addReactionValidation = [
  body('emoji')
    .notEmpty()
    .withMessage('Emoji is required')
    .isLength({ min: 1, max: 10 })
    .withMessage('Invalid emoji')
];

// Routes
router.post('/direct', protect, uploadMultiple('media', 3), sendDirectMessageValidation, sendDirectMessage);
router.get('/direct/:userId', protect, getDirectMessages);
router.get('/recent', protect, getRecentConversations);
router.post('/rooms', protect, createChatRoomValidation, createChatRoom);
router.get('/rooms', protect, getChatRooms);
router.put('/rooms/:chatRoomId', protect, updateChatRoomValidation, updateChatRoom);
router.post('/rooms/:chatRoomId/members', protect, addMemberValidation, addMemberToChatRoom);
router.put('/rooms/:chatRoomId/members/:memberId/role', protect, updateMemberRoleValidation, updateMemberRole);
router.delete('/rooms/:chatRoomId/members/:memberId', protect, removeMemberFromChatRoom);
router.post('/group', protect, uploadMultiple('media', 3), sendGroupMessageValidation, sendGroupMessage);
router.get('/rooms/:chatRoomId', protect, getGroupMessages);
router.post('/:messageId/reaction', protect, addReactionValidation, addReaction);
router.post('/:messageId/invite-response', protect, handleInviteResponse);
router.post('/mark-read', protect, markMessagesAsRead);

module.exports = router;
