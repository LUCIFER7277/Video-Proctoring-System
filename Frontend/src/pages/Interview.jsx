import React, { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Webcam from "react-webcam";
import axios from "axios";
import io from "socket.io-client";
import DetectionService from "../services/detectionService";

const Interview = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // State management
  const [isRecording, setIsRecording] = useState(false);
  const [interview, setInterview] = useState(null);
  const [violations, setViolations] = useState([]);
  const [focusStatus, setFocusStatus] = useState("focused");
  const [detectionActive, setDetectionActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [socket, setSocket] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [webcamKey, setWebcamKey] = useState(Date.now());
  const [videoConstraints, setVideoConstraints] = useState({
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 },
    facingMode: "user",
  });

  // Refs
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const detectionServiceRef = useRef(new DetectionService());
  const recordedChunksRef = useRef([]);
  const detectionIntervalRef = useRef(null);
  const timeIntervalRef = useRef(null);

  // Initialize
  useEffect(() => {
    initializeInterview();
    initializeSocket();
    initializeDetection();

    return () => {
      cleanup();
    };
  }, [sessionId]);

  // Timer effect
  useEffect(() => {
    if (isRecording) {
      timeIntervalRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timeIntervalRef.current);
    }

    return () => clearInterval(timeIntervalRef.current);
  }, [isRecording]);

  const initializeInterview = async () => {
    try {
      const response = await axios.get(`/api/interviews/${sessionId}`);
      if (response.data.success) {
        setInterview(response.data.data.interview);
        setViolations(response.data.data.violations || []);
      } else {
        setError("Interview session not found");
      }
    } catch (error) {
      console.error("Error loading interview:", error);
      setError("Failed to load interview session");
    } finally {
      setLoading(false);
    }
  };

  const initializeSocket = () => {
    const newSocket = io(import.meta.env.VITE_SOCKET_URL);
    setSocket(newSocket);

    newSocket.emit("join-interview", sessionId);

    return () => {
      newSocket.close();
    };
  };

  const initializeDetection = async () => {
    try {
      console.log("🚀 Starting AI detection initialization...");
      setError(""); // Clear any previous errors

      const initialized = await detectionServiceRef.current.initialize();
      console.log("AI initialization result:", initialized);

      if (initialized) {
        console.log("✅ AI detection successfully initialized");
        setDetectionActive(true);

        // Add violation callback
        detectionServiceRef.current.addViolationCallback(handleViolation);

        // Start detection loop
        startDetectionLoop();
        console.log("🔄 Detection loop started");
      } else {
        console.error("❌ Failed to initialize AI models");
        setError(
          "Failed to initialize AI models. Please refresh and try again."
        );
      }
    } catch (error) {
      console.error("❌ Detection initialization error:", error);
      setError(`AI models failed to load: ${error.message}`);
    }
  };

  const startDetectionLoop = () => {
    console.log("🔄 Starting detection loop...");

    detectionIntervalRef.current = setInterval(async () => {
      if (webcamRef.current?.video && canvasRef.current && detectionActive) {
        const video = webcamRef.current.video;
        const canvas = canvasRef.current;

        // Check if video is actually playing
        if (video.readyState < 2) {
          console.warn("⚠️ Video not ready, readyState:", video.readyState);
          return;
        }

        // Set canvas dimensions to match video
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        console.log("📹 Processing frame...", {
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
        });

        // Process frame
        const result = await detectionServiceRef.current.processFrame(
          video,
          canvas
        );
        console.log("🔍 Detection result:", result);

        if (result?.focus) {
          console.log(
            "👤 Focus status:",
            result.focus.focusStatus,
            "Face count:",
            result.focus.faceCount
          );
          setFocusStatus(result.focus.focusStatus);

          // Send focus status to interviewer
          if (socket) {
            socket.emit("focus-status", {
              sessionId,
              status: result.focus.focusStatus,
              faceCount: result.focus.faceCount,
              timestamp: new Date(),
            });
          }
        }

        if (result?.objects && result.objects.violations?.length > 0) {
          console.log("📱 Objects detected:", result.objects.violations);
        }
      } else {
        console.warn("⚠️ Detection loop conditions not met:", {
          hasVideo: !!webcamRef.current?.video,
          hasCanvas: !!canvasRef.current,
          detectionActive,
        });
      }
    }, 2000); // Run every 2 seconds for debugging
  };

  const handleViolation = useCallback(
    async (violation) => {
      try {
        // Capture screenshot as evidence
        const screenshot = detectionServiceRef.current.captureScreenshot(
          canvasRef.current
        );

        // Convert base64 to blob
        let screenshotBlob = null;
        if (screenshot) {
          const response = await fetch(screenshot);
          screenshotBlob = await response.blob();
        }

        // Prepare form data
        const formData = new FormData();
        formData.append("sessionId", sessionId);
        formData.append("type", violation.type);
        formData.append("description", violation.description);
        formData.append("confidence", violation.confidence || 0.5);
        formData.append("timestamp", violation.timestamp.toISOString());
        formData.append("severity", violation.severity || "medium");
        if (violation.metadata) {
          formData.append("metadata", JSON.stringify(violation.metadata));
        }
        if (screenshotBlob) {
          formData.append(
            "screenshot",
            screenshotBlob,
            `violation-${Date.now()}.jpg`
          );
        }

        // Send to backend
        const response = await axios.post("/api/violations", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });

        if (response.data.success) {
          // Update local violations list
          setViolations((prev) => [...prev, response.data.data]);

          // Send real-time alert to interviewer
          if (socket) {
            socket.emit("violation-detected", {
              sessionId,
              violation: response.data.data,
              timestamp: new Date(),
            });
          }

          // Update interview integrity score
          if (response.data.integrityScore !== undefined) {
            setInterview((prev) => ({
              ...prev,
              integrityScore: response.data.integrityScore,
            }));
          }
        }
      } catch (error) {
        console.error("Error handling violation:", error);
      }
    },
    [sessionId, socket]
  );

  const startRecording = useCallback(() => {
    if (!webcamRef.current?.stream) {
      setError("Camera not available");
      return;
    }

    try {
      recordedChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(webcamRef.current.stream, {
        mimeType: "video/webm",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: "video/webm",
        });
        await uploadRecording(blob);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
    } catch (error) {
      console.error("Error starting recording:", error);
      setError("Failed to start recording");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const uploadRecording = async (blob) => {
    try {
      const formData = new FormData();
      formData.append("video", blob, `interview-${sessionId}.webm`);

      await axios.post(`/api/interviews/${sessionId}/upload`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      console.log("Recording uploaded successfully");
    } catch (error) {
      console.error("Error uploading recording:", error);
    }
  };

  const endInterview = async () => {
    try {
      setLoading(true);

      // Stop recording
      stopRecording();

      // Stop detection
      setDetectionActive(false);
      clearInterval(detectionIntervalRef.current);

      // End interview session
      await axios.post(`/api/interviews/${sessionId}/end`);

      // Generate report
      await axios.get(`/api/interviews/${sessionId}/report`);

      // Navigate to report view
      navigate(`/report/${sessionId}`);
    } catch (error) {
      console.error("Error ending interview:", error);
      setError("Failed to end interview");
    } finally {
      setLoading(false);
    }
  };

  const cleanup = () => {
    clearInterval(detectionIntervalRef.current);
    clearInterval(timeIntervalRef.current);
    if (socket) socket.close();
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
  };

  const retryCamera = async () => {
    try {
      setCameraError("");
      setRetryAttempt((prev) => prev + 1);

      // Try to enumerate devices first
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(
        (device) => device.kind === "videoinput"
      );

      console.log("Available video devices:", videoDevices);

      if (videoDevices.length === 0) {
        setCameraError(
          "No camera devices found. Please connect a camera and try again."
        );
        return;
      }

      // Progressive constraint fallback
      const constraintLevels = [
        {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: "user",
        },
        {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 15, max: 30 },
          facingMode: "user",
        },
        {
          width: 640,
          height: 480,
          facingMode: "user",
        },
        {
          width: 320,
          height: 240,
        },
        true, // Basic constraints
      ];

      for (let i = retryAttempt; i < constraintLevels.length; i++) {
        try {
          console.log(`Trying constraint level ${i + 1}:`, constraintLevels[i]);
          setVideoConstraints(constraintLevels[i]);
          setWebcamKey(Date.now()); // Force re-render
          break;
        } catch (err) {
          console.log(`Constraint level ${i + 1} failed:`, err);
          if (i === constraintLevels.length - 1) {
            throw err;
          }
        }
      }
    } catch (error) {
      console.error("Camera retry failed:", error);
      setCameraError(`Camera initialization failed: ${error.message}`);
    }
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "focused":
        return "#27ae60";
      case "looking_away":
        return "#f39c12";
      case "no_face":
        return "#e74c3c";
      case "multiple_faces":
        return "#e74c3c";
      default:
        return "#95a5a6";
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case "focused":
        return "Focused";
      case "looking_away":
        return "Looking Away";
      case "no_face":
        return "Face Not Detected";
      case "multiple_faces":
        return "Multiple Faces";
      default:
        return "Unknown";
    }
  };

  const styles = {
    container: {
      minHeight: "100vh",
      background: "#f8f9fa",
      padding: "20px",
    },
    header: {
      background: "white",
      borderRadius: "8px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
      padding: "20px",
      marginBottom: "20px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerLeft: {
      display: "flex",
      alignItems: "center",
    },
    headerRight: {
      display: "flex",
      alignItems: "center",
      gap: "20px",
    },
    title: {
      fontSize: "24px",
      fontWeight: "bold",
      color: "#2c3e50",
      margin: 0,
    },
    timer: {
      fontSize: "18px",
      fontWeight: "bold",
      color: "#2c3e50",
    },
    status: {
      padding: "8px 16px",
      borderRadius: "20px",
      color: "white",
      fontWeight: "bold",
      fontSize: "14px",
    },
    mainContent: {
      display: "grid",
      gridTemplateColumns: "2fr 1fr",
      gap: "20px",
      marginBottom: "20px",
    },
    videoSection: {
      background: "white",
      borderRadius: "8px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
      padding: "20px",
    },
    videoContainer: {
      position: "relative",
      marginBottom: "20px",
    },
    webcam: {
      width: "100%",
      borderRadius: "8px",
    },
    canvas: {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      borderRadius: "8px",
      pointerEvents: "none",
    },
    violationsSection: {
      background: "white",
      borderRadius: "8px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
      padding: "20px",
    },
    violationsList: {
      maxHeight: "400px",
      overflowY: "auto",
    },
    violationItem: {
      padding: "10px",
      borderBottom: "1px solid #ecf0f1",
      fontSize: "14px",
    },
    violationType: {
      fontWeight: "bold",
      textTransform: "capitalize",
    },
    violationTime: {
      color: "#7f8c8d",
      fontSize: "12px",
    },
    controlsSection: {
      background: "white",
      borderRadius: "8px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
      padding: "20px",
      textAlign: "center",
    },
    button: {
      padding: "12px 24px",
      borderRadius: "8px",
      border: "none",
      fontSize: "16px",
      fontWeight: "bold",
      cursor: "pointer",
      margin: "0 10px",
      transition: "all 0.3s",
    },
    startButton: {
      background: "#27ae60",
      color: "white",
    },
    stopButton: {
      background: "#e74c3c",
      color: "white",
    },
    endButton: {
      background: "#9b59b6",
      color: "white",
    },
    error: {
      background: "#ffe6e6",
      border: "1px solid #ff9999",
      borderRadius: "8px",
      padding: "12px",
      marginBottom: "20px",
      color: "#cc0000",
    },
    loading: {
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "200px",
      fontSize: "18px",
      color: "#7f8c8d",
    },
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading interview session...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>
            Interview Session
            {interview && ` - ${interview.candidateName}`}
          </h1>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.timer}>{formatTime(elapsedTime)}</div>
          <div
            style={{
              ...styles.status,
              backgroundColor: getStatusColor(focusStatus),
            }}
          >
            {getStatusText(focusStatus)}
          </div>
          {interview && (
            <div style={{ ...styles.status, backgroundColor: "#3498db" }}>
              Score: {interview.integrityScore}/100
            </div>
          )}
        </div>
      </div>

      <div style={styles.mainContent}>
        <div style={styles.videoSection}>
          <h3>Candidate Video</h3>
          <div style={styles.videoContainer}>
            <Webcam
              key={webcamKey}
              ref={webcamRef}
              style={styles.webcam}
              mirrored={false}
              audio={true}
              video={videoConstraints}
              audioConstraints={{
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              }}
              onUserMedia={(stream) => {
                console.log("Webcam stream initialized:", stream);
                setCameraReady(true);
                setError(""); // Clear any previous errors

                // Log stream details
                const videoTracks = stream.getVideoTracks();
                const audioTracks = stream.getAudioTracks();
                console.log("Stream details:", {
                  video:
                    videoTracks.length > 0
                      ? videoTracks[0].getSettings()
                      : "No video",
                  audio:
                    audioTracks.length > 0
                      ? audioTracks[0].getSettings()
                      : "No audio",
                });
              }}
              onUserMediaError={(error) => {
                console.error("Webcam error:", error);
                setCameraReady(false);

                let errorMessage = "Camera access failed: ";
                if (error.name === "NotAllowedError") {
                  errorMessage +=
                    "Permission denied. Please allow camera access and try the retry button.";
                } else if (error.name === "NotFoundError") {
                  errorMessage +=
                    "No camera found. Please connect a camera and try the retry button.";
                } else if (error.name === "NotReadableError") {
                  errorMessage +=
                    "Camera is already in use by another application.";
                } else if (error.name === "OverconstrainedError") {
                  errorMessage +=
                    "Camera constraints too strict. Trying fallback...";
                  retryCamera();
                  return;
                } else {
                  errorMessage += error.message;
                }
                setCameraError(errorMessage);
              }}
            />
            <canvas ref={canvasRef} style={styles.canvas} />
          </div>
          {/* Camera Status */}
          <div
            style={{
              padding: "10px",
              borderRadius: "8px",
              marginTop: "10px",
              backgroundColor: cameraReady ? "#d4edda" : "#f8d7da",
              border: `1px solid ${cameraReady ? "#c3e6cb" : "#f5c6cb"}`,
              color: cameraReady ? "#155724" : "#721c24",
            }}
          >
            <div style={{ fontWeight: "bold", marginBottom: "5px" }}>
              {cameraReady ? "📹 Camera Active" : "❌ Camera Inactive"}
            </div>
            <div style={{ fontSize: "12px" }}>
              {cameraReady
                ? "Camera streaming successfully"
                : cameraError || "Initializing camera..."}
            </div>
            {!cameraReady && (
              <button
                style={{
                  marginTop: "8px",
                  padding: "6px 12px",
                  fontSize: "12px",
                  backgroundColor: "#007bff",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
                onClick={retryCamera}
              >
                Retry Camera (Attempt {retryAttempt + 1})
              </button>
            )}
          </div>

          {/* AI Detection Status */}
          <div
            style={{
              padding: "10px",
              borderRadius: "8px",
              marginTop: "10px",
              backgroundColor: detectionActive ? "#d4edda" : "#f8d7da",
              border: `1px solid ${detectionActive ? "#c3e6cb" : "#f5c6cb"}`,
              color: detectionActive ? "#155724" : "#721c24",
            }}
          >
            <div style={{ fontWeight: "bold", marginBottom: "5px" }}>
              {detectionActive
                ? "✅ AI Detection Active"
                : "❌ AI Detection Inactive"}
            </div>
            <div style={{ fontSize: "12px" }}>
              {detectionActive
                ? "Face and object detection running..."
                : "Loading AI models or detection failed"}
            </div>
            {detectionActive && (
              <div
                style={{ fontSize: "11px", marginTop: "5px", color: "#6c757d" }}
              >
                Check browser console (F12) for detection logs
                <button
                  style={{
                    marginLeft: "10px",
                    padding: "4px 8px",
                    fontSize: "10px",
                    backgroundColor: "#007bff",
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    // Trigger a test violation
                    const testViolation = {
                      type: "looking_away",
                      description: "Manual test violation",
                      confidence: 0.9,
                      timestamp: new Date(),
                      severity: "medium",
                    };

                    handleViolation(testViolation);
                  }}
                >
                  Test Detection
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={styles.violationsSection}>
          <h3>Recent Violations ({violations.length})</h3>
          <div style={styles.violationsList}>
            {violations.length === 0 ? (
              <p
                style={{
                  color: "#27ae60",
                  textAlign: "center",
                  padding: "20px",
                }}
              >
                No violations detected
              </p>
            ) : (
              violations
                .slice(-10)
                .reverse()
                .map((violation, index) => (
                  <div key={index} style={styles.violationItem}>
                    <div style={styles.violationType}>
                      {violation.type.replace(/_/g, " ")}
                    </div>
                    <div>{violation.description}</div>
                    <div style={styles.violationTime}>
                      {new Date(violation.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>

      <div style={styles.controlsSection}>
        <h3>Interview Controls</h3>
        {!isRecording ? (
          <button
            style={{ ...styles.button, ...styles.startButton }}
            onClick={startRecording}
          >
            Start Recording
          </button>
        ) : (
          <button
            style={{ ...styles.button, ...styles.stopButton }}
            onClick={stopRecording}
          >
            Stop Recording
          </button>
        )}
        <button
          style={{ ...styles.button, ...styles.endButton }}
          onClick={endInterview}
          disabled={loading}
        >
          {loading ? "Ending..." : "End Interview"}
        </button>
      </div>
    </div>
  );
};

export default Interview;
