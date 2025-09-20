import RecordRTC from 'recordrtc';

class VideoRecordingService {
  constructor() {
    this.recorder = null;
    this.stream = null;
    this.isRecording = false;
    this.isPaused = false;
    this.recordingStartTime = null;
    this.recordingData = [];
    this.eventCallbacks = [];
    this.currentBlob = null;

    // Resource tracking for cleanup
    this.objectUrls = new Set();
    this.timers = new Set();
    this.isDisposed = false;
    this.recordingLock = false; // Prevent race conditions
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // IndexedDB storage
    this.dbName = 'VideoRecordingDB';
    this.dbVersion = 1;
    this.db = null;

    // Recording limits
    this.limits = {
      maxDuration: 3600000, // 1 hour in milliseconds
      maxFileSize: 500 * 1024 * 1024, // 500MB
      maxChunks: 100
    };

    // Recording settings with MIME type validation
    this.settings = {
      type: 'video',
      mimeType: this.getOptimalMimeType(),
      disableLogs: false,
      video: {
        width: { ideal: 1920, max: 1920, min: 640 },
        height: { ideal: 1080, max: 1080, min: 480 },
        frameRate: { ideal: 30, max: 30, min: 15 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 44100
      },
      timeSlice: 10000, // 10 seconds per chunk (reduced for better memory management)
      recorderType: RecordRTC.MediaStreamRecorder
    };

    // Storage settings
    this.storageSettings = {
      autoSave: true,
      saveInterval: 30000, // Save every 30 seconds (reduced)
      maxChunkSize: 10 * 1024 * 1024, // 10MB per chunk (reduced for reliability)
      compressionLevel: 0.8,
      useIndexedDB: true
    };

    this.saveTimer = null;
    this.recordingChunks = [];
    this.totalRecordedSize = 0;

    // Initialize IndexedDB
    this.initializeDB().catch(error => {
      console.warn('Failed to initialize IndexedDB, falling back to memory storage:', error);
      this.storageSettings.useIndexedDB = false;
    });
  }

  /**
   * Get optimal MIME type based on browser support
   */
  getOptimalMimeType() {
    const supportedTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4;codecs=h264,aac',
      'video/mp4'
    ];

    for (const type of supportedTypes) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
        console.log(`Selected MIME type: ${type}`);
        return type;
      }
    }

    console.warn('No supported MIME type found, using default');
    return 'video/webm';
  }

  /**
   * Initialize IndexedDB for large file storage
   */
  async initializeDB() {
    if (!window.indexedDB) {
      throw new Error('IndexedDB not supported');
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create object store for video chunks
        if (!db.objectStoreNames.contains('chunks')) {
          const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' });
          chunkStore.createIndex('sessionId', 'sessionId', { unique: false });
          chunkStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Create object store for recording metadata
        if (!db.objectStoreNames.contains('recordings')) {
          const recordingStore = db.createObjectStore('recordings', { keyPath: 'id' });
          recordingStore.createIndex('sessionId', 'sessionId', { unique: false });
        }
      };
    });
  }

  /**
   * Check browser compatibility and feature support
   */
  static checkCompatibility() {
    const support = {
      mediaDevices: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      mediaRecorder: !!window.MediaRecorder,
      indexedDB: !!window.indexedDB,
      recordRTC: !!window.RecordRTC || !!RecordRTC,
      supportedMimeTypes: []
    };

    if (support.mediaRecorder) {
      const types = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4;codecs=h264,aac',
        'video/mp4'
      ];
      support.supportedMimeTypes = types.filter(type => MediaRecorder.isTypeSupported(type));
    }

    return support;
  }

  async initialize(videoElement, audioEnabled = true) {
    try {
      console.log('Initializing video recording service...');

      if (this.isDisposed) {
        throw new Error('Service has been disposed');
      }

      // Check browser compatibility
      const compatibility = VideoRecordingService.checkCompatibility();
      if (!compatibility.mediaDevices) {
        throw new Error('MediaDevices API not supported');
      }
      if (!compatibility.mediaRecorder && !compatibility.recordRTC) {
        throw new Error('No recording API available');
      }

      // Get media stream with error handling and validation
      const constraints = {
        video: this.settings.video,
        audio: audioEnabled ? this.settings.audio : false
      };

      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (mediaError) {
        // Try with fallback constraints
        console.warn('Failed with ideal constraints, trying fallback:', mediaError);
        const fallbackConstraints = {
          video: {
            width: { ideal: 1280, max: 1920, min: 640 },
            height: { ideal: 720, max: 1080, min: 480 },
            frameRate: { ideal: 24, max: 30, min: 15 }
          },
          audio: audioEnabled
        };
        this.stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
      }

      // Set video element source
      if (videoElement) {
        videoElement.srcObject = this.stream;
      }

      console.log('Video recording service initialized successfully');

      this.triggerEvent({
        type: 'recording_service_initialized',
        message: 'Video recording service ready',
        data: {
          hasVideo: this.stream.getVideoTracks().length > 0,
          hasAudio: this.stream.getAudioTracks().length > 0,
          videoSettings: this.stream.getVideoTracks()[0]?.getSettings(),
          audioSettings: this.stream.getAudioTracks()[0]?.getSettings()
        }
      });

      return this.stream;

    } catch (error) {
      console.error('Failed to initialize video recording service:', error);

      this.triggerEvent({
        type: 'recording_service_error',
        message: 'Failed to initialize recording service',
        data: { error: error.message }
      });

      throw error;
    }
  }

  async startRecording() {
    // Prevent race conditions with atomic locking
    if (this.recordingLock) {
      console.warn('Recording operation already in progress');
      return;
    }

    if (this.isDisposed) {
      throw new Error('Service has been disposed');
    }

    if (!this.stream) {
      throw new Error('Video recording service not initialized');
    }

    if (this.isRecording) {
      console.warn('Recording already in progress');
      return;
    }

    this.recordingLock = true;

    try {
      // Check duration and size limits
      if (this.totalRecordedSize >= this.limits.maxFileSize) {
        throw new Error(`Maximum file size limit reached (${this.limits.maxFileSize} bytes)`);
      }

      // Validate MIME type is still supported
      if (!MediaRecorder.isTypeSupported(this.settings.mimeType)) {
        console.warn('Current MIME type no longer supported, updating...');
        this.settings.mimeType = this.getOptimalMimeType();
      }

      // Initialize RecordRTC with enhanced error handling
      this.recorder = new RecordRTC(this.stream, {
        ...this.settings,
        ondataavailable: (blob) => {
          this.handleDataAvailable(blob);
        },
        onTimeStamp: (timestamp, timestamps) => {
          this.checkRecordingLimits(timestamp);
        }
      });

      // Add error handling for RecordRTC
      this.recorder.onStateChanged = (state) => {
        console.log('RecordRTC state changed:', state);
        if (state === 'recording') {
          this.isRecording = true;
        } else if (state === 'stopped') {
          this.isRecording = false;
        }
      };

      // Start recording
      this.recorder.startRecording();
      this.isRecording = true;
      this.isPaused = false;
      this.recordingStartTime = new Date();
      this.recordingChunks = [];
      this.totalRecordedSize = 0;

      // Start auto-save timer with tracking
      if (this.storageSettings.autoSave) {
        this.startAutoSave();
      }

      // Set duration limit timer
      this.setDurationLimitTimer();

      console.log('Video recording started');

      this.triggerEvent({
        type: 'recording_started',
        message: 'Video recording started',
        data: {
          startTime: this.recordingStartTime.toISOString(),
          settings: this.settings,
          sessionId: this.sessionId
        }
      });

    } catch (error) {
      this.isRecording = false;
      console.error('Failed to start recording:', error);
      this.triggerEvent({
        type: 'recording_error',
        message: 'Failed to start recording',
        data: { error: error.message }
      });
      throw error;
    } finally {
      this.recordingLock = false;
    }
  }

  /**
   * Check recording limits and auto-stop if needed
   */
  checkRecordingLimits(timestamp) {
    try {
      if (!this.isRecording) return;

      const currentDuration = Date.now() - this.recordingStartTime.getTime();

      // Check duration limit
      if (currentDuration >= this.limits.maxDuration) {
        console.warn('Maximum recording duration reached, stopping recording');
        this.stopRecording().then(() => {
          this.triggerEvent({
            type: 'recording_limit_reached',
            message: 'Recording stopped due to duration limit',
            data: { reason: 'duration_limit', duration: currentDuration }
          });
        });
        return;
      }

      // Check chunk count limit
      if (this.recordingChunks.length >= this.limits.maxChunks) {
        console.warn('Maximum chunk count reached, stopping recording');
        this.stopRecording().then(() => {
          this.triggerEvent({
            type: 'recording_limit_reached',
            message: 'Recording stopped due to chunk count limit',
            data: { reason: 'chunk_limit', chunks: this.recordingChunks.length }
          });
        });
        return;
      }

      // Check file size limit
      if (this.totalRecordedSize >= this.limits.maxFileSize) {
        console.warn('Maximum file size reached, stopping recording');
        this.stopRecording().then(() => {
          this.triggerEvent({
            type: 'recording_limit_reached',
            message: 'Recording stopped due to file size limit',
            data: { reason: 'size_limit', size: this.totalRecordedSize }
          });
        });
        return;
      }
    } catch (error) {
      console.error('Error checking recording limits:', error);
    }
  }

  /**
   * Set timer to enforce duration limits
   */
  setDurationLimitTimer() {
    const timerId = setTimeout(() => {
      if (this.isRecording) {
        console.log('Duration limit reached, stopping recording');
        this.stopRecording().catch(error => {
          console.error('Error stopping recording on duration limit:', error);
        });
      }
      this.timers.delete(timerId);
    }, this.limits.maxDuration);

    this.timers.add(timerId);
  }

  stopRecording() {
    return new Promise((resolve, reject) => {
      if (!this.isRecording || !this.recorder) {
        resolve(null);
        return;
      }

      try {
        this.recorder.stopRecording(() => {
          const blob = this.recorder.getBlob();
          this.currentBlob = blob;
          this.isRecording = false;
          this.isPaused = false;

          // Stop auto-save timer
          this.stopAutoSave();

          const recordingData = {
            blob: blob,
            startTime: this.recordingStartTime,
            endTime: new Date(),
            duration: Date.now() - this.recordingStartTime.getTime(),
            size: blob.size,
            type: blob.type,
            chunks: this.recordingChunks.length
          };

          this.recordingData.push(recordingData);

          console.log('Video recording stopped');

          this.triggerEvent({
            type: 'recording_stopped',
            message: 'Video recording stopped',
            data: recordingData
          });

          resolve(recordingData);
        });

      } catch (error) {
        console.error('Failed to stop recording:', error);
        this.triggerEvent({
          type: 'recording_error',
          message: 'Failed to stop recording',
          data: { error: error.message }
        });
        reject(error);
      }
    });
  }

  pauseRecording() {
    if (!this.isRecording || this.isPaused) return;

    try {
      this.recorder.pauseRecording();
      this.isPaused = true;

      console.log('Video recording paused');

      this.triggerEvent({
        type: 'recording_paused',
        message: 'Video recording paused',
        data: { pausedAt: new Date().toISOString() }
      });

    } catch (error) {
      console.error('Failed to pause recording:', error);
      this.triggerEvent({
        type: 'recording_error',
        message: 'Failed to pause recording',
        data: { error: error.message }
      });
    }
  }

  resumeRecording() {
    if (!this.isRecording || !this.isPaused) return;

    try {
      this.recorder.resumeRecording();
      this.isPaused = false;

      console.log('Video recording resumed');

      this.triggerEvent({
        type: 'recording_resumed',
        message: 'Video recording resumed',
        data: { resumedAt: new Date().toISOString() }
      });

    } catch (error) {
      console.error('Failed to resume recording:', error);
      this.triggerEvent({
        type: 'recording_error',
        message: 'Failed to resume recording',
        data: { error: error.message }
      });
    }
  }

  handleDataAvailable(blob) {
    if (!blob || blob.size === 0) {
      console.warn('Received empty blob in handleDataAvailable');
      return;
    }

    try {
      const chunk = {
        id: `chunk_${this.sessionId}_${Date.now()}_${this.recordingChunks.length}`,
        blob: blob,
        timestamp: new Date().toISOString(),
        size: blob.size,
        index: this.recordingChunks.length,
        sessionId: this.sessionId,
        saved: false
      };

      this.recordingChunks.push(chunk);
      this.totalRecordedSize += blob.size;

      console.log(`📹 Chunk ${chunk.index}: ${(blob.size / 1024 / 1024).toFixed(2)}MB, Total: ${(this.totalRecordedSize / 1024 / 1024).toFixed(2)}MB`);

      this.triggerEvent({
        type: 'recording_chunk_available',
        message: 'Recording chunk available',
        data: {
          index: chunk.index,
          size: chunk.size,
          timestamp: chunk.timestamp,
          totalSize: this.totalRecordedSize,
          totalChunks: this.recordingChunks.length
        }
      });

      // Auto-save if enabled and chunk size threshold is met
      if (this.storageSettings.autoSave && blob.size >= this.storageSettings.maxChunkSize) {
        this.saveChunk(chunk).catch(error => {
          console.error('Failed to save chunk:', error);
          this.triggerEvent({
            type: 'recording_error',
            message: 'Failed to save chunk',
            data: { error: error.message, chunkIndex: chunk.index }
          });
        });
      }

      // Check if we're approaching limits
      if (this.totalRecordedSize >= this.limits.maxFileSize * 0.9) {
        this.triggerEvent({
          type: 'recording_warning',
          message: 'Approaching file size limit',
          data: {
            currentSize: this.totalRecordedSize,
            limit: this.limits.maxFileSize,
            percentUsed: (this.totalRecordedSize / this.limits.maxFileSize) * 100
          }
        });
      }
    } catch (error) {
      console.error('Error handling data chunk:', error);
      this.triggerEvent({
        type: 'recording_error',
        message: 'Error processing recording chunk',
        data: { error: error.message }
      });
    }
  }

  async saveRecording(filename) {
    if (!this.currentBlob) {
      throw new Error('No recording available to save');
    }

    if (this.isDisposed) {
      throw new Error('Service has been disposed');
    }

    let objectUrl = null;

    try {
      // Create object URL and track it for cleanup
      objectUrl = URL.createObjectURL(this.currentBlob);
      this.objectUrls.add(objectUrl);

      const sanitizedFilename = this.sanitizeFilename(filename || `recording_${this.sessionId}_${Date.now()}.webm`);

      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = sanitizedFilename;
      a.style.display = 'none';

      document.body.appendChild(a);

      // Add click event handler to clean up after download
      const cleanup = () => {
        document.body.removeChild(a);
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          this.objectUrls.delete(objectUrl);
        }
      };

      // Set a timeout to clean up in case click doesn't trigger cleanup
      const timeoutId = setTimeout(cleanup, 5000);
      this.timers.add(timeoutId);

      a.onclick = () => {
        clearTimeout(timeoutId);
        this.timers.delete(timeoutId);
        setTimeout(cleanup, 100); // Short delay to allow download to start
      };

      a.click();

      this.triggerEvent({
        type: 'recording_saved',
        message: 'Recording saved successfully',
        data: {
          filename: sanitizedFilename,
          size: this.currentBlob.size,
          type: this.currentBlob.type,
          sessionId: this.sessionId
        }
      });

      console.log('Recording saved:', sanitizedFilename);

    } catch (error) {
      // Clean up object URL on error
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        this.objectUrls.delete(objectUrl);
      }

      console.error('Failed to save recording:', error);
      this.triggerEvent({
        type: 'recording_error',
        message: 'Failed to save recording',
        data: { error: error.message }
      });
      throw error;
    }
  }

  /**
   * Sanitize filename to prevent security issues
   */
  sanitizeFilename(filename) {
    // Remove dangerous characters and limit length
    return filename
      .replace(/[^a-zA-Z0-9.-_]/g, '_')
      .substring(0, 255)
      .replace(/^\.+/, '') // Remove leading dots
      .replace(/\.+$/, ''); // Remove trailing dots
  }

  async saveChunk(chunk) {
    if (this.isDisposed) {
      console.warn('Service disposed, skipping chunk save');
      return;
    }

    try {
      const chunkData = {
        id: chunk.id,
        sessionId: this.sessionId,
        timestamp: chunk.timestamp,
        size: chunk.size,
        index: chunk.index,
        blob: chunk.blob
      };

      // Use IndexedDB if available, otherwise skip saving binary data
      if (this.storageSettings.useIndexedDB && this.db) {
        await this.storeChunkInIndexedDB(chunkData);
      } else {
        // Store only metadata without blob to avoid localStorage limits
        await this.storeChunkMetadata(chunkData);
      }

      chunk.saved = true;

      this.triggerEvent({
        type: 'chunk_saved',
        message: 'Recording chunk saved',
        data: {
          id: chunkData.id,
          sessionId: chunkData.sessionId,
          size: chunkData.size,
          index: chunkData.index,
          timestamp: chunkData.timestamp,
          useIndexedDB: this.storageSettings.useIndexedDB
        }
      });

    } catch (error) {
      console.error('Failed to save chunk:', error);
      this.triggerEvent({
        type: 'recording_error',
        message: 'Failed to save chunk',
        data: {
          error: error.message,
          chunkId: chunk.id,
          chunkIndex: chunk.index
        }
      });
    }
  }

  /**
   * Store chunk in IndexedDB with proper error handling
   */
  async storeChunkInIndexedDB(chunkData) {
    if (!this.db) {
      throw new Error('IndexedDB not initialized');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['chunks'], 'readwrite');
      const store = transaction.objectStore('chunks');

      const request = store.put(chunkData);

      request.onsuccess = () => {
        console.log(`✅ Chunk ${chunkData.index} stored in IndexedDB`);
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to store chunk in IndexedDB:', request.error);
        reject(request.error);
      };

      transaction.onerror = () => {
        console.error('Transaction failed:', transaction.error);
        reject(transaction.error);
      };
    });
  }

  /**
   * Store only chunk metadata (no blob) for fallback storage
   */
  async storeChunkMetadata(chunkData) {
    try {
      const metadata = {
        id: chunkData.id,
        sessionId: chunkData.sessionId,
        timestamp: chunkData.timestamp,
        size: chunkData.size,
        index: chunkData.index
        // Note: blob is intentionally excluded to avoid storage limits
      };

      const key = `chunk_metadata_${chunkData.id}`;
      localStorage.setItem(key, JSON.stringify(metadata));
      console.log(`📄 Chunk ${chunkData.index} metadata stored`);
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.warn('LocalStorage quota exceeded, clearing old chunk metadata...');
        this.clearOldChunkMetadata();
        // Try again after cleanup
        const metadata = {
          id: chunkData.id,
          sessionId: chunkData.sessionId,
          timestamp: chunkData.timestamp,
          size: chunkData.size,
          index: chunkData.index
        };
        const key = `chunk_metadata_${chunkData.id}`;
        localStorage.setItem(key, JSON.stringify(metadata));
      } else {
        throw error;
      }
    }
  }

  /**
   * Clear old chunk metadata to free up localStorage space
   */
  clearOldChunkMetadata() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('chunk_metadata_')) {
          keysToRemove.push(key);
        }
      }

      // Remove oldest entries (keep only last 10)
      keysToRemove.sort().slice(0, -10).forEach(key => {
        localStorage.removeItem(key);
      });

      console.log(`🧹 Cleared ${keysToRemove.length - 10} old chunk metadata entries`);
    } catch (error) {
      console.error('Error clearing old chunk metadata:', error);
    }
  }

  startAutoSave() {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.timers.delete(this.saveTimer);
    }

    this.saveTimer = setInterval(() => {
      if (this.isDisposed) {
        this.stopAutoSave();
        return;
      }

      if (this.isRecording && this.recordingChunks.length > 0) {
        // Save the latest chunks that haven't been saved yet
        const unsavedChunks = this.recordingChunks.filter(chunk => !chunk.saved);
        if (unsavedChunks.length > 0) {
          console.log(`💾 Auto-saving ${unsavedChunks.length} chunks...`);

          // Process chunks sequentially to avoid overwhelming storage
          unsavedChunks.forEach(chunk => {
            this.saveChunk(chunk).catch(error => {
              console.error(`Failed to auto-save chunk ${chunk.index}:`, error);
            });
          });
        }
      }
    }, this.storageSettings.saveInterval);

    this.timers.add(this.saveTimer);
  }

  stopAutoSave() {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  getRecordingStatus() {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      recordingStartTime: this.recordingStartTime,
      currentDuration: this.isRecording ? Date.now() - this.recordingStartTime?.getTime() : 0,
      chunksRecorded: this.recordingChunks.length,
      totalSize: this.recordingChunks.reduce((sum, chunk) => sum + chunk.size, 0),
      hasActiveRecording: this.currentBlob !== null
    };
  }

  getAllRecordings() {
    return this.recordingData.map(recording => ({
      startTime: recording.startTime,
      endTime: recording.endTime,
      duration: recording.duration,
      size: recording.size,
      type: recording.type,
      chunks: recording.chunks
    }));
  }

  updateSettings(newSettings) {
    Object.assign(this.settings, newSettings);
    console.log('Recording settings updated:', this.settings);
  }

  updateStorageSettings(newSettings) {
    Object.assign(this.storageSettings, newSettings);
    console.log('Storage settings updated:', this.storageSettings);
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
    if (typeof callback !== 'function') {
      throw new Error('Event listener must be a function');
    }

    if (this.isDisposed) {
      console.warn('Service is disposed, cannot add event listener');
      return () => {}; // Return empty cleanup function
    }

    this.eventCallbacks.push(callback);

    // Return cleanup function
    return () => this.removeEventListener(callback);
  }

  removeEventListener(callback) {
    const index = this.eventCallbacks.indexOf(callback);
    if (index > -1) {
      this.eventCallbacks.splice(index, 1);
      return true;
    }
    return false;
  }

  removeAllEventListeners() {
    this.eventCallbacks.length = 0;
  }

  getSessionId() {
    return this.sessionId;
  }

  /**
   * Comprehensive cleanup with resource management
   */
  async cleanup() {
    try {
      console.log('🧹 Cleaning up Video Recording Service...');

      // Mark as disposed to prevent further operations
      this.isDisposed = true;

      // Stop recording if active
      if (this.isRecording) {
        try {
          await this.stopRecording();
        } catch (error) {
          console.warn('Error stopping recording during cleanup:', error);
        }
      }

      // Stop auto-save
      this.stopAutoSave();

      // Clear all tracked timers
      this.timers.forEach(timerId => {
        try {
          clearTimeout(timerId);
          clearInterval(timerId);
        } catch (error) {
          console.warn('Error clearing timer:', error);
        }
      });
      this.timers.clear();

      // Revoke all object URLs to prevent memory leaks
      this.objectUrls.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          console.warn('Error revoking object URL:', error);
        }
      });
      this.objectUrls.clear();

      // Stop media stream tracks
      if (this.stream) {
        this.stream.getTracks().forEach(track => {
          try {
            track.stop();
            console.log(`🛑 Stopped ${track.kind} track`);
          } catch (error) {
            console.warn(`Error stopping ${track.kind} track:`, error);
          }
        });
        this.stream = null;
      }

      // Clean up recorder
      if (this.recorder) {
        try {
          this.recorder.destroy();
          console.log('📹 RecordRTC destroyed');
        } catch (error) {
          console.warn('Error destroying recorder:', error);
        }
        this.recorder = null;
      }

      // Close IndexedDB connection
      if (this.db) {
        try {
          this.db.close();
          this.db = null;
          console.log('🗄️ IndexedDB connection closed');
        } catch (error) {
          console.warn('Error closing IndexedDB:', error);
        }
      }

      // Clear all data and state
      this.recordingChunks.length = 0;
      this.recordingData.length = 0;
      this.currentBlob = null;
      this.totalRecordedSize = 0;
      this.isRecording = false;
      this.isPaused = false;
      this.recordingStartTime = null;
      this.recordingLock = false;

      // Clear event listeners
      this.removeAllEventListeners();

      console.log('✅ Video Recording Service cleanup complete');

    } catch (error) {
      console.error('Error during Video Recording Service cleanup:', error);
    }
  }

  /**
   * Destructor-like method for complete cleanup
   */
  destroy() {
    this.cleanup();
  }

  // Utility methods
  static getSupportedMimeTypes() {
    if (typeof MediaRecorder === 'undefined') {
      return [];
    }

    const possibleTypes = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4;codecs=h264,aac',
      'video/mp4'
    ];

    return possibleTypes.filter(type => {
      try {
        return MediaRecorder.isTypeSupported(type);
      } catch (error) {
        console.warn(`Error checking MIME type support for ${type}:`, error);
        return false;
      }
    });
  }

  static checkBrowserSupport() {
    const support = {
      getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      mediaRecorder: !!window.MediaRecorder,
      indexedDB: !!window.indexedDB,
      recordRTC: !!window.RecordRTC || !!RecordRTC,
      webRTC: !!(window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection),
      supportedTypes: VideoRecordingService.getSupportedMimeTypes()
    };

    // Additional checks
    support.canRecord = support.getUserMedia && (support.mediaRecorder || support.recordRTC);
    support.canStoreOffline = support.indexedDB;

    return support;
  }

  /**
   * Get recommended settings based on browser capabilities
   */
  static getRecommendedSettings() {
    const support = VideoRecordingService.checkBrowserSupport();
    const supportedTypes = support.supportedTypes;

    return {
      mimeType: supportedTypes.length > 0 ? supportedTypes[0] : 'video/webm',
      video: {
        width: { ideal: 1280, max: 1920, min: 640 },
        height: { ideal: 720, max: 1080, min: 480 },
        frameRate: { ideal: 24, max: 30, min: 15 }
      },
      audio: support.getUserMedia ? {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } : false,
      useIndexedDB: support.indexedDB,
      maxDuration: 3600000, // 1 hour
      maxFileSize: support.indexedDB ? 500 * 1024 * 1024 : 50 * 1024 * 1024 // 500MB with IndexedDB, 50MB without
    };
  }
}

export default VideoRecordingService;