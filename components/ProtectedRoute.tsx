import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { SplashScreen } from '../components/SplashScreen';
import { UserRole } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRole 
}) => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <SplashScreen />;
  }

  if (!currentUser) {
    // Redirect to login but save the current location to redirect back after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check for role requirement if specified
  if (requiredRole && currentUser.role !== UserRole.ADMIN && currentUser.role !== requiredRole) {
    // If the user doesn't have the required role, redirect to dashboard or a "not authorized" page
    // For now, we'll just send them back to the dashboard
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
