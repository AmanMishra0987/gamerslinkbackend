const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Generate unique filename
const generateUniqueFilename = (originalname) => {
  const ext = path.extname(originalname);
  const basename = path.basename(originalname, ext);
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  return `${basename}-${timestamp}-${randomString}${ext}`;
};

// Save file locally
const saveFileLocally = async (file, folder = 'gaming-social') => {
  return new Promise((resolve, reject) => {
    try {
      const folderPath = path.join(uploadsDir, folder);
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      
      const filename = generateUniqueFilename(file.originalname);
      const filePath = path.join(folderPath, filename);
      
      // Write file to disk
      fs.writeFile(filePath, file.buffer, (err) => {
        if (err) {
          reject(err);
        } else {
          // Return file info similar to Cloudinary response
          resolve({
            url: `/uploads/${folder}/${filename}`,
            publicId: filename,
            filename: filename
          });
        }
      });
    } catch (error) {
      reject(error);
    }
  });
};

// Upload image locally
const uploadImage = async (file, folder = 'gaming-social') => {
  const result = await saveFileLocally(file, folder);
  return {
    url: result.url,
    publicId: result.publicId,
    width: 0, // Placeholder values since we're not processing images
    height: 0
  };
};

// Upload video locally
const uploadVideo = async (file, folder = 'gaming-social') => {
  const result = await saveFileLocally(file, folder);
  return {
    url: result.url,
    publicId: result.publicId,
    duration: 0, // Placeholder values since we're not processing videos
    width: 0,
    height: 0
  };
};

// Upload avatar (smaller size) - same as image for now
const uploadAvatar = async (file, folder = 'gaming-social/avatars') => {
  const result = await saveFileLocally(file, folder);
  return {
    url: result.url,
    publicId: result.publicId
  };
};

// Delete file locally
const deleteFile = async (publicId) => {
  try {
    // In a real implementation, you would delete the file from the filesystem
    // For now, we'll just return a success response
    return { result: 'ok' };
  } catch (error) {
    throw new Error(`Failed to delete file: ${error.message}`);
  }
};

// Upload multiple files
const uploadMultipleFiles = async (files, folder = 'gaming-social') => {
  const uploadPromises = files.map(file => {
    if (file.mimetype.startsWith('image/')) {
      return uploadImage(file, folder);
    } else if (file.mimetype.startsWith('video/')) {
      return uploadVideo(file, folder);
    } else {
      throw new Error(`Unsupported file type: ${file.mimetype}`);
    }
  });

  try {
    const results = await Promise.all(uploadPromises);
    return results.map((result, index) => ({
      type: files[index].mimetype.startsWith('image/') ? 'image' : 'video',
      ...result
    }));
  } catch (error) {
    throw new Error(`Failed to upload files: ${error.message}`);
  }
};

module.exports = {
  uploadImage,
  uploadVideo,
  uploadAvatar,
  deleteFile,
  uploadMultipleFiles
};