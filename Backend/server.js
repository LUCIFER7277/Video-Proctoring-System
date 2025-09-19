const express = require('express');
const http = require('http');
const path = require('path');
require('dotenv').config();

// Import configurations
const { connectDB } = require('./config/database.js');
const configureSocket = require('./config/socket.js');

// Import middleware
const {
  securityMiddleware,
  createRateLimit,
  createViolationRateLimit,
  createGeneralAPIRateLimit,
  errorHandler,
  notFoundHandler
} = require('./middleware/index.js');

// Import routes
const interviewRoutes = require('./routes/interviewRoutes.js');
const violationRoutes = require('./routes/violationRoutes.js');
const reportRoutes = require('./routes/reportRoutes.js');

const app = express();
const server = http.createServer(app);

const io = configureSocket(server);

// Apply security middleware
app.use(securityMiddleware);

// Apply differentiated rate limiting
const generalLimiter = createGeneralAPIRateLimit();
const violationLimiter = createViolationRateLimit();

// Apply general rate limiting to all API routes
app.use('/api/', generalLimiter);

// Apply more permissive rate limiting specifically for violation endpoints
app.use('/api/violations', violationLimiter);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/interviews', interviewRoutes);
app.use('/api/violations', violationRoutes);
app.use('/api/reports', reportRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    activeInterviews: io.getActiveInterviews ? io.getActiveInterviews().size : 0
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', notFoundHandler);

const PORT = process.env.PORT || 8000;

const startServer = async () => {
  try {
    await connectDB();
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = { app, io };