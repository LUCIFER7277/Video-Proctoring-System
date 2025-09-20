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

// Apply CORS middleware first, before other middleware
const cors = require('cors');

// Apply CORS with comprehensive settings
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      "https://video-proctoring-system-pink.vercel.app",
      "https://video-proctoring-system01.netlify.app",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5174"
    ];

    // Add production frontend URL(s) from environment variable
    if (process.env.FRONTEND_URL) {
      const frontendUrls = process.env.FRONTEND_URL.split(',').map(url => url.trim());
      allowedOrigins.push(...frontendUrls);
    }

    console.log('CORS check - Origin:', origin, 'Allowed:', allowedOrigins.includes(origin));

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(null, true); // Temporarily allow all origins for debugging
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-File-Name'
  ]
}));

// Handle preflight OPTIONS requests explicitly
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-File-Name');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '3600'); // Cache preflight response for 1 hour
  res.sendStatus(200);
});

// Apply security middleware (without CORS since we handle it above)
const helmet = require('helmet');
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

// Apply differentiated rate limiting
const generalLimiter = createGeneralAPIRateLimit();
const violationLimiter = createViolationRateLimit();

// Apply general rate limiting to all API routes
app.use('/api/', generalLimiter);

// Apply more permissive rate limiting specifically for violation endpoints
app.use('/api/violations', violationLimiter);

// CORS debugging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/interviews', interviewRoutes);
app.use('/api/violations', violationRoutes);
app.use('/api/reports', reportRoutes);

app.get('/api/health', (req, res) => {
  console.log('Health check request from origin:', req.headers.origin);
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    activeInterviews: io.getActiveInterviews ? io.getActiveInterviews().size : 0,
    origin: req.headers.origin,
    userAgent: req.headers['user-agent']
  });
});

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
  console.log('CORS test request from origin:', req.headers.origin);
  res.json({
    message: 'CORS is working!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
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