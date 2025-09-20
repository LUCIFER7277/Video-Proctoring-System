import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';

// Import Professional WebRTC Service
import ProfessionalWebRTCService from '../services/professionalWebRTCService';

// Professional CSS animations
const animations = `
  @keyframes fadeInUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes statusPulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }

  .control-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2) !important;
    filter: brightness(1.05);
  }

  .control-button:active {
    transform: translateY(0);
  }

  .control-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none !important;
  }

  .status-active {
    animation: statusPulse 2s infinite;
  }

  .fade-in {
    animation: fadeInUp 0.6s ease-out;
  }

  @media (max-width: 768px) {
    .controls-mobile {
      flex-direction: column !important;
      gap: 12px !important;
      padding: 16px 20px !important;
    }

    .control-button-mobile {
      min-width: 200px !important;
      font-size: 16px !important;
    }
  }
`;

// Inject styles
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = animations;
  document.head.appendChild(style);
}

const CandidateRoom = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // State management
  const [isConnected, setIsConnected] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [socket, setSocket] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState('good');
  const [notifications, setNotifications] = useState([]);
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const webrtcServiceRef = useRef(null);
  const chatRef = useRef(null);

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
    // Check if user is logged in
    const storedUserInfo = sessionStorage.getItem('userInfo');
    if (!storedUserInfo) {
      navigate('/');
      return;
    }

    const userData = JSON.parse(storedUserInfo);
    if (userData.role !== 'candidate') {
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
        setError('');

        // Start the interview if it's scheduled
        if (response.data.data.interview.status === 'scheduled') {
          await startInterview();
        }
      } else {
        setError('Interview session not found');
        addNotification('Interview session not found', 'error');
      }
    } catch (error) {
      console.error('Error loading interview data:', error);
      setError('Failed to load interview data');
      addNotification('Failed to load interview session', 'error');
    } finally {
      setLoading(false);
    }
  };

  const startInterview = async () => {
    try {
      const response = await axios.post(`/api/interviews/${sessionId}/start`);
      if (response.data.success) {
        console.log('Interview started successfully');
        setInterview(prev => prev ? {...prev, status: 'in_progress'} : null);
        addNotification('Interview session started', 'success');
      }
    } catch (error) {
      console.error('Error starting interview:', error);
      addNotification('Failed to start interview session', 'warning');
    }
  };

  // Initialize WebRTC service when socket is connected
  useEffect(() => {
    if (socket && socket.connected && webrtcServiceRef.current && !webrtcServiceRef.current.isInitialized) {
      initializeWebRTCService(socket).catch(error => {
        console.error('Failed to initialize WebRTC service:', error);
        addNotification('Failed to initialize video connection', 'error');
      });
    }
  }, [socket]);

  // Ensure video elements get streams when refs are available
  useEffect(() => {
    if (localStream && localVideoRef.current) {
      console.log('Candidate: Setting local video source...');
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      console.log('Candidate: Setting remote video source...');
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const checkAvailableDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      const audioDevices = devices.filter(device => device.kind === 'audioinput');

      console.log('Available devices:', {
        video: videoDevices.length,
        audio: audioDevices.length,
        total: devices.length
      });

      return {
        hasVideo: videoDevices.length > 0,
        hasAudio: audioDevices.length > 0,
        videoDevices,
        audioDevices
      };
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
      return {
        hasVideo: false,
        hasAudio: false,
        videoDevices: [],
        audioDevices: []
      };
    }
  };

  const initializeConnection = async () => {
    try {
      setConnectionStatus('connecting');

      // Check available devices first
      const deviceInfo = await checkAvailableDevices();
      console.log('Device check:', deviceInfo);

      if (!deviceInfo.hasVideo && !deviceInfo.hasAudio) {
        addNotification('No camera or microphone detected. Please connect devices and refresh.', 'warning');
      }

      // Initialize socket connection
      const newSocket = io(import.meta.env.VITE_SOCKET_URL, {
        query: {
          sessionId,
          role: 'candidate'
        }
      });

      setSocket(newSocket);

      // Set up socket event listeners
      setupSocketListeners(newSocket);

      // Get user media with device-aware constraints
      await initializeLocalStream();

      setConnectionStatus('connecting');
      // Note: WebRTC initialization will happen in socket 'connect' event
      // Connection status will be updated to 'connected' after WebRTC is ready

    } catch (error) {
      console.error('Connection initialization failed:', error);
      setConnectionStatus('failed');
      addNotification('Failed to connect to the session', 'error');
    }
  };

  const setupSocketListeners = (socket) => {
    socket.on('connect', () => {
      console.log('Socket connected');
      socket.emit('join-room', { sessionId, role: 'candidate' });
      
      // Initialize WebRTC service after socket is connected
      if (webrtcServiceRef.current && !webrtcServiceRef.current.isInitialized) {
        initializeWebRTCService(socket).catch(error => {
          console.error('Failed to initialize WebRTC service after socket connection:', error);
          addNotification('Failed to initialize video connection', 'error');
        });
      }
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
    });

    socket.on('interviewer-joined', () => {
      console.log('Interviewer joined the session');
      setConnectionStatus('interviewer-connected');
      addNotification('Interviewer has joined the session', 'info');
    });

    socket.on('interviewer-left', () => {
      console.log('Interviewer left the session');
      setConnectionStatus('interviewer-disconnected');
      addNotification('Interviewer has left the session', 'warning');
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      setRemoteStream(null);
    });

    socket.on('offer', async (offer) => {
      console.log('Received offer from interviewer');
      if (webrtcServiceRef.current) {
        await webrtcServiceRef.current.handleOffer(offer);
      }
    });

    socket.on('answer', async (answer) => {
      console.log('Received answer from interviewer');
      if (webrtcServiceRef.current) {
        await webrtcServiceRef.current.handleAnswer(answer);
      }
    });

    socket.on('ice-candidate', async (candidate) => {
      console.log('Candidate: Received ICE candidate from interviewer');
      if (webrtcServiceRef.current) {
        await webrtcServiceRef.current.handleIceCandidate(candidate);
      }
    });

    socket.on('chat-message', (message) => {
      // Only add message if it's from interviewer (avoid duplicate of our own messages)
      if (message.role !== 'candidate') {
        setMessages(prev => [...prev, {
          ...message,
          timestamp: new Date(message.timestamp)
        }]);
      }
    });

    socket.on('session-ended', () => {
      alert('Interview session has been ended by the interviewer');
      navigate('/');
    });
  };

  const initializeLocalStream = async () => {
    try {
      console.log('Requesting media devices...');

      // Try different constraint configurations with fallbacks
      const constraints = [
        // Ideal constraints
        {
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            facingMode: 'user',
            frameRate: { ideal: 30, max: 30 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        },
        // Fallback 1: Basic HD
        {
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
          },
          audio: true
        },
        // Fallback 2: Very basic
        {
          video: true,
          audio: true
        },
        // Fallback 3: Audio only
        {
          audio: true
        }
      ];

      let stream = null;
      let lastError = null;

      for (let i = 0; i < constraints.length; i++) {
        try {
          console.log(`Trying constraint set ${i + 1}:`, constraints[i]);
          stream = await navigator.mediaDevices.getUserMedia(constraints[i]);
          console.log('Stream acquired with constraint set', i + 1);
          break;
        } catch (error) {
          console.warn(`Constraint set ${i + 1} failed:`, error.name, error.message);
          lastError = error;

          // If this is a permission denied error, don't try other constraints
          if (error.name === 'NotAllowedError') {
            throw error;
          }
        }
      }

      if (!stream) {
        console.error('All constraint sets failed');
        throw lastError || new Error('Failed to get media stream');
      }

      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Log stream details
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();
      console.log('Local stream initialized:', {
        video: videoTracks.length > 0 ? videoTracks[0].getSettings() : 'No video',
        audio: audioTracks.length > 0 ? audioTracks[0].getSettings() : 'No audio'
      });

      // Add notification based on what we got
      if (videoTracks.length > 0 && audioTracks.length > 0) {
        addNotification('Camera and microphone connected', 'success');
      } else if (audioTracks.length > 0) {
        addNotification('Microphone connected (no camera)', 'warning');
      } else {
        addNotification('No media devices available', 'error');
      }

    } catch (error) {
      console.error('Failed to get user media:', error);

      let errorMessage = 'Failed to access camera/microphone: ';
      if (error.name === 'NotAllowedError') {
        errorMessage += 'Permission denied. Please allow camera and microphone access.';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No camera or microphone found. Please connect devices and refresh.';
      } else if (error.name === 'NotReadableError') {
        errorMessage += 'Camera/microphone in use by another application.';
      } else {
        errorMessage += error.message;
      }

      addNotification(errorMessage, 'error');
      throw error;
    }
  };

  const initializeWebRTCService = async (socketInstance = socket) => {
    try {
      console.log('🚀 Initializing Professional WebRTC Service for Candidate...');
      console.log('Socket instance passed:', socketInstance ? 'valid' : 'null');

      const service = webrtcServiceRef.current;

      // Set up event handlers
      service.onRemoteStream = (remoteStream) => {
        console.log('📹 CANDIDATE: Received remote stream from interviewer');
        setRemoteStream(remoteStream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          // Ensure audio is audible
          try { remoteVideoRef.current.muted = false; } catch {}
          remoteVideoRef.current.play?.().catch((e) => {
            console.warn('Autoplay with sound blocked, waiting for user gesture to start audio.', e?.message);
            addNotification('Click anywhere to enable audio if muted by browser.', 'info');
          });
          console.log('📹 Set remote video srcObject successfully');
        }
        addNotification('Video connection established with interviewer', 'success');
      };

      service.onConnectionEstablished = () => {
        console.log('✅ WebRTC connection established');
        addNotification('Video connection established', 'success');
      };

      service.onConnectionLost = () => {
        console.log('⚠️ WebRTC connection lost');
        addNotification('Connection lost, attempting to reconnect...', 'warning');
      };

      service.onError = (error) => {
        console.error('🚨 WebRTC Error:', error);
        addNotification(`Connection error: ${error.message}`, 'error');
      };

      // Initialize the service
      await service.initialize(socketInstance);

      // Get local stream and set it to video element
      const stream = service.localStream;
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Create peer connection
      await service.createPeerConnection();

      // Signal that candidate is ready
      setTimeout(() => {
        console.log('Candidate: Signaling ready for WebRTC...');
        socketInstance.emit('candidate-ready', { sessionId });
      }, 1000);

      console.log('✅ WebRTC service initialized successfully');
      
      // Update connection status after successful WebRTC initialization
      setConnectionStatus('connected');
      setIsConnected(true);
      setSessionStartTime(new Date());
      addNotification('Connection established successfully', 'success');
    } catch (error) {
      console.error('❌ Failed to initialize WebRTC service:', error);
      setConnectionStatus('failed');
      addNotification('Failed to initialize video connection', 'error');
      throw error;
    }
  };

  // Handle offer is now managed by the Professional WebRTC Service

  const toggleAudio = async () => {
    if (!localStream) {
      addNotification('No microphone stream available', 'error');
      return;
    }

    try {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack && audioTrack.readyState === 'live') {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
      } else {
        // Need to get a fresh audio track
        console.log('🔄 Getting new microphone stream...');
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newAudioTrack = audioStream.getAudioTracks()[0];
        if (newAudioTrack) {
          const oldAudioTrack = audioTrack || localStream.getAudioTracks()[0];
          if (oldAudioTrack) {
            localStream.removeTrack(oldAudioTrack);
            try { oldAudioTrack.stop(); } catch {}
          }
          localStream.addTrack(newAudioTrack);
          if (webrtcServiceRef.current && webrtcServiceRef.current.isConnected()) {
            await webrtcServiceRef.current.replaceAudioTrack(newAudioTrack);
          }
          setIsAudioMuted(false);
          addNotification('Microphone turned on', 'success');
          console.log('✅ Microphone restarted with new track');
        }
      }
    } catch (err) {
      console.error('❌ Failed to toggle microphone:', err);
      addNotification('Failed to toggle microphone: ' + err.message, 'error');
    }
  };

  const toggleVideo = async () => {
    if (!localStream) {
      addNotification('No camera stream available', 'error');
      return;
    }

    try {
      if (isVideoMuted) {
        // Camera is currently off, turn it on
        console.log('🔄 Turning camera ON...');

        // Check if we have a video track that can be enabled
        const existingVideoTrack = localStream.getVideoTracks()[0];
        if (existingVideoTrack && existingVideoTrack.readyState === 'live') {
          // Simply enable the existing track
          existingVideoTrack.enabled = true;
          setIsVideoMuted(false);
          addNotification('Camera turned on', 'success');
          console.log('✅ Camera enabled using existing track');
        } else {
          // Need to get a new video track
          console.log('🔄 Getting new camera stream...');

          try {
            const videoStream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 },
                frameRate: { ideal: 15, max: 30 },
                facingMode: 'user'
              }
            });

            // Replace the video track in the existing stream
            const newVideoTrack = videoStream.getVideoTracks()[0];
            if (newVideoTrack) {
              // Remove old video track if exists
              const oldVideoTrack = localStream.getVideoTracks()[0];
              if (oldVideoTrack) {
                localStream.removeTrack(oldVideoTrack);
                oldVideoTrack.stop();
              }

              // Add new video track
              localStream.addTrack(newVideoTrack);

              // Update video element
              if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStream;
              }

              // Update peer connection if connected
              if (webrtcServiceRef.current && webrtcServiceRef.current.isConnected()) {
                await webrtcServiceRef.current.replaceVideoTrack(newVideoTrack);
              }

              setIsVideoMuted(false);
              addNotification('Camera turned on', 'success');
              console.log('✅ Camera restarted with new track');
            }
          } catch (error) {
            console.error('❌ Failed to restart camera:', error);
            addNotification('Failed to turn on camera: ' + error.message, 'error');
          }
        }
      } else {
        // Camera is currently on, turn it off
        console.log('🔄 Turning camera OFF...');
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          videoTrack.enabled = false;
          setIsVideoMuted(true);
          addNotification('Camera turned off', 'info');
          console.log('✅ Camera disabled');
        }
      }
    } catch (error) {
      console.error('❌ Error toggling video:', error);
      addNotification('Error toggling camera: ' + error.message, 'error');
    }
  };

  const sendMessage = () => {
    if (newMessage.trim() && socket) {
      const message = {
        sender: userInfo.name,
        role: 'candidate',
        text: newMessage.trim(),
        timestamp: new Date().toISOString()
      };

      // Add message to local state immediately so candidate sees their own message
      setMessages(prev => [...prev, {
        ...message,
        timestamp: new Date(message.timestamp)
      }]);

      // Send message to interviewer via socket
      socket.emit('chat-message', message);
      setNewMessage('');
    }
  };

  const leaveSession = () => {
    if (window.confirm('Are you sure you want to leave the interview?')) {
      cleanup();
      navigate('/');
    }
  };

  const cleanup = () => {
    if (webrtcServiceRef.current) {
      webrtcServiceRef.current.cleanup();
    }
    if (socket) {
      socket.disconnect();
    }
  };

  // Timer effect for session duration
  useEffect(() => {
    let interval;
    if (sessionStartTime && isConnected) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((new Date() - sessionStartTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [sessionStartTime, isConnected]);

  // Connection quality monitoring
  useEffect(() => {
    if (webrtcServiceRef.current && webrtcServiceRef.current.isConnected()) {
      const interval = setInterval(async () => {
        const stats = await webrtcServiceRef.current.getConnectionStats();
        if (stats && stats.inboundVideo) {
          const { packetsLost = 0, packetsReceived = 0 } = stats.inboundVideo;
          const lossRate = packetsReceived > 0 ? packetsLost / packetsReceived : 0;

          if (lossRate > 0.05) {
            setConnectionQuality('poor');
          } else if (lossRate > 0.02) {
            setConnectionQuality('fair');
          } else {
            setConnectionQuality('good');
          }
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [webrtcServiceRef.current]);

  // Auto-remove notifications after 5 seconds
  useEffect(() => {
    const timeouts = [];

    notifications.forEach((notification) => {
      const timeout = setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== notification.id));
      }, 5000);
      timeouts.push(timeout);
    });

    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout));
    };
  }, [notifications]);

  // Scroll chat to bottom when new message arrives
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  // Update video element when local stream changes
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      console.log('Video element updated with new stream');
    }
  }, [localStream]);

  const addNotification = (message, type = 'info') => {
    const notification = {
      id: Date.now(),
      message,
      type,
      timestamp: new Date()
    };
    setNotifications(prev => [...prev, notification]);
  };

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getConnectionQualityColor = () => {
    switch (connectionQuality) {
      case 'good': return '#4CAF50';
      case 'fair': return '#FF9800';
      case 'poor': return '#f44336';
      default: return '#4CAF50';
    }
  };

  const styles = {
    container: {
      height: '100vh',
      background: '#f8fafc',
      display: 'flex',
      flexDirection: 'column',
      color: '#1a202c',
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
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      zIndex: 50
    },
    title: {
      fontSize: '20px',
      fontWeight: '600',
      margin: 0,
      color: '#1a202c',
      letterSpacing: '-0.025em'
    },
    headerRight: {
      display: 'flex',
      alignItems: 'center',
      gap: '24px'
    },
    statusIndicator: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '14px',
      fontWeight: '500',
      padding: '8px 16px',
      borderRadius: '6px',
      background: isConnected ? '#f0fff4' : '#fef2f2',
      border: `1px solid ${isConnected ? '#10b981' : '#ef4444'}`,
      color: isConnected ? '#065f46' : '#991b1b'
    },
    statusDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      backgroundColor: isConnected ? '#10b981' : '#ef4444'
    },
    timerDisplay: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '15px',
      fontWeight: '600',
      padding: '10px 16px',
      borderRadius: '6px',
      background: '#f1f5f9',
      border: '1px solid #cbd5e1',
      color: '#475569'
    },
    mainContent: {
      flex: 1,
      display: 'flex',
      position: 'relative',
      padding: '24px',
      gap: '24px'
    },
    videoContainer: {
      flex: 1,
      position: 'relative',
      background: '#1f2937',
      borderRadius: '8px',
      overflow: 'hidden',
      border: '1px solid #374151',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
    },
    remoteVideo: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    },
    localVideoContainer: {
      position: 'absolute',
      top: '24px',
      right: '24px',
      width: '240px',
      height: '180px',
      borderRadius: '8px',
      overflow: 'hidden',
      border: '2px solid #ffffff',
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
      zIndex: 20
    },
    localVideo: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transform: 'scaleX(-1)' // Mirror effect
    },
    noVideo: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      background: '#374151',
      color: '#9ca3af',
      gap: '16px'
    },
    noVideoIcon: {
      fontSize: '48px',
      opacity: 0.6
    },
    noVideoText: {
      fontSize: '16px',
      fontWeight: '500',
      textAlign: 'center'
    },
    chatPanel: {
      width: showChat ? '320px' : '0',
      background: '#ffffff',
      borderLeft: '1px solid #e2e8f0',
      transition: 'width 0.3s ease',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: showChat ? '-4px 0 6px rgba(0, 0, 0, 0.1)' : 'none'
    },
    chatHeader: {
      padding: '20px 24px',
      borderBottom: '1px solid #e2e8f0',
      fontWeight: '600',
      fontSize: '16px',
      color: '#1a202c',
      background: '#f8fafc'
    },
    chatMessages: {
      flex: 1,
      overflowY: 'auto',
      padding: '16px'
    },
    message: {
      marginBottom: '12px',
      padding: '12px 16px',
      borderRadius: '8px',
      background: '#f1f5f9',
      border: '1px solid #e2e8f0'
    },
    messageHeader: {
      fontSize: '12px',
      color: '#64748b',
      marginBottom: '4px',
      fontWeight: '500'
    },
    messageText: {
      fontSize: '14px',
      color: '#334155'
    },
    chatInput: {
      padding: '16px 20px',
      borderTop: '1px solid #e2e8f0',
      display: 'flex',
      gap: '12px',
      background: '#f8fafc'
    },
    input: {
      flex: 1,
      padding: '12px 16px',
      borderRadius: '6px',
      border: '1px solid #d1d5db',
      background: '#ffffff',
      color: '#1a202c',
      fontSize: '14px',
      outline: 'none'
    },
    controls: {
      position: 'absolute',
      bottom: '32px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: '16px',
      zIndex: 30,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px 24px',
      borderRadius: '12px',
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)'
    },
    controlButton: {
      minWidth: '120px',
      height: '44px',
      borderRadius: '8px',
      border: '1px solid #e2e8f0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      fontSize: '14px',
      fontWeight: '500',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      background: '#ffffff',
      color: '#374151',
      padding: '0 16px'
    },
    muteButton: {
      background: isAudioMuted
        ? 'linear-gradient(135deg, #fecaca, #fef2f2)'
        : 'linear-gradient(135deg, #bbf7d0, #f0fdf4)',
      border: `2px solid ${isAudioMuted ? '#ef4444' : '#22c55e'}`,
      color: isAudioMuted ? '#dc2626' : '#16a34a',
      boxShadow: isAudioMuted
        ? '0 4px 12px rgba(239, 68, 68, 0.2)'
        : '0 4px 12px rgba(34, 197, 94, 0.2)'
    },
    videoButton: {
      background: isVideoMuted
        ? 'linear-gradient(135deg, #fecaca, #fef2f2)'
        : 'linear-gradient(135deg, #bbf7d0, #f0fdf4)',
      border: `2px solid ${isVideoMuted ? '#ef4444' : '#22c55e'}`,
      color: isVideoMuted ? '#dc2626' : '#16a34a',
      boxShadow: isVideoMuted
        ? '0 4px 12px rgba(239, 68, 68, 0.2)'
        : '0 4px 12px rgba(34, 197, 94, 0.2)'
    },
    chatButton: {
      background: showChat
        ? 'linear-gradient(135deg, #dbeafe, #eff6ff)'
        : 'linear-gradient(135deg, #f8fafc, #ffffff)',
      border: `2px solid ${showChat ? '#3b82f6' : '#e2e8f0'}`,
      color: showChat ? '#1d4ed8' : '#374151',
      boxShadow: showChat
        ? '0 4px 12px rgba(59, 130, 246, 0.2)'
        : '0 4px 12px rgba(0, 0, 0, 0.1)'
    },
    leaveButton: {
      background: 'linear-gradient(135deg, #fecaca, #fef2f2)',
      border: '2px solid #ef4444',
      color: '#dc2626',
      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.2)'
    },
    sendButton: {
      padding: '12px 20px',
      borderRadius: '6px',
      border: '1px solid #3b82f6',
      background: '#3b82f6',
      color: 'white',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '14px',
      transition: 'all 0.2s ease'
    },
    infoPanel: {
      position: 'absolute',
      top: '24px',
      left: '24px',
      width: '320px',
      maxWidth: 'calc(100vw - 280px)',
      background: '#ffffff',
      borderRadius: '12px',
      padding: '20px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
      zIndex: 25,
      transform: showInfoPanel ? 'translateX(0)' : 'translateX(-360px)',
      transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    },
    infoPanelHeader: {
      fontSize: '18px',
      fontWeight: '600',
      marginBottom: '20px',
      color: '#1a202c',
      borderBottom: '1px solid #e2e8f0',
      paddingBottom: '12px'
    },
    infoPanelContent: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    },
    infoItem: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: '14px',
      padding: '12px 16px',
      background: '#f8fafc',
      borderRadius: '8px',
      border: '1px solid #e2e8f0'
    },
    infoLabel: {
      color: '#64748b',
      fontWeight: '500'
    },
    infoValue: {
      fontWeight: '600',
      color: '#1a202c'
    },
    connectionQuality: {
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    },
    qualityDot: {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      backgroundColor: getConnectionQualityColor()
    },
    notifications: {
      position: 'fixed',
      top: '80px',
      right: '20px',
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    },
    notification: {
      padding: '12px 16px',
      borderRadius: '8px',
      color: 'white',
      fontSize: '14px',
      minWidth: '250px',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
      animation: 'slideInRight 0.3s ease',
      backdropFilter: 'blur(10px)'
    },
    notificationSuccess: {
      background: 'rgba(76, 175, 80, 0.9)',
      border: '1px solid rgba(76, 175, 80, 0.3)'
    },
    notificationError: {
      background: 'rgba(244, 67, 54, 0.9)',
      border: '1px solid rgba(244, 67, 54, 0.3)'
    },
    notificationWarning: {
      background: 'rgba(255, 152, 0, 0.9)',
      border: '1px solid rgba(255, 152, 0, 0.3)'
    },
    notificationInfo: {
      background: 'rgba(33, 150, 243, 0.9)',
      border: '1px solid rgba(33, 150, 243, 0.3)'
    },
    toggleButton: {
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      border: 'none',
      background: 'rgba(255, 255, 255, 0.15)',
      color: 'white',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '14px',
      transition: 'all 0.3s ease',
      backdropFilter: 'blur(5px)',
      ':hover': {
        background: 'rgba(255, 255, 255, 0.25)',
        transform: 'scale(1.1)'
      }
    },
    infoPanelToggle: {
      position: 'absolute',
      top: '24px',
      left: showInfoPanel ? '364px' : '24px',
      width: '44px',
      height: '44px',
      borderRadius: '8px',
      border: '1px solid #e2e8f0',
      background: '#ffffff',
      color: '#374151',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '16px',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
      zIndex: 30
    }
  };

  const getNotificationStyle = (type) => ({
    ...styles.notification,
    ...styles[`notification${type.charAt(0).toUpperCase() + type.slice(1)}`]
  });

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
          <div>Loading interview session...</div>
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
          <div style={{ color: '#ef4444', textAlign: 'center' }}>{error}</div>
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
      {/* Notifications */}
      <div style={styles.notifications}>
        {notifications.map((notification) => (
          <div key={notification.id} style={getNotificationStyle(notification.type)}>
            {notification.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Interview Session</h1>
        <div style={styles.headerRight}>
          <div style={styles.timerDisplay}>
            Duration: {formatTime(elapsedTime)}
          </div>
          <div style={styles.statusIndicator}>
            <div style={styles.statusDot}></div>
            <span>
              {connectionStatus === 'connecting' && 'Connecting...'}
              {connectionStatus === 'connected' && 'Connected'}
              {connectionStatus === 'interviewer-connected' && 'Interviewer Online'}
              {connectionStatus === 'interviewer-disconnected' && 'Waiting for Interviewer'}
              {connectionStatus === 'failed' && 'Connection Failed'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.mainContent}>
        {/* Info Panel Toggle Button */}
        <button
          style={styles.infoPanelToggle}
          onClick={() => setShowInfoPanel(!showInfoPanel)}
          title={showInfoPanel ? 'Hide session info' : 'Show session info'}
        >
          {showInfoPanel ? '✕' : 'i'}
        </button>

        {/* Session Information Panel */}
        <div style={styles.infoPanel}>
          <div style={styles.infoPanelHeader}>
            Session Details
          </div>
          <div style={styles.infoPanelContent}>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Session ID:</span>
              <span style={styles.infoValue}>{sessionId}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Candidate:</span>
              <span style={styles.infoValue}>{interview?.candidateName || userInfo?.name || 'Unknown'}</span>
            </div>
            {interview?.interviewerName && (
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Interviewer:</span>
                <span style={styles.infoValue}>{interview.interviewerName}</span>
              </div>
            )}
            {interview?.status && (
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Status:</span>
                <span style={{
                  ...styles.infoValue,
                  color: interview.status === 'in_progress' ? '#16a34a' : '#64748b',
                  textTransform: 'capitalize'
                }}>
                  {interview.status.replace('_', ' ')}
                </span>
              </div>
            )}
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Duration:</span>
              <span style={styles.infoValue}>{formatTime(elapsedTime)}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Connection:</span>
              <div style={styles.connectionQuality}>
                <div style={styles.qualityDot}></div>
                <span style={styles.infoValue}>
                  {connectionQuality.charAt(0).toUpperCase() + connectionQuality.slice(1)}
                </span>
              </div>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Audio:</span>
              <span style={styles.infoValue}>{isAudioMuted ? 'Muted' : 'Active'}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Video:</span>
              <span style={styles.infoValue}>{isVideoMuted ? 'Disabled' : 'Active'}</span>
            </div>
          </div>
        </div>

        {/* Video Container */}
        <div style={styles.videoContainer}>
          {/* Remote Video (Interviewer) */}
          {remoteStream ? (
            <video
              ref={remoteVideoRef}
              style={styles.remoteVideo}
              autoPlay
              playsInline
            />
          ) : (
            <div style={styles.noVideo}>
              👤
              <div style={{
                position: 'absolute',
                fontSize: '16px',
                bottom: '50px',
                textAlign: 'center',
                width: '100%',
                color: '#9ca3af'
              }}>
                Waiting for interviewer to join
              </div>
            </div>
          )}

          {/* Connection Failed Message */}
          {connectionStatus === 'failed' && (
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              background: 'rgba(244, 67, 54, 0.9)',
              color: 'white',
              padding: '20px',
              borderRadius: '8px',
              zIndex: 30
            }}>
              <div style={{ fontSize: '18px', marginBottom: '12px' }}>
                ⚠️ Connection Failed
              </div>
              <div style={{ fontSize: '14px', marginBottom: '16px' }}>
                Unable to connect to the session. Please check your camera and microphone permissions.
              </div>
              <button
                style={{
                  background: '#ffffff',
                  color: '#f44336',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
                onClick={() => {
                  setConnectionStatus('connecting');
                  initializeConnection();
                }}
              >
                🔄 Retry Connection
              </button>
            </div>
          )}

          {/* Local Video (Self) */}
          <div style={styles.localVideoContainer}>
            {localStream && !isVideoMuted && localStream.getVideoTracks().length > 0 && localStream.getVideoTracks()[0].readyState === 'live' ? (
              <video
                ref={localVideoRef}
                style={styles.localVideo}
                autoPlay
                muted
                playsInline
                onLoadedMetadata={() => {
                  console.log('Local video loaded successfully');
                }}
                onError={(e) => {
                  console.error('Local video error:', e);
                  addNotification('Video display error', 'error');
                }}
              />
            ) : (
              <div style={styles.noVideo}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>📷</div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  {isVideoMuted ? 'Camera Off' : 'No Camera'}
                </div>
                {isVideoMuted && (
                  <button
                    style={{
                      marginTop: '8px',
                      padding: '4px 8px',
                      backgroundColor: '#3498db',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '10px',
                      cursor: 'pointer'
                    }}
                    onClick={toggleVideo}
                  >
                    Turn On
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Controls */}
          <div style={styles.controls} className="controls-mobile">
            <button
              className="control-button control-button-mobile"
              style={{...styles.controlButton, ...styles.muteButton}}
              onClick={toggleAudio}
              title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              <span style={{ fontSize: '16px' }}>
                {isAudioMuted ? '🔇' : '🎤'}
              </span>
              {isAudioMuted ? 'Unmute' : 'Mute'}
            </button>

            <button
              className="control-button control-button-mobile"
              style={{...styles.controlButton, ...styles.videoButton}}
              onClick={toggleVideo}
              title={isVideoMuted ? 'Turn on camera' : 'Turn off camera'}
            >
              <span style={{ fontSize: '16px' }}>
                {isVideoMuted ? '📷' : '📹'}
              </span>
              {isVideoMuted ? 'Start Video' : 'Stop Video'}
            </button>

            <button
              className="control-button control-button-mobile"
              style={{...styles.controlButton, ...styles.chatButton}}
              onClick={() => setShowChat(!showChat)}
              title={showChat ? 'Hide chat' : 'Show chat'}
            >
              <span style={{ fontSize: '16px' }}>💬</span>
              {showChat ? 'Hide Chat' : 'Show Chat'}
            </button>

            <button
              className="control-button control-button-mobile"
              style={{...styles.controlButton, ...styles.leaveButton}}
              onClick={leaveSession}
              title="Leave interview session"
            >
              <span style={{ fontSize: '16px' }}>🚪</span>
              Leave Session
            </button>
          </div>
        </div>

        {/* Chat Panel */}
        <div style={styles.chatPanel}>
          <div style={styles.chatHeader}>
            Chat
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
              placeholder="Type a message..."
            />
            <button style={styles.sendButton} onClick={sendMessage}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CandidateRoom;