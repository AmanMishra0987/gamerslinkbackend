const { Message, ChatRoom } = require('../models/Message');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { uploadMultipleFiles } = require('../utils/cloudinary');
const { createMessageNotification } = require('../utils/notificationService');

// Get io instance from server
let io;
const setIoInstance = (ioInstance) => {
  io = ioInstance;
};

// Send direct message
const sendDirectMessage = async (req, res) => {
  try {
    const { recipientId, text, replyTo } = req.body;
    const senderId = req.user._id;

    if (senderId.toString() === recipientId) {
      return res.status(400).json({
        success: false,
        message: 'You cannot send message to yourself'
      });
    }

    // Check if recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient || !recipient.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found'
      });
    }

    // Handle media uploads
    let mediaData = [];
    if (req.files && req.files.length > 0) {
      try {
        const uploadResults = await uploadMultipleFiles(req.files, 'gaming-social/messages');
        mediaData = uploadResults.map(result => ({
          type: result.type,
          url: result.url,
          publicId: result.publicId,
          filename: req.files.find(f => f.originalname).originalname,
          size: req.files.find(f => f.size).size
        }));
      } catch (uploadError) {
        return res.status(400).json({
          success: false,
          message: 'Failed to upload media files',
          error: uploadError.message
        });
      }
    }

    // Create message
    const messageData = {
      sender: senderId,
      recipient: recipientId,
      messageType: 'direct',
      content: {
        text: text || '',
        media: mediaData
      }
    };

    if (replyTo) {
      messageData.replyTo = replyTo;
    }

    const message = await Message.create(messageData);
    
    // Populate sender and recipient info
    await message.populate([
      { path: 'sender', select: 'username profile.displayName profile.avatar' },
      { path: 'recipient', select: 'username profile.displayName profile.avatar' },
      { path: 'replyTo', select: 'content.text sender', populate: { path: 'sender', select: 'username profile.displayName' } }
    ]);

    // Create notification for recipient
    console.log('Creating message notification for recipient:', recipientId);
    await createMessageNotification(recipientId, senderId, message._id);
    console.log('Message notification created and emitted');

    // Emit real-time message to recipient
    if (io) {
      console.log('Emitting real-time message to recipient:', recipientId);
      io.to(`user-${recipientId}`).emit('newMessage', {
        chatId: `direct_${senderId}`,
        message: message
      });
      console.log('Real-time message emitted successfully');
    } else {
      console.log('Socket.io not available for real-time messaging');
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: {
        message
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
};

// Get direct messages between two users
const getDirectMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const messages = await Message.find({
      messageType: 'direct',
      $or: [
        { sender: currentUserId, recipient: userId },
        { sender: userId, recipient: currentUserId }
      ],
      isDeleted: false
    })
    .populate('sender', 'username profile.displayName profile.avatar')
    .populate('recipient', 'username profile.displayName profile.avatar')
    .populate('replyTo', 'content.text sender')
    .populate('reactions.user', 'username profile.displayName')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    const total = await Message.countDocuments({
      messageType: 'direct',
      $or: [
        { sender: currentUserId, recipient: userId },
        { sender: userId, recipient: currentUserId }
      ],
      isDeleted: false
    });

    res.status(200).json({
      success: true,
      messages: messages.reverse(), // Reverse to show oldest first
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: messages.length,
        totalMessages: total
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: error.message
    });
  }
};

// Create chat room
const createChatRoom = async (req, res) => {
  try {
    const { name, description, memberIds } = req.body;
    const creatorId = req.user._id;

    // Validate members
    if (memberIds && memberIds.length > 0) {
      const validMembers = await User.find({ _id: { $in: memberIds }, isActive: true });
      if (validMembers.length !== memberIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Some members are invalid or inactive'
        });
      }
    }

    // Create chat room
    const chatRoomData = {
      name,
      description: description || '',
      roomType: 'private', // Default to private
      creator: creatorId,
      members: [
        { user: creatorId, role: 'admin' },
        ...(memberIds || []).map(memberId => ({ user: memberId, role: 'member' }))
      ]
    };

    const chatRoom = await ChatRoom.create(chatRoomData);
    
    // Populate members info
    await chatRoom.populate('members.user', 'username profile.displayName profile.avatar');
    await chatRoom.populate('creator', 'username profile.displayName profile.avatar');

    // Transform to match frontend expectations
    const transformedChatRoom = {
      _id: chatRoom._id,
      name: chatRoom.name,
      description: chatRoom.description,
      avatar: chatRoom.avatar,
      roomType: chatRoom.roomType,
      creator: {
        _id: chatRoom.creator._id,
        username: chatRoom.creator.username || chatRoom.creator.profile?.displayName,
        profile: chatRoom.creator.profile
      },
      members: chatRoom.members.map(member => ({
        user: {
          _id: member.user._id,
          username: member.user.username || member.user.profile?.displayName,
          profile: member.user.profile
        },
        role: member.role,
        joinedAt: member.joinedAt
      })),
      memberCount: chatRoom.members.length,
      lastMessage: null,
      unreadCount: 0,
      lastActivity: chatRoom.lastActivity
    };

    res.status(201).json({
      success: true,
      message: 'Chat room created successfully',
      data: {
        chatRoom: transformedChatRoom
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to create chat room',
      error: error.message
    });
  }
};

