import RecordRTC from 'recordrtc';

class AdvancedVideoRecordingService {
  constructor() {
    this.isInitialized = false;
    this.isRecording = false;
    this.isPaused = false;

    // Recording components
    this.mediaStream = null;
    this.videoRecorder = null;
    this.audioRecorder = null;
    this.screenRecorder = null;
    this.screenStream = null;

    // Recording data
    this.recordingData = [];
    this.recordingChunks = [];
    this.currentSession = null;

    // Event handling
    this.eventCallbacks = [];

    // Cleanup tracking
    this.intervals = new Set();
    this.timeouts = new Set();
    this.animationFrames = new Set();
    this.audioContext = null;

    // Configuration
    this.config = {
      video: {
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        frameRate: { ideal: 30, min: 15 },
        facingMode: 'user'
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 44100
      },
      recording: {
        videoBitsPerSecond: 2500000, // 2.5 Mbps
        audioBitsPerSecond: 128000,  // 128 kbps
        mimeType: 'video/webm;codecs=vp9,opus',
        timeSlice: 10000, // 10 seconds chunks
        type: 'video'
      },
      storage: {
        chunkSize: 10 * 1024 * 1024, // 10MB chunks
        compressionQuality: 0.8,
        autoBackup: true,
        backupInterval: 60000 // 1 minute
      }
    };

    // Statistics
    this.stats = {
      startTime: null,
      duration: 0,
      totalSize: 0,
      chunkCount: 0,
      errorCount: 0,
      qualityMetrics: {
        averageBitrate: 0,
        droppedFrames: 0,
        audioLevels: []
      }
    };

    // Storage management
    this.storageManager = new RecordingStorageManager();
  }

