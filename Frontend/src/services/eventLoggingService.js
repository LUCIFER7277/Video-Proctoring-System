import { v4 as uuidv4 } from 'uuid';

class EventLoggingService {
  constructor() {
    this.events = [];
    this.sessionId = uuidv4();
    this.candidateId = null;
    this.interviewId = null;
    this.startTime = new Date().toISOString();
    this.eventCallbacks = [];
    this.storageKey = 'proctoring_events';
    this.maxEventsInMemory = 1000;
    this.autoSaveInterval = 10000; // Auto-save every 10 seconds
    this.autoSaveTimer = null;
    this.isDirty = false; // Track if events have changed since last save
    this.statisticsCache = null; // Cache for expensive statistics calculations
    this.lastCacheUpdate = 0;

    // Event severity levels
    this.severityLevels = {
      'info': 1,
      'warning': 2,
      'critical': 3,
      'violation': 4
    };

    // Initialize auto-save
    this.startAutoSave();
  }

  initialize(candidateId, interviewId) {
    this.candidateId = candidateId;
    this.interviewId = interviewId;
    this.sessionId = uuidv4();
    this.startTime = new Date().toISOString();

    // Log session start
    this.logEvent({
      type: 'session_started',
      severity: 'info',
      message: 'Proctoring session started',
      data: {
        candidateId,
        interviewId,
        sessionId: this.sessionId,
        userAgent: navigator.userAgent,
        timestamp: this.startTime
      }
    });

    console.log('Event logging service initialized for session:', this.sessionId);
  }

