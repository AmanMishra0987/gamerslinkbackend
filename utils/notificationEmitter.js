let io;

const setIoInstance = (ioInstance) => {
  io = ioInstance;
};

const emitNotification = (userId, notification) => {
  if (io) {
    io.to(`user_${userId}`).emit('new-notification', notification);
  }
};

const createAndEmitNotification = async (notificationData) => {
  try {
    const Notification = require('../models/Notification');
    const notification = await Notification.createNotification(notificationData);
    
    // Emit real-time notification
    emitNotification(notification.recipient, notification);
    
    return notification;
  } catch (error) {
    console.error('Error creating and emitting notification:', error);
    throw error;
  }
};

module.exports = {
  setIoInstance,
  emitNotification,
  createAndEmitNotification
};
