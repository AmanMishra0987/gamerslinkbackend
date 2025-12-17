const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender is required']
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  chatRoom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatRoom'
  },
  messageType: {
    type: String,
    enum: ['direct', 'group'],
    required: [true, 'Message type is required']
  },
  content: {
    text: {
      type: String,
      required: function() {
        return !this.content.media || this.content.media.length === 0;
      },
      maxlength: [1000, 'Message cannot exceed 1000 characters']
    },
    media: [{
      type: {
        type: String,
        enum: ['image', 'video', 'file'],
        required: true
      },
      url: {
        type: String,
        required: true
      },
      publicId: String,
      filename: String,
      size: Number
    }]
  },
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date,
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      required: true
    },
    reactedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: Date,
  // Invite data for team invitations sent as messages
  inviteData: {
    type: {
      type: String,
      enum: ['roster', 'staff']
    },
    inviteId: {
      type: mongoose.Schema.Types.ObjectId
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    game: String,
    role: String,
    inGameName: String,
    message: String
  }
}, {
  timestamps: true
});

// Chat Room Schema for group messaging
const chatRoomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Chat room name is required'],
    trim: true,
    maxlength: [50, 'Chat room name cannot exceed 50 characters']
  },
  description: {
    type: String,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  avatar: {
    type: String,
    default: ''
  },
  roomType: {
    type: String,
    enum: ['public', 'private', 'team'],
    default: 'private'
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Chat room creator is required']
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['admin', 'moderator', 'member'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    lastSeen: {
      type: Date,
      default: Date.now
    }
  }],
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  settings: {
    allowMediaSharing: {
      type: Boolean,
      default: true
    },
    allowInvites: {
      type: Boolean,
      default: true
    },
    maxMembers: {
      type: Number,
      default: 100
    }
  }
}, {
  timestamps: true
});

// Indexes for better performance
messageSchema.index({ sender: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, createdAt: -1 });
messageSchema.index({ chatRoom: 1, createdAt: -1 });
messageSchema.index({ messageType: 1, createdAt: -1 });

chatRoomSchema.index({ creator: 1 });
chatRoomSchema.index({ 'members.user': 1 });
chatRoomSchema.index({ roomType: 1, isActive: 1 });

// Virtual for unread message count
messageSchema.virtual('isUnread').get(function() {
  return this.readBy.length === 0;
});

module.exports = {
  Message: mongoose.model('Message', messageSchema),
  ChatRoom: mongoose.model('ChatRoom', chatRoomSchema)
};
