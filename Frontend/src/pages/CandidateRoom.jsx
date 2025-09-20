import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';

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
  const [socket, setSocket] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Refs
  const chatRef = React.useRef(null);


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
      const response = await axios.get(`${import.meta.env.VITE_API_URL || 'https://video-proctoring-system-0i3w.onrender.com/api'}/interviews/${sessionId}`);

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
      const response = await axios.post(`${import.meta.env.VITE_API_URL || 'https://video-proctoring-system-0i3w.onrender.com/api'}/interviews/${sessionId}/start`);
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



  const initializeConnection = async () => {
    try {
      setConnectionStatus('connecting');

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
      setConnectionStatus('connected');
      setIsConnected(true);
      setSessionStartTime(new Date());
      addNotification('Connected to interview session', 'success');
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
    interviewContainer: {
      flex: 1,
      position: 'relative',
      background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
      borderRadius: '8px',
      overflow: 'hidden',
      border: '1px solid #e2e8f0',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      display: 'flex',
      flexDirection: 'column'
    },
    connectionStatus: {
      padding: '20px',
      borderBottom: '1px solid #e2e8f0',
      background: '#f8fafc'
    },
    connectionInfo: {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      fontSize: '16px',
      fontWeight: '500'
    },
    statusIndicator: {
      fontSize: '12px'
    },
    retryButton: {
      marginLeft: '12px',
      padding: '6px 12px',
      background: '#3b82f6',
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontSize: '12px'
    },
    interviewContent: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px',
      textAlign: 'center'
    },
    welcomeMessage: {
      marginBottom: '40px'
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
      display: 'flex',
      gap: '16px',
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
              <span style={styles.infoValue}>Active</span>
            </div>
          </div>
        </div>

        {/* Interview Interface */}
        <div style={styles.interviewContainer}>
          {/* Connection Status */}
          <div style={styles.connectionStatus}>
            {connectionStatus === 'connected' && (
              <div style={styles.connectionInfo}>
                <div style={styles.statusIndicator}>🟢</div>
                <span>Connected to Interview Session</span>
              </div>
            )}
            {connectionStatus === 'interviewer-connected' && (
              <div style={styles.connectionInfo}>
                <div style={styles.statusIndicator}>🟢</div>
                <span>Interviewer is Online</span>
              </div>
            )}
            {connectionStatus === 'interviewer-disconnected' && (
              <div style={styles.connectionInfo}>
                <div style={styles.statusIndicator}>🟡</div>
                <span>Waiting for Interviewer</span>
              </div>
            )}
            {connectionStatus === 'failed' && (
              <div style={styles.connectionInfo}>
                <div style={styles.statusIndicator}>🔴</div>
                <span>Connection Failed</span>
                <button
                  style={styles.retryButton}
                  onClick={() => {
                    setConnectionStatus('connecting');
                    initializeConnection();
                  }}
                >
                  🔄 Retry
                </button>
              </div>
            )}
          </div>

          {/* Interview Content */}
          <div style={styles.interviewContent}>
            <div style={styles.welcomeMessage}>
              <h2>Welcome to your Interview Session</h2>
              <p>You are connected to session: <strong>{sessionId}</strong></p>
              <p>Use the chat feature to communicate with your interviewer.</p>
            </div>

            {/* Controls */}
            <div style={styles.controls}>
              <button
                style={{...styles.controlButton, ...styles.chatButton}}
                onClick={() => setShowChat(!showChat)}
                title={showChat ? 'Hide chat' : 'Show chat'}
              >
                <span style={{ fontSize: '16px' }}>💬</span>
                {showChat ? 'Hide Chat' : 'Show Chat'}
              </button>

              <button
                style={{...styles.controlButton, ...styles.leaveButton}}
                onClick={leaveSession}
                title="Leave interview session"
              >
                <span style={{ fontSize: '16px' }}>🚪</span>
                Leave Session
              </button>
            </div>
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