// Get user's chat rooms
const getChatRooms = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const chatRooms = await ChatRoom.find({
      'members.user': userId,
      isActive: true
    })
    .populate('members.user', 'username profile.displayName profile.avatar')
    .populate('creator', 'username profile.displayName profile.avatar')
    .populate('lastMessage')
    .sort({ lastActivity: -1 })
    .skip(skip)
    .limit(limit);

    // Transform chat rooms to match frontend expectations
    const transformedChatRooms = await Promise.all(chatRooms.map(async (room) => {
      // Get unread count for this user
      const unreadCount = await Message.countDocuments({
        chatRoom: room._id,
        messageType: 'group',
        'readBy.user': { $ne: userId },
        isDeleted: false
      });
      
      return {
        _id: room._id,
        name: room.name,
        description: room.description,
        avatar: room.avatar,
        roomType: room.roomType,
        creator: {
          _id: room.creator._id,
          username: room.creator.username || room.creator.profile?.displayName,
          profile: room.creator.profile
        },
        members: room.members.map(member => ({
          user: {
            _id: member.user._id,
            username: member.user.username || member.user.profile?.displayName,
            profile: member.user.profile
          },
          role: member.role,
          joinedAt: member.joinedAt
        })),
        memberCount: room.members.length,
        lastMessage: room.lastMessage ? {
          content: room.lastMessage.content,
          sender: room.lastMessage.sender,
          createdAt: room.lastMessage.createdAt
        } : null,
        unreadCount,
        lastActivity: room.lastActivity
      };
    }));

    // Sort by unread count first, then by last activity
    transformedChatRooms.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      return new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0);
    });

    const total = await ChatRoom.countDocuments({
      'members.user': userId,
      isActive: true
    });

    res.status(200).json({
      success: true,
      chatRooms: transformedChatRooms,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: transformedChatRooms.length,
        totalRooms: total
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat rooms',
      error: error.message
    });
  }
};

// Get recent conversations (direct messages)
const getRecentConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get all unique users the current user has had conversations with
    const conversations = await Message.aggregate([
      {
        $match: {
          messageType: 'direct',
          $or: [
            { sender: userId },
            { recipient: userId }
          ],
          isDeleted: false
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', userId] },
              '$recipient',
              '$sender'
            ]
          },
          lastMessage: { $first: '$$ROOT' },
          messageCount: { $sum: 1 }
        }
      },
      {
        $sort: { 'lastMessage.createdAt': -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: limit
      }
    ]);

    // Populate user information for each conversation
    const populatedConversations = await Promise.all(
      conversations.map(async (conv) => {
        const otherUser = await User.findById(conv._id)
          .select('username profile.displayName profile.avatar role userType')
          .lean();

        if (!otherUser) return null;

        // Get unread count
        const unreadCount = await Message.countDocuments({
          sender: conv._id,
          recipient: userId,
          'readBy.user': { $ne: userId },
          isDeleted: false
        });

        return {
          _id: `direct_${conv._id}`,
          participants: [{
            _id: otherUser._id,
            username: otherUser.username || otherUser.profile?.displayName,
            profilePicture: otherUser.profile?.avatar,
            role: otherUser.role || otherUser.userType
          }],
          lastMessage: {
            content: conv.lastMessage.content,
            sender: conv.lastMessage.sender,
            createdAt: conv.lastMessage.createdAt
          },
          unreadCount,
          messageCount: conv.messageCount
        };
      })
    );

    // Filter out null entries (deleted users)
    const validConversations = populatedConversations.filter(conv => conv !== null);

    // Sort by unread count first, then by last message time
    validConversations.sort((a, b) => {
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
      if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
      return new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt);
    });

    const total = await Message.aggregate([
      {
        $match: {
          messageType: 'direct',
          $or: [
            { sender: userId },
            { recipient: userId }
          ],
          isDeleted: false
        }
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ['$sender', userId] },
              '$recipient',
              '$sender'
            ]
          }
        }
      },
      {
        $count: 'total'
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        conversations: validConversations,
        pagination: {
          current: page,
          total: Math.ceil((total[0]?.total || 0) / limit),
          count: validConversations.length,
          totalConversations: total[0]?.total || 0
        }
      }
    });

  } catch (error) {
    console.error('Error fetching recent conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent conversations',
      error: error.message
    });
  }
};