  async initialize(videoElement, enableAudio = true, enableScreen = false) {
    try {
      console.log('🎥 Initializing Advanced Video Recording Service...');

      // Validate browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API not supported');
      }

      if (!window.MediaRecorder) {
        throw new Error('MediaRecorder API not supported');
      }

      // Get media constraints with validation
      const constraints = {
        video: this.config.video,
        audio: enableAudio ? this.config.audio : false
      };

      // Add timeout for media access
      const mediaPromise = navigator.mediaDevices.getUserMedia(constraints);
      const timeoutPromise = new Promise((_, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Media access timeout (10s)'));
        }, 10000);
        this.timeouts.add(timeoutId);
      });

      this.mediaStream = await Promise.race([mediaPromise, timeoutPromise]);

      // Set up video element
      if (videoElement) {
        videoElement.srcObject = this.mediaStream;
        await new Promise(resolve => {
          videoElement.onloadedmetadata = resolve;
        });
      }

      // Initialize screen recording if requested
      if (enableScreen) {
        await this.initializeScreenRecording();
      }

      // Set up quality monitoring
      this.setupQualityMonitoring();

      this.isInitialized = true;
      console.log('✅ Video recording service initialized');

      this.triggerEvent({
        type: 'recording_service_initialized',
        timestamp: new Date(),
        data: {
          hasVideo: this.mediaStream.getVideoTracks().length > 0,
          hasAudio: this.mediaStream.getAudioTracks().length > 0,
          videoSettings: this.mediaStream.getVideoTracks()[0]?.getSettings(),
          audioSettings: this.mediaStream.getAudioTracks()[0]?.getSettings()
        }
      });

      return true;

    } catch (error) {
      console.error('❌ Failed to initialize video recording:', error);
      this.triggerEvent({
        type: 'recording_service_error',
        timestamp: new Date(),
        error: error.message
      });
      throw error;
    }
  }

  async initializeScreenRecording() {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen' },
        audio: true
      });

      this.screenStream = screenStream;
      console.log('📺 Screen recording initialized');

    } catch (error) {
      console.warn('Screen recording not available:', error.message);
    }
  }

  setupQualityMonitoring() {
    if (!this.mediaStream) return;

    // Monitor video track
    const videoTrack = this.mediaStream.getVideoTracks()[0];
    if (videoTrack) {
      this.monitorVideoQuality(videoTrack);
    }

    // Monitor audio track
    const audioTrack = this.mediaStream.getAudioTracks()[0];
    if (audioTrack) {
      this.monitorAudioQuality(audioTrack);
    }
  }

  monitorVideoQuality(videoTrack) {
    const intervalId = setInterval(() => {
      if (videoTrack && videoTrack.readyState === 'live') {
        try {
          const settings = videoTrack.getSettings();

          // Update quality metrics
          this.stats.qualityMetrics.currentResolution = {
            width: settings.width,
            height: settings.height
          };
          this.stats.qualityMetrics.currentFrameRate = settings.frameRate;
        } catch (error) {
          console.warn('Video quality monitoring error:', error);
        }
      } else {
        // Stop monitoring if track is not live
        clearInterval(intervalId);
        this.intervals.delete(intervalId);
      }
    }, 5000);

    this.intervals.add(intervalId);
  }

  monitorAudioQuality(audioTrack) {
    try {
      // Store audio context for cleanup
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      const analyzer = this.audioContext.createAnalyser();

      source.connect(analyzer);
      analyzer.fftSize = 256;

      const dataArray = new Uint8Array(analyzer.frequencyBinCount);
      let isMonitoring = true;

      const checkAudioLevel = () => {
        if (this.isRecording && isMonitoring && audioTrack.readyState === 'live') {
          try {
            analyzer.getByteFrequencyData(dataArray);

            // Calculate average audio level
            const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
            this.stats.qualityMetrics.audioLevels.push(average);

            // Keep only last 100 measurements
            if (this.stats.qualityMetrics.audioLevels.length > 100) {
              this.stats.qualityMetrics.audioLevels = this.stats.qualityMetrics.audioLevels.slice(-100);
            }

            const frameId = requestAnimationFrame(checkAudioLevel);
            this.animationFrames.add(frameId);
          } catch (error) {
            console.warn('Audio level check error:', error);
            isMonitoring = false;
          }
        } else {
          isMonitoring = false;
        }
      };

      // Start monitoring only if audio context is not suspended
      if (this.audioContext.state !== 'suspended') {
        checkAudioLevel();
      } else {
        // Resume audio context if suspended
        this.audioContext.resume().then(() => {
          checkAudioLevel();
        }).catch(error => {
          console.warn('Audio context resume failed:', error);
        });
      }

    } catch (error) {
      console.warn('Audio monitoring setup failed:', error);
    }
  }

  async startRecording(sessionId, metadata = {}) {
    if (!this.isInitialized) {
      throw new Error('Video recording service not initialized');
    }

    if (this.isRecording) {
      console.warn('Recording already in progress');
      return;
    }

    try {
      console.log('🔴 Starting video recording...');

      // Create recording session
      this.currentSession = {
        id: sessionId || `session_${Date.now()}`,
        startTime: new Date(),
        metadata,
        chunks: [],
        status: 'recording'
      };

      // Configure RecordRTC for main video
      this.videoRecorder = new RecordRTC(this.mediaStream, {
        ...this.config.recording,
        ondataavailable: (blob) => this.handleVideoChunk(blob),
        onstop: () => this.handleRecordingStop(),
        onerror: (error) => this.handleRecordingError(error)
      });

      // Start screen recording if available
      if (this.screenStream) {
        this.screenRecorder = new RecordRTC(this.screenStream, {
          ...this.config.recording,
          ondataavailable: (blob) => this.handleScreenChunk(blob)
        });
        this.screenRecorder.startRecording();
      }

      // Start main recording
      this.videoRecorder.startRecording();

      // Update state
      this.isRecording = true;
      this.isPaused = false;
      this.stats.startTime = Date.now();

      // Start automatic chunking
      this.startChunking();

      // Start backup process
      if (this.config.storage.autoBackup) {
        this.startAutoBackup();
      }

      console.log('✅ Recording started successfully');

      this.triggerEvent({
        type: 'recording_started',
        timestamp: new Date(),
        sessionId: this.currentSession.id,
        data: {
          videoSettings: this.mediaStream.getVideoTracks()[0]?.getSettings(),
          audioSettings: this.mediaStream.getAudioTracks()[0]?.getSettings(),
          hasScreen: !!this.screenRecorder
        }
      });

      return this.currentSession.id;

    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      this.handleRecordingError(error);
      throw error;
    }
  }

  pauseRecording() {
    if (!this.isRecording || this.isPaused) return;

    try {
      this.videoRecorder.pauseRecording();
      if (this.screenRecorder) {
        this.screenRecorder.pauseRecording();
      }

      this.isPaused = true;

      console.log('⏸️ Recording paused');

      this.triggerEvent({
        type: 'recording_paused',
        timestamp: new Date(),
        sessionId: this.currentSession?.id
      });

    } catch (error) {
      console.error('Failed to pause recording:', error);
      this.handleRecordingError(error);
    }
  }

  resumeRecording() {
    if (!this.isRecording || !this.isPaused) return;

    try {
      this.videoRecorder.resumeRecording();
      if (this.screenRecorder) {
        this.screenRecorder.resumeRecording();
      }

      this.isPaused = false;

      console.log('▶️ Recording resumed');

      this.triggerEvent({
        type: 'recording_resumed',
        timestamp: new Date(),
        sessionId: this.currentSession?.id
      });

    } catch (error) {
      console.error('Failed to resume recording:', error);
      this.handleRecordingError(error);
    }
  }

  async stopRecording() {
    if (!this.isRecording) {
      console.warn('No recording in progress');
      return null;
    }

    try {
      console.log('⏹️ Stopping recording...');

      return new Promise((resolve, reject) => {
        const recordingPromises = [];

        // Stop main video recording
        if (this.videoRecorder) {
          recordingPromises.push(new Promise((res) => {
            this.videoRecorder.stopRecording(() => {
              const blob = this.videoRecorder.getBlob();
              res({ type: 'video', blob });
            });
          }));
        }

        // Stop screen recording
        if (this.screenRecorder) {
          recordingPromises.push(new Promise((res) => {
            this.screenRecorder.stopRecording(() => {
              const blob = this.screenRecorder.getBlob();
              res({ type: 'screen', blob });
            });
          }));
        }

        Promise.all(recordingPromises).then(recordings => {
          this.finalizeRecording(recordings);
          resolve(this.currentSession);
        }).catch(reject);
      });

    } catch (error) {
      console.error('❌ Failed to stop recording:', error);
      this.handleRecordingError(error);
      throw error;
    }
  }

  finalizeRecording(recordings) {
    const endTime = Date.now();
    this.stats.duration = endTime - this.stats.startTime;

    // Process recordings
    recordings.forEach(recording => {
      this.currentSession.chunks.push({
        type: recording.type,
        blob: recording.blob,
        size: recording.blob.size,
        timestamp: new Date()
      });

      this.stats.totalSize += recording.blob.size;
    });

    // Update session
    this.currentSession.endTime = new Date();
    this.currentSession.duration = this.stats.duration;
    this.currentSession.totalSize = this.stats.totalSize;
    this.currentSession.status = 'completed';

    // Store recording
    this.storageManager.saveRecording(this.currentSession);

    // Reset state
    this.isRecording = false;
    this.isPaused = false;

    console.log('✅ Recording completed and saved');

    this.triggerEvent({
      type: 'recording_completed',
      timestamp: new Date(),
      sessionId: this.currentSession.id,
      data: {
        duration: this.stats.duration,
        totalSize: this.stats.totalSize,
        chunks: this.currentSession.chunks.length
      }
    });
  }

  startChunking() {
    const intervalId = setInterval(() => {
      if (this.isRecording && !this.isPaused) {
        this.createChunk();
      }
    }, this.config.recording.timeSlice);

    this.intervals.add(intervalId);
    this.chunkingInterval = intervalId;
  }

  createChunk() {
    if (!this.videoRecorder) return;

    try {
      // Request a data chunk
      this.videoRecorder.getDataURL((dataURL) => {
        const chunk = {
          id: `chunk_${Date.now()}`,
          sessionId: this.currentSession.id,
          timestamp: new Date(),
          dataURL,
          size: dataURL.length
        };

        this.recordingChunks.push(chunk);
        this.stats.chunkCount++;

        // Auto-save chunk if it exceeds size limit
        if (chunk.size > this.config.storage.chunkSize) {
          this.storageManager.saveChunk(chunk);
        }

        this.triggerEvent({
          type: 'recording_chunk_created',
          timestamp: new Date(),
          chunk
        });
      });

    } catch (error) {
      console.error('Failed to create chunk:', error);
    }
  }

  startAutoBackup() {
    const intervalId = setInterval(() => {
      if (this.recordingChunks.length > 0) {
        this.backupChunks();
      }
    }, this.config.storage.backupInterval);

    this.intervals.add(intervalId);
    this.backupInterval = intervalId;
  }

  async backupChunks() {
    try {
      const chunksToBackup = [...this.recordingChunks];
      this.recordingChunks = [];

      await this.storageManager.backupChunks(chunksToBackup);

      console.log(`📦 Backed up ${chunksToBackup.length} chunks`);

      this.triggerEvent({
        type: 'chunks_backed_up',
        timestamp: new Date(),
        count: chunksToBackup.length
      });

    } catch (error) {
      console.error('Backup failed:', error);
      this.stats.errorCount++;
    }
  }

  handleVideoChunk(blob) {
    this.stats.totalSize += blob.size;

    this.triggerEvent({
      type: 'video_chunk_received',
      timestamp: new Date(),
      size: blob.size
    });
  }

  handleScreenChunk(blob) {
    this.triggerEvent({
      type: 'screen_chunk_received',
      timestamp: new Date(),
      size: blob.size
    });
  }

  handleRecordingStop() {
    console.log('🛑 Recording stopped by recorder');
  }

  handleRecordingError(error) {
    console.error('🚨 Recording error:', error);
    this.stats.errorCount++;

    this.triggerEvent({
      type: 'recording_error',
      timestamp: new Date(),
      error: error.message || error
    });
  }

  async downloadRecording(sessionId, format = 'webm') {
    try {
      // Validate format
      const allowedFormats = ['webm', 'mp4', 'avi'];
      if (!allowedFormats.includes(format)) {
        throw new Error(`Unsupported format: ${format}`);
      }

      const recording = await this.storageManager.getRecording(sessionId);
      if (!recording) {
        throw new Error('Recording not found');
      }

      const blob = recording.chunks.find(chunk => chunk.type === 'video')?.blob;
      if (!blob) {
        throw new Error('Video data not found');
      }

      // Validate blob size (max 1GB)
      if (blob.size > 1024 * 1024 * 1024) {
        throw new Error('Recording too large to download');
      }

      // Create download link with proper cleanup
      const url = URL.createObjectURL(blob);

      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = `interview_${sessionId}.${format}`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        console.log('📥 Recording downloaded');

        this.triggerEvent({
          type: 'recording_downloaded',
          timestamp: new Date(),
          sessionId,
          format
        });
      } finally {
        // Always revoke URL to prevent memory leak
        URL.revokeObjectURL(url);
      }

    } catch (error) {
      console.error('Download failed:', error);
      throw error;
    }
  }

  getRecordingStats() {
    return {
      ...this.stats,
      currentDuration: this.isRecording ? Date.now() - this.stats.startTime : this.stats.duration,
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      chunkCount: this.recordingChunks.length,
      averageChunkSize: this.stats.chunkCount > 0 ? this.stats.totalSize / this.stats.chunkCount : 0
    };
  }

  getRecordingStatus() {
    return {
      isInitialized: this.isInitialized,
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      currentSession: this.currentSession,
      stats: this.getRecordingStats(),
      config: this.config
    };
  }

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('Recording config updated:', this.config);
  }

  triggerEvent(event) {
    this.eventCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in recording event callback:', error);
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

  async cleanup() {
    try {
      console.log('🧹 Starting video recording service cleanup...');

      // Stop recording if active
      if (this.isRecording) {
        await this.stopRecording();
      }

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

      // Cancel all animation frames
      this.animationFrames.forEach(frameId => {
        cancelAnimationFrame(frameId);
      });
      this.animationFrames.clear();

      // Close audio context
      if (this.audioContext && this.audioContext.state !== 'closed') {
        try {
          await this.audioContext.close();
        } catch (error) {
          console.warn('Audio context close error:', error);
        }
      }

      // Stop media streams
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (error) {
            console.warn('Track stop error:', error);
          }
        });
        this.mediaStream = null;
      }

      if (this.screenStream) {
        this.screenStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (error) {
            console.warn('Screen track stop error:', error);
          }
        });
        this.screenStream = null;
      }

      // Clean up recorders
      if (this.videoRecorder) {
        try {
          this.videoRecorder.destroy();
        } catch (error) {
          console.warn('Video recorder destroy error:', error);
        }
        this.videoRecorder = null;
      }

      if (this.screenRecorder) {
        try {
          this.screenRecorder.destroy();
        } catch (error) {
          console.warn('Screen recorder destroy error:', error);
        }
        this.screenRecorder = null;
      }

      // Clear data arrays
      this.recordingData = [];
      this.recordingChunks = [];
      this.currentSession = null;

      // Reset state
      this.isInitialized = false;
      this.isRecording = false;
      this.isPaused = false;
      this.eventCallbacks = [];

      // Reset stats
      this.stats = {
        startTime: null,
        duration: 0,
        totalSize: 0,
        chunkCount: 0,
        errorCount: 0,
        qualityMetrics: {
          averageBitrate: 0,
          droppedFrames: 0,
          audioLevels: []
        }
      };

      console.log('✅ Video recording service cleaned up successfully');

    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }
}

