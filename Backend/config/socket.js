const socketIo = require('socket.io');

// Socket.IO configuration and handlers
const configureSocket = (server) => {
  // Get allowed origins function
  const getAllowedOrigins = () => {
    const defaultOrigins = [
      "https://video-proctoring-system-pink.vercel.app",
      "https://video-proctoring-system01.netlify.app",
    ];

    // Add production frontend URL(s) from environment variable
    if (process.env.FRONTEND_URL) {
      const frontendUrls = process.env.FRONTEND_URL.split(',').map(url => url.trim());
      return [...frontendUrls, ...defaultOrigins];
    }

    return defaultOrigins;
  };

  const io = socketIo(server, {
    cors: {
      origin: function(origin, callback) {
        // Allow requests with no origin
        if (!origin) return callback(null, true);

        const allowedOrigins = getAllowedOrigins();
        console.log('Socket.IO CORS check - Origin:', origin, 'Allowed:', allowedOrigins.includes(origin));

        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          console.log('Socket.IO CORS temporarily allowing origin:', origin);
          callback(null, true); // Temporarily allow all origins for debugging
        }
      },
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Active interviews tracking
  const activeInterviews = new Map();
  const roomUsers = new Map(); // Track users in each room

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Join room with role-based handling
    socket.on('join-room', (data) => {
      const { sessionId, role } = data;
      socket.join(sessionId);
      socket.role = role;
      socket.sessionId = sessionId;

      // Track users in the room
      if (!roomUsers.has(sessionId)) {
        roomUsers.set(sessionId, new Map());
      }

      const roomData = roomUsers.get(sessionId);
      roomData.set(socket.id, { role, socketId: socket.id });

      console.log(`${role} joined session: ${sessionId}`);

      // Notify other users in the room
      if (role === 'candidate') {
        socket.to(sessionId).emit('candidate-joined', data);
      } else if (role === 'interviewer') {
        socket.to(sessionId).emit('interviewer-joined', data);
      }
    });

    // Legacy support for existing join-interview event
    socket.on('join-interview', (sessionId) => {
      socket.join(sessionId);
      activeInterviews.set(sessionId, socket.id);
      console.log(`Client joined interview session: ${sessionId}`);
    });

    // WebRTC Signaling
    socket.on('offer', (offer) => {
      console.log('📤 Relaying offer from interviewer to candidate in session:', socket.sessionId);
      console.log('📤 Offer type:', offer?.type, 'SDP length:', offer?.sdp?.length);
      socket.to(socket.sessionId).emit('offer', offer);
    });

    socket.on('answer', (answer) => {
      console.log('📤 Relaying answer from candidate to interviewer in session:', socket.sessionId);
      console.log('📤 Answer type:', answer?.type, 'SDP length:', answer?.sdp?.length);
      socket.to(socket.sessionId).emit('answer', answer);
    });

    socket.on('ice-candidate', (candidate) => {
      console.log('📤 Relaying ICE candidate in session:', socket.sessionId);
      console.log('📤 ICE candidate type:', candidate?.type, 'protocol:', candidate?.protocol);
      socket.to(socket.sessionId).emit('ice-candidate', candidate);
    });

    // Candidate ready signal
    socket.on('candidate-ready', (data) => {
      console.log('Candidate ready for WebRTC in session:', data.sessionId);
      socket.to(data.sessionId).emit('candidate-ready', data);
    });

    // Chat messaging
    socket.on('chat-message', (message) => {
      console.log('Relaying chat message:', message);
      socket.to(socket.sessionId).emit('chat-message', message);
    });

    // Monitoring events
    socket.on('violation-detected', async (data) => {
      console.log('Violation detected:', data);

      try {
        // Save violation to database
        const Violation = require('../models/Violation');
        const Interview = require('../models/Interview');

        // Find the interview
        const interview = await Interview.findOne({ sessionId: data.sessionId });
        if (!interview) {
          console.error('Interview not found for sessionId:', data.sessionId);
          return;
        }

        // Extract violation data with proper mapping
        const violationData = data.violationData || data;

        // Create violation record
        const violation = new Violation({
          interviewId: interview._id,
          sessionId: data.sessionId,
          type: data.violationType || violationData.type || 'unknown',
          description: violationData.message || violationData.description || 'No description provided',
          confidence: violationData.confidence || 0.5,
          timestamp: violationData.timestamp ? new Date(violationData.timestamp) : new Date(),
          duration: violationData.duration || 0,
          severity: violationData.severity || 'medium',
          source: 'candidate_detection',
          metadata: {
            detectionSource: 'candidate_side',
            detectionLocation: 'candidate_side',
            candidateInfo: interview.candidateName,
            violationType: data.violationType,
            originalData: violationData
          }
        });

        await violation.save();
        console.log('✅ Violation saved to database:', violation._id);

        // Update interview counts
        const violationCount = await Violation.countDocuments({ sessionId: data.sessionId });
        const focusLostCount = await Violation.countDocuments({
          sessionId: data.sessionId,
          type: { $in: ['focus_lost', 'looking_away', 'no_face_detected', 'multiple_faces_detected'] }
        });
        const objectViolations = await Violation.countDocuments({
          sessionId: data.sessionId,
          type: { $in: ['unauthorized_item', 'unauthorized_object', 'phone_detected', 'book_detected', 'notes_detected', 'device_detected'] }
        });

        interview.violationCount = violationCount;
        interview.focusLostCount = focusLostCount;
        interview.objectViolationCount = objectViolations;
        interview.calculateIntegrityScore();
        await interview.save();

        console.log('📊 Interview stats updated:', {
          violationCount,
          focusLostCount,
          objectViolations,
          integrityScore: interview.integrityScore
        });

      } catch (error) {
        console.error('❌ Error saving violation to database:', error);
      }

      // Relay to interviewer dashboard
      socket.to(data.sessionId).emit('real-time-violation', data);
    });

    socket.on('violation-recorded', (data) => {
      console.log('Violation recorded by interviewer:', data);
      socket.to(data.sessionId).emit('violation-update', data);
    });

    socket.on('focus-status', (data) => {
      socket.to(data.sessionId).emit('focus-update', data);
    });

    socket.on('focus-update', (data) => {
      socket.to(data.sessionId).emit('focus-update', data);
    });

    socket.on('object-detection', (data) => {
      socket.to(data.sessionId).emit('object-detection', data);
    });

    // Session management
    socket.on('end-session', (data) => {
      console.log('Session ended by interviewer:', data.sessionId);
      socket.to(data.sessionId).emit('session-ended');

      // Clean up room data
      if (roomUsers.has(data.sessionId)) {
        roomUsers.delete(data.sessionId);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id} (${socket.role})`);

      // Notify others in the room about disconnection
      if (socket.sessionId && socket.role) {
        if (socket.role === 'candidate') {
          socket.to(socket.sessionId).emit('candidate-left');
        } else if (socket.role === 'interviewer') {
          socket.to(socket.sessionId).emit('interviewer-left');
        }

        // Clean up room data
        if (roomUsers.has(socket.sessionId)) {
          const roomData = roomUsers.get(socket.sessionId);
          roomData.delete(socket.id);

          // If room is empty, remove it
          if (roomData.size === 0) {
            roomUsers.delete(socket.sessionId);
          }
        }
      }

      // Remove from active interviews (legacy)
      for (const [sessionId, socketId] of activeInterviews.entries()) {
        if (socketId === socket.id) {
          activeInterviews.delete(sessionId);
          break;
        }
      }
    });
  });

  // Expose activeInterviews for health check
  io.getActiveInterviews = () => activeInterviews;

  return io;
};

module.exports = configureSocket;