// Send group message
const sendGroupMessage = async (req, res) => {
  try {
    const { chatRoomId, text, replyTo } = req.body;
    const senderId = req.user._id;

    // Check if user is member of the chat room
    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom || !chatRoom.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    const isMember = chatRoom.members.some(member => member.user.toString() === senderId.toString());
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this chat room'
      });
    }

    // Handle media uploads
    let mediaData = [];
    if (req.files && req.files.length > 0) {
      try {
        const uploadResults = await uploadMultipleFiles(req.files, 'gaming-social/messages');
        mediaData = uploadResults.map(result => ({
          type: result.type,
          url: result.url,
          publicId: result.publicId
        }));
      } catch (uploadError) {
        return res.status(400).json({
          success: false,
          message: 'Failed to upload media files',
          error: uploadError.message
        });
      }
    }

    // Create message
    const messageData = {
      sender: senderId,
      chatRoom: chatRoomId,
      messageType: 'group',
      content: {
        text: text || '',
        media: mediaData
      }
    };

    if (replyTo) {
      messageData.replyTo = replyTo;
    }

    const message = await Message.create(messageData);
    
    // Update chat room last message and activity
    chatRoom.lastMessage = message._id;
    chatRoom.lastActivity = new Date();
    await chatRoom.save();

    // Populate message info
    await message.populate([
      { path: 'sender', select: 'username profile.displayName profile.avatar' },
      { path: 'replyTo', select: 'content.text sender', populate: { path: 'sender', select: 'username profile.displayName' } }
    ]);

    // Emit real-time message to all group members
    if (io) {
      console.log('Emitting real-time group message to chat room:', chatRoomId);
      io.to(`chat-${chatRoomId}`).emit('newMessage', {
        chatId: chatRoomId,
        message: message
      });
      console.log('Real-time group message emitted successfully');
    } else {
      console.log('Socket.io not available for real-time group messaging');
    }

    res.status(201).json({
      success: true,
      message: 'Group message sent successfully',
      data: {
        message
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send group message',
      error: error.message
    });
  }
};

// Get group messages
const getGroupMessages = async (req, res) => {
  try {
    const { chatRoomId } = req.params;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Check if user is member of the chat room
    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom || !chatRoom.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    const isMember = chatRoom.members.some(member => member.user.toString() === userId.toString());
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'You are not a member of this chat room'
      });
    }

    const messages = await Message.find({
      chatRoom: chatRoomId,
      messageType: 'group',
      isDeleted: false
    })
    .populate('sender', 'username profile.displayName profile.avatar')
    .populate('replyTo', 'content.text sender')
    .populate('reactions.user', 'username profile.displayName')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    const total = await Message.countDocuments({
      chatRoom: chatRoomId,
      messageType: 'group',
      isDeleted: false
    });

    res.status(200).json({
      success: true,
      messages: messages.reverse(), // Reverse to show oldest first
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        count: messages.length,
        totalMessages: total
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch group messages',
      error: error.message
    });
  }
};

// Mark messages as read
const markMessagesAsRead = async (req, res) => {
  try {
    const { chatId, messageType } = req.body;
    const userId = req.user._id;

    let filter = { 'readBy.user': { $ne: userId }, isDeleted: false };

    if (messageType === 'direct') {
      // For direct messages, mark messages from the other user as read
      const otherUserId = chatId.replace('direct_', '');
      filter = {
        ...filter,
        messageType: 'direct',
        sender: otherUserId,
        recipient: userId
      };
    } else {
      // For group messages, mark all messages in the chat room as read
      filter = {
        ...filter,
        messageType: 'group',
        chatRoom: chatId
      };
    }

    const result = await Message.updateMany(filter, {
      $addToSet: {
        readBy: {
          user: userId,
          readAt: new Date()
        }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Messages marked as read',
      data: {
        updatedCount: result.modifiedCount
      }
    });

  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read',
      error: error.message
    });
  }
};