// Storage Manager for handling recording persistence
class RecordingStorageManager {
  constructor() {
    this.dbName = 'VideoProctoring';
    this.version = 1;
    this.db = null;
  }

  async initialize() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create recordings store
        if (!db.objectStoreNames.contains('recordings')) {
          const recordingsStore = db.createObjectStore('recordings', { keyPath: 'id' });
          recordingsStore.createIndex('timestamp', 'startTime');
        }

        // Create chunks store
        if (!db.objectStoreNames.contains('chunks')) {
          const chunksStore = db.createObjectStore('chunks', { keyPath: 'id' });
          chunksStore.createIndex('sessionId', 'sessionId');
          chunksStore.createIndex('timestamp', 'timestamp');
        }
      };
    });
  }

  async saveRecording(recording) {
    try {
      if (!this.db) await this.initialize();

      // Check storage quota before saving
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const availableSpace = estimate.quota - estimate.usage;
        const recordingSize = recording.totalSize || 0;

        if (recordingSize > availableSpace) {
          throw new Error('Insufficient storage space');
        }
      }

      const transaction = this.db.transaction(['recordings'], 'readwrite');
      const store = transaction.objectStore('recordings');

      return new Promise((resolve, reject) => {
        const request = store.put(recording);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);

        // Add timeout for transaction
        const timeout = setTimeout(() => {
          reject(new Error('Storage transaction timeout'));
        }, 10000);

        request.onsuccess = () => {
          clearTimeout(timeout);
          resolve();
        };
      });
    } catch (error) {
      console.error('Save recording error:', error);
      throw error;
    }
  }

  async getRecording(sessionId) {
    if (!this.db) await this.initialize();

    const transaction = this.db.transaction(['recordings'], 'readonly');
    const store = transaction.objectStore('recordings');

    return new Promise((resolve, reject) => {
      const request = store.get(sessionId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveChunk(chunk) {
    if (!this.db) await this.initialize();

    const transaction = this.db.transaction(['chunks'], 'readwrite');
    const store = transaction.objectStore('chunks');

    return new Promise((resolve, reject) => {
      const request = store.put(chunk);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async backupChunks(chunks) {
    const promises = chunks.map(chunk => this.saveChunk(chunk));
    return Promise.all(promises);
  }

  async getAllRecordings() {
    if (!this.db) await this.initialize();

    const transaction = this.db.transaction(['recordings'], 'readonly');
    const store = transaction.objectStore('recordings');

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteRecording(sessionId) {
    if (!this.db) await this.initialize();

    const transaction = this.db.transaction(['recordings', 'chunks'], 'readwrite');

    // Delete recording
    const recordingsStore = transaction.objectStore('recordings');
    recordingsStore.delete(sessionId);

    // Delete associated chunks
    const chunksStore = transaction.objectStore('chunks');
    const index = chunksStore.index('sessionId');
    const range = IDBKeyRange.only(sessionId);

    return new Promise((resolve, reject) => {
      const request = index.openCursor(range);
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}

export default AdvancedVideoRecordingService;