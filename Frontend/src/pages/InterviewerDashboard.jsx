import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import axios from 'axios';
import AlertsMonitor from '../components/AlertsMonitor';

const InterviewerDashboard = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // State management
  const [isConnected, setIsConnected] = useState(false);
  const [candidateConnected, setCandidateConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [interview, setInterview] = useState(null);
  const [violations, setViolations] = useState([]);
  const [focusStatus, setFocusStatus] = useState('waiting');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [candidateInfo, setCandidateInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  // System status
  const [systemStatus, setSystemStatus] = useState({
    socketConnection: false,
    interviewSession: false
  });

  const [serviceStats, setServiceStats] = useState({
    totalEvents: 0,
    violations: 0,
    messagesExchanged: 0
  });

  // Refs
  const chatRef = React.useRef(null);

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
      console.log('Loading interview data for sessionId:', sessionId);
      
      const apiUrl = `${import.meta.env.VITE_API_URL || 'https://video-proctoring-system-0i3w.onrender.com/api'}/interviews/${sessionId}`;
      console.log('API URL:', apiUrl);
      
      const response = await axios.get(apiUrl);
      console.log('Interview data response:', response.data);

      if (response.data.success) {
        setInterview(response.data.data.interview);
        setViolations(response.data.data.violations || []);
        setError('');
        console.log('Interview data loaded successfully');
      } else {
        console.error('Interview not found in response:', response.data);
        setError('Interview session not found');
      }
    } catch (error) {
      console.error('Error loading interview data:', error);
      console.error('Error details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      if (error.response?.status === 404) {
        setError('Interview session not found');
      } else if (error.response?.status === 500) {
        setError('Server error. Please try again.');
      } else {
        setError('Failed to load interview data. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  const retryLoadInterview = () => {
    console.log('Retrying interview data load...');
    setRetryCount(prev => prev + 1);
    setError('');
    loadInterviewData();
  };


  const initializeConnection = async () => {
    try {
      console.log('Starting connection initialization...');

      // Initialize socket connection
      const newSocket = io(import.meta.env.VITE_SOCKET_URL, {
        query: {
          sessionId,
          role: 'interviewer'
        }
      });

      setSocket(newSocket);
      setupSocketListeners(newSocket);

      setIsConnected(true);
      setSystemStatus(prev => ({ ...prev, socketConnection: true }));

    } catch (error) {
      console.error('Connection initialization failed:', error);
    }
  };

  const setupSocketListeners = (socket) => {
    socket.on('connect', () => {
      console.log('Interviewer socket connected');
      socket.emit('join-room', { sessionId, role: 'interviewer' });
      setSystemStatus(prev => ({ ...prev, socketConnection: true }));
    });

    socket.on('candidate-joined', (candidateData) => {
      console.log('Candidate joined:', candidateData);
      setCandidateConnected(true);
      setCandidateInfo(candidateData);
    });

    socket.on('candidate-left', () => {
      console.log('Candidate left the session');
      setCandidateConnected(false);
      setCandidateInfo(null);
    });

    socket.on('chat-message', (message) => {
      // Only add message if it's from candidate (avoid duplicate of our own messages)
      if (message.role !== 'interviewer') {
        setMessages(prev => [...prev, {
          ...message,
          timestamp: new Date(message.timestamp)
        }]);
        setServiceStats(prev => ({
          ...prev,
          messagesExchanged: prev.messagesExchanged + 1
        }));
      }
    });

    socket.on('violation-detected', (data) => {
      handleViolationReceived(data.violation);
    });
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

      setServiceStats(prev => ({
        ...prev,
        messagesExchanged: prev.messagesExchanged + 1
      }));
    }
  };

  const endSession = async () => {
    if (window.confirm('Are you sure you want to end the interview session?')) {
      try {
        setLoading(true);
        console.log('Ending interview session:', sessionId);

        // End the interview session in backend
        const endUrl = `${import.meta.env.VITE_API_URL || 'https://video-proctoring-system-0i3w.onrender.com/api'}/interviews/${sessionId}/end`;
        console.log('Ending session with URL:', endUrl);
        
        const endResponse = await axios.post(endUrl);
        console.log('End session response:', endResponse.data);

        // Generate report
        const reportUrl = `${import.meta.env.VITE_API_URL || 'https://video-proctoring-system-0i3w.onrender.com/api'}/interviews/${sessionId}/report`;
        console.log('Generating report with URL:', reportUrl);
        
        const reportResponse = await axios.get(reportUrl);
        console.log('Report generation response:', reportResponse.data);

        // Notify via socket
        if (socket) {
          socket.emit('end-session', { sessionId });
        }

        cleanup();
        navigate(`/report/${sessionId}`);
      } catch (error) {
        console.error('Error ending session:', error);
        console.error('Error details:', {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data,
          url: error.config?.url
        });
        
        if (error.response?.status === 405) {
          setError('Method not allowed. Please check the server configuration.');
        } else if (error.response?.status === 404) {
          setError('Interview session not found.');
        } else if (error.response?.status === 500) {
          setError('Server error. Please try again.');
        } else {
          setError(`Failed to end session: ${error.message}`);
        }
        setLoading(false);
      }
    }
  };

  const cleanup = () => {
    if (socket) {
      socket.disconnect();
    }
  };


  const startInterview = async () => {
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL || 'https://video-proctoring-system-0i3w.onrender.com/api'}/interviews/${sessionId}/start`);
      if (response.data.success) {
        console.log('Interview started successfully');
        // Update interview state if needed
        if (interview) {
          setInterview({...interview, status: 'in_progress'});
          setSystemStatus(prev => ({ ...prev, interviewSession: true }));
        }
      }
    } catch (error) {
      console.error('Error starting interview:', error);
      setError('Failed to start interview session');
    }
  };


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
    interviewSection: {
      background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
      borderRadius: '16px',
      padding: '24px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
      border: '1px solid #e2e8f0',
      position: 'relative'
    },
    interviewSectionTitle: {
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
    interviewContent: {
      display: 'flex',
      flexDirection: 'column',
      gap: '24px'
    },
    candidateStatus: {
      background: '#f8fafc',
      padding: '20px',
      borderRadius: '12px',
      border: '1px solid #e2e8f0'
    },
    statusLabel: {
      fontSize: '16px',
      fontWeight: '600',
      color: '#1a202c',
      marginBottom: '12px'
    },
    statusInfo: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    connectedStatus: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      color: '#065f46',
      fontWeight: '500'
    },
    disconnectedStatus: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      color: '#991b1b',
      fontWeight: '500'
    },
    statusDot: {
      fontSize: '12px'
    },
    interviewControls: {
      display: 'flex',
      gap: '16px',
      alignItems: 'center'
    },
    startButton: {
      background: 'linear-gradient(135deg, #10b981, #059669)',
      color: 'white',
      border: 'none',
      padding: '12px 24px',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'all 0.3s ease'
    },
    inProgressStatus: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      color: '#065f46',
      fontWeight: '600',
      fontSize: '16px'
    },
    sessionInfo: {
      background: '#f1f5f9',
      padding: '20px',
      borderRadius: '12px',
      border: '1px solid #cbd5e1'
    },
    infoRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px'
    },
    infoLabel: {
      fontSize: '14px',
      color: '#64748b',
      fontWeight: '500'
    },
    infoValue: {
      fontSize: '14px',
      color: '#1a202c',
      fontWeight: '600'
    },
    communicationSection: {
      marginTop: '24px'
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
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={retryLoadInterview}
              style={{
                padding: '12px 24px',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Retry
            </button>
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
              Reload Page
            </button>
          </div>
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
          {/* Interview Control Section */}
          <div style={styles.interviewSection}>
            <div style={styles.interviewSectionTitle}>
              📝 Interview Management
            </div>
            <div style={styles.interviewContent}>
              {/* Candidate Status */}
              <div style={styles.candidateStatus}>
                <div style={styles.statusLabel}>
                  👤 Candidate Status
                </div>
                <div style={styles.statusInfo}>
                  {candidateConnected ? (
                    <div style={styles.connectedStatus}>
                      <span style={styles.statusDot}>🟢</span>
                      <span>Online - {candidateInfo ? candidateInfo.name : 'Connected'}</span>
                    </div>
                  ) : (
                    <div style={styles.disconnectedStatus}>
                      <span style={styles.statusDot}>🔴</span>
                      <span>Waiting for candidate to join</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Interview Controls */}
              <div style={styles.interviewControls}>
                {interview && interview.status === 'scheduled' && (
                  <button
                    style={styles.startButton}
                    onClick={startInterview}
                  >
                    🚀 Start Interview
                  </button>
                )}

                {interview && interview.status === 'in_progress' && (
                  <div style={styles.inProgressStatus}>
                    <span style={styles.statusDot}>🟢</span>
                    <span>Interview in Progress</span>
                  </div>
                )}
              </div>

              {/* Session Information */}
              <div style={styles.sessionInfo}>
                <div style={styles.infoRow}>
                  <span style={styles.infoLabel}>Session ID:</span>
                  <span style={styles.infoValue}>{sessionId}</span>
                </div>
                {interview && (
                  <>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Interviewer:</span>
                      <span style={styles.infoValue}>{interview.interviewerName}</span>
                    </div>
                    <div style={styles.infoRow}>
                      <span style={styles.infoLabel}>Status:</span>
                      <span style={styles.infoValue}>{interview.status?.replace('_', ' ')}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Communication Log */}
          <div style={styles.communicationSection}>
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