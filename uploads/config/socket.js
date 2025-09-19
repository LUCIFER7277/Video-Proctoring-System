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
      origin: getAllowedOrigins(),
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
    socket.on('violation-detected', (data) => {
      console.log('Violation detected:', data);
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