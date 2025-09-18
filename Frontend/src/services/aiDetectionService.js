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

      // Setup TensorFlow backend
      await tf.ready();
      console.log(`TensorFlow backend: ${tf.getBackend()}`);

      // Load face detection model
      console.log('Loading face detection model...');
      this.models.faceDetection = await blazeface.load();
      console.log('✅ Face detection model loaded');

      // Load face landmarks model
      console.log('Loading face landmarks model...');
      this.models.faceLandmarks = await faceLandmarksDetection.load(
        faceLandmarksDetection.SupportedPackages.mediapipeFacemesh
      );
      console.log('✅ Face landmarks model loaded');

      // Load object detection model
      console.log('Loading object detection model...');
      this.models.objectDetection = await cocoSsd.load();
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

    try {
      const canvas = outputCanvas;
      const ctx = canvas.getContext('2d');

      // Set canvas dimensions to match video
      canvas.width = videoElement.videoWidth || 640;
      canvas.height = videoElement.videoHeight || 480;

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
      // Simple gaze estimation based on eye and nose positions
      // This is a basic implementation - in production you might want more sophisticated algorithms

      const leftEye = landmarks[0];
      const rightEye = landmarks[1];
      const nose = landmarks[2];
      const mouth = landmarks[3];

      // Calculate eye center
      const eyeCenter = [
        (leftEye[0] + rightEye[0]) / 2,
        (leftEye[1] + rightEye[1]) / 2
      ];

      // Calculate horizontal deviation of nose from eye center
      const horizontalDeviation = Math.abs(nose[0] - eyeCenter[0]);
      const eyeDistance = Math.abs(rightEye[0] - leftEye[0]);

      // Normalize deviation
      const normalizedDeviation = horizontalDeviation / eyeDistance;

      // Determine if looking away
      const isLookingAway = normalizedDeviation > this.settings.lookingAwayThreshold;

      // Determine direction
      let direction = 'center';
      if (isLookingAway) {
        direction = nose[0] < eyeCenter[0] ? 'left' : 'right';
      }

      return {
        isLookingAway,
        direction,
        deviation: normalizedDeviation,
        confidence: 1 - normalizedDeviation
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

    if (faceResults.confidence > 0) {
      stats.averageConfidence = (
        (stats.averageConfidence * (stats.facesDetected - 1) + faceResults.confidence) /
        stats.facesDetected
      );
    }

    stats.violationsDetected += objectResults.violations.length;
  }

  startDetection(videoElement, outputCanvas, frameRate = null) {
    if (!this.isInitialized) {
      throw new Error('AI Detection Service not initialized');
    }

    if (this.detectionActive) {
      console.warn('Detection already active');
      return;
    }

    const fps = frameRate || this.settings.detectionFrameRate;
    const interval = 1000 / fps;

    this.detectionActive = true;
    this.detectionInterval = setInterval(async () => {
      if (this.detectionActive) {
        await this.processFrame(videoElement, outputCanvas);
      }
    }, interval);

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
      this.detectionInterval = null;
    }

    this.detectionActive = false;

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
      uptime: this.detectionActive ? Date.now() - this.state.lastFaceDetection : 0,
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
  }

  cleanup() {
    this.stopDetection();
    this.eventCallbacks = [];

    // Dispose TensorFlow tensors to prevent memory leaks
    if (this.models.faceDetection) {
      this.models.faceDetection.dispose?.();
    }
    if (this.models.faceLandmarks) {
      this.models.faceLandmarks.dispose?.();
    }
    if (this.models.objectDetection) {
      this.models.objectDetection.dispose?.();
    }

    console.log('AI Detection Service cleaned up');
  }
}

export default AIDetectionService;