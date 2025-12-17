# Gaming Social Platform Backend

A comprehensive MERN stack backend for a gaming social media platform that supports both players and teams.

## 🚀 Features

### User Management
- **Dual User Types**: Players and Teams with separate profiles
- **JWT Authentication**: Secure token-based authentication
- **Profile Management**: Comprehensive profile system with avatars
- **Follow System**: Users can follow each other

### Posts & Content
- **Post Types**: General, Recruitment, Achievement, Looking-for-Team
- **Media Support**: Image and video uploads via Cloudinary
- **Interactions**: Like, comment, share functionality
- **Visibility Controls**: Public, followers-only, private posts

### Messaging System
- **Direct Messages**: One-to-one messaging
- **Group Chat**: Create and manage chat rooms
- **Real-time**: Socket.IO powered real-time messaging
- **Media Sharing**: Share images and videos in messages
- **Reactions**: Emoji reactions to messages

### Social Features
- **Search & Discovery**: Find users, teams, and posts
- **Notifications**: Real-time notification system
- **Recruitment**: Teams can post recruitment, players can apply

## 🛠️ Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database with Mongoose ODM
- **Socket.IO** - Real-time communication
- **Cloudinary** - Media storage and optimization
- **JWT** - Authentication tokens
- **bcryptjs** - Password hashing

## 📁 Project Structure

```
backend/
├── config/
│   ├── db.js              # MongoDB connection
│   └── cloudinary.js      # Cloudinary configuration
├── controllers/
│   ├── authController.js  # Authentication logic
│   ├── postController.js  # Post management
│   ├── userController.js  # User operations
│   └── messageController.js # Messaging system
├── middleware/
│   ├── auth.js           # JWT authentication middleware
│   ├── upload.js         # File upload middleware
│   ├── errorHandler.js   # Global error handling
│   └── validation.js     # Request validation
├── models/
│   ├── User.js           # User/Team model
│   ├── Post.js           # Post model
│   ├── Message.js        # Message & ChatRoom models
│   └── Notification.js   # Notification model
├── routes/
│   ├── auth.js           # Authentication routes
│   ├── posts.js          # Post routes
│   ├── users.js          # User routes
│   ├── messages.js       # Message routes
│   └── notifications.js  # Notification routes
├── utils/
│   ├── jwt.js            # JWT utilities
│   └── cloudinary.js     # Cloudinary utilities
└── server.js             # Main server file
```

## 🔧 Setup Instructions

### 1. Environment Variables
Create a `.env` file in the backend directory:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/arc-esports

# JWT Secret
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRE=7d

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Server
PORT=5000
NODE_ENV=development

# CORS
CLIENT_URL=http://localhost:3000
```

### 2. Install Dependencies
```bash
cd backend
npm install
```

### 3. Start the Server
```bash
# Development mode with nodemon
npm run dev

# Production mode
npm start
```

## 📚 API Documentation

### Authentication Endpoints
```
POST /api/auth/register     # Register new user
POST /api/auth/login        # User login
GET  /api/auth/me           # Get current user
PUT  /api/auth/profile      # Update profile
PUT  /api/auth/change-password # Change password
POST /api/auth/logout       # Logout
```

### User Endpoints
```
GET  /api/users             # Get all users (with search)
GET  /api/users/:id         # Get user by ID
POST /api/users/:id/follow  # Follow/unfollow user
GET  /api/users/:id/followers # Get user followers
GET  /api/users/:id/following # Get user following
GET  /api/users/:id/posts   # Get user posts
```

### Post Endpoints
```
POST /api/posts             # Create new post
GET  /api/posts             # Get all posts (feed)
GET  /api/posts/:id         # Get single post
POST /api/posts/:id/like    # Like/unlike post
POST /api/posts/:id/comment # Add comment
PUT  /api/posts/:id         # Update post
DELETE /api/posts/:id       # Delete post
```

### Message Endpoints
```
POST /api/messages/direct   # Send direct message
GET  /api/messages/direct/:userId # Get direct messages
POST /api/messages/rooms    # Create chat room
GET  /api/messages/rooms    # Get user's chat rooms
POST /api/messages/group    # Send group message
GET  /api/messages/rooms/:id # Get group messages
POST /api/messages/:id/reaction # Add reaction
```

### Notification Endpoints
```
GET  /api/notifications     # Get notifications
PUT  /api/notifications/:id/read # Mark as read
PUT  /api/notifications/read-all # Mark all as read
DELETE /api/notifications/:id # Delete notification
```

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## 📤 File Uploads

The API supports file uploads for:
- **Avatars**: Profile pictures (400x400px, optimized)
- **Post Media**: Images and videos (up to 50MB, 5 files max)
- **Message Media**: Images and videos (up to 50MB, 3 files max)

All files are uploaded to Cloudinary with automatic optimization.

## ⚡ Real-time Features

Socket.IO events:
- `join-user-room` - Join personal notification room
- `join-chat-room` - Join chat room
- `send-message` - Send real-time message
- `typing-start/stop` - Typing indicators
- `new-notification` - Receive notifications

## 🗄️ Database Schema

### Users Collection
- Supports both Player and Team user types
- Nested profile information
- Type-specific fields (playerInfo/teamInfo)
- Social connections (followers/following)

### Posts Collection
- Multiple post types with specific metadata
- Media attachments
- Social interactions (likes, comments, shares)
- Visibility controls

### Messages Collection
- Direct and group messaging
- Media attachments
- Read receipts and reactions
- Reply functionality

## 🚦 Error Handling

Comprehensive error handling with:
- Validation errors
- Authentication errors
- Database errors
- File upload errors
- Global error middleware

## 🔒 Security Features

- **Helmet.js**: Security headers
- **Rate Limiting**: Prevent abuse
- **CORS**: Cross-origin protection
- **Input Validation**: Request sanitization
- **Password Hashing**: bcrypt encryption
- **JWT Security**: Token-based auth

## 📊 Performance

- **Database Indexing**: Optimized queries
- **Pagination**: Efficient data loading
- **Cloudinary CDN**: Fast media delivery
- **Connection Pooling**: Database optimization

## 🧪 Testing

Access the health check endpoint:
```
GET /api/health
```

## 🚀 Deployment

The backend is production-ready with:
- Environment-based configuration
- Error logging
- Process management
- Security best practices

---

Built with ❤️ for the gaming community!
