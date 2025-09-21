const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Interview = require('../models/Interview');
const Violation = require('../models/Violation');

class ReportGenerator {
  constructor() {
    this.reportsDir = path.join(__dirname, '../../reports');
    this.ensureReportsDirectory();
  }

  ensureReportsDirectory() {
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  async getViolationSummaryBySessionId(sessionId) {
    return await Violation.aggregate([
      { $match: { sessionId: sessionId } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          avgConfidence: { $avg: '$confidence' },
          totalDuration: { $sum: '$duration' }
        }
      }
    ]);
  }

  async generateInterviewReport(interviewId) {
    try {
      console.log('Starting report generation for interview:', interviewId);

      // Fetch interview data - handle both ObjectId and sessionId
      let interview;
      try {
        // First try to find by MongoDB _id
        interview = await Interview.findById(interviewId);
      } catch (error) {
        // If ObjectId casting fails, this is likely a sessionId string
        console.log('ObjectId casting failed in reportGenerator, trying sessionId lookup:', error.message);
        interview = null;
      }

      if (!interview) {
        // Try finding by sessionId if _id lookup failed
        interview = await Interview.findOne({ sessionId: interviewId });
      }

      if (!interview) {
        throw new Error('Interview not found');
      }

      console.log('Interview found:', {
        candidateName: interview.candidateName,
        candidateEmail: interview.candidateEmail,
        interviewerName: interview.interviewerName,
        sessionId: interview.sessionId
      });

      // Fetch violations - prioritize sessionId since that's how violations are stored
      let violations = await Violation.find({ sessionId: interview.sessionId }).sort({ timestamp: 1 });

      // If no violations found by sessionId, try interviewId as fallback
      if (violations.length === 0) {
        violations = await Violation.find({ interviewId }).sort({ timestamp: 1 });
      }

      // Get violation summary - prioritize sessionId since that's how violations are stored
      let violationSummary = [];
      try {
        violationSummary = await this.getViolationSummaryBySessionId(interview.sessionId);
      } catch (error) {
        console.warn('Failed to get violation summary by sessionId:', error.message);
        violationSummary = []; // Ensure it's an empty array
      }

      // If no summary from sessionId, try with interviewId as fallback
      if (violationSummary.length === 0) {
        try {
          violationSummary = await Violation.getViolationSummary(interviewId);
        } catch (error) {
          console.warn('Failed to get violation summary by interviewId:', error.message);
        }
      }

      console.log('Violations found:', violations.length);
      console.log('Violation summary:', violationSummary.length);

      // Recalculate violation counts if they're missing or incorrect
      const actualViolationCount = violations.length;
      const actualFocusLostCount = violations.filter(v =>
        v.type === 'face_not_detected' || v.type === 'multiple_faces' || v.type === 'focus_lost'
      ).length;
      const actualObjectViolationCount = violations.filter(v =>
        v.type === 'object_detected' || v.type === 'prohibited_object'
      ).length;

      // Update interview record if counts are incorrect
      if (interview.violationCount !== actualViolationCount ||
          interview.focusLostCount !== actualFocusLostCount ||
          interview.objectViolationCount !== actualObjectViolationCount) {

        console.log('Updating violation counts in interview record');
        interview.violationCount = actualViolationCount;
        interview.focusLostCount = actualFocusLostCount;
        interview.objectViolationCount = actualObjectViolationCount;

        // Recalculate integrity score
        interview.integrityScore = interview.calculateIntegrityScore();

        // Save the updated interview
        await interview.save();
      }

      // Debug: Log actual violation data
      if (violations.length > 0) {
        console.log('Sample violation types:', violations.slice(0, 3).map(v => ({
          type: v.type,
          severity: v.severity,
          confidence: v.confidence,
          timestamp: v.timestamp
        })));
      }

      // Debug: Log violation summary data
      if (violationSummary.length > 0) {
        console.log('Violation summary data:', violationSummary);
      }

      // Handle placeholder candidate information
      let candidateName = interview.candidateName;
      let candidateEmail = interview.candidateEmail;

      // If candidate info is still placeholder, try to get better info
      if (candidateName === 'TBD' || candidateName === 'Unknown' || !candidateName) {
        // Try to extract from violations or other sources
        const candidateViolation = violations.find(v => v.candidateName && v.candidateName !== 'TBD');
        if (candidateViolation) {
          candidateName = candidateViolation.candidateName;
        } else {
          candidateName = `Candidate ${interview.sessionId.slice(0, 8)}`;
        }
      }

      if (candidateEmail === 'candidate@example.com' || !candidateEmail) {
        // Try to extract from violations or other sources
        const candidateViolation = violations.find(v => v.candidateEmail && v.candidateEmail !== 'candidate@example.com');
        if (candidateViolation) {
          candidateEmail = candidateViolation.candidateEmail;
        } else {
          candidateEmail = 'Not provided';
        }
      }

      // Debug: Log interview statistics
      console.log('Interview statistics:', {
        violationCount: interview.violationCount,
        focusLostCount: interview.focusLostCount,
        objectViolationCount: interview.objectViolationCount,
        integrityScore: interview.integrityScore,
        finalCandidateName: candidateName,
        finalCandidateEmail: candidateEmail
      });

      // Create PDF
      const doc = new PDFDocument({ margin: 50 });
      const filename = `interview_report_${interview.sessionId}_${Date.now()}.pdf`;
      const filePath = path.join(this.reportsDir, filename);

      console.log('Creating PDF file:', filePath);

      // Pipe PDF to file
      doc.pipe(fs.createWriteStream(filePath));

      // Add content with error handling for each section
      try {
        console.log('Adding header...');
        this.addHeader(doc, interview, candidateName, candidateEmail);

        console.log('Adding interview summary...');
        this.addInterviewSummary(doc, interview, candidateName, candidateEmail);

        console.log('Adding candidate details...');
        this.addCandidateDetails(doc, interview, violations, candidateName, candidateEmail);

        console.log('Adding violation summary...');
        this.addViolationSummary(doc, violationSummary);

        console.log('Adding detection statistics...');
        this.addDetectionStatistics(doc, violations);

        console.log('Adding detection analysis...');
        this.addDetectionAnalysis(doc, violations);

        console.log('Adding violation analysis...');
        this.addViolationAnalysis(doc, violations);

        console.log('Adding violation details...');
        this.addViolationDetails(doc, violations);

        console.log('Adding footer...');
        this.addFooter(doc);
      } catch (sectionError) {
        console.error('Error in PDF section:', sectionError);
        throw sectionError;
      }

      // Finalize PDF
      console.log('Finalizing PDF...');
      doc.end();

      // Update interview with report path
      interview.reportPath = filePath;
      await interview.save();

      console.log('Report generated successfully:', filePath);

      return {
        success: true,
        reportPath: filePath,
        filename: filename
      };

    } catch (error) {
      console.error('Error generating report:', error);
      console.error('Error stack:', error.stack);
      return {
        success: false,
        error: error.message
      };
    }
  }

