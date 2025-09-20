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

  async generateInterviewReport(interviewId) {
    try {
      // Fetch interview data
      const interview = await Interview.findById(interviewId);
      if (!interview) {
        throw new Error('Interview not found');
      }

      // Fetch violations
      const violations = await Violation.find({ interviewId }).sort({ timestamp: 1 });
      const violationSummary = await Violation.getViolationSummary(interviewId);

      // Create PDF
      const doc = new PDFDocument({ margin: 50 });
      const filename = `interview_report_${interview.sessionId}_${Date.now()}.pdf`;
      const filePath = path.join(this.reportsDir, filename);

      // Pipe PDF to file
      doc.pipe(fs.createWriteStream(filePath));

      // Add content
      this.addHeader(doc, interview);
      this.addInterviewSummary(doc, interview);
      this.addViolationSummary(doc, violationSummary);
      this.addViolationAnalysis(doc, violations);
      this.addViolationDetails(doc, violations);
      this.addFooter(doc);

      // Finalize PDF
      doc.end();

      // Update interview with report path
      interview.reportPath = filePath;
      await interview.save();

      return {
        success: true,
        reportPath: filePath,
        filename: filename
      };

    } catch (error) {
      console.error('Error generating report:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  addHeader(doc, interview) {
    // Title
    doc.fontSize(24)
      .fillColor('#2C3E50')
      .text('INTERVIEW PROCTORING REPORT', 50, 50, { align: 'center' });

    // Line under title
    doc.strokeColor('#3498DB')
      .lineWidth(3)
      .moveTo(50, 85)
      .lineTo(545, 85)
      .stroke();

    doc.moveDown(2);
  }

  addInterviewSummary(doc, interview) {
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
      ['Candidate Name:', interview.candidateName || 'Unknown'],
      ['Candidate Email:', interview.candidateEmail || 'N/A'],
      ['Interviewer:', interview.interviewerName || 'Unknown'],
      ['Start Time:', interview.startTime ? new Date(interview.startTime).toLocaleString() : 'N/A'],
      ['End Time:', interview.endTime ? new Date(interview.endTime).toLocaleString() : 'In Progress'],
      ['Duration:', interview.duration ? `${interview.duration} minutes` : 'N/A'],
      ['Status:', (interview.status || 'unknown').toUpperCase()],
      ['Integrity Score:', `${interview.integrityScore || 0}/100`],
      ['Total Violations:', interview.violationCount || 0],
      ['Focus Lost Count:', interview.focusLostCount || 0]
    ];

    details.forEach(([label, value]) => {
      // Ensure value is properly formatted and not undefined
      const displayValue = value !== undefined && value !== null ? value.toString() : 'N/A';

      doc.text(label, 50, y, { continued: false })
        .text(displayValue, 200, y, { continued: false });
      y += 20;
    });

    doc.moveDown(2);
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
        if (metadataStr.length > 100) {
          doc.text(`Metadata: ${metadataStr.substring(0, 100)}...`, 70, y + 90);
        } else {
          doc.text(`Metadata: ${metadataStr}`, 70, y + 90);
        }
        y += 15;
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
    const pageCount = doc.bufferedPageRange().count;

    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);

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