// Add reaction to message
const addReaction = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Check if user already reacted with this emoji
    const existingReaction = message.reactions.find(
      reaction => reaction.user.toString() === userId.toString() && reaction.emoji === emoji
    );

    if (existingReaction) {
      // Remove reaction
      message.reactions = message.reactions.filter(
        reaction => !(reaction.user.toString() === userId.toString() && reaction.emoji === emoji)
      );
    } else {
      // Add reaction
      message.reactions.push({
        user: userId,
        emoji,
        reactedAt: new Date()
      });
    }

    await message.save();

    res.status(200).json({
      success: true,
      message: existingReaction ? 'Reaction removed' : 'Reaction added',
      data: {
        reactions: message.reactions
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add reaction',
      error: error.message
    });
  }
};

// Update chat room settings
const updateChatRoom = async (req, res) => {
  try {
    const { chatRoomId } = req.params;
    const { name, description } = req.body;
    const userId = req.user._id;

    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    // Check if user is admin
    const isAdmin = chatRoom.creator.toString() === userId.toString() || 
                   chatRoom.members.some(member => 
                     member.user.toString() === userId.toString() && member.role === 'admin'
                   );

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can update group settings'
      });
    }

    // Update chat room
    chatRoom.name = name;
    if (description !== undefined) {
      chatRoom.description = description;
    }

    await chatRoom.save();

    // Populate and transform for frontend
    await chatRoom.populate([
      { path: 'creator', select: 'username profile.displayName profile.avatar' },
      { path: 'members.user', select: 'username profile.displayName profile.avatar' }
    ]);

    const transformedChatRoom = {
      _id: chatRoom._id,
      name: chatRoom.name,
      description: chatRoom.description,
      avatar: chatRoom.avatar,
      creator: chatRoom.creator,
      members: chatRoom.members,
      memberCount: chatRoom.members.length,
      lastMessage: null, // TODO: Add last message logic
      unreadCount: 0 // TODO: Add unread count logic
    };

    res.status(200).json({
      success: true,
      message: 'Chat room updated successfully',
      data: {
        chatRoom: transformedChatRoom
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update chat room',
      error: error.message
    });
  }
};

// Add member to chat room
const addMemberToChatRoom = async (req, res) => {
  try {
    const { chatRoomId } = req.params;
    const { memberId } = req.body;
    const userId = req.user._id;

    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    // Check if user is admin
    const isAdmin = chatRoom.creator.toString() === userId.toString() || 
                   chatRoom.members.some(member => 
                     member.user.toString() === userId.toString() && member.role === 'admin'
                   );

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can add members'
      });
    }

    // Check if member already exists
    const existingMember = chatRoom.members.find(
      member => member.user.toString() === memberId
    );

    if (existingMember) {
      return res.status(400).json({
        success: false,
        message: 'User is already a member of this group'
      });
    }

    // Check if user exists
    const user = await User.findById(memberId);
    if (!user || !user.isActive) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Add member
    chatRoom.members.push({
      user: memberId,
      role: 'member',
      joinedAt: new Date()
    });

    await chatRoom.save();

    // Populate and transform for frontend
    await chatRoom.populate([
      { path: 'creator', select: 'username profile.displayName profile.avatar' },
      { path: 'members.user', select: 'username profile.displayName profile.avatar' }
    ]);

    const transformedChatRoom = {
      _id: chatRoom._id,
      name: chatRoom.name,
      description: chatRoom.description,
      avatar: chatRoom.avatar,
      creator: chatRoom.creator,
      members: chatRoom.members,
      memberCount: chatRoom.members.length,
      lastMessage: null, // TODO: Add last message logic
      unreadCount: 0 // TODO: Add unread count logic
    };

    res.status(200).json({
      success: true,
      message: 'Member added successfully',
      data: {
        chatRoom: transformedChatRoom
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to add member',
      error: error.message
    });
  }
};