  addHeader(doc, interview, candidateName, candidateEmail) {
    // Title
    doc.fontSize(24)
      .fillColor('#2C3E50')
      .text('INTERVIEW PROCTORING REPORT', 50, 50, { align: 'center' });

    // Candidate information in header
    doc.fontSize(16)
      .fillColor('#34495E')
      .text(`Candidate: ${candidateName || interview.candidateName || 'Unknown'}`, 50, 90, { align: 'center' });

    doc.fontSize(14)
      .fillColor('#7F8C8D')
      .text(`Session ID: ${interview.sessionId || 'N/A'}`, 50, 110, { align: 'center' });

    // Line under header
    doc.strokeColor('#3498DB')
      .lineWidth(3)
      .moveTo(50, 130)
      .lineTo(545, 130)
      .stroke();

    doc.moveDown(2);
  }

  addInterviewSummary(doc, interview, candidateName, candidateEmail) {
    const currentY = doc.y;

    // Section title
    doc.fontSize(16)
      .fillColor('#2C3E50')
      .text('INTERVIEW SUMMARY', 50, currentY);

    doc.fontSize(12)
      .fillColor('#000000');

    const startY = currentY + 30;
    let y = startY;

    // Interview details with proper validation
    const details = [
      ['Session ID:', interview.sessionId || 'N/A'],
      ['Interviewer:', interview.interviewerName || 'Unknown'],
      ['Start Time:', interview.startTime ? new Date(interview.startTime).toLocaleString() : 'N/A'],
      ['End Time:', interview.endTime ? new Date(interview.endTime).toLocaleString() : 'In Progress'],
      ['Duration:', interview.duration ? `${interview.duration} minutes` : 'N/A'],
      ['Status:', (interview.status || 'unknown').toUpperCase()],
      ['Integrity Score:', `${interview.integrityScore || 0}/100`],
      ['Total Violations:', interview.violationCount || 0],
      ['Focus Lost Count:', interview.focusLostCount || 0],
      ['Object Violations:', interview.objectViolationCount || 0]
    ];

    details.forEach(([label, value]) => {
      // Ensure value is properly formatted and not undefined
      const displayValue = value !== undefined && value !== null ? value.toString() : 'N/A';

      doc.text(label, 50, y, { continued: false })
        .text(displayValue, 200, y, { continued: false });
      y += 20;
    });

    y += 10;

    // Add candidate summary box
    doc.rect(50, y, 500, 60)
      .fill('#F8F9FA')
      .stroke('#E9ECEF');

    doc.fontSize(14)
      .fillColor('#2C3E50')
      .text('CANDIDATE SUMMARY', 60, y + 10);

    doc.fontSize(12)
      .fillColor('#495057')
      .text(`Name: ${candidateName || interview.candidateName || 'Unknown'}`, 60, y + 30)
      .text(`Email: ${candidateEmail || interview.candidateEmail || 'N/A'}`, 60, y + 45);

    doc.moveDown(3);
  }

