import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import MonitoringDashboard from '../components/MonitoringDashboard';
import AlertsMonitor from '../components/AlertsMonitor';

// Import detection services
import FocusDetectionService from '../services/focusDetectionService';
import ObjectDetectionService from '../services/objectDetectionService';

// Import WebRTC configuration
import { createPeerConnection, logWebRTCConfig } from '../utils/webrtcConfig';

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
  const peerConnectionRef = useRef(null);
  const detectionCanvasRef = useRef(null);
  const chatRef = useRef(null);

  // Services
  const focusServiceRef = useRef(new FocusDetectionService());
  const objectServiceRef = useRef(new ObjectDetectionService());

  // WebRTC configuration - using enhanced config
  const rtcConfiguration = logWebRTCConfig();

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

  const initializeConnection = async () => {
    try {
      // Initialize socket connection
      const newSocket = io(import.meta.env.VITE_SOCKET_URL, {
        query: {
          sessionId,
          role: 'interviewer'
        }
      });

      setSocket(newSocket);
      setupSocketListeners(newSocket);

      // Get user media for interviewer
      await initializeLocalStream();

      // Initialize WebRTC peer connection
      initializePeerConnection();

      setIsConnected(true);

    } catch (error) {
      console.error('Connection initialization failed:', error);
    }
  };

  const setupSocketListeners = (socket) => {
    socket.on('connect', () => {
      console.log('Interviewer socket connected');
      socket.emit('join-room', { sessionId, role: 'interviewer' });
    });

    socket.on('candidate-joined', (candidateData) => {
      console.log('Candidate joined:', candidateData);
      setCandidateConnected(true);
      setCandidateInfo(candidateData);

      // Initiate WebRTC connection
      initiateCall();
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

    socket.on('answer', async (answer) => {
      console.log('Received answer from candidate');
      await peerConnectionRef.current.setRemoteDescription(answer);
    });

    socket.on('ice-candidate', async (candidate) => {
      console.log('Received ICE candidate from candidate');
      await peerConnectionRef.current.addIceCandidate(candidate);
    });

    socket.on('chat-message', (message) => {
      setMessages(prev => [...prev, {
        ...message,
        timestamp: new Date(message.timestamp)
      }]);
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: true
      });

      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      console.log('Interviewer local stream initialized');
    } catch (error) {
      console.error('Failed to get interviewer media:', error);
    }
  };

  const initializePeerConnection = () => {
    console.log('Initializing peer connection with enhanced WebRTC config');

    const peerConnection = createPeerConnection(
      // ontrack handler
      (event) => {
        console.log('Received candidate stream');
        const [candidateStream] = event.streams;
        setRemoteStream(candidateStream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = candidateStream;
        }
        // Start AI detection on candidate stream
        startDetection(candidateStream);
        setSystemStatus(prev => ({ ...prev, webrtcConnection: true }));
      },
      // onicecandidate handler
      (event) => {
        if (event.candidate && socket) {
          console.log('Sending ICE candidate to candidate');
          socket.emit('ice-candidate', event.candidate);
        }
      },
      // onconnectionstatechange handler
      () => {
        console.log('WebRTC connection state:', peerConnection.connectionState);
        const connected = peerConnection.connectionState === 'connected';
        setSystemStatus(prev => ({ ...prev, webrtcConnection: connected }));

        if (peerConnection.connectionState === 'failed') {
          console.error('WebRTC connection failed, attempting to restart ICE');
          peerConnection.restartIce();
        }
      }
    );

    peerConnectionRef.current = peerConnection;

    // Add local stream
    if (localStream) {
      localStream.getTracks().forEach(track => {
        console.log('Adding track to peer connection:', track.kind);
        peerConnection.addTrack(track, localStream);
      });
    }
  };

  const initiateCall = async () => {
    try {
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);

      if (socket) {
        socket.emit('offer', offer);
      }
    } catch (error) {
      console.error('Error creating offer:', error);
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
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
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
      background: '#ffffff',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      border: '1px solid #e2e8f0',
      height: '450px'
    },
    videoSectionTitle: {
      fontSize: '18px',
      fontWeight: '600',
      color: '#1a202c',
      margin: '0 0 20px 0',
      borderBottom: '1px solid #e2e8f0',
      paddingBottom: '12px'
    },
    videoGrid: {
      display: 'grid',
      gridTemplateColumns: '2.2fr 1fr',
      gap: '20px',
      height: 'calc(100% - 60px)'
    },
    candidateVideo: {
      position: 'relative',
      background: '#1f2937',
      borderRadius: isFullscreen ? '0' : '8px',
      overflow: 'hidden',
      boxShadow: isFullscreen ? 'none' : '0 4px 6px rgba(0, 0, 0, 0.1)',
      border: isFullscreen ? 'none' : '1px solid #374151'
    },
    video: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    },
    videoLabel: {
      position: 'absolute',
      top: '12px',
      left: '12px',
      background: 'rgba(0,0,0,0.8)',
      color: 'white',
      padding: '6px 12px',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: '500'
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
      background: '#1f2937',
      borderRadius: '8px',
      overflow: 'hidden',
      position: 'relative',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      border: '1px solid #374151'
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
    monitoringSection: {
      flex: 1,
      overflow: 'auto'
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
      height: '320px',
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
      bottom: '12px',
      right: '12px',
      width: '40px',
      height: '40px',
      borderRadius: '8px',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '16px',
      fontWeight: '600',
      transition: 'all 0.2s ease',
      zIndex: 20
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
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>
          Interviewer Dashboard - Session {sessionId}
        </h1>
        <div style={styles.headerControls}>
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
              Live Video Feed
            </div>
            <div style={styles.videoGrid}>
              {/* Candidate Video */}
              <div style={styles.candidateVideo}>
                <div style={styles.videoLabel}>
                  Candidate {candidateInfo ? `- ${candidateInfo.name}` : ''}
                </div>

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
                <div style={styles.videoLabel}>You</div>
                {localStream ? (
                  <video
                    ref={localVideoRef}
                    style={{...styles.video, transform: 'scaleX(-1)'}}
                    autoPlay
                    muted
                    playsInline
                  />
                ) : (
                  <div style={styles.noVideo}>
                    📷
                    <div style={styles.noVideoText}>Camera disabled</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Monitoring Dashboard */}
          <div style={styles.monitoringSection}>
            <MonitoringDashboard
              violations={violations}
              focusStatus={focusStatus}
              systemStatus={systemStatus}
              serviceStats={serviceStats}
              sessionId={sessionId}
            />
          </div>
        </div>

        {/* Right Panel */}
        <div style={styles.rightPanel}>
          {/* Alerts Monitor */}
          <AlertsMonitor
            violations={violations}
            focusStatus={focusStatus}
            systemStatus={systemStatus}
            serviceStats={serviceStats}
          />

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
    </div>
  );
};

export default InterviewerDashboard;