// Remove member from chat room
const removeMemberFromChatRoom = async (req, res) => {
  try {
    const { chatRoomId, memberId } = req.params;
    const userId = req.user._id;

    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    // Check if user is admin
    const isAdmin = chatRoom.creator.toString() === userId.toString() || 
                   chatRoom.members.some(member => 
                     member.user.toString() === userId.toString() && member.role === 'admin'
                   );

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can remove members'
      });
    }

    // Check if member exists
    const memberIndex = chatRoom.members.findIndex(
      member => member.user.toString() === memberId
    );

    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Member not found in this group'
      });
    }

    // Check if trying to remove the creator
    if (chatRoom.creator.toString() === memberId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove the group creator'
      });
    }

    // Remove member
    chatRoom.members.splice(memberIndex, 1);

    await chatRoom.save();

    // Populate and transform for frontend
    await chatRoom.populate([
      { path: 'creator', select: 'username profile.displayName profile.avatar' },
      { path: 'members.user', select: 'username profile.displayName profile.avatar' }
    ]);

    const transformedChatRoom = {
      _id: chatRoom._id,
      name: chatRoom.name,
      description: chatRoom.description,
      avatar: chatRoom.avatar,
      creator: chatRoom.creator,
      members: chatRoom.members,
      memberCount: chatRoom.members.length,
      lastMessage: null, // TODO: Add last message logic
      unreadCount: 0 // TODO: Add unread count logic
    };

    res.status(200).json({
      success: true,
      message: 'Member removed successfully',
      data: {
        chatRoom: transformedChatRoom
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to remove member',
      error: error.message
    });
  }
};

// Update member role in chat room
const updateMemberRole = async (req, res) => {
  try {
    const { chatRoomId, memberId } = req.params;
    const { role } = req.body; // 'admin' or 'member'
    const userId = req.user._id;

    const chatRoom = await ChatRoom.findById(chatRoomId);
    if (!chatRoom) {
      return res.status(404).json({
        success: false,
        message: 'Chat room not found'
      });
    }

    // Check if user is admin
    const isAdmin = chatRoom.creator.toString() === userId.toString() || 
                   chatRoom.members.some(member => 
                     member.user.toString() === userId.toString() && member.role === 'admin'
                   );

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can update member roles'
      });
    }

    // Check if member exists
    const memberIndex = chatRoom.members.findIndex(
      member => member.user.toString() === memberId
    );

    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Member not found in this group'
      });
    }

    // Check if trying to update the creator's role
    if (chatRoom.creator.toString() === memberId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot change the group creator\'s role'
      });
    }

    // Update member role
    chatRoom.members[memberIndex].role = role;

    await chatRoom.save();

    // Populate and transform for frontend
    await chatRoom.populate([
      { path: 'creator', select: 'username profile.displayName profile.avatar' },
      { path: 'members.user', select: 'username profile.displayName profile.avatar' }
    ]);

    const transformedChatRoom = {
      _id: chatRoom._id,
      name: chatRoom.name,
      description: chatRoom.description,
      avatar: chatRoom.avatar,
      creator: chatRoom.creator,
      members: chatRoom.members.map(member => ({
        user: member.user,
        role: member.role,
        joinedAt: member.joinedAt
      })),
      createdAt: chatRoom.createdAt
    };

    res.json({
      success: true,
      message: `Member role updated to ${role}`,
      chatRoom: transformedChatRoom
    });

  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Handle invite response from message