  addCandidateDetails(doc, interview, violations, candidateName, candidateEmail) {
    try {
      const currentY = doc.y;

      // Section title
      doc.fontSize(16)
        .fillColor('#2C3E50')
        .text('CANDIDATE DETAILS', 50, currentY);

      doc.fontSize(12)
        .fillColor('#000000');

      const startY = currentY + 30;
      let y = startY;

      // Candidate basic information
      const candidateDetails = [
        ['Full Name:', candidateName || interview.candidateName || 'Unknown'],
        ['Email Address:', candidateEmail || interview.candidateEmail || 'N/A'],
        ['Session ID:', interview.sessionId || 'N/A'],
        ['Interview Date:', interview.startTime ? new Date(interview.startTime).toLocaleDateString() : 'N/A'],
        ['Interview Time:', interview.startTime ? new Date(interview.startTime).toLocaleTimeString() : 'N/A']
      ];

      // Add candidate information
      candidateDetails.forEach(([label, value]) => {
        const displayValue = value !== undefined && value !== null ? value.toString() : 'N/A';
        doc.text(label, 50, y, { continued: false })
          .text(displayValue, 200, y, { continued: false });
        y += 20;
      });

      y += 10;

      // Candidate performance analysis
      doc.fontSize(14)
        .fillColor('#2C3E50')
        .text('PERFORMANCE ANALYSIS:', 50, y);
      y += 25;

      // Calculate performance metrics
      const totalViolations = violations.length;
      const focusViolations = violations.filter(v => v.source === 'focus_detection' || v.type.includes('face') || v.type.includes('focus') || v.type.includes('looking')).length;
      const objectViolations = violations.filter(v => v.source === 'object_detection' || v.type.includes('unauthorized') || v.type.includes('item')).length;

      // Calculate violation frequency per hour
      const durationHours = interview.duration ? interview.duration / 60 : 1; // Convert minutes to hours
      const violationsPerHour = durationHours > 0 ? (totalViolations / durationHours).toFixed(2) : totalViolations;
      const focusViolationsPerHour = durationHours > 0 ? (focusViolations / durationHours).toFixed(2) : focusViolations;
      const objectViolationsPerHour = durationHours > 0 ? (objectViolations / durationHours).toFixed(2) : objectViolations;

      const performanceDetails = [
        ['Total Violations:', totalViolations.toString()],
        ['Focus Violations:', focusViolations.toString()],
        ['Object Violations:', objectViolations.toString()],
        ['Violations per Hour:', violationsPerHour],
        ['Focus Violations per Hour:', focusViolationsPerHour],
        ['Object Violations per Hour:', objectViolationsPerHour],
        ['Integrity Score:', `${interview.integrityScore || 0}/100`],
        ['Focus Lost Count:', (interview.focusLostCount || 0).toString()],
        ['Object Violation Count:', (interview.objectViolationCount || 0).toString()]
      ];

      performanceDetails.forEach(([label, value]) => {
        doc.text(label, 70, y, { continued: false })
          .text(value, 250, y, { continued: false });
        y += 18;
      });

      y += 10;

      // Candidate behavior patterns
      doc.fontSize(14)
        .fillColor('#2C3E50')
        .text('BEHAVIOR PATTERNS:', 50, y);
      y += 25;

      // Analyze violation patterns
      const violationTypes = {};
      const severityCounts = { low: 0, medium: 0, high: 0, critical: 0 };
      const timePatterns = { morning: 0, afternoon: 0, evening: 0 };
      let totalDuration = 0;

      violations.forEach(violation => {
        // Count by type
        violationTypes[violation.type] = (violationTypes[violation.type] || 0) + 1;

        // Count by severity
        if (severityCounts.hasOwnProperty(violation.severity)) {
          severityCounts[violation.severity]++;
        }

        // Analyze time patterns
        const hour = new Date(violation.timestamp).getHours();
        if (hour >= 6 && hour < 12) timePatterns.morning++;
        else if (hour >= 12 && hour < 18) timePatterns.afternoon++;
        else timePatterns.evening++;

        // Sum duration
        if (violation.duration) {
          totalDuration += violation.duration;
        }
      });

      // Most common violation type
      const mostCommonType = Object.keys(violationTypes).length > 0 ?
        Object.keys(violationTypes).reduce((a, b) => violationTypes[a] > violationTypes[b] ? a : b) : 'None';

      // Risk assessment
      const riskLevel = this.assessRiskLevel(violations, severityCounts);

      const behaviorDetails = [
        ['Most Common Violation:', mostCommonType.replace(/_/g, ' ').toUpperCase()],
        ['Risk Level:', riskLevel],
        ['Total Violation Duration:', `${Math.round(totalDuration)} seconds`],
        ['Morning Violations:', timePatterns.morning.toString()],
        ['Afternoon Violations:', timePatterns.afternoon.toString()],
        ['Evening Violations:', timePatterns.evening.toString()]
      ];

      behaviorDetails.forEach(([label, value]) => {
        doc.text(label, 70, y, { continued: false })
          .text(value, 250, y, { continued: false });
        y += 18;
      });

      y += 10;

      // Severity breakdown
      doc.fontSize(14)
        .fillColor('#2C3E50')
        .text('VIOLATION SEVERITY BREAKDOWN:', 50, y);
      y += 25;

      Object.entries(severityCounts).forEach(([severity, count]) => {
        if (count > 0) {
          const color = this.getSeverityColor(severity);
          doc.fillColor(color)
            .text(`${severity.toUpperCase()}: ${count} violations`, 70, y);
          y += 15;
        }
      });

      y += 20;

      // Candidate compliance summary
      doc.fontSize(14)
        .fillColor('#2C3E50')
        .text('COMPLIANCE SUMMARY:', 50, y);
      y += 25;

      // Generate compliance assessment
      let complianceLevel = 'EXCELLENT';
      let complianceNotes = [];

      if (totalViolations === 0) {
        complianceLevel = 'EXCELLENT';
        complianceNotes.push('No violations detected during the interview');
      } else if (totalViolations <= 2) {
        complianceLevel = 'GOOD';
        complianceNotes.push('Minimal violations detected');
      } else if (totalViolations <= 5) {
        complianceLevel = 'FAIR';
        complianceNotes.push('Moderate number of violations');
      } else if (totalViolations <= 10) {
        complianceLevel = 'POOR';
        complianceNotes.push('High number of violations detected');
      } else {
        complianceLevel = 'VERY POOR';
        complianceNotes.push('Excessive violations detected');
      }

      // Add specific notes based on violation types
      if (focusViolations > objectViolations) {
        complianceNotes.push('More focus-related violations than object violations');
      } else if (objectViolations > focusViolations) {
        complianceNotes.push('More object-related violations than focus violations');
      }

      if (severityCounts.critical > 0) {
        complianceNotes.push('Critical violations detected');
      }

      if (violationsPerHour > 5) {
        complianceNotes.push('High violation frequency');
      }

      doc.fillColor('#000000')
        .text(`Compliance Level: ${complianceLevel}`, 70, y);
      y += 20;

      complianceNotes.forEach(note => {
        doc.text(`• ${note}`, 90, y);
        y += 15;
      });

      y += 20;

      // Interview notes if available
      if (interview.notes) {
        doc.fontSize(14)
          .fillColor('#2C3E50')
          .text('INTERVIEW NOTES:', 50, y);
        y += 25;

        doc.fontSize(12)
          .fillColor('#000000')
          .text(interview.notes, 70, y, { width: 500 });
        y += 30;
      }

      doc.y = y + 20;
    } catch (error) {
      console.error('Error in addCandidateDetails:', error);
      // Add a simple fallback
      doc.fontSize(12)
        .fillColor('#000000')
        .text('Error loading candidate details', 50, doc.y);
      doc.moveDown(2);
    }
  }

