import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const ProtectedRoute = ({ children, requiredRole, maxSessionAge = 24 * 60 * 60 * 1000 }) => {
  const [authState, setAuthState] = useState({
    isLoading: true,
    isAuthenticated: false,
    userData: null,
    error: null
  });
  const location = useLocation();

  useEffect(() => {
    validateAuthentication();
  }, [requiredRole, maxSessionAge]);

  const validateAuthentication = () => {
    try {
      const userInfo = sessionStorage.getItem('userInfo');

      if (!userInfo) {
        setAuthState({
          isLoading: false,
          isAuthenticated: false,
          userData: null,
          error: 'No authentication data found'
        });
        return;
      }

      let userData;
      try {
        userData = JSON.parse(userInfo);
      } catch (parseError) {
        console.error('Failed to parse user info:', parseError);
        // Clear corrupted data
        sessionStorage.removeItem('userInfo');
        setAuthState({
          isLoading: false,
          isAuthenticated: false,
          userData: null,
          error: 'Corrupted authentication data'
        });
        return;
      }

      // Validate userData structure
      if (!userData || typeof userData !== 'object') {
        console.error('Invalid user data structure:', userData);
        sessionStorage.removeItem('userInfo');
        setAuthState({
          isLoading: false,
          isAuthenticated: false,
          userData: null,
          error: 'Invalid user data structure'
        });
        return;
      }

      // Check required fields
      if (!userData.role || !userData.email || !userData.name) {
        console.error('Missing required user data fields:', userData);
        sessionStorage.removeItem('userInfo');
        setAuthState({
          isLoading: false,
          isAuthenticated: false,
          userData: null,
          error: 'Incomplete user data'
        });
        return;
      }

      // Check session age
      if (userData.loginTime) {
        const loginTime = new Date(userData.loginTime);
        const now = new Date();
        const sessionAge = now.getTime() - loginTime.getTime();

        if (sessionAge > maxSessionAge) {
          console.warn('Session expired:', {
            loginTime: loginTime.toISOString(),
            age: sessionAge,
            maxAge: maxSessionAge
          });
          sessionStorage.removeItem('userInfo');
          setAuthState({
            isLoading: false,
            isAuthenticated: false,
            userData: null,
            error: 'Session expired'
          });
          return;
        }
      }

      // Validate role requirement
      if (requiredRole && userData.role !== requiredRole) {
        console.warn('Role mismatch:', {
          required: requiredRole,
          actual: userData.role,
          path: location.pathname
        });
        setAuthState({
          isLoading: false,
          isAuthenticated: false,
          userData: userData,
          error: `Access denied: ${requiredRole} role required`
        });
        return;
      }

      // Valid authentication
      setAuthState({
        isLoading: false,
        isAuthenticated: true,
        userData: userData,
        error: null
      });

    } catch (error) {
      console.error('Authentication validation error:', error);
      // Clear potentially corrupted data
      sessionStorage.removeItem('userInfo');
      setAuthState({
        isLoading: false,
        isAuthenticated: false,
        userData: null,
        error: 'Authentication validation failed'
      });
    }
  };

  // Show loading state
  if (authState.isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingContent}>
          <div style={styles.spinner}></div>
          <div style={styles.loadingText}>Validating authentication...</div>
        </div>
      </div>
    );
  }

  // Redirect if not authenticated
  if (!authState.isAuthenticated) {
    // Store current location for potential redirect after login
    const redirectPath = location.pathname !== '/' ? location.pathname : null;
    if (redirectPath) {
      sessionStorage.setItem('redirectAfterLogin', redirectPath);
    }

    return <Navigate to="/" replace state={{
      from: location.pathname,
      error: authState.error
    }} />;
  }

  return children;
};

const styles = {
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  loadingContent: {
    background: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(20px)',
    borderRadius: '20px',
    padding: '40px',
    textAlign: 'center',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #3498db',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 20px'
  },
  loadingText: {
    fontSize: '16px',
    color: '#2c3e50',
    fontWeight: '500'
  }
};

// Add CSS animation for spinner
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

export default ProtectedRoute;