import * as tf from '@tensorflow/tfjs';
import * as blazeface from '@tensorflow-models/blazeface';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

class AIDetectionService {
  constructor() {
    this.isInitialized = false;
    this.models = {
      faceDetection: null,
      faceLandmarks: null,
      objectDetection: null
    };

    this.eventCallbacks = [];
    this.detectionActive = false;
    this.detectionInterval = null;

    // Resource tracking for cleanup
    this.intervals = new Set();
    this.timeouts = new Set();
    this.canvasContexts = new Set();
    this.tensorBuffers = new Set();
    this.detectionStartTime = null;

    // Detection settings - optimized for quality and performance
    this.settings = {
      faceDetectionThreshold: 0.7,
      lookingAwayThreshold: 0.3,
      noFaceTimeout: 10000, // 10 seconds
      lookingAwayTimeout: 5000, // 5 seconds
      detectionFrameRate: 3, // Increased to 3 FPS for better responsiveness
      confidenceThreshold: 0.6,
      // Quality settings
      videoInputWidth: 1920,
      videoInputHeight: 1080,
      processWidth: 640, // Process at lower resolution for performance
      processHeight: 480
    };

    // State tracking
    this.state = {
      lastFaceDetection: Date.now(),
      lastLookingAwayStart: null,
      currentFaceCount: 0,
      isLookingAway: false,
      currentViolations: [],
      detectionStats: {
        totalFrames: 0,
        facesDetected: 0,
        violationsDetected: 0,
        averageConfidence: 0
      }
    };

    // Unauthorized items to detect
    this.unauthorizedItems = new Set([
      'cell phone', 'laptop', 'book', 'paper', 'tablet',
      'keyboard', 'mouse', 'monitor', 'tv', 'person'
    ]);
  }

