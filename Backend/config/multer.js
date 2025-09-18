const multer = require('multer');
const path = require('path');

// Configure multer for video uploads
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/recordings/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `recording-${req.params.sessionId || uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// Configure multer for evidence/screenshot uploads
const evidenceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/evidence/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `evidence-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// File filter for video uploads
const videoFileFilter = (req, file, cb) => {
  const allowedMimes = ['video/mp4', 'video/webm', 'video/ogg'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only video files are allowed.'));
  }
};

// File filter for image uploads
const imageFileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only image files are allowed.'));
  }
};

// Video upload configuration
const videoUpload = multer({
  storage: videoStorage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: videoFileFilter
});

// Evidence/screenshot upload configuration
const evidenceUpload = multer({
  storage: evidenceStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for screenshots
  },
  fileFilter: imageFileFilter
});

// Error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 100MB.'
      });
    }
    return res.status(400).json({
      success: false,
      message: 'File upload error.',
      error: error.message
    });
  }
  next(error);
};

module.exports = {
  upload: videoUpload, // Keep backward compatibility
  videoUpload,
  evidenceUpload,
  handleMulterError
};