import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
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
  const [interview, setInterview] = useState(null);
  const [violations, setViolations] = useState([]);
  const [focusStatus, setFocusStatus] = useState('waiting');
  const [detectionActive, setDetectionActive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [candidateInfo, setCandidateInfo] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [connectionQuality, setConnectionQuality] = useState('good');
  const [recordingStatus, setRecordingStatus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    loadInterviewData();
    initializeConnection();

    return () => {
      cleanup();
    };
  }, [sessionId, navigate]);

  const loadInterviewData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/interviews/${sessionId}`);

      if (response.data.success) {
        setInterview(response.data.data.interview);
        setViolations(response.data.data.violations || []);
        setError('');
      } else {
        setError('Interview session not found');
      }
    } catch (error) {
      console.error('Error loading interview data:', error);
      setError('Failed to load interview data');
    } finally {
      setLoading(false);
    }
  };

  // Initialize WebRTC service when socket is connected
  useEffect(() => {
    if (socket && socket.connected && webrtcServiceRef.current && !webrtcServiceRef.current.isInitialized) {
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

      // Initialize WebRTC service after socket is connected
      if (webrtcServiceRef.current && !webrtcServiceRef.current.isInitialized) {
        initializeWebRTCService().catch(error => {
          console.error('Failed to initialize WebRTC service after socket connection:', error);
        });
      } else if (webrtcServiceRef.current && webrtcServiceRef.current.isInitialized && !hasJoinedRoomRef.current) {
        console.log('WebRTC service ready, joining room...');
        socket.emit('join-room', { sessionId, role: 'interviewer' });
        hasJoinedRoomRef.current = true;
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

  const handleViolation = async (violation) => {
    try {
      // Create FormData for violation with optional screenshot
      const formData = new FormData();
      formData.append('sessionId', sessionId);
      formData.append('type', violation.type);
      formData.append('description', violation.description);
      formData.append('confidence', violation.confidence || 0.8);
      formData.append('severity', violation.severity === 'critical' ? 'high' : violation.severity);
      formData.append('timestamp', violation.timestamp.toISOString());

      // Send violation to backend
      const response = await axios.post(`${import.meta.env.VITE_API_URL || 'https://video-proctoring-system-0i3w.onrender.com/api'}/violations`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.success) {
        // Update local state with backend response
        setViolations(prev => [...prev, response.data.data]);
        setServiceStats(prev => ({
          ...prev,
          violations: prev.violations + 1
        }));

        // Send violation to candidate via socket
        if (socket) {
          socket.emit('violation-recorded', {
            sessionId,
            violation: response.data.data,
            timestamp: new Date()
          });
        }
      }
    } catch (error) {
      console.error('Error recording violation:', error);
      // Still add to local state as fallback
      setViolations(prev => [...prev, violation]);
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

  const endSession = async () => {
    if (window.confirm('Are you sure you want to end the interview session?')) {
      try {
        setLoading(true);

        // End the interview session in backend
        await axios.post(`/api/interviews/${sessionId}/end`);

        // Generate report
        await axios.get(`/api/interviews/${sessionId}/report`);

        // Notify via socket
        if (socket) {
          socket.emit('end-session', { sessionId });
        }

        cleanup();
        navigate(`/report/${sessionId}`);
      } catch (error) {
        console.error('Error ending session:', error);
        setError('Failed to end session properly');
        setLoading(false);
      }
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

  // Video control functions
  const toggleMute = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !isCameraOn;
      });
      setIsCameraOn(!isCameraOn);
    }
  };

  const startInterview = async () => {
    try {
      const response = await axios.post(`/api/interviews/${sessionId}/start`);
      if (response.data.success) {
        console.log('Interview started successfully');
        // Update interview state if needed
        if (interview) {
          setInterview({...interview, status: 'in_progress'});
        }
      }
    } catch (error) {
      console.error('Error starting interview:', error);
      setError('Failed to start interview session');
    }
  };

  const startRecording = async () => {
    try {
      // Start interview session if not already started
      if (interview && interview.status === 'scheduled') {
        await startInterview();
      }

      setRecordingStatus(true);
      setSystemStatus(prev => ({ ...prev, videoRecording: true }));

      // In a real implementation, you would initialize MediaRecorder here
      console.log('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      setError('Failed to start recording');
    }
  };

  const stopRecording = async () => {
    try {
      setRecordingStatus(false);
      setSystemStatus(prev => ({ ...prev, videoRecording: false }));

      // In a real implementation, you would stop MediaRecorder and upload the file
      console.log('Recording stopped');
    } catch (error) {
      console.error('Error stopping recording:', error);
      setError('Failed to stop recording');
    }
  };

  // Monitor connection quality
  useEffect(() => {
    const interval = setInterval(() => {
      if (webrtcServiceRef.current && webrtcServiceRef.current.peerConnection) {
        const stats = webrtcServiceRef.current.peerConnection.getStats();
        stats.then(report => {
          report.forEach(stat => {
            if (stat.type === 'inbound-rtp' && stat.mediaType === 'video') {
              const packetLoss = stat.packetsLost / stat.packetsReceived;
              if (packetLoss > 0.05) {
                setConnectionQuality('poor');
              } else if (packetLoss > 0.02) {
                setConnectionQuality('fair');
              } else {
                setConnectionQuality('good');
              }
            }
          });
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  const styles = {
    container: {
      height: '100vh',
      background: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    },
    header: {
      background: '#ffffff',
      padding: '20px 32px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
    },
    title: {
      fontSize: '24px',
      fontWeight: '600',
      color: '#1a202c',
      margin: 0,
      letterSpacing: '-0.025em'
    },
    headerControls: {
      display: 'flex',
      gap: '16px',
      alignItems: 'center'
    },
    statusBadge: {
      padding: '8px 16px',
      borderRadius: '6px',
      fontSize: '14px',
      fontWeight: '500',
      background: candidateConnected ? '#f0fff4' : '#fef2f2',
      border: `1px solid ${candidateConnected ? '#10b981' : '#ef4444'}`,
      color: candidateConnected ? '#065f46' : '#991b1b'
    },
    mainGrid: {
      flex: 1,
      display: 'grid',
      gridTemplateColumns: '1fr 380px',
      gap: '24px',
      padding: '24px',
      overflow: 'hidden'
    },
    leftPanel: {
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      overflow: 'hidden'
    },
    videoSection: {
      background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
      borderRadius: '16px',
      padding: '24px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
      border: '1px solid #e2e8f0',
      height: '800px',
      position: 'relative'
    },
    videoSectionTitle: {
      fontSize: '20px',
      fontWeight: '700',
      color: '#1a202c',
      margin: '0 0 24px 0',
      borderBottom: '2px solid #e2e8f0',
      paddingBottom: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    },
    videoGrid: {
      display: 'grid',
      gridTemplateColumns: '2.5fr 1fr',
      gap: '24px',
      height: 'calc(100% - 80px)'
    },
    candidateVideo: {
      position: 'relative',
      background: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)',
      borderRadius: isFullscreen ? '0' : '12px',
      overflow: 'hidden',
      boxShadow: isFullscreen ? 'none' : '0 8px 24px rgba(0, 0, 0, 0.15)',
      border: isFullscreen ? 'none' : '2px solid #374151',
      minHeight: '420px',
      transition: 'all 0.3s ease'
    },
    video: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transition: 'all 0.3s ease'
    },
    videoLabel: {
      position: 'absolute',
      top: '16px',
      left: '16px',
      background: 'rgba(0,0,0,0.85)',
      color: 'white',
      padding: '8px 16px',
      borderRadius: '8px',
      fontSize: '13px',
      fontWeight: '600',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.1)',
      zIndex: 10
    },
    detectionCanvas: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none'
    },
    interviewerVideo: {
      background: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)',
      borderRadius: '12px',
      overflow: 'hidden',
      position: 'relative',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
      border: '2px solid #374151',
      maxHeight: '320px',
      minHeight: '220px',
      transition: 'all 0.3s ease'
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
    liveMonitoringSection: {
      marginTop: '20px',
      marginBottom: '20px'
    },
    rightPanel: {
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      overflow: 'hidden'
    },
    chatSection: {
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(20px)',
      borderRadius: '20px',
      boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      height: '400px', // Increased height since Live Monitoring moved
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
    controlsSection: {
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(20px)',
      borderRadius: '20px',
      padding: '20px',
      boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)'
    },
    controlsTitle: {
      fontSize: '16px',
      fontWeight: '600',
      color: '#2d3748',
      margin: '0 0 16px 0',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    controlButtons: {
      display: 'flex',
      gap: '12px',
      justifyContent: 'center'
    },
    button: {
      padding: '14px 24px',
      borderRadius: '12px',
      border: 'none',
      fontWeight: '600',
      cursor: 'pointer',
      fontSize: '14px',
      transition: 'all 0.3s ease',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    endButton: {
      background: 'linear-gradient(135deg, #f44336, #e53935)',
      color: 'white',
      boxShadow: '0 4px 15px rgba(244, 67, 54, 0.4)'
    },
    reportButton: {
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
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
    fullscreenButton: {
      position: 'absolute',
      bottom: '16px',
      right: '16px',
      width: '44px',
      height: '44px',
      borderRadius: '10px',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      background: 'rgba(0, 0, 0, 0.85)',
      color: 'white',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '18px',
      fontWeight: '600',
      transition: 'all 0.3s ease',
      zIndex: 20,
      backdropFilter: 'blur(10px)'
    },
    videoControls: {
      position: 'absolute',
      bottom: '16px',
      left: '16px',
      display: 'flex',
      gap: '8px',
      zIndex: 20
    },
    controlButton: {
      width: '40px',
      height: '40px',
      borderRadius: '8px',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      background: 'rgba(0, 0, 0, 0.85)',
      color: 'white',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '16px',
      transition: 'all 0.3s ease',
      backdropFilter: 'blur(10px)'
    },
    controlButtonActive: {
      background: 'rgba(239, 68, 68, 0.9)',
      borderColor: 'rgba(239, 68, 68, 0.5)'
    },
    connectionStatus: {
      position: 'absolute',
      top: '16px',
      right: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      background: 'rgba(0, 0, 0, 0.85)',
      padding: '6px 12px',
      borderRadius: '8px',
      color: 'white',
      fontSize: '12px',
      fontWeight: '500',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255,255,255,0.1)',
      zIndex: 10
    },
    connectionIndicator: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: '#10b981'
    },
    connectionIndicatorPoor: {
      background: '#ef4444'
    },
    connectionIndicatorFair: {
      background: '#f59e0b'
    },
    recordingIndicator: {
      position: 'absolute',
      top: '16px',
      right: '80px',
      background: 'rgba(239, 68, 68, 0.9)',
      color: 'white',
      padding: '6px 12px',
      borderRadius: '8px',
      fontSize: '12px',
      fontWeight: '600',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      zIndex: 10,
      animation: 'pulse 2s infinite'
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

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ fontSize: '24px' }}>⏳</div>
          <div>Loading interview dashboard...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ fontSize: '24px', color: '#ef4444' }}>⚠️</div>
          <div style={{ color: '#ef4444' }}>{error}</div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>
          Interviewer Dashboard - Session {sessionId}
        </h1>
        <div style={styles.headerControls}>
          {interview && (
            <div style={{
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '500',
              background: interview.status === 'in_progress' ? '#f0fff4' : '#fef2f2',
              border: `1px solid ${interview.status === 'in_progress' ? '#10b981' : '#f59e0b'}`,
              color: interview.status === 'in_progress' ? '#065f46' : '#92400e',
              textTransform: 'capitalize'
            }}>
              {interview.status.replace('_', ' ')}
            </div>
          )}
          <div style={styles.statusBadge}>
            {candidateConnected ? 'Candidate Connected' : 'Waiting for Candidate'}
          </div>
          {candidateInfo && (
            <span style={{ fontSize: '14px', color: '#666' }}>
              {candidateInfo.name}
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.mainGrid}>
        {/* Left Panel */}
        <div style={styles.leftPanel}>
          {/* Video Section */}
          <div style={styles.videoSection}>
            <div style={styles.videoSectionTitle}>
              📹 Live Video Feed
              {recordingStatus && (
                <span style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '600'
                }}>
                  ● REC
                </span>
              )}
            </div>
            <div style={styles.videoGrid}>
              {/* Candidate Video */}
              <div style={styles.candidateVideo}>
                <div style={styles.videoLabel}>
                  👤 Candidate {candidateInfo ? `- ${candidateInfo.name}` : ''}
                </div>

                {/* Connection Status */}
                {remoteStream && (
                  <div style={styles.connectionStatus}>
                    <div style={{
                      ...styles.connectionIndicator,
                      ...(connectionQuality === 'poor' ? styles.connectionIndicatorPoor : {}),
                      ...(connectionQuality === 'fair' ? styles.connectionIndicatorFair : {})
                    }}></div>
                    {connectionQuality.toUpperCase()}
                  </div>
                )}

                {/* Recording Indicator */}
                {recordingStatus && (
                  <div style={styles.recordingIndicator}>
                    ● REC
                  </div>
                )}

                {remoteStream ? (
                  <>
                    <video
                      ref={remoteVideoRef}
                      style={styles.video}
                      autoPlay
                      playsInline
                    />
                    <canvas
                      ref={detectionCanvasRef}
                      style={styles.detectionCanvas}
                    />
                  </>
                ) : (
                  <div style={styles.noVideo}>
                    👤
                    <div style={styles.noVideoText}>Waiting for candidate</div>
                  </div>
                )}

                {/* Video Controls */}
                {remoteStream && (
                  <div style={styles.videoControls}>
                    <button
                      style={{
                        ...styles.controlButton,
                        ...(recordingStatus ? styles.controlButtonActive : {})
                      }}
                      onClick={recordingStatus ? stopRecording : startRecording}
                      title={recordingStatus ? "Stop Recording" : "Start Recording"}
                    >
                      {recordingStatus ? '⏹️' : '🔴'}
                    </button>
                  </div>
                )}

                {/* Fullscreen Button */}
                {remoteStream && (
                  <button
                    style={styles.fullscreenButton}
                    onClick={toggleFullscreen}
                    title="Enter Fullscreen"
                  >
                    ⛶
                  </button>
                )}
              </div>

              {/* Interviewer Video */}
              <div style={styles.interviewerVideo}>
                <div style={styles.videoLabel}>📹 You</div>
                
                {localStream ? (
                  <>
                    <video
                      ref={localVideoRef}
                      style={{...styles.video, transform: 'scaleX(-1)'}}
                      autoPlay
                      muted
                      playsInline
                    />
                    
                    {/* Interviewer Controls */}
                    <div style={styles.videoControls}>
                      <button
                        style={{
                          ...styles.controlButton,
                          ...(!isMuted ? styles.controlButtonActive : {})
                        }}
                        onClick={toggleMute}
                        title={isMuted ? "Unmute" : "Mute"}
                      >
                        {isMuted ? '🔇' : '🎤'}
                      </button>
                      <button
                        style={{
                          ...styles.controlButton,
                          ...(!isCameraOn ? styles.controlButtonActive : {})
                        }}
                        onClick={toggleCamera}
                        title={isCameraOn ? "Turn Off Camera" : "Turn On Camera"}
                      >
                        {isCameraOn ? '📹' : '📷'}
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={styles.noVideo}>
                    📷
                    <div style={styles.noVideoText}>Camera disabled</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Live Monitoring - Moved from right panel */}
          <div style={styles.liveMonitoringSection}>
            <AlertsMonitor
              violations={violations}
              focusStatus={focusStatus}
              systemStatus={systemStatus}
              serviceStats={serviceStats}
            />
          </div>
        </div>

        {/* Right Panel */}
        <div style={styles.rightPanel}>

          {/* Chat Section */}
          <div style={styles.chatSection}>
            <div style={styles.chatHeader}>
              Communication
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
                placeholder="Send message to candidate..."
              />
              <button style={styles.sendButton} onClick={sendMessage}>
                Send
              </button>
            </div>
          </div>

          {/* Controls */}
          <div style={styles.controlsSection}>
            <div style={styles.controlsTitle}>
              Session Controls
            </div>
            <div style={styles.controlButtons}>
              <button
                style={{...styles.button, ...styles.reportButton}}
                onClick={() => navigate(`/report/${sessionId}`)}
              >
                View Report
              </button>
              <button
                style={{...styles.button, ...styles.endButton}}
                onClick={endSession}
              >
                End Session
              </button>
            </div>
          </div>
        </div>
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

      <style>
        {`
          @keyframes pulse {
            0% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
            100% {
              opacity: 1;
            }
          }
        `}
      </style>
    </div>
  );
};

export default InterviewerDashboard;