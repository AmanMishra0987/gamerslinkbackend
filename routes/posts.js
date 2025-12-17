const express = require('express');
const { body } = require('express-validator');
const { protect, optionalAuth } = require('../middleware/auth');
const { uploadMultiple } = require('../middleware/upload');
const { handleValidationErrors } = require('../middleware/validation');
const {
  createPost,
  getPosts,
  getPost,
  toggleLike,
  addComment,
  updatePost,
  deletePost,
  reportPost
} = require('../controllers/postController');

const router = express.Router();

// Validation middleware
const createPostValidation = [
  body('text')
    .isLength({ min: 1, max: 2000 })
    .withMessage('Post content must be between 1 and 2000 characters'),
  body('postType')
    .optional()
    .isIn(['general', 'recruitment', 'achievement', 'looking-for-team'])
    .withMessage('Invalid post type'),
  body('visibility')
    .optional()
    .isIn(['public', 'followers', 'private'])
    .withMessage('Invalid visibility setting')
];

const updatePostValidation = [
  body('text')
    .optional()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Post content must be between 1 and 2000 characters'),
  body('visibility')
    .optional()
    .isIn(['public', 'followers', 'private'])
    .withMessage('Invalid visibility setting')
];

const addCommentValidation = [
  body('text')
    .isLength({ min: 1, max: 500 })
    .withMessage('Comment must be between 1 and 500 characters')
];

// Routes
router.post('/', protect, uploadMultiple('media', 5), createPostValidation, handleValidationErrors, createPost);
router.get('/', optionalAuth, getPosts);
router.get('/:id', optionalAuth, getPost);
router.post('/:id/like', protect, toggleLike);
router.post('/:id/comment', protect, addCommentValidation, handleValidationErrors, addComment);
router.put('/:id', protect, updatePostValidation, handleValidationErrors, updatePost);
router.delete('/:id', protect, deletePost);
router.post('/:id/report', protect, reportPost);

module.exports = router;
