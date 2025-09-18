import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children, requiredRole }) => {
  const userInfo = sessionStorage.getItem('userInfo');

  if (!userInfo) {
    return <Navigate to="/" replace />;
  }

  try {
    const userData = JSON.parse(userInfo);

    if (requiredRole && userData.role !== requiredRole) {
      return <Navigate to="/" replace />;
    }

    return children;
  } catch (error) {
    console.error('Error parsing user info:', error);
    return <Navigate to="/" replace />;
  }
};

export default ProtectedRoute;