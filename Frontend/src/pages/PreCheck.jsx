import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Webcam from 'react-webcam';
import axios from 'axios';

const PreCheck = () => {
  const [step, setStep] = useState('info'); // info, camera, audio, ready
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [candidateInfo, setCandidateInfo] = useState({
    candidateName: '',
    candidateEmail: '',
    interviewerName: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [cameraRetryAttempt, setCameraRetryAttempt] = useState(0);
  const [audioRetryAttempt, setAudioRetryAttempt] = useState(0);
  const [deviceInfo, setDeviceInfo] = useState({ cameras: [], microphones: [] });
  const [videoConstraints, setVideoConstraints] = useState({
    width: { ideal: 640, max: 1280 },
    height: { ideal: 480, max: 720 },
    frameRate: { ideal: 15, max: 30 },
    facingMode: 'user'
  });
  const [webcamKey, setWebcamKey] = useState(Date.now());

  const webcamRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const navigate = useNavigate();

  // Enumerate available devices
  const enumerateDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      const microphones = devices.filter(device => device.kind === 'audioinput');

      setDeviceInfo({ cameras, microphones });
      console.log('Available devices:', { cameras: cameras.length, microphones: microphones.length });

      return { cameras, microphones };
    } catch (error) {
      console.error('Device enumeration failed:', error);
      return { cameras: [], microphones: [] };
    }
  };

  // Check camera access with progressive fallback
  const checkCamera = async () => {
    try {
      setError('');
      console.log('🔍 Starting camera access check...');

      // Check if getUserMedia is supported
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera access not supported in this browser. Please use a modern browser like Chrome, Firefox, or Safari.');
        return false;
      }

      // First, enumerate devices
      const { cameras } = await enumerateDevices();
      console.log('📹 Available cameras:', cameras);

      if (cameras.length === 0) {
        setError('No camera devices found. Please connect a camera and try again.');
        return false;
      }

      // Progressive constraint fallback
      const constraintLevels = [
        {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: 'user'
        },
        {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 15, max: 30 },
          facingMode: 'user'
        },
        {
          width: 640,
          height: 480,
          facingMode: 'user'
        },
        {
          width: 320,
          height: 240
        },
        true // Basic constraints
      ];

      let stream = null;
      for (let i = cameraRetryAttempt; i < constraintLevels.length; i++) {
        try {
          console.log(`Trying camera constraint level ${i + 1}:`, constraintLevels[i]);

          stream = await navigator.mediaDevices.getUserMedia({
            video: constraintLevels[i]
          });

          console.log('Camera access granted with constraints:', constraintLevels[i]);
          break;
        } catch (err) {
          console.log(`Camera constraint level ${i + 1} failed:`, err.name);
          if (i === constraintLevels.length - 1) {
            throw err;
          }
        }
      }

      if (stream) {
        setCameraEnabled(true);
        setCameraRetryAttempt(0);

        // Log stream details
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
          console.log('Camera settings:', videoTracks[0].getSettings());

          // Store the working constraints for the Webcam component
          const workingConstraints = videoTracks[0].getSettings();
          setVideoConstraints({
            width: { ideal: workingConstraints.width || 640 },
            height: { ideal: workingConstraints.height || 480 },
            frameRate: { ideal: workingConstraints.frameRate || 15 },
            facingMode: 'user'
          });
          setWebcamKey(Date.now()); // Force Webcam re-render
        }

        // Stop the test stream - Webcam component will create its own
        stream.getTracks().forEach(track => track.stop());
        return true;
      }

      return false;
    } catch (error) {
      console.error('Camera access error:', error.name, error.message);

      let errorMessage = 'Camera access denied. ';
      if (error.name === 'NotAllowedError') {
        errorMessage += 'Please click "Allow" when prompted for camera access.';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No camera found. Please connect a camera and try again.';
      } else if (error.name === 'NotReadableError') {
        errorMessage += 'Camera is already in use by another application.';
      } else if (error.name === 'OverconstrainedError') {
        errorMessage += 'Camera constraints too strict. Trying fallback...';
        setCameraRetryAttempt(prev => prev + 1);
        return checkCamera(); // Retry with next constraint level
      } else {
        errorMessage += 'Please check your camera and try again.';
      }

      setError(errorMessage);
      return false;
    }
  };

  // Check microphone access with progressive fallback
  const checkAudio = async () => {
    try {
      setError('');
      console.log('Requesting microphone access...');

      // First, check for available microphones
      const { microphones } = await enumerateDevices();

      if (microphones.length === 0) {
        setError('No microphone devices found. Please connect a microphone and try again.');
        return false;
      }

      // Progressive audio constraint fallback
      const audioConstraintLevels = [
        {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 1
        },
        {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        true // Basic constraints
      ];

      let stream = null;
      for (let i = audioRetryAttempt; i < audioConstraintLevels.length; i++) {
        try {
          console.log(`Trying audio constraint level ${i + 1}:`, audioConstraintLevels[i]);

          stream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraintLevels[i]
          });

          console.log('Microphone access granted with constraints:', audioConstraintLevels[i]);
          break;
        } catch (err) {
          console.log(`Audio constraint level ${i + 1} failed:`, err.name);
          if (i === audioConstraintLevels.length - 1) {
            throw err;
          }
        }
      }

      if (stream) {
        setAudioEnabled(true);
        setAudioRetryAttempt(0);

        // Log stream details
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          console.log('Microphone settings:', audioTracks[0].getSettings());
        }

        // Start audio visualization
        startAudioVisualization(stream);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Audio access error:', error.name, error.message);

      let errorMessage = 'Microphone access denied. ';
      if (error.name === 'NotAllowedError') {
        errorMessage += 'Please click "Allow" when prompted for microphone access.';
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'No microphone found. Please connect a microphone and try again.';
      } else if (error.name === 'NotReadableError') {
        errorMessage += 'Microphone is already in use by another application.';
      } else if (error.name === 'OverconstrainedError') {
        errorMessage += 'Microphone constraints too strict. Trying fallback...';
        setAudioRetryAttempt(prev => prev + 1);
        return checkAudio(); // Retry with next constraint level
      } else {
        errorMessage += 'Please check your microphone and try again.';
      }

      setError(errorMessage);
      return false;
    }
  };

  // Start audio visualization
  const startAudioVisualization = (stream) => {
    audioStreamRef.current = stream;

    try {
      console.log('Starting audio visualization...');

      // Create audio context and analyser
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        console.error('AudioContext not supported');
        return;
      }

      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();

      // Resume audio context if it's suspended (required by some browsers)
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

      setIsListening(true);
      console.log('Audio visualization started');

      let lastUpdateTime = 0;
      const updateAudioLevel = (currentTime) => {
        // Limit updates to 20fps to reduce CPU usage
        if (currentTime - lastUpdateTime < 50) {
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
          return;
        }
        lastUpdateTime = currentTime;

        if (analyserRef.current && audioStreamRef.current && audioStreamRef.current.active) {
          analyserRef.current.getByteFrequencyData(dataArray);

          // Simplified calculation for better performance
          let sum = 0;
          let max = 0;
          const step = Math.max(1, Math.floor(dataArray.length / 32)); // Sample fewer points

          for (let i = 0; i < dataArray.length; i += step) {
            sum += dataArray[i];
            if (dataArray[i] > max) max = dataArray[i];
          }

          const average = sum / (dataArray.length / step);
          const combinedLevel = Math.max(average, max * 0.25);
          const normalizedLevel = Math.min(combinedLevel / 80, 1);

          setAudioLevel(normalizedLevel);

          // Continue animation frame
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
        } else {
          // Stop if stream is not active
          setIsListening(false);
        }
      };

      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
    } catch (error) {
      console.error('Error setting up audio visualization:', error);
      setError('Audio visualization failed. Audio detection will continue without visualization.');
    }
  };

  // Stop audio visualization
  const stopAudioVisualization = () => {
    setIsListening(false);

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    setAudioLevel(0);
  };

  // Initialize device enumeration on mount
  useEffect(() => {
    enumerateDevices();
  }, []);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      stopAudioVisualization();
    };
  }, []);

  // Removed debug useEffect for performance

  // Start interview session
  const startInterview = async () => {
    if (!candidateInfo.candidateName || !candidateInfo.candidateEmail || !candidateInfo.interviewerName) {
      setError('Please fill in all required information');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Generate a simple session ID for demo purposes
      const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

      // Store candidate info in sessionStorage for the interview
      sessionStorage.setItem('candidateInfo', JSON.stringify({
        ...candidateInfo,
        sessionId,
        startTime: new Date().toISOString()
      }));

      console.log('Starting interview with session ID:', sessionId);

      // Navigate to interview room
      navigate(`/candidate/${sessionId}`);

    } catch (error) {
      console.error('Error starting interview:', error);
      setError('Failed to start interview session. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    setError('');

    switch (step) {
      case 'info':
        if (!candidateInfo.candidateName || !candidateInfo.candidateEmail || !candidateInfo.interviewerName) {
          setError('Please fill in all required information');
          return;
        }
        setStep('camera');
        // Automatically test camera when entering camera step
        setTimeout(() => {
          if (!cameraEnabled) {
            checkCamera();
          }
        }, 500);
        break;

      case 'camera':
        if (!cameraEnabled) {
          const cameraOk = await checkCamera();
          if (!cameraOk) {
            return; // Stay on camera step if failed
          }
        }
        setStep('audio');
        break;

      case 'audio':
        if (!audioEnabled) {
          const audioOk = await checkAudio();
          if (!audioOk) {
            return; // Stay on audio step if failed
          }
        }
        setStep('ready');
        stopAudioVisualization();
        break;

      case 'ready':
        await startInterview();
        break;

      default:
        break;
    }
  };

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    },
    card: {
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
      padding: '40px',
      maxWidth: '600px',
      width: '100%'
    },
    header: {
      textAlign: 'center',
      marginBottom: '30px'
    },
    title: {
      fontSize: '28px',
      fontWeight: 'bold',
      color: '#2c3e50',
      marginBottom: '10px'
    },
    subtitle: {
      fontSize: '16px',
      color: '#7f8c8d',
      marginBottom: '20px'
    },
    steps: {
      display: 'flex',
      justifyContent: 'center',
      marginBottom: '30px'
    },
    stepItem: {
      width: '40px',
      height: '40px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 10px',
      fontSize: '14px',
      fontWeight: 'bold'
    },
    stepActive: {
      background: '#3498db',
      color: 'white'
    },
    stepCompleted: {
      background: '#27ae60',
      color: 'white'
    },
    stepInactive: {
      background: '#ecf0f1',
      color: '#95a5a6'
    },
    formGroup: {
      marginBottom: '20px'
    },
    label: {
      display: 'block',
      marginBottom: '8px',
      fontSize: '14px',
      fontWeight: '600',
      color: '#2c3e50'
    },
    input: {
      width: '100%',
      padding: '12px',
      border: '2px solid #ecf0f1',
      borderRadius: '8px',
      fontSize: '16px',
      transition: 'border-color 0.3s'
    },
    inputFocus: {
      borderColor: '#3498db',
      outline: 'none'
    },
    webcamContainer: {
      display: 'flex',
      justifyContent: 'center',
      marginBottom: '20px'
    },
    webcam: {
      borderRadius: '8px',
      maxWidth: '100%'
    },
    statusIcon: {
      width: '60px',
      height: '60px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '0 auto 20px',
      fontSize: '24px'
    },
    statusSuccess: {
      background: '#27ae60',
      color: 'white'
    },
    statusError: {
      background: '#e74c3c',
      color: 'white'
    },
    button: {
      background: '#3498db',
      color: 'white',
      border: 'none',
      padding: '12px 30px',
      borderRadius: '8px',
      fontSize: '16px',
      fontWeight: '600',
      cursor: 'pointer',
      transition: 'background-color 0.3s',
      width: '100%'
    },
    buttonHover: {
      background: '#2980b9'
    },
    buttonDisabled: {
      background: '#bdc3c7',
      cursor: 'not-allowed'
    },
    error: {
      background: '#ffe6e6',
      border: '1px solid #ff9999',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '20px',
      color: '#cc0000',
      fontSize: '14px'
    },
    retryButton: {
      background: '#3498db',
      color: 'white',
      border: 'none',
      padding: '8px 16px',
      borderRadius: '6px',
      fontSize: '12px',
      cursor: 'pointer',
      marginTop: '8px'
    },
    readyList: {
      listStyle: 'none',
      padding: 0
    },
    readyItem: {
      display: 'flex',
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid #ecf0f1'
    },
    checkIcon: {
      color: '#27ae60',
      marginRight: '10px',
      fontSize: '18px'
    },
    // Audio Visualizer Styles
    audioVisualizerContainer: {
      background: '#f8f9fa',
      borderRadius: '12px',
      padding: '25px',
      margin: '20px 0',
      border: '2px solid #e9ecef'
    },
    audioVisualizerLabel: {
      textAlign: 'center',
      fontSize: '16px',
      fontWeight: '600',
      color: '#2c3e50',
      marginBottom: '20px'
    },
    frequencyBars: {
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'end',
      height: '120px',
      marginBottom: '25px',
      gap: '3px',
      padding: '0 20px'
    },
    frequencyBar: {
      width: '8px',
      minHeight: '10px',
      borderRadius: '4px 4px 0 0',
      transition: 'height 0.1s ease-out, background-color 0.2s ease',
      background: 'linear-gradient(to top, currentColor, rgba(255,255,255,0.3))',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
    },
    audioLevelContainer: {
      marginBottom: '20px'
    },
    audioLevelLabel: {
      fontSize: '14px',
      fontWeight: '600',
      color: '#2c3e50',
      marginBottom: '8px',
      textAlign: 'center'
    },
    audioLevelBar: {
      width: '100%',
      height: '12px',
      backgroundColor: '#e9ecef',
      borderRadius: '6px',
      overflow: 'hidden',
      marginBottom: '8px',
      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
    },
    audioLevelFill: {
      height: '100%',
      borderRadius: '6px',
      transition: 'width 0.1s ease-out, background-color 0.3s ease',
      background: 'linear-gradient(90deg, currentColor, rgba(255,255,255,0.2))'
    },
    audioLevelText: {
      textAlign: 'center',
      fontSize: '14px',
      fontWeight: '600',
      color: '#2c3e50'
    },
    audioInstructions: {
      textAlign: 'center',
      background: '#ffffff',
      padding: '15px',
      borderRadius: '8px',
      border: '1px solid #dee2e6'
    }
  };

  const getStepStyle = (stepName) => {
    const stepOrder = ['info', 'camera', 'audio', 'ready'];
    const currentIndex = stepOrder.indexOf(step);
    const stepIndex = stepOrder.indexOf(stepName);

    if (stepIndex < currentIndex) return { ...styles.stepItem, ...styles.stepCompleted };
    if (stepIndex === currentIndex) return { ...styles.stepItem, ...styles.stepActive };
    return { ...styles.stepItem, ...styles.stepInactive };
  };

  const renderStepContent = () => {
    switch (step) {
      case 'info':
        return (
          <>
            <div style={styles.formGroup}>
              <label style={styles.label}>Candidate Name *</label>
              <input
                style={styles.input}
                type="text"
                value={candidateInfo.candidateName}
                onChange={(e) => setCandidateInfo({
                  ...candidateInfo,
                  candidateName: e.target.value
                })}
                placeholder="Enter your full name"
                required
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Email Address *</label>
              <input
                style={styles.input}
                type="email"
                value={candidateInfo.candidateEmail}
                onChange={(e) => setCandidateInfo({
                  ...candidateInfo,
                  candidateEmail: e.target.value
                })}
                placeholder="Enter your email address"
                required
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Interviewer Name *</label>
              <input
                style={styles.input}
                type="text"
                value={candidateInfo.interviewerName}
                onChange={(e) => setCandidateInfo({
                  ...candidateInfo,
                  interviewerName: e.target.value
                })}
                placeholder="Enter interviewer's name"
                required
              />
            </div>
          </>
        );

      case 'camera':
        return (
          <>
            <div style={{
              ...styles.statusIcon,
              ...(cameraEnabled ? styles.statusSuccess : styles.statusError)
            }}>
              {cameraEnabled ? '✓' : '📷'}
            </div>
            <h3 style={{ textAlign: 'center', color: '#2c3e50', marginBottom: '20px' }}>
              Camera Test
            </h3>
            <p style={{ textAlign: 'center', marginBottom: '20px', color: '#7f8c8d' }}>
              {cameraEnabled
                ? 'Camera access granted! You should see yourself in the preview below.'
                : 'Please allow camera access when prompted to continue.'
              }
            </p>
            {deviceInfo.cameras.length > 0 && (
              <div style={{ textAlign: 'center', marginBottom: '15px', fontSize: '14px', color: '#666' }}>
                📹 {deviceInfo.cameras.length} camera{deviceInfo.cameras.length !== 1 ? 's' : ''} detected
                {cameraRetryAttempt > 0 && (
                  <span style={{ color: '#f39c12', marginLeft: '10px' }}>
                    (Attempt {cameraRetryAttempt + 1})
                  </span>
                )}
              </div>
            )}
            {!cameraEnabled && (
              <div style={{ textAlign: 'center', margin: '20px 0' }}>
                <button
                  style={{
                    background: '#3498db',
                    color: 'white',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    fontSize: '16px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                  onClick={checkCamera}
                >
                  📹 Test Camera Access
                </button>
              </div>
            )}
            {cameraEnabled && (
              <div style={styles.webcamContainer}>
                <Webcam
                  key={webcamKey}
                  ref={webcamRef}
                  style={styles.webcam}
                  width={640}
                  height={480}
                  videoConstraints={videoConstraints}
                  onUserMedia={(stream) => {
                    console.log('Webcam preview stream initialized:', stream);
                    const videoTracks = stream.getVideoTracks();
                    if (videoTracks.length > 0) {
                      console.log('Video track settings:', videoTracks[0].getSettings());
                    }
                  }}
                  onUserMediaError={(error) => {
                    console.error('Webcam preview error:', error);
                    setCameraEnabled(false);

                    let errorMessage = 'Camera preview failed: ';
                    if (error.name === 'NotAllowedError') {
                      errorMessage += 'Permission denied. Please allow camera access and try again.';
                    } else if (error.name === 'NotFoundError') {
                      errorMessage += 'Camera not found. Please connect a camera and try again.';
                    } else if (error.name === 'NotReadableError') {
                      errorMessage += 'Camera is already in use by another application.';
                    } else if (error.name === 'OverconstrainedError') {
                      errorMessage += 'Camera constraints not supported. Retrying with simpler settings...';
                      // Retry with simpler constraints
                      setTimeout(() => {
                        setVideoConstraints({
                          width: 320,
                          height: 240,
                          facingMode: 'user'
                        });
                        setWebcamKey(Date.now()); // Force re-render
                      }, 1000);
                      return;
                    } else {
                      errorMessage += error.message;
                    }

                    setError(errorMessage);
                  }}
                />
              </div>
            )}
          </>
        );

      case 'audio':
        return (
          <>
            <div style={{
              ...styles.statusIcon,
              ...(audioEnabled ? styles.statusSuccess : styles.statusError)
            }}>
              {audioEnabled ? '✓' : '🎤'}
            </div>
            <h3 style={{ textAlign: 'center', color: '#2c3e50', marginBottom: '20px' }}>
              Microphone Test
            </h3>
            <p style={{ textAlign: 'center', marginBottom: '30px', color: '#7f8c8d' }}>
              {audioEnabled
                ? 'Microphone access granted! Please speak clearly to test your audio level.'
                : 'Please allow microphone access when prompted to continue.'
              }
            </p>
            {deviceInfo.microphones.length > 0 && (
              <div style={{ textAlign: 'center', marginBottom: '15px', fontSize: '14px', color: '#666' }}>
                🎤 {deviceInfo.microphones.length} microphone{deviceInfo.microphones.length !== 1 ? 's' : ''} detected
                {audioRetryAttempt > 0 && (
                  <span style={{ color: '#f39c12', marginLeft: '10px' }}>
                    (Attempt {audioRetryAttempt + 1})
                  </span>
                )}
              </div>
            )}

            {!audioEnabled && (
              <div style={{ textAlign: 'center', margin: '20px 0' }}>
                <button
                  style={{
                    background: '#3498db',
                    color: 'white',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    fontSize: '16px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                  onClick={checkAudio}
                >
                  🎤 Test Microphone Access
                </button>
              </div>
            )}

            {/* Audio Visualizer */}
            {audioEnabled && (
              <div style={styles.audioVisualizerContainer}>
                <div style={styles.audioVisualizerLabel}>
                  Speak now - Watch the audio level:
                </div>

                {/* Frequency Bars - Reduced from 20 to 10 for better performance */}
                <div style={styles.frequencyBars}>
                  {[...Array(10)].map((_, i) => {
                    // Simplified animation with less CPU-intensive calculations
                    const barHeight = Math.max(15, audioLevel * 80 + (i % 3) * 10);
                    const isActive = audioLevel > 0.05;

                    return (
                      <div
                        key={i}
                        style={{
                          ...styles.frequencyBar,
                          height: `${barHeight}%`,
                          backgroundColor: isActive
                            ? audioLevel > 0.5 ? '#27ae60' : '#f39c12'
                            : '#e0e0e0',
                          transform: isActive ? 'scaleY(1)' : 'scaleY(0.3)'
                        }}
                      />
                    );
                  })}
                </div>

                {/* Audio Level Indicator */}
                <div style={styles.audioLevelContainer}>
                  <div style={styles.audioLevelLabel}>Audio Level:</div>
                  <div style={styles.audioLevelBar}>
                    <div
                      style={{
                        ...styles.audioLevelFill,
                        width: `${audioLevel * 100}%`,
                        backgroundColor: audioLevel > 0.1
                          ? audioLevel > 0.7
                            ? '#27ae60'
                            : '#f39c12'
                          : '#e74c3c'
                      }}
                    />
                  </div>
                  <div style={styles.audioLevelText}>
                    {audioLevel > 0.1
                      ? audioLevel > 0.7
                        ? 'Excellent!'
                        : 'Good'
                      : 'Speak louder'
                    }
                  </div>
                </div>

                {/* Instructions */}
                <div style={styles.audioInstructions}>
                  <p style={{ color: '#666', fontSize: '14px', margin: '10px 0' }}>
                    💡 <strong>Try saying:</strong> "Hello, my name is [Your Name]. I can hear my voice clearly."
                  </p>
                  <p style={{ color: '#666', fontSize: '12px', margin: '5px 0' }}>
                    The bars should move when you speak. Adjust your microphone if needed.
                  </p>
                  <p style={{ color: '#999', fontSize: '11px', margin: '5px 0' }}>
                    Current audio level: {audioLevel.toFixed(3)} | Listening: {isListening ? 'Yes' : 'No'}
                  </p>
                  <button
                    style={{
                      background: '#3498db',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      marginTop: '5px'
                    }}
                    onClick={() => {
                      console.log('Manual test - Audio Level:', audioLevel);
                      setAudioLevel(Math.random() * 0.8 + 0.2); // Test animation
                    }}
                  >
                    Test Animation
                  </button>
                </div>
              </div>
            )}
          </>
        );

      case 'ready':
        return (
          <>
            <div style={{ ...styles.statusIcon, ...styles.statusSuccess }}>
              ✓
            </div>
            <h3 style={{ textAlign: 'center', color: '#2c3e50', marginBottom: '20px' }}>
              Ready to Start
            </h3>
            <p style={{ textAlign: 'center', marginBottom: '30px', color: '#7f8c8d' }}>
              All systems check complete. You're ready to begin your proctored interview.
            </p>
            <ul style={styles.readyList}>
              <li style={styles.readyItem}>
                <span style={styles.checkIcon}>✓</span>
                <span>Camera and microphone access granted</span>
              </li>
              <li style={styles.readyItem}>
                <span style={styles.checkIcon}>✓</span>
                <span>Candidate information collected</span>
              </li>
              <li style={styles.readyItem}>
                <span style={styles.checkIcon}>✓</span>
                <span>Proctoring system ready</span>
              </li>
            </ul>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>Video Proctoring System</h1>
          <p style={styles.subtitle}>Pre-Interview System Check</p>

          <div style={styles.steps}>
            <div style={getStepStyle('info')}>1</div>
            <div style={getStepStyle('camera')}>2</div>
            <div style={getStepStyle('audio')}>3</div>
            <div style={getStepStyle('ready')}>4</div>
          </div>
        </div>

        {error && (
          <div style={styles.error}>
            <div style={{ marginBottom: '10px' }}>
              ⚠️ {error}
            </div>
            {(step === 'camera' || step === 'audio') && (
              <button
                style={styles.retryButton}
                onClick={() => {
                  setError('');
                  if (step === 'camera') {
                    setCameraEnabled(false);
                    setCameraRetryAttempt(0);
                    checkCamera();
                  } else if (step === 'audio') {
                    setAudioEnabled(false);
                    setAudioRetryAttempt(0);
                    stopAudioVisualization();
                    checkAudio();
                  }
                }}
              >
                🔄 Try Again
              </button>
            )}
          </div>
        )}

        {renderStepContent()}

        <button
          style={{
            ...styles.button,
            ...(loading ? styles.buttonDisabled : {})
          }}
          onClick={handleNext}
          disabled={loading}
        >
          {loading ? 'Starting Interview...' :
           step === 'ready' ? 'Start Interview' : 'Next'}
        </button>
      </div>
    </div>
  );
};

export default PreCheck;