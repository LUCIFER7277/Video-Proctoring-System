const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

class PDFService {
  static async generateProctoringReport(interview, violations, outputPath) {
    return new Promise((resolve, reject) => {
      try {
        // Create a new PDF document
        const doc = new PDFDocument({ size: 'A4', margin: 50 });

        // Create write stream
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // Header
        doc.fontSize(28)
           .fillColor('#1a365d')
           .font('Helvetica-Bold')
           .text('VIDEO PROCTORING REPORT', 50, 50);

        // Metadata
        doc.fontSize(12)
           .fillColor('#666')
           .font('Helvetica')
           .text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 90)
           .text(`Session ID: ${interview.sessionId}`, 50, 110);

        // Candidate Information
        doc.fontSize(18)
           .fillColor('#1a365d')
           .font('Helvetica-Bold')
           .text('CANDIDATE INFORMATION', 50, 150);

        let candidateY = 180;
        doc.fontSize(14)
           .fillColor('#000')
           .font('Helvetica')
           .text('Candidate Name:', 50, candidateY)
           .font('Helvetica-Bold')
           .text(interview.candidateName, 150, candidateY);

        candidateY += 25;
        doc.font('Helvetica')
           .text('Email:', 50, candidateY)
           .font('Helvetica-Bold')
           .text(interview.candidateEmail, 150, candidateY);

        candidateY += 25;
        doc.font('Helvetica')
           .text('Interviewer:', 50, candidateY)
           .font('Helvetica-Bold')
           .text(interview.interviewerName, 150, candidateY);

        // Interview Summary
        doc.fontSize(18)
           .fillColor('#1a365d')
           .font('Helvetica-Bold')
           .text('INTERVIEW SUMMARY', 50, 280);

        let summaryY = 310;

        // Calculate duration
        const duration = interview.endTime && interview.startTime
          ? Math.round((new Date(interview.endTime) - new Date(interview.startTime)) / (1000 * 60))
          : 0;
        const durationText = `${duration} minutes`;

        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor('#1a365d')
           .text('Interview Duration:', 50, summaryY)
           .text(durationText, 200, summaryY);

        summaryY += 30;
        doc.text('Start Time:', 50, summaryY)
           .fillColor('#000')
           .font('Helvetica')
           .text(interview.startTime ? new Date(interview.startTime).toLocaleString() : 'N/A', 200, summaryY);

        summaryY += 25;
        doc.fillColor('#1a365d')
           .font('Helvetica-Bold')
           .text('End Time:', 50, summaryY)
           .fillColor('#000')
           .font('Helvetica')
           .text(interview.endTime ? new Date(interview.endTime).toLocaleString() : 'N/A', 200, summaryY);

        summaryY += 25;
        doc.fillColor('#1a365d')
           .font('Helvetica-Bold')
           .text('Status:', 50, summaryY)
           .fillColor('#000')
           .font('Helvetica')
           .text(interview.status || 'completed', 200, summaryY);

        // Focus Lost Count (as specifically requested)
        summaryY += 40;
        const focusLostCount = violations.filter(v =>
          ['looking_away', 'no_face_detected', 'focus_lost'].includes(v.type)
        ).length;

        doc.fontSize(16)
           .fillColor('#d73027')
           .font('Helvetica-Bold')
           .text('Number of times focus lost:', 50, summaryY)
           .text(focusLostCount.toString(), 280, summaryY);

        // Integrity Score Box
        doc.rect(400, 480, 150, 120)
           .stroke('#1a365d');

        doc.fontSize(16)
           .fillColor('#1a365d')
           .font('Helvetica-Bold')
           .text('INTEGRITY SCORE', 410, 500);

        const scoreColor = interview.integrityScore >= 90 ? '#22543d' :
                          interview.integrityScore >= 70 ? '#d69e2e' : '#c53030';

        doc.fontSize(36)
           .fillColor(scoreColor)
           .font('Helvetica-Bold')
           .text(`${interview.integrityScore}/100`, 420, 530);

        // Grade
        let grade = 'F';
        if (interview.integrityScore >= 90) grade = 'A';
        else if (interview.integrityScore >= 80) grade = 'B';
        else if (interview.integrityScore >= 70) grade = 'C';
        else if (interview.integrityScore >= 60) grade = 'D';

        doc.fontSize(18)
           .fillColor('#1a365d')
           .text(`Grade: ${grade}`, 430, 575);

        // Add new page for detailed analysis
        doc.addPage();

        // Suspicious Events Analysis
        doc.fontSize(20)
           .fillColor('#1a365d')
           .font('Helvetica-Bold')
           .text('SUSPICIOUS EVENTS ANALYSIS', 50, 50);

        // Categorize violations
        const focusViolations = violations.filter(v =>
          ['looking_away', 'no_face_detected', 'focus_lost'].includes(v.type)
        );

        const objectViolations = violations.filter(v =>
          ['phone_detected', 'book_detected', 'notes_detected', 'device_detected'].includes(v.type)
        );

        const behaviorViolations = violations.filter(v =>
          ['multiple_faces', 'absence', 'eye_closure'].includes(v.type)
        );

        let yPos = 90;

        // Focus Violations
        doc.fontSize(16)
           .fillColor('#d73027')
           .font('Helvetica-Bold')
           .text('Focus & Attention Violations:', 50, yPos);

        yPos += 30;
        doc.fontSize(12)
           .fillColor('#000')
           .font('Helvetica')
           .text(`• Looking away incidents: ${focusViolations.filter(v => v.type === 'looking_away').length}`, 70, yPos);

        yPos += 20;
        doc.text(`• No face detected: ${focusViolations.filter(v => v.type === 'no_face_detected').length}`, 70, yPos);

        yPos += 20;
        doc.text(`• Focus lost events: ${focusViolations.filter(v => v.type === 'focus_lost').length}`, 70, yPos);

        // Object Detection Violations
        yPos += 40;
        doc.fontSize(16)
           .fillColor('#d73027')
           .font('Helvetica-Bold')
           .text('Unauthorized Items Detected:', 50, yPos);

        yPos += 30;
        doc.fontSize(12)
           .fillColor('#000')
           .font('Helvetica')
           .text(`• Phone detected: ${objectViolations.filter(v => v.type === 'phone_detected').length}`, 70, yPos);

        yPos += 20;
        doc.text(`• Books/Notes detected: ${objectViolations.filter(v => v.type === 'book_detected').length + objectViolations.filter(v => v.type === 'notes_detected').length}`, 70, yPos);

        yPos += 20;
        doc.text(`• Other devices: ${objectViolations.filter(v => v.type === 'device_detected').length}`, 70, yPos);

        // Behavioral Violations
        yPos += 40;
        doc.fontSize(16)
           .fillColor('#d73027')
           .font('Helvetica-Bold')
           .text('Behavioral Issues:', 50, yPos);

        yPos += 30;
        doc.fontSize(12)
           .fillColor('#000')
           .font('Helvetica')
           .text(`• Multiple faces: ${behaviorViolations.filter(v => v.type === 'multiple_faces').length}`, 70, yPos);

        yPos += 20;
        doc.text(`• Absence from frame: ${behaviorViolations.filter(v => v.type === 'absence').length}`, 70, yPos);

        // Total Summary
        yPos += 50;
        doc.fontSize(16)
           .fillColor('#1a365d')
           .font('Helvetica-Bold')
           .text('TOTAL SUSPICIOUS EVENTS:', 50, yPos);

        yPos += 30;
        doc.fontSize(14)
           .fillColor('#000')
           .font('Helvetica')
           .text(`Total Violations: ${violations.length}`, 70, yPos);

        // Recommendations
        yPos += 60;
        doc.fontSize(16)
           .fillColor('#1a365d')
           .font('Helvetica-Bold')
           .text('RECOMMENDATIONS:', 50, yPos);

        yPos += 30;
        let recommendations = [];

        if (interview.integrityScore >= 90) {
          recommendations.push('• Excellent interview conduct. No significant concerns identified.');
          recommendations.push('• Candidate demonstrated proper focus and adherence to guidelines.');
        } else if (interview.integrityScore >= 80) {
          recommendations.push('• Good interview conduct with minor issues.');
          recommendations.push('• Consider reviewing specific incidents for future improvement.');
        } else if (interview.integrityScore >= 70) {
          recommendations.push('• Moderate concerns identified during interview.');
          recommendations.push('• Recommend additional verification of candidate responses.');
        } else if (interview.integrityScore >= 60) {
          recommendations.push('• Significant violations detected.');
          recommendations.push('• Consider re-interview or additional assessment methods.');
        } else {
          recommendations.push('• Multiple serious violations detected.');
          recommendations.push('• Interview integrity compromised - recommend rejection or re-interview.');
        }

        recommendations.forEach(rec => {
          doc.fontSize(12)
             .fillColor('#000')
             .font('Helvetica')
             .text(rec, 70, yPos);
          yPos += 20;
        });

        // System Information Footer
        yPos += 40;
        doc.fontSize(10)
           .fillColor('#666')
           .font('Helvetica')
           .text('Generated by Video Proctoring System v1.0', 50, yPos)
           .text(`Report ID: ${interview.sessionId}-${Date.now()}`, 50, yPos + 15)
           .text('This report is confidential and intended for authorized personnel only.', 50, yPos + 30);

        // Finalize the PDF
        doc.end();

        stream.on('finish', () => {
          console.log(`PDF report generated successfully: ${outputPath}`);
          resolve(outputPath);
        });

        stream.on('error', (error) => {
          console.error('Error writing PDF:', error);
          reject(error);
        });

      } catch (error) {
        console.error('Error generating PDF report:', error);
        reject(error);
      }
    });
  }

  static async generateSimpleReport(interview, outputPath) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument();
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        doc.fontSize(20).text('Interview Report', 100, 50);
        doc.fontSize(14).text(`Candidate: ${interview.candidateName}`, 100, 100);
        doc.fontSize(14).text(`Email: ${interview.candidateEmail}`, 100, 120);
        doc.fontSize(14).text(`Session ID: ${interview.sessionId}`, 100, 140);
        doc.fontSize(14).text(`Status: ${interview.status}`, 100, 160);

        if (interview.startTime) {
          doc.fontSize(14).text(`Start Time: ${new Date(interview.startTime).toLocaleString()}`, 100, 180);
        }

        if (interview.endTime) {
          doc.fontSize(14).text(`End Time: ${new Date(interview.endTime).toLocaleString()}`, 100, 200);
        }

        doc.end();

        stream.on('finish', () => {
          resolve(outputPath);
        });

        stream.on('error', (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = PDFService;