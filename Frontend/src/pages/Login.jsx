import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const Login = () => {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    sessionId: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    setError('');
    setSuccess('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!selectedRole) {
      setError('Please select your role');
      return;
    }

    if (!formData.name || !formData.email) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      let sessionId;

      if (selectedRole === 'interviewer') {
        // For interviewer: Create new interview session in database
        console.log('Creating new interview session...');

        const interviewData = {
          candidateName: 'TBD', // Will be updated when candidate joins
          candidateEmail: 'candidate@example.com', // Temporary placeholder
          interviewerName: formData.name
        };

        const response = await axios.post(
          `${import.meta.env.VITE_API_URL}/interviews`,
          interviewData
        );

        if (response.data.success) {
          sessionId = response.data.sessionId;
          console.log('Created interview session:', sessionId);
          setSuccess(`Interview session created! Session ID: ${sessionId}`);
        } else {
          throw new Error('Failed to create interview session');
        }
      } else {
        // For candidate: Validate session ID exists in backend
        sessionId = formData.sessionId;
        if (!sessionId) {
          setError('Please enter a valid session ID to join as candidate');
          return;
        }

        // Validate session exists
        try {
          const validateResponse = await axios.get(`/api/interviews/${sessionId}`);
          if (!validateResponse.data.success) {
            throw new Error('Session not found');
          }
          console.log('Session validated successfully');
        } catch (validateError) {
          console.error('Session validation failed:', validateError);
          setError('Invalid session ID. Please check the session ID provided by your interviewer.');
          return;
        }
      }

      // Store user info in sessionStorage
      const userInfo = {
        role: selectedRole,
        name: formData.name,
        email: formData.email,
        sessionId: sessionId,
        loginTime: new Date().toISOString()
      };

      sessionStorage.setItem('userInfo', JSON.stringify(userInfo));

      // Navigate based on role
      if (selectedRole === 'candidate') {
        navigate(`/candidate/${sessionId}`);
      } else {
        navigate(`/interviewer/${sessionId}`);
      }

    } catch (error) {
      console.error('Login error:', error);

      // Provide more specific error messages
      if (error.response?.status === 404) {
        setError('Interview session not found. Please check your session ID.');
      } else if (error.response?.status === 400) {
        setError('Invalid request. Please check your information and try again.');
      } else if (error.message.includes('Network Error')) {
        setError('Connection failed. Please check your internet connection and try again.');
      } else if (error.message.includes('Failed to create interview session')) {
        setError('Unable to create interview session. Please try again or contact support.');
      } else {
        setError(`Login failed: ${error.message || 'Please try again.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '20px'
    },
    loginCard: {
      background: 'white',
      borderRadius: '20px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      padding: '40px',
      width: '100%',
      maxWidth: '500px',
      textAlign: 'center'
    },
    title: {
      fontSize: '32px',
      fontWeight: 'bold',
      color: '#2c3e50',
      marginBottom: '10px'
    },
    subtitle: {
      fontSize: '16px',
      color: '#7f8c8d',
      marginBottom: '40px'
    },
    roleSection: {
      marginBottom: '30px'
    },
    roleTitle: {
      fontSize: '18px',
      fontWeight: 'bold',
      color: '#2c3e50',
      marginBottom: '20px'
    },
    roleButtons: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '15px'
    },
    roleButton: {
      padding: '20px',
      borderRadius: '12px',
      border: '2px solid #ecf0f1',
      background: 'white',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      textAlign: 'center'
    },
    roleButtonActive: {
      borderColor: '#3498db',
      background: 'linear-gradient(135deg, #3498db, #2980b9)',
      color: 'white',
      transform: 'translateY(-2px)',
      boxShadow: '0 8px 25px rgba(52, 152, 219, 0.3)'
    },
    roleIcon: {
      fontSize: '40px',
      marginBottom: '10px',
      display: 'block'
    },
    roleLabel: {
      fontSize: '16px',
      fontWeight: 'bold',
      marginBottom: '5px'
    },
    roleDescription: {
      fontSize: '12px',
      opacity: 0.8
    },
    form: {
      textAlign: 'left'
    },
    formGroup: {
      marginBottom: '20px'
    },
    label: {
      display: 'block',
      fontSize: '14px',
      fontWeight: 'bold',
      color: '#2c3e50',
      marginBottom: '8px'
    },
    input: {
      width: '100%',
      padding: '12px 16px',
      borderRadius: '8px',
      border: '2px solid #ecf0f1',
      fontSize: '16px',
      transition: 'border-color 0.3s ease',
      boxSizing: 'border-box'
    },
    inputFocus: {
      borderColor: '#3498db',
      outline: 'none'
    },
    optional: {
      color: '#7f8c8d',
      fontSize: '12px',
      fontWeight: 'normal'
    },
    error: {
      background: '#ffe6e6',
      border: '1px solid #ff9999',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '20px',
      color: '#cc0000',
      fontSize: '14px'
    },
    success: {
      background: '#e8f5e8',
      border: '1px solid #27ae60',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '20px',
      color: '#27ae60',
      fontSize: '14px'
    },
    submitButton: {
      width: '100%',
      padding: '14px',
      borderRadius: '8px',
      border: 'none',
      background: 'linear-gradient(135deg, #27ae60, #2ecc71)',
      color: 'white',
      fontSize: '16px',
      fontWeight: 'bold',
      cursor: 'pointer',
      transition: 'all 0.3s ease',
      marginTop: '10px'
    },
    submitButtonDisabled: {
      background: '#95a5a6',
      cursor: 'not-allowed'
    },
    features: {
      marginTop: '30px',
      padding: '20px',
      background: '#f8f9fa',
      borderRadius: '8px',
      textAlign: 'left'
    },
    featuresTitle: {
      fontSize: '14px',
      fontWeight: 'bold',
      color: '#2c3e50',
      marginBottom: '10px'
    },
    featuresList: {
      fontSize: '12px',
      color: '#7f8c8d',
      lineHeight: '1.6'
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.loginCard}>
        <h1 style={styles.title}>🎥 Video Proctoring</h1>
        <p style={styles.subtitle}>Secure Online Interview Platform</p>

        {/* Role Selection */}
        <div style={styles.roleSection}>
          <h3 style={styles.roleTitle}>Select Your Role</h3>
          <div style={styles.roleButtons}>
            <div
              style={{
                ...styles.roleButton,
                ...(selectedRole === 'candidate' ? styles.roleButtonActive : {})
              }}
              onClick={() => handleRoleSelect('candidate')}
            >
              <span style={styles.roleIcon}>👤</span>
              <div style={styles.roleLabel}>Candidate</div>
              <div style={styles.roleDescription}>Join interview session</div>
            </div>
            <div
              style={{
                ...styles.roleButton,
                ...(selectedRole === 'interviewer' ? styles.roleButtonActive : {})
              }}
              onClick={() => handleRoleSelect('interviewer')}
            >
              <span style={styles.roleIcon}>👨‍💼</span>
              <div style={styles.roleLabel}>Interviewer</div>
              <div style={styles.roleDescription}>Monitor and conduct</div>
            </div>
          </div>
        </div>

        {/* Login Form */}
        {selectedRole && (
          <form onSubmit={handleLogin} style={styles.form}>
            {error && (
              <div style={styles.error}>
                ⚠️ {error}
              </div>
            )}

            {success && (
              <div style={styles.success}>
                ✅ {success}
              </div>
            )}

            <div style={styles.formGroup}>
              <label style={styles.label}>
                Full Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter your full name"
                style={styles.input}
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>
                Email Address *
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="Enter your email"
                style={styles.input}
                required
              />
            </div>

            {selectedRole === 'candidate' && (
              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Session ID *
                </label>
                <input
                  type="text"
                  name="sessionId"
                  value={formData.sessionId}
                  onChange={handleInputChange}
                  placeholder="Enter session ID provided by interviewer"
                  style={styles.input}
                  required
                />
              </div>
            )}

            {selectedRole === 'interviewer' && (
              <div style={{...styles.formGroup, background: '#e8f5e8', padding: '15px', borderRadius: '8px', border: '1px solid #27ae60'}}>
                <div style={{color: '#27ae60', fontWeight: 'bold', marginBottom: '8px'}}>
                  ✅ New Interview Session
                </div>
                <div style={{color: '#666', fontSize: '14px'}}>
                  A unique session ID will be generated automatically for you to share with the candidate.
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.submitButton,
                ...(loading ? styles.submitButtonDisabled : {})
              }}
            >
              {loading ? '🔄 Connecting...' :
               selectedRole === 'candidate' ? '🚀 Join Interview' : '📊 Start Monitoring'}
            </button>
          </form>
        )}

        {/* Features */}
        {selectedRole && (
          <div style={styles.features}>
            <div style={styles.featuresTitle}>
              {selectedRole === 'candidate' ? '🎯 What to Expect' : '🛠️ Monitoring Features'}
            </div>
            <div style={styles.featuresList}>
              {selectedRole === 'candidate' ? (
                <>
                  • Simple, Zoom-like video interface<br/>
                  • Real-time communication with interviewer<br/>
                  • Secure and private session<br/>
                  • No complex monitoring displays
                </>
              ) : (
                <>
                  • Real-time AI violation detection<br/>
                  • Live candidate monitoring dashboard<br/>
                  • WebRTC communication controls<br/>
                  • Comprehensive reporting system
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;