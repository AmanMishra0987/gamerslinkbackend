const express = require('express');
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  deleteAccount,
  logout,
  uploadProfilePicture,
  uploadBanner
} = require('../controllers/authController');

const router = express.Router();

// Validation middleware
const registerValidation = [
  body('username')
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers and underscores'),
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('userType')
    .isIn(['player', 'team'])
    .withMessage('User type must be either player or team'),
  body('displayName')
    .isLength({ min: 1, max: 50 })
    .withMessage('Display name is required and must be less than 50 characters')
];

const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
];

const deleteAccountValidation = [
  body('password')
    .notEmpty()
    .withMessage('Password is required to delete account')
];

const profileUpdateValidation = [
  body('username')
    .optional()
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers and underscores'),
  body('displayName')
    .optional()
    .isLength({ min: 1, max: 50 })
    .withMessage('Display name must be less than 50 characters')
];

// Routes
router.post('/register', uploadSingle('avatar'), registerValidation, register);
router.post('/login', loginValidation, login);
router.get('/me', protect, getMe);
router.put('/profile', protect, uploadSingle('avatar'), profileUpdateValidation, updateProfile);
router.post('/upload-profile-picture', protect, uploadSingle('image'), uploadProfilePicture);
router.post('/upload-banner', protect, uploadSingle('image'), uploadBanner);
router.put('/change-password', protect, changePasswordValidation, changePassword);
router.delete('/account', protect, deleteAccountValidation, deleteAccount);
router.post('/logout', logout);

module.exports = router;
