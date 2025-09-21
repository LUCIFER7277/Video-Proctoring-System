const mongoose = require('mongoose');
const Violation = require('./Backend/models/Violation');

async function checkViolations() {
  try {
    await mongoose.connect('mongodb://localhost:27017/video_proctoring_db');

    console.log('=== Checking violations for session c86a89b5-598d-428b-89e0-9291e55a1047 ===');

    const violations = await Violation.find({ sessionId: 'c86a89b5-598d-428b-89e0-9291e55a1047' });
    console.log('Total violations found:', violations.length);

    if (violations.length > 0) {
      console.log('Violation types:');
      violations.forEach((v, i) => {
        console.log(`${i+1}. Type: ${v.type}, Severity: ${v.severity}, Confidence: ${v.confidence}, Time: ${v.timestamp}`);
      });

      console.log('\n=== Violation count by type ===');
      const typeCount = {};
      violations.forEach(v => {
        typeCount[v.type] = (typeCount[v.type] || 0) + 1;
      });
      console.log(typeCount);
    } else {
      console.log('No violations found for this session');
    }

    console.log('\n=== Checking all violations in database ===');
    const allViolations = await Violation.find({}).limit(10);
    console.log(`Total violations in database: ${allViolations.length}`);

    if (allViolations.length > 0) {
      console.log('Sample violations:');
      allViolations.slice(0, 5).forEach((v, i) => {
        console.log(`${i+1}. SessionId: ${v.sessionId}, Type: ${v.type}, Time: ${v.timestamp}`);
      });
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkViolations();