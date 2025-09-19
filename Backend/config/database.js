const mongoose = require('mongoose');

// MongoDB connection configuration
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/video_proctoring');
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  }
};

// Database connection with retry logic
const connectWithRetry = async (retries = 5) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await connectDB();
    } catch (error) {
      console.log(`Database connection attempt ${i + 1} failed. Retrying in 5 seconds...`);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};

// Graceful shutdown handler
const gracefulShutdown = async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed through app termination');
    process.exit(0);
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
    process.exit(1);
  }
};

// Handle process termination
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

module.exports = {
  connectDB,
  connectWithRetry,
  gracefulShutdown
};