  addViolationSummary(doc, violationSummary) {
    const currentY = doc.y;

    // Section title
    doc.fontSize(16)
      .fillColor('#2C3E50')
      .text('VIOLATION SUMMARY', 50, currentY);

    if (violationSummary.length === 0) {
      doc.fontSize(12)
        .fillColor('#27AE60')
        .text('No violations detected during this interview.', 50, currentY + 30);
      doc.moveDown(2);
      return;
    }

    // Table headers
    const tableTop = currentY + 40;
    const tableHeaders = ['Violation Type', 'Count', 'Avg Confidence', 'Total Duration'];
    const columnWidths = [200, 80, 100, 100];
    let x = 50;

    doc.fontSize(10)
      .fillColor('#FFFFFF');

    // Header background
    doc.rect(50, tableTop, 480, 20)
      .fill('#3498DB');

    // Header text
    tableHeaders.forEach((header, i) => {
      doc.text(header, x + 5, tableTop + 5, { width: columnWidths[i] - 10 });
      x += columnWidths[i];
    });

    // Table rows
    let rowY = tableTop + 20;
    doc.fillColor('#000000');

    violationSummary.forEach((violation, index) => {
      const bgColor = index % 2 === 0 ? '#F8F9FA' : '#FFFFFF';

      // Row background
      doc.rect(50, rowY, 480, 20)
        .fill(bgColor);

      // Row data
      x = 50;
      const rowData = [
        violation._id.replace(/_/g, ' ').toUpperCase(),
        violation.count.toString(),
        violation.avgConfidence ? violation.avgConfidence.toFixed(2) : 'N/A',
        violation.totalDuration ? `${violation.totalDuration}s` : 'N/A'
      ];

      rowData.forEach((data, i) => {
        doc.fillColor('#000000')
          .text(data, x + 5, rowY + 5, { width: columnWidths[i] - 10 });
        x += columnWidths[i];
      });

      rowY += 20;
    });

    doc.y = rowY + 20;
    doc.moveDown(1);
  }

  addDetectionStatistics(doc, violations) {
    if (violations.length === 0) return;

    const currentY = doc.y;

    // Section title
    doc.fontSize(16)
      .fillColor('#2C3E50')
      .text('DETECTION STATISTICS', 50, currentY);

    doc.fontSize(12);
    let y = currentY + 30;

    // Calculate detection statistics
    const focusDetections = violations.filter(v => v.source === 'focus_detection' || v.type.includes('face') || v.type.includes('focus') || v.type.includes('looking'));
    const objectDetections = violations.filter(v => v.source === 'object_detection' || v.type.includes('unauthorized') || v.type.includes('item'));

    // Create statistics table
    const tableTop = y;
    const tableHeaders = ['Detection Type', 'Total Count', 'High Confidence', 'Medium Confidence', 'Low Confidence'];
    const columnWidths = [150, 80, 100, 100, 100];
    let x = 50;

    doc.fontSize(10)
      .fillColor('#FFFFFF');

    // Header background
    doc.rect(50, tableTop, 530, 20)
      .fill('#3498DB');

    // Header text
    tableHeaders.forEach((header, i) => {
      doc.text(header, x + 5, tableTop + 5, { width: columnWidths[i] - 10 });
      x += columnWidths[i];
    });

    // Table rows
    let rowY = tableTop + 20;
    doc.fillColor('#000000');

    // Focus Detection Row
    const focusHighConfidence = focusDetections.filter(v => v.confidence && v.confidence > 0.8).length;
    const focusMediumConfidence = focusDetections.filter(v => v.confidence && v.confidence > 0.5 && v.confidence <= 0.8).length;
    const focusLowConfidence = focusDetections.filter(v => v.confidence && v.confidence <= 0.5).length;

    const bgColor1 = '#F8F9FA';
    doc.rect(50, rowY, 530, 20)
      .fill(bgColor1);

    x = 50;
    const focusRowData = [
      'Focus Detection',
      focusDetections.length.toString(),
      focusHighConfidence.toString(),
      focusMediumConfidence.toString(),
      focusLowConfidence.toString()
    ];

    focusRowData.forEach((data, i) => {
      doc.fillColor('#000000')
        .text(data, x + 5, rowY + 5, { width: columnWidths[i] - 10 });
      x += columnWidths[i];
    });

    rowY += 20;

    // Object Detection Row
    const objectHighConfidence = objectDetections.filter(v => v.confidence && v.confidence > 0.8).length;
    const objectMediumConfidence = objectDetections.filter(v => v.confidence && v.confidence > 0.5 && v.confidence <= 0.8).length;
    const objectLowConfidence = objectDetections.filter(v => v.confidence && v.confidence <= 0.5).length;

    const bgColor2 = '#FFFFFF';
    doc.rect(50, rowY, 530, 20)
      .fill(bgColor2);

    x = 50;
    const objectRowData = [
      'Object Detection',
      objectDetections.length.toString(),
      objectHighConfidence.toString(),
      objectMediumConfidence.toString(),
      objectLowConfidence.toString()
    ];

    objectRowData.forEach((data, i) => {
      doc.fillColor('#000000')
        .text(data, x + 5, rowY + 5, { width: columnWidths[i] - 10 });
      x += columnWidths[i];
    });

    rowY += 20;

    // Total Row
    const totalHighConfidence = focusHighConfidence + objectHighConfidence;
    const totalMediumConfidence = focusMediumConfidence + objectMediumConfidence;
    const totalLowConfidence = focusLowConfidence + objectLowConfidence;

    const bgColor3 = '#E8F4FD';
    doc.rect(50, rowY, 530, 20)
      .fill(bgColor3);

    x = 50;
    const totalRowData = [
      'TOTAL',
      violations.length.toString(),
      totalHighConfidence.toString(),
      totalMediumConfidence.toString(),
      totalLowConfidence.toString()
    ];

    totalRowData.forEach((data, i) => {
      doc.fillColor('#000000')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text(data, x + 5, rowY + 5, { width: columnWidths[i] - 10 });
      x += columnWidths[i];
    });

    // Reset font
    doc.font('Helvetica');

    doc.y = rowY + 30;
    doc.moveDown(1);
  }

