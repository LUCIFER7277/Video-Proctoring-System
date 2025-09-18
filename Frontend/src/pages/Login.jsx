import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    setError('');
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

    try {
      // Generate session ID if not provided
      const sessionId = formData.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
      setError('Login failed. Please try again.');
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

            <div style={styles.formGroup}>
              <label style={styles.label}>
                Session ID <span style={styles.optional}>(optional)</span>
              </label>
              <input
                type="text"
                name="sessionId"
                value={formData.sessionId}
                onChange={handleInputChange}
                placeholder="Leave empty to generate automatically"
                style={styles.input}
              />
            </div>

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