const handleInviteResponse = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { response } = req.body; // 'accept' or 'decline'
    const userId = req.user._id;

    // Find the message with invite data
    const message = await Message.findById(messageId);
    if (!message || !message.inviteData) {
      return res.status(404).json({
        success: false,
        message: 'Invite message not found'
      });
    }

    // Check if user is the recipient of the invite
    if (message.recipient.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only respond to invites sent to you'
      });
    }

    // Check if invite is still valid (not expired)
    const RosterInvite = require('../models/RosterInvite');
    const StaffInvite = require('../models/StaffInvite');
    
    let invite;
    if (message.inviteData.type === 'roster') {
      invite = await RosterInvite.findById(message.inviteData.inviteId);
    } else if (message.inviteData.type === 'staff') {
      invite = await StaffInvite.findById(message.inviteData.inviteId);
    }

    if (!invite || invite.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Invite is no longer valid or has already been responded to'
      });
    }

    // Update invite status
    invite.status = response === 'accept' ? 'accepted' : 'declined';
    await invite.save();

    // Handle the response based on type
    if (response === 'accept') {
      if (message.inviteData.type === 'roster') {
        // Add player to team roster
        const team = await User.findById(message.inviteData.teamId);
        if (team) {
          let roster = team.teamInfo.rosters.find(r => r.game === message.inviteData.game);
          if (!roster) {
            roster = {
              game: message.inviteData.game,
              players: []
            };
            team.teamInfo.rosters.push(roster);
          }
          
          roster.players.push({
            user: userId,
            role: message.inviteData.role,
            inGameName: message.inviteData.inGameName,
            joinedAt: new Date(),
            isActive: true
          });
          
          await team.save();
        }

        // Add team to player's joinedTeams array
        const player = await User.findById(userId);
        if (player && player.userType === 'player') {
          // Check if player is already in this team for this game
          const existingTeamIndex = player.playerInfo.joinedTeams.findIndex(
            teamEntry => teamEntry.team.toString() === message.inviteData.teamId.toString() && 
                        teamEntry.game === message.inviteData.game
          );

          if (existingTeamIndex === -1) {
            // Add new team entry
            player.playerInfo.joinedTeams.push({
              team: message.inviteData.teamId,
              game: message.inviteData.game,
              role: message.inviteData.role,
              inGameName: message.inviteData.inGameName,
              joinedAt: new Date(),
              isActive: true
            });
          } else {
            // Update existing entry
            player.playerInfo.joinedTeams[existingTeamIndex].isActive = true;
            player.playerInfo.joinedTeams[existingTeamIndex].leftAt = null;
            player.playerInfo.joinedTeams[existingTeamIndex].role = message.inviteData.role;
            player.playerInfo.joinedTeams[existingTeamIndex].inGameName = message.inviteData.inGameName;
          }
          
          await player.save();
        }
      } else if (message.inviteData.type === 'staff') {
        // Add player to team staff
        const team = await User.findById(message.inviteData.teamId);
        if (team) {
          team.teamInfo.staff.push({
            user: userId,
            role: message.inviteData.role,
            joinedAt: new Date(),
            isActive: true
          });
          
          await team.save();
        }

        // Add team to player's joinedTeams array for staff role
        const player = await User.findById(userId);
        if (player && player.userType === 'player') {
          // Check if player is already in this team for staff role
          const existingTeamIndex = player.playerInfo.joinedTeams.findIndex(
            teamEntry => teamEntry.team.toString() === message.inviteData.teamId.toString() && 
                        teamEntry.role === message.inviteData.role
          );

          if (existingTeamIndex === -1) {
            // Add new team entry for staff role
            player.playerInfo.joinedTeams.push({
              team: message.inviteData.teamId,
              game: 'Staff', // Staff members don't have specific game
              role: message.inviteData.role,
              inGameName: '', // Staff members don't have in-game names
              joinedAt: new Date(),
              isActive: true
            });
          } else {
            // Update existing entry
            player.playerInfo.joinedTeams[existingTeamIndex].isActive = true;
            player.playerInfo.joinedTeams[existingTeamIndex].leftAt = null;
            player.playerInfo.joinedTeams[existingTeamIndex].role = message.inviteData.role;
          }
          
          await player.save();
        }
      }
    }

    // Send response message back to team
    const responseMessage = response === 'accept' 
      ? `✅ **Invitation Accepted!**\n\nThank you for accepting the invitation to join our team! Welcome aboard! 🎉`
      : `❌ **Invitation Declined**\n\nThank you for considering our invitation. We understand and wish you the best!`;

    const responseMessageData = {
      sender: userId,
      recipient: message.inviteData.teamId,
      messageType: 'direct',
      content: {
        text: responseMessage,
        media: []
      }
    };

    const responseMsg = await Message.create(responseMessageData);
    
    // Populate sender and recipient info
    await responseMsg.populate([
      { path: 'sender', select: 'username profile.displayName profile.avatar' },
      { path: 'recipient', select: 'username profile.displayName profile.avatar' }
    ]);

    // Create notification for the team
    await Notification.createNotification({
      recipient: message.inviteData.teamId,
      sender: userId,
      type: 'message',
      title: 'New Message',
      message: `${req.user.profile?.displayName || req.user.username} sent you a message`,
      data: {
        messageId: responseMsg._id
      }
    });

    res.status(200).json({
      success: true,
      message: `Invitation ${response}d successfully`,
      data: {
        inviteStatus: invite.status,
        responseMessage: responseMsg
      }
    });

  } catch (error) {
    console.error('Error handling invite response:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process invite response',
      error: error.message
    });
  }
};

module.exports = {
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
  markMessagesAsRead,
  setIoInstance
};