  addDetectionAnalysis(doc, violations) {
    if (violations.length === 0) return;

    const currentY = doc.y;

    // Section title
    doc.fontSize(16)
      .fillColor('#2C3E50')
      .text('DETECTION ANALYSIS', 50, currentY);

    doc.fontSize(12);
    let y = currentY + 30;

    // Analyze focus detections
    const focusDetections = violations.filter(v => v.source === 'focus_detection' || v.type.includes('face') || v.type.includes('focus') || v.type.includes('looking'));
    const objectDetections = violations.filter(v => v.source === 'object_detection' || v.type.includes('unauthorized') || v.type.includes('item'));

    // Focus Detection Analysis
    doc.fillColor('#000000')
      .text('FOCUS DETECTION ANALYSIS:', 50, y);
    y += 25;

    doc.fontSize(14)
      .fillColor('#2C3E50')
      .text(`Total Focus Violations: ${focusDetections.length}`, 50, y);
    y += 20;

    if (focusDetections.length > 0) {
      doc.fontSize(12)
        .fillColor('#000000');

      // Focus detection breakdown by type
      const focusTypes = {};
      focusDetections.forEach(violation => {
        const type = violation.type || 'unknown';
        focusTypes[type] = (focusTypes[type] || 0) + 1;
      });

      doc.text('Focus Violation Breakdown:', 70, y);
      y += 20;

      Object.entries(focusTypes).forEach(([type, count]) => {
        const displayType = type.replace(/_/g, ' ').toUpperCase();
        doc.text(`• ${displayType}: ${count} occurrences`, 90, y);
        y += 15;
      });

      y += 10;

      // Focus detection confidence analysis
      const focusHighConfidence = focusDetections.filter(v => v.confidence && v.confidence > 0.8).length;
      const focusMediumConfidence = focusDetections.filter(v => v.confidence && v.confidence > 0.5 && v.confidence <= 0.8).length;
      const focusLowConfidence = focusDetections.filter(v => v.confidence && v.confidence <= 0.5).length;

      doc.text('Focus Detection Confidence:', 70, y);
      y += 20;
      doc.text(`• High Confidence (>80%): ${focusHighConfidence} detections`, 90, y);
      y += 15;
      doc.text(`• Medium Confidence (50-80%): ${focusMediumConfidence} detections`, 90, y);
      y += 15;
      doc.text(`• Low Confidence (<50%): ${focusLowConfidence} detections`, 90, y);
      y += 20;
    }

    // Object Detection Analysis
    doc.fontSize(14)
      .fillColor('#2C3E50')
      .text(`Total Object Violations: ${objectDetections.length}`, 50, y);
    y += 20;

    if (objectDetections.length > 0) {
      doc.fontSize(12)
        .fillColor('#000000');

      // Object detection breakdown by item type
      const objectTypes = {};
      objectDetections.forEach(violation => {
        let itemType = 'unknown';
        if (violation.metadata && violation.metadata.itemType) {
          itemType = violation.metadata.itemType;
        } else if (violation.type === 'unauthorized_item') {
          itemType = 'unauthorized_item';
        }
        objectTypes[itemType] = (objectTypes[itemType] || 0) + 1;
      });

      doc.text('Object Violation Breakdown:', 70, y);
      y += 20;

      Object.entries(objectTypes).forEach(([type, count]) => {
        const displayType = type.replace(/_/g, ' ').toUpperCase();
        doc.text(`• ${displayType}: ${count} occurrences`, 90, y);
        y += 15;
      });

      y += 10;

      // Object detection priority analysis
      const highPriorityObjects = objectDetections.filter(v => v.metadata && v.metadata.priority === 'high').length;
      const mediumPriorityObjects = objectDetections.filter(v => v.metadata && v.metadata.priority === 'medium').length;
      const lowPriorityObjects = objectDetections.filter(v => v.metadata && v.metadata.priority === 'low').length;

      doc.text('Object Detection Priority:', 70, y);
      y += 20;
      doc.text(`• High Priority: ${highPriorityObjects} detections`, 90, y);
      y += 15;
      doc.text(`• Medium Priority: ${mediumPriorityObjects} detections`, 90, y);
      y += 15;
      doc.text(`• Low Priority: ${lowPriorityObjects} detections`, 90, y);
      y += 20;

      // Object detection confidence analysis
      const objectHighConfidence = objectDetections.filter(v => v.confidence && v.confidence > 0.8).length;
      const objectMediumConfidence = objectDetections.filter(v => v.confidence && v.confidence > 0.5 && v.confidence <= 0.8).length;
      const objectLowConfidence = objectDetections.filter(v => v.confidence && v.confidence <= 0.5).length;

      doc.text('Object Detection Confidence:', 70, y);
      y += 20;
      doc.text(`• High Confidence (>80%): ${objectHighConfidence} detections`, 90, y);
      y += 15;
      doc.text(`• Medium Confidence (50-80%): ${objectMediumConfidence} detections`, 90, y);
      y += 15;
      doc.text(`• Low Confidence (<50%): ${objectLowConfidence} detections`, 90, y);
      y += 20;
    }

    // Overall Detection Summary
    doc.fontSize(14)
      .fillColor('#2C3E50')
      .text('OVERALL DETECTION SUMMARY:', 50, y);
    y += 20;

    doc.fontSize(12)
      .fillColor('#000000');

    // Detection sources
    const detectionSources = {};
    const videoSources = {};
    const detectionTypes = {};

    violations.forEach(violation => {
      if (violation.metadata) {
        // Detection source analysis
        const source = violation.metadata.detectionSource || violation.source || 'unknown';
        detectionSources[source] = (detectionSources[source] || 0) + 1;

        // Video source analysis
        const videoSource = violation.metadata.detectionLocation === 'candidate_side' ? 'candidate' : 'interviewer';
        videoSources[videoSource] = (videoSources[videoSource] || 0) + 1;

        // Detection type analysis
        const detectionType = violation.source || 'unknown';
        detectionTypes[detectionType] = (detectionTypes[detectionType] || 0) + 1;
      } else {
        // Fallback for violations without metadata
        const detectionType = violation.source || 'unknown';
        detectionTypes[detectionType] = (detectionTypes[detectionType] || 0) + 1;
        detectionSources['unknown'] = (detectionSources['unknown'] || 0) + 1;
        videoSources['unknown'] = (videoSources['unknown'] || 0) + 1;
      }
    });

    // Detection source breakdown
    doc.text('Detection Source Analysis:', 70, y);
    y += 20;

    Object.entries(detectionSources).forEach(([source, count]) => {
      doc.text(`• ${source}: ${count} detections`, 90, y);
      y += 15;
    });

    y += 10;

    // Video source breakdown
    doc.text('Video Source Analysis:', 70, y);
    y += 20;

    Object.entries(videoSources).forEach(([videoSource, count]) => {
      doc.text(`• ${videoSource} video: ${count} detections`, 90, y);
      y += 15;
    });

    y += 10;

    // Detection type breakdown
    doc.text('Detection Type Analysis:', 70, y);
    y += 20;

    Object.entries(detectionTypes).forEach(([type, count]) => {
      doc.text(`• ${type}: ${count} detections`, 90, y);
      y += 15;
    });

    y += 20;

    // Overall detection quality analysis
    const highConfidenceDetections = violations.filter(v => v.confidence && v.confidence > 0.8).length;
    const mediumConfidenceDetections = violations.filter(v => v.confidence && v.confidence > 0.5 && v.confidence <= 0.8).length;
    const lowConfidenceDetections = violations.filter(v => v.confidence && v.confidence <= 0.5).length;

    doc.text('Overall Detection Quality:', 70, y);
    y += 20;

    doc.text(`• High Confidence (>80%): ${highConfidenceDetections} detections`, 90, y);
    y += 15;
    doc.text(`• Medium Confidence (50-80%): ${mediumConfidenceDetections} detections`, 90, y);
    y += 15;
    doc.text(`• Low Confidence (<50%): ${lowConfidenceDetections} detections`, 90, y);
    y += 15;

    doc.y = y + 20;
  }