  logEvent(eventData) {
    const event = this.createEvent(eventData);
    this.events.push(event);

    // Maintain memory limit efficiently
    if (this.events.length > this.maxEventsInMemory) {
      // Remove oldest events without creating new array
      const eventsToRemove = this.events.length - this.maxEventsInMemory;
      this.events.splice(0, eventsToRemove);
    }

    // Mark as dirty for auto-save
    this.isDirty = true;
    this.invalidateCache();

    // Trigger callbacks
    this.eventCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in event logging callback:', error);
      }
    });

    // Log to console based on severity
    this.logToConsole(event);

    return event;
  }

  createEvent(eventData) {
    const timestamp = new Date().toISOString();
    const eventId = uuidv4();

    return {
      id: eventId,
      sessionId: this.sessionId,
      candidateId: this.candidateId,
      interviewId: this.interviewId,
      timestamp,
      type: eventData.type || 'unknown',
      severity: eventData.severity || 'info',
      message: eventData.message || '',
      data: eventData.data || {},
      source: eventData.source || 'system',
      duration: eventData.duration || null,
      screenshot: eventData.screenshot || null,
      videoTimestamp: eventData.videoTimestamp || null
    };
  }

  logToConsole(event) {
    const logLevel = this.severityLevels[event.severity] || 1;
    const message = `[${event.severity.toUpperCase()}] ${event.type}: ${event.message}`;

    switch (logLevel) {
      case 1: // info
        console.log(message, event);
        break;
      case 2: // warning
        console.warn(message, event);
        break;
      case 3: // critical
      case 4: // violation
        console.error(message, event);
        break;
    }
  }

  // Specific logging methods for different event types
  logFocusEvent(eventData) {
    return this.logEvent({
      ...eventData,
      source: 'focus_detection',
      severity: eventData.severity || 'warning'
    });
  }

  logObjectDetectionEvent(eventData) {
    // Use severity if provided, otherwise derive from priority
    const severity = eventData.severity || this.getObjectDetectionSeverity(eventData.priority || eventData.severity);
    return this.logEvent({
      ...eventData,
      source: 'object_detection',
      severity
    });
  }

  logSystemEvent(eventData) {
    return this.logEvent({
      ...eventData,
      source: 'system',
      severity: eventData.severity || 'info'
    });
  }

  logUserAction(eventData) {
    return this.logEvent({
      ...eventData,
      source: 'user',
      severity: 'info'
    });
  }

  logViolation(eventData) {
    return this.logEvent({
      ...eventData,
      severity: 'violation'
    });
  }

  // Cache management
  invalidateCache() {
    this.statisticsCache = null;
    this.lastCacheUpdate = 0;
  }

  getObjectDetectionSeverity(priority) {
    switch (priority) {
      case 'high':
        return 'violation';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'info';
    }
  }

  // Query and filter methods (optimized)
  getEvents(filters = {}) {
    // Check if we need to apply any filters
    const hasFilters = Object.keys(filters).length > 0;
    if (!hasFilters) {
      return [...this.events]; // Return copy of all events
    }

    // Use efficient filtering without intermediate arrays
    const result = this.events.filter(event => {
      if (filters.type && event.type !== filters.type) return false;
      if (filters.severity && event.severity !== filters.severity) return false;
      if (filters.source && event.source !== filters.source) return false;
      if (filters.startTime && event.timestamp < filters.startTime) return false;
      if (filters.endTime && event.timestamp > filters.endTime) return false;
      return true;
    });

    // Apply limit correctly (first N events, not last N)
    if (filters.limit && filters.limit > 0) {
      return result.slice(0, filters.limit);
    }

    return result;
  }

  getViolations() {
    return this.getEvents({ severity: 'violation' });
  }

  getCriticalEvents() {
    return this.getEvents({ severity: 'critical' });
  }

  getWarnings() {
    return this.getEvents({ severity: 'warning' });
  }

  getRecentEvents(minutes = 5) {
    const startTime = new Date(Date.now() - minutes * 60 * 1000).toISOString();
    return this.getEvents({ startTime });
  }

  // Statistics and reporting (with caching)
  getEventSummary() {
    const now = Date.now();

    // Return cached version if recent and still valid
    if (this.statisticsCache && (now - this.lastCacheUpdate) < 5000) {
      return { ...this.statisticsCache };
    }

    const summary = {
      total: this.events.length,
      byType: {},
      bySeverity: {},
      bySource: {},
      timeRange: {
        start: this.startTime,
        end: this.events.length > 0 ? this.events[this.events.length - 1].timestamp : this.startTime
      }
    };

    this.events.forEach(event => {
      // Count by type
      summary.byType[event.type] = (summary.byType[event.type] || 0) + 1;

      // Count by severity
      summary.bySeverity[event.severity] = (summary.bySeverity[event.severity] || 0) + 1;

      // Count by source
      summary.bySource[event.source] = (summary.bySource[event.source] || 0) + 1;
    });

    // Cache the result
    this.statisticsCache = summary;
    this.lastCacheUpdate = now;

    return { ...summary };
  }

  getViolationReport() {
    const violations = this.getViolations();
    const report = {
      totalViolations: violations.length,
      violationTypes: {},
      timeline: [],
      severity: 'clean'
    };

    violations.forEach(violation => {
      // Count by type
      report.violationTypes[violation.type] = (report.violationTypes[violation.type] || 0) + 1;

      // Add to timeline
      report.timeline.push({
        timestamp: violation.timestamp,
        type: violation.type,
        message: violation.message
      });
    });

    // Determine overall severity
    if (violations.length > 10) {
      report.severity = 'severe';
    } else if (violations.length > 5) {
      report.severity = 'moderate';
    } else if (violations.length > 0) {
      report.severity = 'mild';
    }

    return report;
  }

  // Storage methods
  saveToLocalStorage() {
    try {
      const data = {
        sessionId: this.sessionId,
        candidateId: this.candidateId,
        interviewId: this.interviewId,
        startTime: this.startTime,
        events: this.events,
        savedAt: new Date().toISOString()
      };

      const serializedData = JSON.stringify(data);
      localStorage.setItem(this.storageKey, serializedData);
      this.isDirty = false;
      console.log('Events saved to local storage');
      return true;
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.warn('LocalStorage quota exceeded, attempting to free space...');
        // Try to save a smaller subset of events
        return this.saveReducedEvents();
      } else if (error.name === 'SecurityError') {
        console.error('LocalStorage access denied (private browsing?):', error.message);
      } else {
        console.error('Failed to save events to local storage:', error);
      }
      return false;
    }
  }

  saveReducedEvents() {
    try {
      // Save only critical events and recent events
      const criticalEvents = this.events.filter(event =>
        event.severity === 'violation' || event.severity === 'critical'
      );
      const recentEvents = this.events.slice(-50); // Last 50 events

      // Combine and deduplicate
      const eventsToSave = [...new Map([...criticalEvents, ...recentEvents].map(e => [e.id, e])).values()];

      const reducedData = {
        sessionId: this.sessionId,
        candidateId: this.candidateId,
        interviewId: this.interviewId,
        startTime: this.startTime,
        events: eventsToSave,
        savedAt: new Date().toISOString(),
        reduced: true,
        originalCount: this.events.length
      };

      localStorage.setItem(this.storageKey, JSON.stringify(reducedData));
      this.isDirty = false;
      console.log(`Saved reduced event set: ${eventsToSave.length} of ${this.events.length} events`);
      return true;
    } catch (error) {
      console.error('Failed to save even reduced events:', error);
      return false;
    }
  }

  loadFromLocalStorage() {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        const parsed = JSON.parse(data);
        this.events = parsed.events || [];
        console.log('Events loaded from local storage:', this.events.length);
        return true;
      }
    } catch (error) {
      console.error('Failed to load events from local storage:', error);
    }
    return false;
  }

  exportEvents(format = 'json') {
    const data = {
      sessionInfo: {
        sessionId: this.sessionId,
        candidateId: this.candidateId,
        interviewId: this.interviewId,
        startTime: this.startTime,
        exportTime: new Date().toISOString()
      },
      summary: this.getEventSummary(),
      violationReport: this.getViolationReport(),
      events: this.events
    };

    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'csv':
        return this.convertToCSV(this.events);
      default:
        return data;
    }
  }

  convertToCSV(events) {
    if (events.length === 0) return '';

    const headers = ['timestamp', 'type', 'severity', 'message', 'source', 'duration'];
    const csvRows = [headers.join(',')];

    events.forEach(event => {
      const row = [
        this.escapeCSVField(event.timestamp),
        this.escapeCSVField(event.type),
        this.escapeCSVField(event.severity),
        this.escapeCSVField(event.message),
        this.escapeCSVField(event.source),
        this.escapeCSVField(event.duration || '')
      ];
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  escapeCSVField(field) {
    if (field == null) return '';

    const stringField = String(field);

    // Remove potential CSV injection characters
    const sanitized = stringField
      .replace(/^[=@+\-]/, '') // Remove formula injection chars at start
      .replace(/[\r\n]/g, ' ') // Replace line breaks with spaces
      .trim();

    // Escape quotes and wrap in quotes if needed
    if (sanitized.includes(',') || sanitized.includes('"') || sanitized.includes('\n')) {
      return `"${sanitized.replace(/"/g, '""')}"`;
    }

    return sanitized;
  }

  // Auto-save functionality (with change detection)
  startAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.autoSaveTimer = setInterval(() => {
      // Only save if there are changes
      if (this.isDirty) {
        this.saveToLocalStorage();
      }
    }, this.autoSaveInterval);
  }

  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // Event listeners (with proper cleanup)
  addEventListener(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Event listener must be a function');
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

  // Session management
  endSession() {
    this.logEvent({
      type: 'session_ended',
      severity: 'info',
      message: 'Proctoring session ended',
      data: {
        duration: Date.now() - new Date(this.startTime).getTime(),
        totalEvents: this.events.length,
        violations: this.getViolations().length
      }
    });

    this.saveToLocalStorage();
    this.stopAutoSave();
  }

  clearEvents() {
    this.events.length = 0; // More memory efficient than creating new array
    this.invalidateCache();
    this.isDirty = true;
    try {
      localStorage.removeItem(this.storageKey);
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
    }
  }

  // Comprehensive cleanup method
  cleanup() {
    try {
      console.log('🧹 Cleaning up EventLoggingService...');

      // Stop auto-save
      this.stopAutoSave();

      // Save final state
      this.saveToLocalStorage();

      // Clear event listeners
      this.removeAllEventListeners();

      // Clear caches
      this.invalidateCache();

      // Clear events if needed (optional, keeps data by default)
      // this.clearEvents();

      console.log('✅ EventLoggingService cleaned up successfully');
    } catch (error) {
      console.error('Error during EventLoggingService cleanup:', error);
    }
  }

  // Destructor-like method
  destroy() {
    this.cleanup();
    this.clearEvents();
  }

  getStatus() {
    return {
      sessionId: this.sessionId,
      candidateId: this.candidateId,
      interviewId: this.interviewId,
      startTime: this.startTime,
      eventCount: this.events.length,
      violationCount: this.getViolations().length,
      autoSaveEnabled: this.autoSaveTimer !== null,
      isDirty: this.isDirty,
      cacheLastUpdate: this.lastCacheUpdate,
      listenerCount: this.eventCallbacks.length,
      memoryUsage: {
        eventsInMemory: this.events.length,
        maxEventsInMemory: this.maxEventsInMemory
      }
    };
  }
}

// Create and export singleton instance
const eventLoggingService = new EventLoggingService();
export default eventLoggingService;