  async initialize() {
    try {
      console.log('🚀 Initializing AI Detection Service...');

      // Validate TensorFlow support
      if (!tf) {
        throw new Error('TensorFlow.js not available');
      }

      // Setup TensorFlow backend with timeout
      const tfReadyPromise = tf.ready();
      const timeoutPromise = new Promise((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('TensorFlow initialization timeout (30s)'));
        }, 30000);
        this.timeouts.add(timeoutId);
      });

      await Promise.race([tfReadyPromise, timeoutPromise]);
      console.log(`TensorFlow backend: ${tf.getBackend()}`);

      // Load models with individual timeouts
      console.log('Loading face detection model...');
      const faceModelPromise = blazeface.load();
      const faceTimeoutPromise = new Promise((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Face detection model loading timeout (30s)'));
        }, 30000);
        this.timeouts.add(timeoutId);
      });
      this.models.faceDetection = await Promise.race([faceModelPromise, faceTimeoutPromise]);
      console.log('✅ Face detection model loaded');

      // Load face landmarks model
      console.log('Loading face landmarks model...');
      const landmarksModelPromise = faceLandmarksDetection.load(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        { runtime: 'mediapipe', solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh' }
      );
      const landmarksTimeoutPromise = new Promise((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Face landmarks model loading timeout (30s)'));
        }, 30000);
        this.timeouts.add(timeoutId);
      });
      this.models.faceLandmarks = await Promise.race([landmarksModelPromise, landmarksTimeoutPromise]);
      console.log('✅ Face landmarks model loaded');

      // Load object detection model
      console.log('Loading object detection model...');
      const objectModelPromise = cocoSsd.load();
      const objectTimeoutPromise = new Promise((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Object detection model loading timeout (30s)'));
        }, 30000);
        this.timeouts.add(timeoutId);
      });
      this.models.objectDetection = await Promise.race([objectModelPromise, objectTimeoutPromise]);
      console.log('✅ Object detection model loaded');

      this.isInitialized = true;
      console.log('🎉 AI Detection Service initialized successfully');

      this.triggerEvent({
        type: 'service_initialized',
        timestamp: new Date(),
        message: 'AI Detection Service ready',
        data: { backend: tf.getBackend() }
      });

      return true;
    } catch (error) {
      console.error('❌ AI Detection Service initialization failed:', error);
      this.triggerEvent({
        type: 'service_error',
        timestamp: new Date(),
        message: 'Failed to initialize AI models',
        error: error.message
      });
      throw error;
    }
  }

  async processFrame(videoElement, outputCanvas) {
    if (!this.isInitialized || !videoElement || !outputCanvas) {
      return null;
    }

    // Validate video element state
    if (videoElement.readyState < 2 || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      return null;
    }

    try {
      const canvas = outputCanvas;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Failed to get 2D context from canvas');
      }

      // Track context for cleanup
      this.canvasContexts.add(ctx);

      // Validate and set canvas dimensions
      const videoWidth = Math.min(videoElement.videoWidth || 640, 1920);
      const videoHeight = Math.min(videoElement.videoHeight || 480, 1080);

      if (canvas.width !== videoWidth || canvas.height !== videoHeight) {
        canvas.width = videoWidth;
        canvas.height = videoHeight;
      }

      // Clear canvas and draw video frame
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      this.state.detectionStats.totalFrames++;

      // Run face detection
      const faceResults = await this.detectFaces(videoElement);

      // Run object detection
      const objectResults = await this.detectObjects(videoElement);

      // Analyze results
      const analysis = this.analyzeDetectionResults(faceResults, objectResults);

      // Draw visualizations
      this.drawDetectionResults(ctx, faceResults, objectResults, canvas.width, canvas.height);

      // Update statistics
      this.updateStatistics(faceResults, objectResults);

      // Clean up any tensors that might have been created during processing
      this.cleanupTensors();

      return {
        faces: faceResults,
        objects: objectResults,
        analysis: analysis,
        violations: this.state.currentViolations,
        stats: this.state.detectionStats
      };

    } catch (error) {
      console.error('Error processing frame:', error);
      this.triggerEvent({
        type: 'processing_error',
        timestamp: new Date(),
        message: 'Frame processing failed',
        error: error.message
      });
      return null;
    }
  }

  async detectFaces(videoElement) {
    try {
      const predictions = await this.models.faceDetection.estimateFaces(videoElement, false);

      const faceResults = {
        count: predictions.length,
        faces: [],
        confidence: 0
      };

      if (predictions.length > 0) {
        this.state.lastFaceDetection = Date.now();
        this.state.detectionStats.facesDetected++;

        for (const prediction of predictions) {
          const face = {
            bbox: prediction.topLeft.concat(prediction.bottomRight),
            probability: prediction.probability,
            landmarks: prediction.landmarks,
            isLookingAway: false,
            gazeDirection: null
          };

          // Analyze gaze direction if landmarks are available
          if (prediction.landmarks && prediction.landmarks.length >= 6) {
            const gazeAnalysis = this.analyzeGaze(prediction.landmarks);
            face.isLookingAway = gazeAnalysis.isLookingAway;
            face.gazeDirection = gazeAnalysis.direction;
          }

          faceResults.faces.push(face);
          faceResults.confidence = Math.max(faceResults.confidence, prediction.probability);
        }
      }

      this.state.currentFaceCount = faceResults.count;
      return faceResults;

    } catch (error) {
      console.error('Face detection error:', error);
      return { count: 0, faces: [], confidence: 0 };
    }
  }

  async detectObjects(videoElement) {
    try {
      const predictions = await this.models.objectDetection.detect(videoElement);

      const objectResults = {
        total: predictions.length,
        authorized: [],
        unauthorized: [],
        violations: []
      };

      for (const prediction of predictions) {
        const objectData = {
          class: prediction.class,
          confidence: prediction.score,
          bbox: prediction.bbox
        };

        if (this.unauthorizedItems.has(prediction.class.toLowerCase())) {
          if (prediction.score >= this.settings.confidenceThreshold) {
            objectResults.unauthorized.push(objectData);

            // Create violation
            const violation = {
              type: 'unauthorized_item',
              item: prediction.class,
              confidence: prediction.score,
              timestamp: new Date(),
              bbox: prediction.bbox,
              severity: this.getViolationSeverity(prediction.class)
            };

            objectResults.violations.push(violation);
          }
        } else {
          objectResults.authorized.push(objectData);
        }
      }

      return objectResults;

    } catch (error) {
      console.error('Object detection error:', error);
      return { total: 0, authorized: [], unauthorized: [], violations: [] };
    }
  }

  analyzeGaze(landmarks) {
    try {
      // Validate landmarks array
      if (!landmarks || !Array.isArray(landmarks) || landmarks.length < 4) {
        return {
          isLookingAway: false,
          direction: 'unknown',
          deviation: 0,
          confidence: 0
        };
      }

      // Validate landmark structure
      const validateLandmark = (landmark) => {
        return landmark && Array.isArray(landmark) && landmark.length >= 2 &&
               typeof landmark[0] === 'number' && typeof landmark[1] === 'number';
      };

      // Ensure we have enough landmarks before accessing
      if (landmarks.length < 4) {
        return {
          isLookingAway: false,
          direction: 'unknown',
          deviation: 0,
          confidence: 0
        };
      }

      const leftEye = landmarks[0];
      const rightEye = landmarks[1];
      const nose = landmarks[2];
      const mouth = landmarks[3];

      if (!validateLandmark(leftEye) || !validateLandmark(rightEye) ||
          !validateLandmark(nose) || !validateLandmark(mouth)) {
        return {
          isLookingAway: false,
          direction: 'unknown',
          deviation: 0,
          confidence: 0
        };
      }

      // Calculate eye center
      const eyeCenter = [
        (leftEye[0] + rightEye[0]) / 2,
        (leftEye[1] + rightEye[1]) / 2
      ];

      // Calculate horizontal deviation of nose from eye center
      const horizontalDeviation = Math.abs(nose[0] - eyeCenter[0]);
      const eyeDistance = Math.abs(rightEye[0] - leftEye[0]);

      // Avoid division by zero
      if (eyeDistance === 0) {
        return {
          isLookingAway: false,
          direction: 'unknown',
          deviation: 0,
          confidence: 0
        };
      }

      // Normalize deviation
      const normalizedDeviation = horizontalDeviation / eyeDistance;

      // Clamp values to reasonable ranges
      const clampedDeviation = Math.min(Math.max(normalizedDeviation, 0), 2);

      // Determine if looking away
      const isLookingAway = clampedDeviation > this.settings.lookingAwayThreshold;

      // Determine direction
      let direction = 'center';
      if (isLookingAway) {
        direction = nose[0] < eyeCenter[0] ? 'left' : 'right';
      }

      return {
        isLookingAway,
        direction,
        deviation: clampedDeviation,
        confidence: Math.max(0, Math.min(1, 1 - clampedDeviation))
      };

    } catch (error) {
      console.error('Gaze analysis error:', error);
      return {
        isLookingAway: false,
        direction: 'unknown',
        deviation: 0,
        confidence: 0
      };
    }
  }

  analyzeDetectionResults(faceResults, objectResults) {
    const currentTime = Date.now();
    const analysis = {
      focusStatus: 'focused',
      violations: [],
      alerts: [],
      recommendations: []
    };

    // Analyze face detection
    if (faceResults.count === 0) {
      // No face detected
      if (currentTime - this.state.lastFaceDetection > this.settings.noFaceTimeout) {
        analysis.focusStatus = 'no_face';
        analysis.violations.push({
          type: 'no_face_detected',
          timestamp: new Date(),
          duration: currentTime - this.state.lastFaceDetection,
          severity: 'high',
          message: 'No face detected for extended period'
        });
      }
    } else if (faceResults.count > 1) {
      // Multiple faces
      analysis.focusStatus = 'multiple_faces';
      analysis.violations.push({
        type: 'multiple_faces',
        timestamp: new Date(),
        count: faceResults.count,
        severity: 'high',
        message: `${faceResults.count} faces detected`
      });
    } else {
      // Single face - check gaze
      const face = faceResults.faces[0];
      if (face.isLookingAway) {
        if (!this.state.isLookingAway) {
          this.state.lastLookingAwayStart = currentTime;
          this.state.isLookingAway = true;
        } else if (currentTime - this.state.lastLookingAwayStart > this.settings.lookingAwayTimeout) {
          analysis.focusStatus = 'looking_away';
          analysis.violations.push({
            type: 'looking_away',
            timestamp: new Date(),
            duration: currentTime - this.state.lastLookingAwayStart,
            direction: face.gazeDirection,
            severity: 'medium',
            message: `Looking ${face.gazeDirection} for ${Math.round((currentTime - this.state.lastLookingAwayStart) / 1000)} seconds`
          });
        }
      } else {
        this.state.isLookingAway = false;
        this.state.lastLookingAwayStart = null;
      }
    }

    // Add object violations
    analysis.violations.push(...objectResults.violations);

    // Generate recommendations
    if (faceResults.count === 0) {
      analysis.recommendations.push('Ensure you are visible in the camera frame');
      analysis.recommendations.push('Check lighting and camera position');
    } else if (faceResults.confidence < 0.5) {
      analysis.recommendations.push('Improve lighting for better face detection');
    }

    if (objectResults.unauthorized.length > 0) {
      analysis.recommendations.push('Remove unauthorized items from camera view');
    }

    // Trigger events for violations
    analysis.violations.forEach(violation => {
      this.triggerEvent({
        type: 'violation_detected',
        timestamp: violation.timestamp,
        violation
      });
    });

    this.state.currentViolations = analysis.violations;
    return analysis;
  }

  drawDetectionResults(ctx, faceResults, objectResults, width, height) {
    // Draw face detections
    faceResults.faces.forEach((face, index) => {
      const [x1, y1, x2, y2] = face.bbox;
      const w = x2 - x1;
      const h = y2 - y1;

      // Draw bounding box
      ctx.strokeStyle = face.isLookingAway ? '#ff6b6b' : '#4ecdc4';
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, w, h);

      // Draw confidence
      ctx.fillStyle = face.isLookingAway ? '#ff6b6b' : '#4ecdc4';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(
        `Face ${index + 1}: ${(face.probability * 100).toFixed(1)}%`,
        x1, y1 - 8
      );

      // Draw gaze indicator
      if (face.gazeDirection) {
        ctx.fillStyle = face.isLookingAway ? '#ff6b6b' : '#4ecdc4';
        ctx.font = 'bold 14px Arial';
        ctx.fillText(
          `👁️ ${face.gazeDirection}`,
          x1, y2 + 20
        );
      }

      // Draw landmarks if available
      if (face.landmarks) {
        ctx.fillStyle = '#fff';
        face.landmarks.forEach(landmark => {
          ctx.beginPath();
          ctx.arc(landmark[0], landmark[1], 2, 0, 2 * Math.PI);
          ctx.fill();
        });
      }
    });

    // Draw object detections
    objectResults.unauthorized.forEach(obj => {
      const [x, y, w, h] = obj.bbox;

      // Draw bounding box for unauthorized items
      ctx.strokeStyle = '#ff4757';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);

      // Draw warning
      ctx.fillStyle = '#ff4757';
      ctx.font = 'bold 16px Arial';
      ctx.fillText(
        `⚠️ ${obj.class} (${(obj.confidence * 100).toFixed(1)}%)`,
        x, y - 8
      );
    });

    objectResults.authorized.forEach(obj => {
      const [x, y, w, h] = obj.bbox;

      // Draw bounding box for authorized items (subtle)
      ctx.strokeStyle = '#a4b0be';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);

      // Draw label
      ctx.fillStyle = '#a4b0be';
      ctx.font = '12px Arial';
      ctx.fillText(
        `${obj.class} (${(obj.confidence * 100).toFixed(1)}%)`,
        x, y - 4
      );
    });

    // Draw status indicators
    this.drawStatusIndicators(ctx, faceResults, objectResults, width, height);
  }

  drawStatusIndicators(ctx, faceResults, objectResults, width, height) {
    const indicators = [];

    // Face status
    if (faceResults.count === 0) {
      indicators.push({ text: '❌ No Face', color: '#ff4757' });
    } else if (faceResults.count > 1) {
      indicators.push({ text: `⚠️ ${faceResults.count} Faces`, color: '#ffa502' });
    } else {
      const face = faceResults.faces[0];
      if (face.isLookingAway) {
        indicators.push({ text: '👁️ Looking Away', color: '#ff6b6b' });
      } else {
        indicators.push({ text: '✅ Focused', color: '#26de81' });
      }
    }

    // Object status
    if (objectResults.unauthorized.length > 0) {
      indicators.push({
        text: `⚠️ ${objectResults.unauthorized.length} Unauthorized Items`,
        color: '#ff4757'
      });
    }

    // Draw indicators
    indicators.forEach((indicator, index) => {
      const y = 30 + (index * 30);

      // Background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(10, y - 20, 200, 25);

      // Text
      ctx.fillStyle = indicator.color;
      ctx.font = 'bold 14px Arial';
      ctx.fillText(indicator.text, 15, y);
    });

    // Draw detection stats
    const stats = this.state.detectionStats;
    const statsY = height - 60;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(width - 220, statsY, 210, 50);

    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.fillText(`Frames: ${stats.totalFrames}`, width - 210, statsY + 15);
    ctx.fillText(`Faces: ${stats.facesDetected}`, width - 210, statsY + 30);
    ctx.fillText(`Violations: ${stats.violationsDetected}`, width - 210, statsY + 45);
  }

  getViolationSeverity(itemClass) {
    const highSeverityItems = ['cell phone', 'laptop', 'tablet', 'person'];
    const mediumSeverityItems = ['book', 'paper', 'monitor', 'tv'];

    if (highSeverityItems.includes(itemClass.toLowerCase())) {
      return 'high';
    } else if (mediumSeverityItems.includes(itemClass.toLowerCase())) {
      return 'medium';
    }
    return 'low';
  }

  updateStatistics(faceResults, objectResults) {
    const stats = this.state.detectionStats;

    // Update average confidence with proper division protection
    if (faceResults.confidence > 0) {
      if (stats.facesDetected === 0) {
        // First face detection
        stats.averageConfidence = faceResults.confidence;
      } else {
        // Calculate running average with safe division
        const newAverage = (
          (stats.averageConfidence * stats.facesDetected + faceResults.confidence) /
          (stats.facesDetected + 1)
        );
        stats.averageConfidence = isNaN(newAverage) ? 0 : Math.max(0, Math.min(1, newAverage));
      }
    }

    // Safely update violation count
    const violationCount = objectResults?.violations?.length || 0;
    stats.violationsDetected += violationCount;
  }

  cleanupTensors() {
    try {
      // Get current memory info
      const memInfo = tf.memory();

      // If memory usage is getting high, force garbage collection
      if (memInfo.numTensors > 100) {
        tf.dispose();
      }

      // Clean up any tracked tensors
      this.tensorBuffers.forEach(tensor => {
        try {
          if (tensor && typeof tensor.dispose === 'function' && !tensor.isDisposed) {
            tensor.dispose();
          }
        } catch (error) {
          console.warn('Error disposing tensor:', error);
        }
      });
      this.tensorBuffers.clear();

    } catch (error) {
      console.warn('Error in tensor cleanup:', error);
    }
  }

  startDetection(videoElement, outputCanvas, frameRate = null) {
    if (!this.isInitialized) {
      throw new Error('AI Detection Service not initialized');
    }

    if (this.detectionActive) {
      console.warn('Detection already active');
      return;
    }

    // Validate inputs
    if (!videoElement || !outputCanvas) {
      throw new Error('Invalid video element or canvas');
    }

    const fps = Math.max(1, Math.min(frameRate || this.settings.detectionFrameRate, 30));
    const interval = 1000 / fps;

    this.detectionActive = true;
    this.detectionStartTime = Date.now();
    let isProcessing = false;

    const intervalId = setInterval(async () => {
      if (this.detectionActive && !isProcessing) {
        isProcessing = true;
        try {
          await this.processFrame(videoElement, outputCanvas);

          // Periodic tensor cleanup to prevent memory buildup
          if (this.state.detectionStats.totalFrames % 10 === 0) {
            this.cleanupTensors();
          }
        } catch (error) {
          console.error('Frame processing error:', error);
          // Clean up on error to prevent memory leaks
          this.cleanupTensors();
        } finally {
          isProcessing = false;
        }
      }
    }, interval);

    this.intervals.add(intervalId);
    this.detectionInterval = intervalId;

    console.log(`Detection started at ${fps} FPS`);
    this.triggerEvent({
      type: 'detection_started',
      timestamp: new Date(),
      message: `Detection started at ${fps} FPS`
    });
  }

  stopDetection() {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.intervals.delete(this.detectionInterval);
      this.detectionInterval = null;
    }

    this.detectionActive = false;
    this.detectionStartTime = null;

    console.log('Detection stopped');
    this.triggerEvent({
      type: 'detection_stopped',
      timestamp: new Date(),
      message: 'Detection stopped'
    });
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    console.log('Detection settings updated:', this.settings);
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      detectionActive: this.detectionActive,
      modelsLoaded: {
        faceDetection: !!this.models.faceDetection,
        faceLandmarks: !!this.models.faceLandmarks,
        objectDetection: !!this.models.objectDetection
      },
      state: this.state,
      settings: this.settings
    };
  }

  getStatistics() {
    return {
      ...this.state.detectionStats,
      uptime: this.detectionActive && this.detectionStartTime ? Date.now() - this.detectionStartTime : 0,
      violationRate: this.state.detectionStats.totalFrames > 0 ?
        this.state.detectionStats.violationsDetected / this.state.detectionStats.totalFrames : 0
    };
  }

  triggerEvent(event) {
    this.eventCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in event callback:', error);
      }
    });
  }

  addEventListener(callback) {
    this.eventCallbacks.push(callback);
  }

  removeEventListener(callback) {
    const index = this.eventCallbacks.indexOf(callback);
    if (index > -1) {
      this.eventCallbacks.splice(index, 1);
    }
  }

  reset() {
    this.state = {
      lastFaceDetection: Date.now(),
      lastLookingAwayStart: null,
      currentFaceCount: 0,
      isLookingAway: false,
      currentViolations: [],
      detectionStats: {
        totalFrames: 0,
        facesDetected: 0,
        violationsDetected: 0,
        averageConfidence: 0
      }
    };
    this.detectionStartTime = null;
  }

  cleanup() {
    try {
      console.log('🧹 Starting AI Detection Service cleanup...');

      // Stop detection first
      this.stopDetection();

      // Clear all intervals
      this.intervals.forEach(intervalId => {
        clearInterval(intervalId);
      });
      this.intervals.clear();

      // Clear all timeouts
      this.timeouts.forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
      this.timeouts.clear();

      // Clear canvas contexts
      this.canvasContexts.clear();

      // Dispose TensorFlow models and tensors
      if (this.models.faceDetection) {
        try {
          if (typeof this.models.faceDetection.dispose === 'function') {
            this.models.faceDetection.dispose();
          }
        } catch (error) {
          console.warn('Face detection model disposal error:', error);
        }
        this.models.faceDetection = null;
      }

      if (this.models.faceLandmarks) {
        try {
          if (typeof this.models.faceLandmarks.dispose === 'function') {
            this.models.faceLandmarks.dispose();
          }
        } catch (error) {
          console.warn('Face landmarks model disposal error:', error);
        }
        this.models.faceLandmarks = null;
      }

      if (this.models.objectDetection) {
        try {
          if (typeof this.models.objectDetection.dispose === 'function') {
            this.models.objectDetection.dispose();
          }
        } catch (error) {
          console.warn('Object detection model disposal error:', error);
        }
        this.models.objectDetection = null;
      }

      // Clear tensor buffers
      this.tensorBuffers.forEach(tensor => {
        try {
          if (tensor && typeof tensor.dispose === 'function') {
            tensor.dispose();
          }
        } catch (error) {
          console.warn('Tensor disposal error:', error);
        }
      });
      this.tensorBuffers.clear();

      // Clear callbacks and reset state
      this.eventCallbacks = [];
      this.isInitialized = false;
      this.detectionActive = false;
      this.detectionStartTime = null;

      // Reset state
      this.state = {
        lastFaceDetection: Date.now(),
        lastLookingAwayStart: null,
        currentFaceCount: 0,
        isLookingAway: false,
        currentViolations: [],
        detectionStats: {
          totalFrames: 0,
          facesDetected: 0,
          violationsDetected: 0,
          averageConfidence: 0
        }
      };

      console.log('✅ AI Detection Service cleaned up successfully');

    } catch (error) {
      console.error('AI Detection Service cleanup error:', error);
    }
  }
}

export default AIDetectionService;