  addViolationAnalysis(doc, violations) {
    if (violations.length === 0) return;

    const currentY = doc.y;

    // Section title
    doc.fontSize(16)
      .fillColor('#2C3E50')
      .text('VIOLATION ANALYSIS', 50, currentY);

    doc.fontSize(12);
    let y = currentY + 30;

    // Analyze violation patterns
    const violationTypes = {};
    const severityCounts = { low: 0, medium: 0, high: 0, critical: 0 };
    const timePatterns = { morning: 0, afternoon: 0, evening: 0 };
    let totalDuration = 0;

    violations.forEach(violation => {
      // Count by type
      violationTypes[violation.type] = (violationTypes[violation.type] || 0) + 1;

      // Count by severity
      if (severityCounts.hasOwnProperty(violation.severity)) {
        severityCounts[violation.severity]++;
      }

      // Analyze time patterns
      const hour = new Date(violation.timestamp).getHours();
      if (hour >= 6 && hour < 12) timePatterns.morning++;
      else if (hour >= 12 && hour < 18) timePatterns.afternoon++;
      else timePatterns.evening++;

      // Sum duration
      if (violation.duration) {
        totalDuration += violation.duration;
      }
    });

    // Most common violation type
    const mostCommonType = Object.keys(violationTypes).reduce((a, b) =>
      violationTypes[a] > violationTypes[b] ? a : b
    );

    // Risk assessment
    const riskLevel = this.assessRiskLevel(violations, severityCounts);

    // Analysis content
    doc.fillColor('#000000')
      .text(`Most Common Violation: ${mostCommonType.replace(/_/g, ' ').toUpperCase()}`, 50, y)
      .text(`Total Violation Duration: ${Math.round(totalDuration)} seconds`, 50, y + 20)
      .text(`Risk Level: ${riskLevel}`, 50, y + 40);

    y += 70;

    // Severity breakdown
    doc.fontSize(14)
      .fillColor('#2C3E50')
      .text('Severity Breakdown:', 50, y);

    y += 25;
    doc.fontSize(10);

    Object.entries(severityCounts).forEach(([severity, count]) => {
      if (count > 0) {
        const color = this.getSeverityColor(severity);
        doc.fillColor(color)
          .text(`${severity.toUpperCase()}: ${count} violations`, 70, y);
        y += 15;
      }
    });

    y += 20;

    // Time pattern analysis
    doc.fontSize(14)
      .fillColor('#2C3E50')
      .text('Time Pattern Analysis:', 50, y);

    y += 25;
    doc.fontSize(10);

    Object.entries(timePatterns).forEach(([period, count]) => {
      if (count > 0) {
        doc.fillColor('#000000')
          .text(`${period.charAt(0).toUpperCase() + period.slice(1)}: ${count} violations`, 70, y);
        y += 15;
      }
    });

    y += 20;

    // Recommendations
    doc.fontSize(14)
      .fillColor('#2C3E50')
      .text('Recommendations:', 50, y);

    y += 25;
    doc.fontSize(10);

    const recommendations = this.generateRecommendations(violations, violationTypes, severityCounts);
    recommendations.forEach((rec, index) => {
      doc.fillColor('#000000')
        .text(`${index + 1}. ${rec}`, 70, y);
      y += 15;
    });

    doc.y = y + 20;
  }

