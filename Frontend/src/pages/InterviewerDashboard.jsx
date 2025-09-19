import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import MonitoringDashboard from '../components/MonitoringDashboard';
import AlertsMonitor from '../components/AlertsMonitor';

// Import detection services
import FocusDetectionService from '../services/focusDetectionService';
import ObjectDetectionService from '../services/objectDetectionService';

// Import Professional WebRTC Service
import ProfessionalWebRTCService from '../services/professionalWebRTCService';

const InterviewerDashboard = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // State management
  const [isConnected, setIsConnected] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [candidateConnected, setCandidateConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [violations, setViolations] = useState([]);
  const [focusStatus, setFocusStatus] = useState('waiting');
  const [detectionActive, setDetectionActive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [candidateInfo, setCandidateInfo] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // System status
  const [systemStatus, setSystemStatus] = useState({
    focusDetection: false,
    objectDetection: false,
    videoRecording: false,
    webrtcConnection: false
  });

  const [serviceStats, setServiceStats] = useState({
    totalEvents: 0,
    violations: 0,
    focusEvents: 0,
    objectEvents: 0
  });

  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const webrtcServiceRef = useRef(null);
  const detectionCanvasRef = useRef(null);
  const chatRef = useRef(null);
  const isCallingRef = useRef(false);
  const hasJoinedRoomRef = useRef(false);

  // Services
  const focusServiceRef = useRef(new FocusDetectionService());
  const objectServiceRef = useRef(new ObjectDetectionService());

  // Initialize Professional WebRTC Service
  useEffect(() => {
    webrtcServiceRef.current = new ProfessionalWebRTCService();
    return () => {
      if (webrtcServiceRef.current) {
        webrtcServiceRef.current.cleanup();
      }
    };
  }, []);

  useEffect(() => {
    // Check if user is logged in as interviewer
    const storedUserInfo = sessionStorage.getItem('userInfo');
    if (!storedUserInfo) {
      navigate('/');
      return;
    }

    const userData = JSON.parse(storedUserInfo);
    if (userData.role !== 'interviewer') {
      navigate('/');
      return;
    }

    setUserInfo(userData);
    initializeConnection();

    return () => {
      cleanup();
    };
  }, [sessionId, navigate]);

  // Initialize WebRTC service when socket is available
  useEffect(() => {
    if (socket && webrtcServiceRef.current && !webrtcServiceRef.current.isInitialized) {
      initializeWebRTCService().catch(error => {
        console.error('Failed to initialize WebRTC service:', error);
      });
    }
  }, [socket]);

  // Handle candidate connection events
  useEffect(() => {
    if (candidateConnected && webrtcServiceRef.current && webrtcServiceRef.current.isInitialized) {
      console.log('Candidate connected, attempting to initiate call...');
      setTimeout(() => {
        initiateCall();
      }, 1000);
    }
  }, [candidateConnected, webrtcServiceRef.current]);

  // Ensure video elements get streams when refs are available
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      console.log('Setting local video source...');
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      console.log('Setting remote video source...');
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const initializeConnection = async () => {
    try {
      console.log('Starting connection initialization...');

      // First, get user media for interviewer
      console.log('Getting interviewer media stream...');
      await initializeLocalStream();

      // Then initialize socket connection after media is ready
      console.log('Media ready, creating socket connection...');
      const newSocket = io(import.meta.env.VITE_SOCKET_URL, {
        query: {
          sessionId,
          role: 'interviewer'
        }
      });

      setSocket(newSocket);
      setupSocketListeners(newSocket);

      setIsConnected(true);

    } catch (error) {
      console.error('Connection initialization failed:', error);
    }
  };

  // Removed waitForReadyAndCall - handled by Professional WebRTC Service

  const setupSocketListeners = (socket) => {
    socket.on('connect', () => {
      console.log('Interviewer socket connected');

      // Join room after WebRTC service is ready
      if (webrtcServiceRef.current && webrtcServiceRef.current.isInitialized && !hasJoinedRoomRef.current) {
        console.log('WebRTC service ready, joining room...');
        socket.emit('join-room', { sessionId, role: 'interviewer' });
        hasJoinedRoomRef.current = true;
      } else {
        console.log('Waiting for WebRTC service before joining room...');
      }
    });

    socket.on('candidate-joined', (candidateData) => {
      console.log('Candidate joined:', candidateData);
      setCandidateConnected(true);
      setCandidateInfo(candidateData);
    });

    socket.on('candidate-ready', () => {
      console.log('Candidate is ready for WebRTC connection');
      setCandidateConnected(true);
    });

    socket.on('candidate-left', () => {
      console.log('Candidate left the session');
      setCandidateConnected(false);
      setCandidateInfo(null);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      setRemoteStream(null);
      stopDetection();
    });

    socket.on('offer', async (offer) => {
      console.log('Interviewer: Received offer (renegotiation) from candidate');
      if (webrtcServiceRef.current) {
        try {
          await webrtcServiceRef.current.handleOffer(offer);
        } catch (e) {
          console.error('Failed to handle renegotiation offer:', e);
        }
      }
    });

    socket.on('answer', async (answer) => {
      console.log('Interviewer: Received answer from candidate');
      if (webrtcServiceRef.current) {
        await webrtcServiceRef.current.handleAnswer(answer);
      }
    });

    socket.on('ice-candidate', async (candidate) => {
      console.log('Interviewer: Received ICE candidate from candidate');
      if (webrtcServiceRef.current) {
        await webrtcServiceRef.current.handleIceCandidate(candidate);
      }
    });

    socket.on('chat-message', (message) => {
      // Only add message if it's from candidate (avoid duplicate of our own messages)
      if (message.role !== 'interviewer') {
        setMessages(prev => [...prev, {
          ...message,
          timestamp: new Date(message.timestamp)
        }]);
      }
    });

    // Real-time monitoring events
    socket.on('focus-update', (data) => {
      setFocusStatus(data.event.type || 'focused');
      setServiceStats(prev => ({
        ...prev,
        focusEvents: prev.focusEvents + 1,
        totalEvents: prev.totalEvents + 1
      }));
    });

    socket.on('violation-detected', (data) => {
      handleViolationReceived(data.violation);
    });
  };

  const initializeLocalStream = async () => {
    try {
      console.log('Requesting interviewer media access...');

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: true
      });

      console.log('Got media stream with tracks:', stream.getTracks().map(t => `${t.kind}:${t.readyState}`));

      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log('Set local video srcObject');
      }

      console.log('Interviewer local stream initialized successfully');
      return stream;
    } catch (error) {
      console.error('Failed to get interviewer media:', error);

      if (error.name === 'NotAllowedError') {
        alert('Camera and microphone access is required for the interview. Please allow access and refresh the page.');
      } else if (error.name === 'NotFoundError') {
        alert('No camera or microphone found. Please connect a camera and microphone and refresh the page.');
      } else {
        alert('Failed to access camera and microphone: ' + error.message);
      }

      throw error;
    }
  };

  const initializeWebRTCService = async () => {
    try {
      console.log('🚀 Initializing Professional WebRTC Service for Interviewer...');

      const service = webrtcServiceRef.current;

      // Set up event handlers
      service.onRemoteStream = (candidateStream) => {
        console.log('📹 INTERVIEWER: Received candidate stream');
        setRemoteStream(candidateStream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = candidateStream;
          try { remoteVideoRef.current.muted = false; } catch {}
          remoteVideoRef.current.play?.().catch((e) => {
            console.warn('Autoplay with sound blocked (interviewer).', e?.message);
          });
          console.log('📹 Set remote video srcObject successfully');
        }

        // Start AI detection on candidate stream
        startDetection(candidateStream);
        setSystemStatus(prev => ({ ...prev, webrtcConnection: true }));
      };

      service.onConnectionEstablished = () => {
        console.log('✅ WebRTC connection established');
        setSystemStatus(prev => ({ ...prev, webrtcConnection: true }));
      };

      service.onConnectionLost = () => {
        console.log('⚠️ WebRTC connection lost');
        setSystemStatus(prev => ({ ...prev, webrtcConnection: false }));
      };

      service.onError = (error) => {
        console.error('🚨 WebRTC Error:', error);
      };

      // Initialize the service
      await service.initialize(socket);

      // Get local stream and set it to video element
      const stream = service.localStream;
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection
      await service.createPeerConnection();

      // Join room now that service is ready
      if (socket.connected && !hasJoinedRoomRef.current) {
        console.log('Socket connected, joining room now...');
        socket.emit('join-room', { sessionId, role: 'interviewer' });
        hasJoinedRoomRef.current = true;
      }

      console.log('✅ WebRTC service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize WebRTC service:', error);
      throw error;
    }
  };

  const initiateCall = async () => {
    if (isCallingRef.current) {
      console.log('Call already in progress, skipping...');
      return;
    }

    isCallingRef.current = true;
    try {
      console.log('Creating WebRTC offer using Professional Service...');

      if (webrtcServiceRef.current) {
        await webrtcServiceRef.current.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
      }
    } catch (error) {
      console.error('Error creating offer:', error);
    } finally {
      isCallingRef.current = false;
    }
  };

  const startDetection = async (candidateStream) => {
    try {
      console.log('Starting AI detection on candidate stream');

      // Wait for detection canvas to be available
      let attempts = 0;
      while (!detectionCanvasRef.current && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!detectionCanvasRef.current) {
        console.error('Detection canvas not available');
        return;
      }

      // Create a video element for detection
      const detectionVideo = document.createElement('video');
      detectionVideo.srcObject = candidateStream;
      detectionVideo.autoplay = true;
      detectionVideo.muted = true;

      await new Promise((resolve) => {
        detectionVideo.onloadedmetadata = resolve;
      });

      // Initialize detection services
      await focusServiceRef.current.initialize(detectionVideo, detectionCanvasRef.current);
      await objectServiceRef.current.initialize(detectionVideo, detectionCanvasRef.current);

      // Set up event listeners
      focusServiceRef.current.addEventListener(handleFocusEvent);
      objectServiceRef.current.addEventListener(handleObjectEvent);

      setSystemStatus(prev => ({
        ...prev,
        focusDetection: true,
        objectDetection: true
      }));

      setDetectionActive(true);
      console.log('AI detection started successfully');

    } catch (error) {
      console.error('Failed to start detection:', error);
    }
  };

  const stopDetection = () => {
    focusServiceRef.current.stop();
    objectServiceRef.current.stop();
    setDetectionActive(false);
    setSystemStatus(prev => ({
      ...prev,
      focusDetection: false,
      objectDetection: false
    }));
  };

  const handleFocusEvent = useCallback((event) => {
    console.log('Focus event detected:', event);
    setFocusStatus(event.type);
    setServiceStats(prev => ({
      ...prev,
      focusEvents: prev.focusEvents + 1,
      totalEvents: prev.totalEvents + 1
    }));

    // Create violation if needed
    if (['looking_away', 'no_face_detected', 'multiple_faces_detected'].includes(event.type)) {
      const violation = {
        id: Date.now(),
        type: event.type,
        description: event.message || `Focus violation: ${event.type}`,
        severity: 'warning',
        timestamp: new Date(),
        source: 'focus_detection',
        confidence: event.confidence || 0.8
      };

      handleViolation(violation);
    }
  }, []);

  const handleObjectEvent = useCallback((event) => {
    console.log('Object event detected:', event);
    setServiceStats(prev => ({
      ...prev,
      objectEvents: prev.objectEvents + 1,
      totalEvents: prev.totalEvents + 1
    }));

    if (event.type === 'unauthorized_item_detected') {
      const violation = {
        id: Date.now(),
        type: 'unauthorized_item',
        description: event.message || 'Unauthorized item detected',
        severity: event.priority === 'high' ? 'critical' : 'warning',
        timestamp: new Date(),
        source: 'object_detection',
        confidence: event.confidence || 0.8
      };

      handleViolation(violation);
    }
  }, []);

  const handleViolation = (violation) => {
    setViolations(prev => [...prev, violation]);
    setServiceStats(prev => ({
      ...prev,
      violations: prev.violations + 1
    }));

    // Send violation to backend and candidate
    if (socket) {
      socket.emit('violation-recorded', {
        sessionId,
        violation,
        timestamp: new Date()
      });
    }
  };

  const handleViolationReceived = (violation) => {
    setViolations(prev => [...prev, {
      ...violation,
      timestamp: new Date(violation.timestamp)
    }]);
    setServiceStats(prev => ({
      ...prev,
      violations: prev.violations + 1
    }));
  };

  const sendMessage = () => {
    if (newMessage.trim() && socket) {
      const message = {
        sender: userInfo.name,
        role: 'interviewer',
        text: newMessage.trim(),
        timestamp: new Date().toISOString()
      };

      // Add message to local state immediately so interviewer sees their own message
      setMessages(prev => [...prev, {
        ...message,
        timestamp: new Date(message.timestamp)
      }]);

      // Send message to candidate via socket
      socket.emit('chat-message', message);
      setNewMessage('');
    }
  };

  const endSession = () => {
    if (window.confirm('Are you sure you want to end the interview session?')) {
      if (socket) {
        socket.emit('end-session', { sessionId });
      }
      cleanup();
      navigate(`/report/${sessionId}`);
    }
  };

  const cleanup = () => {
    if (webrtcServiceRef.current) {
      webrtcServiceRef.current.cleanup();
    }
    if (socket) {
      socket.disconnect();
    }
    stopDetection();
  };

  // Fullscreen control
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const exitFullscreen = () => {
    setIsFullscreen(false);
  };

  // Handle escape key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        exitFullscreen();
      }
    };

    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  const styles = {
    container: {
      height: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      position: 'relative'
    },
    sidebar: {
      position: 'fixed',
      left: 0,
      top: 0,
      bottom: 0,
      width: '80px',
      background: 'rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(20px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '20px 0',
      zIndex: 100
    },
    sidebarIcon: {
      width: '48px',
      height: '48px',
      borderRadius: '12px',
      background: 'rgba(255, 255, 255, 0.2)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      marginBottom: '16px',
      cursor: 'pointer',
      transition: 'all 0.3s ease'
    },
    mainContent: {
      marginLeft: '80px',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative'
    },
    topBar: {
      position: 'absolute',
      top: '20px',
      left: '20px',
      right: '20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      zIndex: 50,
      height: '60px'
    },
    sessionInfo: {
      background: 'rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(20px)',
      borderRadius: '12px',
      padding: '12px 20px',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    },
    timer: {
      background: 'rgba(255, 255, 255, 0.2)',
      borderRadius: '8px',
      padding: '8px 12px',
      fontFamily: 'monospace',
      fontSize: '16px',
      fontWeight: 'bold'
    },
    participantName: {
      fontSize: '14px',
      opacity: 0.9
    },
    statusIndicator: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: candidateConnected ? '#4ade80' : '#ef4444'
    },
    videoContainer: {
      flex: 1,
      padding: '100px 20px 20px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px'
    },
    mainVideoArea: {
      flex: 1,
      position: 'relative',
      borderRadius: '20px',
      overflow: 'hidden',
      background: '#1f2937',
      boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
    },
    candidateVideo: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    },
    videoLabel: {
      position: 'absolute',
      bottom: '20px',
      left: '20px',
      background: 'rgba(0,0,0,0.7)',
      color: 'white',
      padding: '8px 16px',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '500',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    detectionCanvas: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none'
    },
    participantGrid: {
      display: 'flex',
      gap: '12px',
      height: '140px'
    },
    participantVideo: {
      width: '200px',
      height: '140px',
      borderRadius: '12px',
      overflow: 'hidden',
      position: 'relative',
      background: '#1f2937',
      boxShadow: '0 8px 16px rgba(0,0,0,0.2)'
    },
    participantVideoElement: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transform: 'scaleX(-1)' // Mirror interviewer video
    },
    participantLabel: {
      position: 'absolute',
      bottom: '8px',
      left: '8px',
      background: 'rgba(0,0,0,0.7)',
      color: 'white',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: '500'
    },
    noVideo: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      background: 'rgba(51, 51, 51, 0.8)',
      color: 'white',
      fontSize: '24px',
      gap: '12px'
    },
    noVideoText: {
      fontSize: '14px',
      color: '#ccc',
      textAlign: 'center'
    },
    controlBar: {
      position: 'absolute',
      bottom: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(255, 255, 255, 0.1)',
      backdropFilter: 'blur(20px)',
      borderRadius: '20px',
      padding: '16px 24px',
      display: 'flex',
      gap: '16px',
      alignItems: 'center',
      zIndex: 50
    },
    controlButton: {
      width: '48px',
      height: '48px',
      borderRadius: '12px',
      border: 'none',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '18px',
      transition: 'all 0.3s ease',
      background: 'rgba(255, 255, 255, 0.2)',
      color: 'white'
    },
    recordButton: {
      background: '#ef4444',
      color: 'white'
    },
    endButton: {
      background: '#ef4444',
      color: 'white'
    },
    floatingChat: {
      position: 'fixed',
      top: '100px',
      right: '20px',
      width: '350px',
      height: '500px',
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(20px)',
      borderRadius: '20px',
      boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column'
    },
    chatHeader: {
      padding: '16px 20px',
      borderBottom: '1px solid rgba(224, 224, 224, 0.3)',
      fontWeight: '600',
      fontSize: '16px',
      color: '#2d3748',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    chatMessages: {
      flex: 1,
      overflowY: 'auto',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px'
    },
    message: {
      padding: '12px 16px',
      borderRadius: '12px',
      background: 'rgba(248, 249, 250, 0.8)',
      border: '1px solid rgba(0, 0, 0, 0.05)',
      backdropFilter: 'blur(5px)'
    },
    messageHeader: {
      fontSize: '12px',
      color: '#666',
      marginBottom: '4px'
    },
    messageText: {
      fontSize: '14px',
      color: '#333'
    },
    chatInput: {
      padding: '16px 20px',
      borderTop: '1px solid rgba(224, 224, 224, 0.3)',
      display: 'flex',
      gap: '12px'
    },
    input: {
      flex: 1,
      padding: '12px 16px',
      borderRadius: '12px',
      border: '1px solid rgba(0, 0, 0, 0.1)',
      background: 'rgba(255, 255, 255, 0.8)',
      fontSize: '14px',
      outline: 'none',
      transition: 'all 0.3s ease'
    },
    sendButton: {
      padding: '12px 20px',
      borderRadius: '12px',
      border: 'none',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '14px',
      transition: 'all 0.3s ease',
      boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)'
    },
    fullscreenOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: '#000000',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    fullscreenVideo: {
      width: '100%',
      height: '100%',
      objectFit: 'contain'
    },
    fullscreenControls: {
      position: 'absolute',
      top: '20px',
      right: '20px',
      display: 'flex',
      gap: '12px',
      zIndex: 10001
    },
    exitButton: {
      padding: '8px 16px',
      borderRadius: '6px',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      cursor: 'pointer',
      fontSize: '14px',
      fontWeight: '500',
      transition: 'all 0.2s ease'
    }
  };

  return (
    <div style={styles.container}>
      {/* Left Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarIcon}>🏠</div>
        <div style={styles.sidebarIcon}>📹</div>
        <div style={styles.sidebarIcon}>👥</div>
        <div style={styles.sidebarIcon}>⚙️</div>
        <div style={styles.sidebarIcon}>❓</div>
        <div style={styles.sidebarIcon} onClick={() => navigate('/')}>🚪</div>
      </div>

      {/* Main Content */}
      <div style={styles.mainContent}>
        {/* Top Bar */}
        <div style={styles.topBar}>
          <div style={styles.sessionInfo}>
            <div style={styles.timer}>24:01:45</div>
            <div style={styles.participantName}>
              {candidateInfo ? candidateInfo.name : 'Waiting for candidate...'}
            </div>
            <div style={styles.statusIndicator}></div>
          </div>
        </div>

        {/* Video Container */}
        <div style={styles.videoContainer}>
          {/* Main Candidate Video */}
          <div style={styles.mainVideoArea}>
            {remoteStream ? (
              <>
                <video
                  ref={remoteVideoRef}
                  style={styles.candidateVideo}
                  autoPlay
                  playsInline
                />
                <canvas
                  ref={detectionCanvasRef}
                  style={styles.detectionCanvas}
                />
                <div style={styles.videoLabel}>
                  <div style={styles.statusIndicator}></div>
                  {candidateInfo ? candidateInfo.name : 'Candidate'}
                </div>
              </>
            ) : (
              <div style={styles.noVideo}>
                👤
                <div style={styles.noVideoText}>Waiting for candidate</div>
              </div>
            )}
          </div>

          {/* Participant Grid */}
          <div style={styles.participantGrid}>
            <div style={styles.participantVideo}>
              {localStream ? (
                <video
                  ref={localVideoRef}
                  style={styles.participantVideoElement}
                  autoPlay
                  muted
                  playsInline
                />
              ) : (
                <div style={styles.noVideo}>
                  📷
                  <div style={styles.noVideoText}>Camera off</div>
                </div>
              )}
              <div style={styles.participantLabel}>You</div>
            </div>
          </div>
        </div>

        {/* Control Bar */}
        <div style={styles.controlBar}>
          <button style={styles.controlButton} title="Mute">
            🎤
          </button>
          <button style={styles.controlButton} title="Camera">
            📹
          </button>
          <button style={styles.controlButton} title="Share Screen">
            📺
          </button>
          <button style={{...styles.controlButton, ...styles.recordButton}} title="Record">
            ⏺
          </button>
          <button style={styles.controlButton} title="Breakout Rooms">
            👥
          </button>
          <button style={styles.controlButton} title="Reactions">
            😊
          </button>
          <button style={{...styles.controlButton, ...styles.endButton}} onClick={endSession} title="End Session">
            📞
          </button>
        </div>
      </div>

      {/* Floating Chat Panel */}
      <div style={styles.floatingChat}>
        <div style={styles.chatHeader}>
          💬 Communication
        </div>
        <div style={styles.chatMessages} ref={chatRef}>
          {messages.map((message, index) => (
            <div key={index} style={styles.message}>
              <div style={styles.messageHeader}>
                {message.sender} • {message.timestamp.toLocaleTimeString()}
              </div>
              <div style={styles.messageText}>
                {message.text}
              </div>
            </div>
          ))}
        </div>
        <div style={styles.chatInput}>
          <input
            style={styles.input}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Write a reply..."
          />
          <button style={styles.sendButton} onClick={sendMessage}>
            ➤
          </button>
        </div>
      </div>

      {/* Floating AlertsMonitor */}
      <div style={{
        position: 'fixed',
        top: '620px',
        right: '20px',
        width: '350px',
        zIndex: 199
      }}>
        <AlertsMonitor
          violations={violations}
          focusStatus={focusStatus}
          systemStatus={systemStatus}
          serviceStats={serviceStats}
        />
      </div>

      {/* Fullscreen Overlay */}
      {isFullscreen && remoteStream && (
        <div style={styles.fullscreenOverlay}>
          <video
            ref={remoteVideoRef}
            style={styles.fullscreenVideo}
            autoPlay
            playsInline
          />
          <div style={styles.fullscreenControls}>
            <button
              style={styles.exitButton}
              onClick={exitFullscreen}
              title="Exit Fullscreen (ESC)"
            >
              Exit Fullscreen
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterviewerDashboard;