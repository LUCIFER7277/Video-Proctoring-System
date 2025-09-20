
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import io from 'socket.io-client';

// Import our enhanced services
import FocusDetectionService from '../services/focusDetectionService';
import ObjectDetectionService from '../services/objectDetectionService';
import VideoRecordingService from '../services/videoRecordingService';
import eventLoggingService from '../services/eventLoggingService';

const EnhancedInterview = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // State management
  const [isRecording, setIsRecording] = useState(false);
  const [interview, setInterview] = useState(null);
  const [violations, setViolations] = useState([]);
  const [focusStatus, setFocusStatus] = useState('loading');
  const [detectionActive, setDetectionActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [socket, setSocket] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentAlerts, setCurrentAlerts] = useState([]);
  const [systemStatus, setSystemStatus] = useState({
    focusDetection: false,
    objectDetection: false,
    videoRecording: false,
    eventLogging: false
  });
  const [videoStatus, setVideoStatus] = useState({ hasStream: false, isPlaying: false });

  // Service status
  const [serviceStats, setServiceStats] = useState({
    focusEvents: 0,
    objectEvents: 0,
    totalEvents: 0,
    violations: 0
  });

  // Refs
  const videoRef = useRef(null);
  const focusCanvasRef = useRef(null);
  const objectCanvasRef = useRef(null);
  const timeIntervalRef = useRef(null);

  // Service instances
  const focusServiceRef = useRef(new FocusDetectionService());
  const objectServiceRef = useRef(new ObjectDetectionService());
  const recordingServiceRef = useRef(new VideoRecordingService());

  // Initialize everything after component mounts
  useEffect(() => {
    // Set loading to false first to render the DOM elements
    setLoading(false);

    // Then initialize after a delay to ensure DOM is rendered
    const timer = setTimeout(() => {
      initializeSession();
    }, 1000); // Give time for DOM elements to render

    return () => {
      clearTimeout(timer);
      cleanup();
    };
  }, [sessionId]);

  // Timer effect
  useEffect(() => {
    if (isRecording) {
      timeIntervalRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timeIntervalRef.current);
    }
    return () => clearInterval(timeIntervalRef.current);
  }, [isRecording]);

  const initializeSession = async () => {
    try {
      setError('');
      console.log('🔧 Starting initialization with DOM elements already rendered...');

      console.log('🚀 Starting session initialization...');
      console.log('Session ID:', sessionId);
      console.log('Current timestamp:', new Date().toISOString());

      // Initialize event logging
      try {
        eventLoggingService.initialize(sessionId, sessionId);
        setSystemStatus(prev => ({ ...prev, eventLogging: true }));
        console.log('✅ Event logging initialized');
      } catch (error) {
        console.error('❌ Event logging failed:', error);
        throw new Error(`Event logging initialization failed: ${error.message}`);
      }

      // Load interview data
      try {
        await loadInterviewData();
        console.log('✅ Interview data loaded');
      } catch (error) {
        console.error('❌ Interview data loading failed:', error);
        throw new Error(`Failed to load interview data: ${error.message}`);
      }

      // Initialize socket connection
      try {
        initializeSocket();
        console.log('✅ Socket connection initialized');
      } catch (error) {
        console.error('❌ Socket initialization failed:', error);
        throw new Error(`Socket initialization failed: ${error.message}`);
      }

      // Initialize detection services
      try {
        console.log('📹 About to initialize detection services...');
        await initializeDetectionServices();
        console.log('✅ Detection services initialized');
      } catch (error) {
        console.error('❌ Detection services failed:', error);
        console.error('Full error:', error);
        console.error('Error stack:', error.stack);

        // For now, continue without detection services in demo mode
        console.warn('⚠️ Continuing without detection services for demo');
        // throw new Error(`Detection services initialization failed: ${error.message}`);
      }

      // Initialize video recording
      try {
        await initializeVideoRecording();
        console.log('✅ Video recording initialized');
      } catch (error) {
        console.error('❌ Video recording failed:', error);
        // Video recording failure is not critical, continue without it
        console.warn('Continuing without video recording capability');
      }

      eventLoggingService.logSystemEvent({
        type: 'session_initialized',
        message: 'Enhanced interview session fully initialized',
        data: { sessionId }
      });

      console.log('🎉 Session initialization completed successfully');

    } catch (error) {
      console.error('💥 Session initialization error:', error);
      setError(`Failed to initialize session: ${error.message}`);
      eventLoggingService.logSystemEvent({
        type: 'session_initialization_error',
        message: 'Failed to initialize session',
        severity: 'critical',
        data: {
          error: error.message,
          stack: error.stack,
          sessionId
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const startInterviewSession = async () => {
    try {
      const response = await axios.post(`/api/interviews/${sessionId}/start`);
      if (response.data.success) {
        console.log('Interview started successfully');
        setInterview(prev => prev ? {...prev, status: 'in_progress'} : null);

        eventLoggingService.logSystemEvent({
          type: 'interview_started',
          message: 'Interview session started successfully',
          severity: 'info'
        });
      }
    } catch (error) {
      console.error('Error starting interview:', error);
      eventLoggingService.logSystemEvent({
        type: 'interview_start_error',
        message: 'Failed to start interview session',
        severity: 'warning',
        data: { error: error.message }
      });
    }
  };

  const loadInterviewData = async () => {
    try {
      // For development/demo, create mock interview data if backend is not available
      console.log('Loading interview data for session:', sessionId);

      try {
        const response = await axios.get(`/api/interviews/${sessionId}`, {
          timeout: 5000
        });

        if (response.data.success) {
          setInterview(response.data.data.interview);
          setViolations(response.data.data.violations || []);
          console.log('Interview data loaded from backend');

          // Start the interview if it's scheduled
          if (response.data.data.interview.status === 'scheduled') {
            await startInterviewSession();
          }
        } else {
          throw new Error('Interview session not found');
        }
      } catch (networkError) {
        console.error('Failed to load interview data:', networkError.message);
        throw new Error(`Interview session not found: ${networkError.message}`);
      }
    } catch (error) {
      console.error('Error loading interview:', error);
      throw error;
    }
  };

  const initializeSocket = () => {
    try {
      const newSocket = io(import.meta.env.VITE_SOCKET_URL, {
        timeout: 5000,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000
      });

      setSocket(newSocket);

      newSocket.on('connect', () => {
        console.log('✅ Socket connected successfully');
        newSocket.emit('join-interview', sessionId);
      });

      newSocket.on('connect_error', (error) => {
        console.warn('⚠️ Socket connection error (continuing without real-time features):', error.message);
        // Don't throw error - continue without socket
      });

      newSocket.on('disconnect', () => {
        console.warn('🔌 Socket disconnected');
      });

      newSocket.on('interviewer-message', (data) => {
        eventLoggingService.logSystemEvent({
          type: 'interviewer_message',
          message: 'Message received from interviewer',
          data
        });
      });

      return () => {
        if (newSocket) {
          newSocket.close();
        }
      };
    } catch (error) {
      console.warn('Socket initialization failed, continuing without real-time features:', error);
      // Don't throw error - socket is not critical for basic functionality
    }
  };

  const initializeDetectionServices = async () => {
    try {
      // Detect user role first
      const role = await detectUserRole();
      console.log('🎭 User role detected:', role);

      // First ensure all DOM elements are available
      console.log('🔍 Checking DOM elements availability...');
      let attempts = 0;
      const maxAttempts = 100; // 10 seconds max wait

      while ((!videoRef.current || !focusCanvasRef.current || !objectCanvasRef.current) && attempts < maxAttempts) {
        console.log(`⏳ Attempt ${attempts + 1}/${maxAttempts} - Elements:`, {
          video: !!videoRef.current,
          focusCanvas: !!focusCanvasRef.current,
          objectCanvas: !!objectCanvasRef.current
        });
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (!videoRef.current || !focusCanvasRef.current || !objectCanvasRef.current) {
        throw new Error(`DOM elements not available after waiting. Available: video=${!!videoRef.current}, focusCanvas=${!!focusCanvasRef.current}, objectCanvas=${!!objectCanvasRef.current}`);
      }

      console.log('✅ All DOM elements are ready');

      // Get video stream with high quality settings
      console.log('📷 Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: 'user'
        },
        audio: false
      });
      console.log('✅ Camera access granted');

      // Store the local stream
      setLocalStream(stream);

      // For candidates: display their own stream and monitor it
      // For interviewers: display their own stream but will monitor candidate's remote stream later
      videoRef.current.srcObject = stream;
      setVideoStatus(prev => ({ ...prev, hasStream: true }));

      // Set candidate stream for monitoring based on role
      if (role === 'candidate') {
        setCandidateStream(stream);
        console.log('🎯 Will monitor candidate (self) stream for focus detection');
      } else {
        console.log('🎯 Interviewer mode - will monitor candidate remote stream when available');
        // For interviewers, we'll set candidateStream when remote stream becomes available
      }

      await new Promise((resolve, reject) => {
        videoRef.current.onloadedmetadata = () => {
          console.log('✅ Video metadata loaded');
          resolve();
        };
        videoRef.current.onerror = reject;
        setTimeout(reject, 5000); // 5 second timeout
      });

      // Explicitly start video playback
      try {
        await videoRef.current.play();
        console.log('✅ Video playback started');
        setVideoStatus(prev => ({ ...prev, isPlaying: true }));
      } catch (playError) {
        console.warn('Video autoplay failed, but continuing:', playError);
        // This is common due to browser autoplay policies, but video should still work
        setVideoStatus(prev => ({ ...prev, isPlaying: false }));
      }

      // Wait for canvas elements to be ready
      let canvasAttempts = 0;
      const maxCanvasAttempts = 30; // 3 seconds max wait
      while ((!focusCanvasRef.current || !objectCanvasRef.current) && canvasAttempts < maxCanvasAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        canvasAttempts++;
      }

      console.log('Canvas elements ready:', {
        focusCanvas: !!focusCanvasRef.current,
        objectCanvas: !!objectCanvasRef.current
      });

      // Set canvas dimensions to match video resolution for better quality
      if (focusCanvasRef.current && objectCanvasRef.current && videoRef.current) {
        const videoWidth = videoRef.current.videoWidth || 1920;
        const videoHeight = videoRef.current.videoHeight || 1080;

        // Set internal canvas resolution to match video
        focusCanvasRef.current.width = videoWidth;
        focusCanvasRef.current.height = videoHeight;
        objectCanvasRef.current.width = videoWidth;
        objectCanvasRef.current.height = videoHeight;

        console.log(`Canvas dimensions set to: ${videoWidth}x${videoHeight}`);
      }

      // Initialize focus detection service
      try {
        // Only initialize focus detection if we have a candidate stream to monitor
        if (candidateStream || role === 'candidate') {
          const streamToMonitor = candidateStream || stream; // Use candidateStream if available, fallback to current stream

          // Create a video element for the stream we want to monitor
          const monitoringVideo = document.createElement('video');
          monitoringVideo.srcObject = streamToMonitor;
          monitoringVideo.muted = true;
          monitoringVideo.autoplay = true;
          monitoringVideo.playsInline = true;

          await focusServiceRef.current.initialize(monitoringVideo, focusCanvasRef.current);
          setSystemStatus(prev => ({ ...prev, focusDetection: true }));

          console.log('🎯 Focus detection initialized for', role === 'candidate' ? 'candidate (self)' : 'candidate (remote)');
        } else {
          console.log('⏸️ Focus detection skipped - no candidate stream available yet');
        }

        focusServiceRef.current.addEventListener(handleFocusEvent);

        eventLoggingService.logSystemEvent({
          type: 'focus_detection_initialized',
          message: 'Focus detection service initialized',
          severity: 'info'
        });

      } catch (error) {
        console.error('Focus detection initialization failed:', error);
        eventLoggingService.logSystemEvent({
          type: 'focus_detection_error',
          message: 'Focus detection initialization failed',
          severity: 'critical',
          data: { error: error.message }
        });
      }

      // Initialize object detection service
      try {
        await objectServiceRef.current.initialize(videoRef.current, objectCanvasRef.current);
        setSystemStatus(prev => ({ ...prev, objectDetection: true }));

        objectServiceRef.current.addEventListener(handleObjectEvent);

        eventLoggingService.logSystemEvent({
          type: 'object_detection_initialized',
          message: 'Object detection service initialized',
          severity: 'info'
        });

      } catch (error) {
        console.error('Object detection initialization failed:', error);
        eventLoggingService.logSystemEvent({
          type: 'object_detection_error',
          message: 'Object detection initialization failed',
          severity: 'critical',
          data: { error: error.message }
        });
      }

      // Update canvas contexts after initialization if they weren't available initially
      if (focusCanvasRef.current && !focusServiceRef.current.ctx) {
        focusServiceRef.current.updateCanvas?.(focusCanvasRef.current);
      }
      if (objectCanvasRef.current && !objectServiceRef.current.ctx) {
        objectServiceRef.current.updateCanvas?.(objectCanvasRef.current);
      }

      setDetectionActive(true);
      setFocusStatus('focused');

    } catch (error) {
      console.error('Detection services initialization failed:', error);
      console.log('Debug info:', {
        videoElement: !!videoRef.current,
        focusCanvas: !!focusCanvasRef.current,
        objectCanvas: !!objectCanvasRef.current,
        errorMessage: error.message
      });

      eventLoggingService.logSystemEvent({
        type: 'detection_services_error',
        message: 'Failed to initialize detection services',
        severity: 'warning', // Changed from critical to warning
        data: {
          error: error.message,
          videoAvailable: !!videoRef.current,
          canvasesAvailable: {
            focus: !!focusCanvasRef.current,
            object: !!objectCanvasRef.current
          }
        }
      });

      // Don't throw error - continue without detection services
      console.warn('⚠️ Continuing without detection services');
    }
  };

  const initializeVideoRecording = async () => {
    try {
      await recordingServiceRef.current.initialize(videoRef.current, true);
      setSystemStatus(prev => ({ ...prev, videoRecording: true }));

      recordingServiceRef.current.addEventListener(handleRecordingEvent);

      eventLoggingService.logSystemEvent({
        type: 'video_recording_initialized',
        message: 'Video recording service initialized',
        severity: 'info'
      });

    } catch (error) {
      console.error('Video recording initialization failed:', error);
      eventLoggingService.logSystemEvent({
        type: 'video_recording_error',
        message: 'Video recording initialization failed',
        severity: 'warning',
        data: { error: error.message }
      });
    }
  };

  const handleFocusEvent = useCallback((event) => {
    eventLoggingService.logFocusEvent(event);

    // Count specific focus loss types
    let focusLossIncrement = 0;
    let lookingAwayIncrement = 0;
    let noFaceIncrement = 0;

    if (event.type === 'looking_away') {
      focusLossIncrement = 1;
      lookingAwayIncrement = 1;
    } else if (event.type === 'no_face_detected') {
      focusLossIncrement = 1;
      noFaceIncrement = 1;
    } else if (event.type === 'multiple_faces_detected') {
      focusLossIncrement = 1;
    }

    setServiceStats(prev => ({
      ...prev,
      focusEvents: prev.focusEvents + 1,
      totalEvents: prev.totalEvents + 1,
      focusLossCount: prev.focusLossCount + focusLossIncrement,
      lookingAwayCount: prev.lookingAwayCount + lookingAwayIncrement,
      noFaceCount: prev.noFaceCount + noFaceIncrement
    }));

    // Update focus status
    switch (event.type) {
      case 'looking_away':
        setFocusStatus('looking_away');
        break;
      case 'no_face_detected':
        setFocusStatus('no_face');
        break;
      case 'multiple_faces_detected':
        setFocusStatus('multiple_faces');
        break;
      default:
        setFocusStatus('focused');
    }

    // Handle violations
    if (['looking_away', 'no_face_detected', 'multiple_faces_detected'].includes(event.type)) {
      handleViolation({
        type: event.type,
        description: event.message,
        severity: 'warning',
        source: 'focus_detection',
        data: event
      });
    }

    // Send real-time update to interviewer
    if (socket) {
      socket.emit('focus-update', {
        sessionId,
        event,
        timestamp: new Date()
      });
    }

  }, [socket, sessionId]);

  const handleObjectEvent = useCallback((event) => {
    eventLoggingService.logObjectDetectionEvent(event);

    setServiceStats(prev => ({
      ...prev,
      objectEvents: prev.objectEvents + 1,
      totalEvents: prev.totalEvents + 1
    }));

    // Handle unauthorized item detection
    if (event.type === 'unauthorized_item_detected') {
      handleViolation({
        type: 'unauthorized_item',
        description: event.message,
        severity: event.priority === 'high' ? 'violation' : 'warning',
        source: 'object_detection',
        data: event
      });

      // Add current alert
      const alert = {
        id: Date.now(),
        type: 'object',
        message: event.message,
        priority: event.priority,
        timestamp: new Date()
      };

      setCurrentAlerts(prev => [...prev.slice(-4), alert]);

      // Remove alert after 10 seconds
      setTimeout(() => {
        setCurrentAlerts(prev => (prev || []).filter(a => a && a.id !== alert.id));
      }, 10000);
    }

    // Send real-time update to interviewer
    if (socket) {
      socket.emit('object-detection', {
        sessionId,
        event,
        timestamp: new Date()
      });
    }

  }, [socket, sessionId]);

  const handleRecordingEvent = useCallback((event) => {
    eventLoggingService.logSystemEvent({
      ...event,
      source: 'video_recording'
    });

    console.log('Recording event:', event);
  }, []);

  const handleViolation = async (violation) => {
    try {
      // Create comprehensive violation record
      const violationData = {
        sessionId,
        type: violation.type,
        description: violation.description,
        severity: violation.severity || 'warning',
        source: violation.source || 'system',
        timestamp: new Date().toISOString(),
        metadata: violation.data || {},
        confidence: violation.data?.confidence || 0.8
      };

      // Capture screenshot evidence
      let screenshot = null;
      if (focusCanvasRef.current) {
        screenshot = focusCanvasRef.current.toDataURL('image/jpeg', 0.8);
      }

      // Log violation
      eventLoggingService.logViolation({
        ...violationData,
        screenshot
      });

      // Update local state
      setViolations(prev => [...prev, violationData]);
      setServiceStats(prev => ({
        ...prev,
        violations: prev.violations + 1
      }));

      // Send to backend
      try {
        const formData = new FormData();
        Object.keys(violationData).forEach(key => {
          if (key === 'metadata') {
            formData.append(key, JSON.stringify(violationData[key]));
          } else {
            formData.append(key, violationData[key]);
          }
        });

        if (screenshot) {
          const blob = await fetch(screenshot).then(r => r.blob());
          formData.append('screenshot', blob, `violation-${Date.now()}.jpg`);
        }

        const response = await axios.post(`${import.meta.env.VITE_API_URL || 'https://video-proctoring-system-0i3w.onrender.com/api'}/violations`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        if (response.data.success && response.data.integrityScore !== undefined) {
          setInterview(prev => ({
            ...prev,
            integrityScore: response.data.integrityScore
          }));
        }

      } catch (error) {
        console.error('Failed to submit violation to backend:', error);
      }

      // Send real-time alert to interviewer
      if (socket) {
        socket.emit('violation-detected', {
          sessionId,
          violation: violationData,
          timestamp: new Date()
        });
      }

    } catch (error) {
      console.error('Error handling violation:', error);
      eventLoggingService.logSystemEvent({
        type: 'violation_handling_error',
        message: 'Failed to handle violation',
        severity: 'critical',
        data: { error: error.message, violation }
      });
    }
  };

  const startRecording = async () => {
    try {
      await recordingServiceRef.current.startRecording();
      setIsRecording(true);

      eventLoggingService.logUserAction({
        type: 'recording_started',
        message: 'Interview recording started by user'
      });

    } catch (error) {
      console.error('Failed to start recording:', error);
      setError('Failed to start recording');
    }
  };

  const stopRecording = async () => {
    try {
      const recordingData = await recordingServiceRef.current.stopRecording();
      setIsRecording(false);

      if (recordingData) {
        await recordingServiceRef.current.saveRecording(`interview-${sessionId}.webm`);
      }

      eventLoggingService.logUserAction({
        type: 'recording_stopped',
        message: 'Interview recording stopped by user',
        data: recordingData
      });

    } catch (error) {
      console.error('Failed to stop recording:', error);
      setError('Failed to stop recording');
    }
  };

  const endInterview = async () => {
    try {
      setLoading(true);

      // Stop all services
      if (isRecording) {
        await stopRecording();
      }

      focusServiceRef.current.stop();
      objectServiceRef.current.stop();
      await recordingServiceRef.current.cleanup();

      // Generate final report
      const eventSummary = eventLoggingService.getEventSummary();
      const violationReport = eventLoggingService.getViolationReport();

      // End session in event logging
      eventLoggingService.endSession();

      // Send final data to backend with focus loss counts
      await axios.post(`/api/interviews/${sessionId}/end`, {
        focusLossCount: serviceStats.focusLossCount,
        lookingAwayCount: serviceStats.lookingAwayCount,
        noFaceCount: serviceStats.noFaceCount,
        totalViolations: violations.length,
        eventSummary,
        violationReport
      });

      // Generate interview report
      await axios.get(`/api/interviews/${sessionId}/report`);

      // Navigate to report
      navigate(`/report/${sessionId}`);

    } catch (error) {
      console.error('Error ending interview:', error);
      setError('Failed to end interview');
    } finally {
      setLoading(false);
    }
  };

  const cleanup = () => {
    clearInterval(timeIntervalRef.current);
    if (socket) socket.close();

    // Clean up all services
    focusServiceRef.current?.stop();
    objectServiceRef.current?.stop();
    recordingServiceRef.current?.cleanup();
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'focused': return '#27ae60';
      case 'looking_away': return '#f39c12';
      case 'no_face': return '#e74c3c';
      case 'multiple_faces': return '#e74c3c';
      case 'loading': return '#95a5a6';
      default: return '#95a5a6';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'focused': return 'Focused';
      case 'looking_away': return 'Looking Away';
      case 'no_face': return 'Face Not Detected';
      case 'multiple_faces': return 'Multiple Faces';
      case 'loading': return 'Loading...';
      default: return 'Unknown';
    }
  };

  // Styles
  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '20px'
    },
    header: {
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
      padding: '24px',
      marginBottom: '20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    title: {
      fontSize: '28px',
      fontWeight: 'bold',
      color: '#2c3e50',
      margin: 0
    },
    statusGrid: {
      display: 'flex',
      gap: '12px',
      alignItems: 'center'
    },
    status: {
      padding: '8px 16px',
      borderRadius: '20px',
      color: 'white',
      fontWeight: 'bold',
      fontSize: '14px'
    },
    mainGrid: {
      display: 'grid',
      gridTemplateColumns: '2fr 1fr',
      gap: '20px',
      marginBottom: '20px'
    },
    videoSection: {
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
      padding: '24px'
    },
    videoContainer: {
      position: 'relative',
      marginBottom: '20px',
      borderRadius: '12px',
      overflow: 'hidden'
    },
    video: {
      width: '100%',
      height: 'auto',
      display: 'block',
      backgroundColor: '#000',
      borderRadius: '8px'
    },
    canvas: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none'
    },
    alertsContainer: {
      position: 'absolute',
      top: '10px',
      right: '10px',
      zIndex: 10
    },
    alert: {
      background: 'rgba(231, 76, 60, 0.9)',
      color: 'white',
      padding: '8px 12px',
      borderRadius: '8px',
      marginBottom: '8px',
      fontSize: '14px',
      fontWeight: 'bold',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    },
    systemStatus: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '12px',
      marginTop: '20px'
    },
    statusItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px',
      background: '#f8f9fa',
      borderRadius: '8px'
    },
    violationsPanel: {
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
      padding: '24px'
    },
    violationsList: {
      maxHeight: '400px',
      overflowY: 'auto'
    },
    violationItem: {
      padding: '12px',
      borderBottom: '1px solid #ecf0f1',
      borderLeft: '4px solid #e74c3c'
    },
    controlsSection: {
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
      padding: '24px',
      textAlign: 'center'
    },
    button: {
      padding: '14px 28px',
      borderRadius: '8px',
      border: 'none',
      fontSize: '16px',
      fontWeight: 'bold',
      cursor: 'pointer',
      margin: '0 10px',
      transition: 'all 0.3s transform 0.1s',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
    },
    startButton: {
      background: 'linear-gradient(135deg, #27ae60, #2ecc71)',
      color: 'white'
    },
    stopButton: {
      background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
      color: 'white'
    },
    endButton: {
      background: 'linear-gradient(135deg, #9b59b6, #8e44ad)',
      color: 'white'
    },
    error: {
      background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
      color: 'white',
      borderRadius: '12px',
      padding: '16px',
      marginBottom: '20px',
      fontWeight: 'bold'
    },
    loading: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '400px',
      color: 'white',
      fontSize: '18px'
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>
          <div style={{ fontSize: '24px', marginBottom: '20px' }}>🚀</div>
          <div>Initializing Enhanced Video Proctoring System...</div>
          <div style={{ fontSize: '14px', marginTop: '10px' }}>
            Loading AI models and detection services
          </div>
          <div style={{ fontSize: '12px', marginTop: '20px', color: 'rgba(255,255,255,0.7)' }}>
            Session ID: {sessionId}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {error && (
        <div style={styles.error}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <span style={{ fontSize: '24px' }}>⚠️</span>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 'bold' }}>System Error</div>
              <div style={{ fontSize: '14px', opacity: 0.9 }}>{error}</div>
            </div>
          </div>
          <button
            onClick={() => {
              setError('');
              setLoading(true);
              initializeSession();
            }}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            🔄 Retry Initialization
          </button>
        </div>
      )}

      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            Enhanced Video Proctoring
            {interview && ` - ${interview.candidateName}`}
          </h1>
        </div>
        <div style={styles.statusGrid}>
          <div style={styles.status}>
            ⏱️ {formatTime(elapsedTime)}
          </div>
          <div style={{
            ...styles.status,
            backgroundColor: getStatusColor(focusStatus)
          }}>
            👁️ {getStatusText(focusStatus)}
          </div>
          {interview && (
            <div style={{ ...styles.status, backgroundColor: '#3498db' }}>
              📊 Score: {interview.integrityScore || 100}/100
            </div>
          )}
          {interview?.status && (
            <div style={{
              ...styles.status,
              backgroundColor: interview.status === 'in_progress' ? '#27ae60' : '#95a5a6',
              textTransform: 'capitalize'
            }}>
              🎯 {interview.status.replace('_', ' ')}
            </div>
          )}
        </div>
      </div>

      <div style={styles.mainGrid}>
        <div style={styles.videoSection}>
          <h3>Live Video Feed</h3>
          <div style={styles.videoContainer}>
            <video
              ref={videoRef}
              style={styles.video}
              autoPlay
              muted
              playsInline
              width="640"
              height="480"
              onError={(e) => console.error('Video element error:', e)}
              onCanPlay={() => console.log('Video can play')}
              onPlay={() => console.log('Video started playing')}
            />
            <canvas
              ref={focusCanvasRef}
              style={styles.canvas}
            />
            <canvas
              ref={objectCanvasRef}
              style={{...styles.canvas, opacity: 0.7}}
            />

            {/* Real-time alerts */}
            <div style={styles.alertsContainer}>
              {(currentAlerts || []).map(alert => alert && (
                <div key={alert.id} style={styles.alert}>
                  ⚠️ {alert.message}
                </div>
              ))}
            </div>
          </div>

          {/* System Status Indicators */}
          <div style={styles.systemStatus}>
            <div style={styles.statusItem}>
              <span>{videoStatus.hasStream ? '✅' : '❌'}</span>
              <span>Camera Stream</span>
            </div>
            <div style={styles.statusItem}>
              <span>{videoStatus.isPlaying ? '✅' : '❌'}</span>
              <span>Video Display</span>
            </div>
            <div style={styles.statusItem}>
              <span>{systemStatus.focusDetection ? '✅' : '❌'}</span>
              <span>Focus Detection</span>
            </div>
            <div style={styles.statusItem}>
              <span>{systemStatus.objectDetection ? '✅' : '❌'}</span>
              <span>Object Detection</span>
            </div>
            <div style={styles.statusItem}>
              <span>{systemStatus.videoRecording ? '✅' : '❌'}</span>
              <span>Video Recording</span>
            </div>
            <div style={styles.statusItem}>
              <span>{systemStatus.eventLogging ? '✅' : '❌'}</span>
              <span>Event Logging</span>
            </div>
          </div>
        </div>

        <div style={styles.violationsPanel}>
          <h3>Live Monitoring</h3>

          {/* Statistics */}
          <div style={{ marginBottom: '20px', padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Session Statistics</div>
            <div>Focus Events: {serviceStats.focusEvents}</div>
            <div>Object Events: {serviceStats.objectEvents}</div>
            <div>Total Violations: {serviceStats.violations}</div>
            <div>Total Events: {serviceStats.totalEvents}</div>
            <div style={{ color: serviceStats.focusLossCount > 0 ? '#e74c3c' : '#27ae60' }}>
              Focus Losses: {serviceStats.focusLossCount}
            </div>
            <div>Looking Away Count: {serviceStats.lookingAwayCount}</div>
            <div>No Face Detected: {serviceStats.noFaceCount}</div>
          </div>

          {/* Recent Violations */}
          <h4>Recent Violations ({violations.length})</h4>
          <div style={styles.violationsList}>
            {violations.length === 0 ? (
              <p style={{ color: '#27ae60', textAlign: 'center', padding: '20px' }}>
                ✅ No violations detected
              </p>
            ) : (
              (violations || []).slice(-10).reverse().map((violation, index) => violation && (
                <div key={index} style={styles.violationItem}>
                  <div style={{ fontWeight: 'bold', color: '#e74c3c' }}>
                    {violation.type.replace(/_/g, ' ').toUpperCase()}
                  </div>
                  <div style={{ margin: '4px 0' }}>{violation.description}</div>
                  <div style={{ fontSize: '12px', color: '#7f8c8d' }}>
                    {new Date(violation.timestamp).toLocaleTimeString()}
                    {violation.source && ` • ${violation.source}`}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div style={styles.controlsSection}>
        <h3>Interview Controls</h3>
        <div style={{ marginBottom: '20px' }}>
          {!isRecording ? (
            <button
              style={{ ...styles.button, ...styles.startButton }}
              onClick={startRecording}
            >
              🎥 Start Recording
            </button>
          ) : (
            <button
              style={{ ...styles.button, ...styles.stopButton }}
              onClick={stopRecording}
            >
              ⏹️ Stop Recording
            </button>
          )}
          <button
            style={{ ...styles.button, ...styles.endButton }}
            onClick={endInterview}
            disabled={loading}
          >
            {loading ? '⏳ Ending...' : '🏁 End Interview'}
          </button>
        </div>

        <div style={{ fontSize: '14px', color: '#7f8c8d' }}>
          Enhanced AI-powered video proctoring with real-time detection
        </div>
      </div>
    </div>
  );
};

export default EnhancedInterview;