  assessRiskLevel(violations, severityCounts) {
    const totalViolations = violations.length;
    const criticalCount = severityCounts.critical || 0;
    const highCount = severityCounts.high || 0;

    if (criticalCount > 0 || highCount > 5) return 'HIGH RISK';
    if (highCount > 2 || totalViolations > 10) return 'MEDIUM RISK';
    if (totalViolations > 5) return 'LOW RISK';
    return 'MINIMAL RISK';
  }

  generateRecommendations(violations, violationTypes, severityCounts) {
    const recommendations = [];

    if (violationTypes.looking_away > 3) {
      recommendations.push('Consider improving lighting or camera positioning to reduce looking away incidents');
    }

    if (violationTypes.phone_detected > 0) {
      recommendations.push('Implement stricter phone detection policies and pre-interview briefings');
    }

    if (violationTypes.multiple_faces > 0) {
      recommendations.push('Ensure candidate is alone in the room and verify environment setup');
    }

    if (severityCounts.high > 2) {
      recommendations.push('Review interview session for potential academic integrity concerns');
    }

    if (violations.length > 10) {
      recommendations.push('Consider shorter interview sessions or additional breaks');
    }

    if (recommendations.length === 0) {
      recommendations.push('Interview conducted with minimal violations - good candidate compliance');
    }

    return recommendations;
  }

  addViolationDetails(doc, violations) {
    if (violations.length === 0) return;

    const currentY = doc.y;

    // Section title
    doc.fontSize(16)
      .fillColor('#2C3E50')
      .text('DETAILED VIOLATION LOG', 50, currentY);

    doc.fontSize(10);
    let y = currentY + 30;

    violations.forEach((violation, index) => {
      // Check if we need a new page
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      // Violation entry with enhanced formatting
      const severityColor = this.getSeverityColor(violation.severity);

      // Violation header with severity indicator
      doc.fillColor(severityColor)
        .text(`${index + 1}. ${violation.type.replace(/_/g, ' ').toUpperCase()}`, 50, y);

      // Draw severity indicator box
      doc.rect(50, y + 5, 15, 15)
        .fill(severityColor);

      doc.fillColor('#000000')
        .text(`Time: ${new Date(violation.timestamp).toLocaleString()}`, 70, y + 15)
        .text(`Severity: ${violation.severity.toUpperCase()}`, 70, y + 30)
        .text(`Description: ${violation.description}`, 70, y + 45);

      if (violation.confidence) {
        doc.text(`Confidence: ${(violation.confidence * 100).toFixed(1)}%`, 70, y + 60);
      }

      if (violation.duration) {
        doc.text(`Duration: ${violation.duration} seconds`, 70, y + 75);
      }

      // Add metadata if available
      if (violation.metadata && typeof violation.metadata === 'object') {
        const metadataStr = JSON.stringify(violation.metadata, null, 2);
        if (metadataStr.length > 200) {
          doc.text(`Detection Details: ${metadataStr.substring(0, 200)}...`, 70, y + 90);
        } else {
          doc.text(`Detection Details: ${metadataStr}`, 70, y + 90);
        }
        y += 15;
      }

      // Add specific detection information
      if (violation.metadata) {
        if (violation.metadata.detectionLocation) {
          doc.text(`Detection Location: ${violation.metadata.detectionLocation}`, 70, y + 90);
          y += 15;
        }
        if (violation.metadata.candidateInfo) {
          doc.text(`Candidate: ${violation.metadata.candidateInfo}`, 70, y + 90);
          y += 15;
        }
        if (violation.metadata.videoDimensions) {
          doc.text(`Video Resolution: ${violation.metadata.videoDimensions.width}x${violation.metadata.videoDimensions.height}`, 70, y + 90);
          y += 15;
        }
        if (violation.metadata.detectionTimestamp) {
          doc.text(`Detection Time: ${new Date(violation.metadata.detectionTimestamp).toLocaleString()}`, 70, y + 90);
          y += 15;
        }
        if (violation.metadata.itemType) {
          doc.text(`Item Type: ${violation.metadata.itemType}`, 70, y + 90);
          y += 15;
        }
        if (violation.metadata.faceCount) {
          doc.text(`Face Count: ${violation.metadata.faceCount}`, 70, y + 90);
          y += 15;
        }
        if (violation.metadata.coordinates) {
          doc.text(`Location: x:${violation.metadata.coordinates.x}, y:${violation.metadata.coordinates.y}`, 70, y + 90);
          y += 15;
        }
        if (violation.metadata.priority) {
          doc.text(`Priority Level: ${violation.metadata.priority.toUpperCase()}`, 70, y + 90);
          y += 15;
        }
        if (violation.metadata.duration) {
          doc.text(`Detection Duration: ${violation.metadata.duration}ms`, 70, y + 90);
          y += 15;
        }
        if (violation.metadata.eventType) {
          doc.text(`Event Type: ${violation.metadata.eventType}`, 70, y + 90);
          y += 15;
        }
      }

      // Add screenshot indicator if available
      if (violation.screenshotPath) {
        doc.fillColor('#3498DB')
          .text(`📷 Screenshot evidence available`, 70, y + 90);
        y += 15;
      }

      y += 120; // Increased spacing for better readability
    });

    doc.y = y;
  }

  getSeverityColor(severity) {
    const colors = {
      low: '#F39C12',
      medium: '#E67E22',
      high: '#E74C3C',
      critical: '#C0392B'
    };
    return colors[severity] || '#95A5A6';
  }

  addFooter(doc) {
    try {
      const range = doc.bufferedPageRange();
      const startPage = range.start;
      const pageCount = range.count;

      for (let i = 0; i < pageCount; i++) {
        const pageIndex = startPage + i;
        doc.switchToPage(pageIndex);

        // Footer line
        doc.strokeColor('#BDC3C7')
          .lineWidth(1)
          .moveTo(50, 750)
          .lineTo(545, 750)
          .stroke();

        // Footer text
        doc.fontSize(8)
          .fillColor('#7F8C8D')
          .text(`Generated on ${new Date().toLocaleString()}`, 50, 760)
          .text(`Page ${i + 1} of ${pageCount}`, 450, 760);
      }
    } catch (error) {
      console.error('Error adding footer:', error);
      // Skip footer if there's an error - don't let it break the whole report
    }
  }

  async generateBulkReport(startDate, endDate) {
    try {
      const interviews = await Interview.find({
        startTime: {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }).sort({ startTime: -1 });

      const doc = new PDFDocument({ margin: 50 });
      const filename = `bulk_report_${Date.now()}.pdf`;
      const filePath = path.join(this.reportsDir, filename);

      doc.pipe(fs.createWriteStream(filePath));

      // Header
      doc.fontSize(24)
        .fillColor('#2C3E50')
        .text('BULK INTERVIEW REPORT', 50, 50, { align: 'center' });

      doc.fontSize(14)
        .text(`Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`, 50, 100, { align: 'center' });

      doc.strokeColor('#3498DB')
        .lineWidth(3)
        .moveTo(50, 125)
        .lineTo(545, 125)
        .stroke();

      // Summary statistics
      const totalInterviews = interviews.length;
      const completedInterviews = interviews.filter(i => i.status === 'completed').length;
      const avgIntegrityScore = interviews.reduce((sum, i) => sum + i.integrityScore, 0) / totalInterviews;
      const totalViolations = interviews.reduce((sum, i) => sum + i.violationCount, 0);

      doc.fontSize(12)
        .fillColor('#000000')
        .text(`Total Interviews: ${totalInterviews}`, 50, 150)
        .text(`Completed Interviews: ${completedInterviews}`, 50, 170)
        .text(`Average Integrity Score: ${avgIntegrityScore.toFixed(1)}/100`, 50, 190)
        .text(`Total Violations: ${totalViolations}`, 50, 210);

      // Interview list
      let y = 250;
      doc.fontSize(14)
        .text('INTERVIEW DETAILS', 50, y);

      y += 30;
      interviews.forEach((interview, index) => {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }

        doc.fontSize(10)
          .text(`${index + 1}. ${interview.candidateName} (${interview.sessionId})`, 50, y)
          .text(`Integrity Score: ${interview.integrityScore}/100 | Violations: ${interview.violationCount}`, 70, y + 15)
          .text(`Date: ${new Date(interview.startTime).toLocaleDateString()}`, 70, y + 30);

        y += 50;
      });

      doc.end();

      return {
        success: true,
        reportPath: filePath,
        filename: filename,
        totalInterviews: totalInterviews
      };

    } catch (error) {
      console.error('Error generating bulk report:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = ReportGenerator;