import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface ProtectedRouteProps {
  allowedRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-sm">
        Đang tải phiên đăng nhập...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !user.roles.some((role) => allowedRoles.includes(role))) {
    const isTeacherOnly =
      user.roles.includes('TEACHER') &&
      !user.roles.includes('ADMIN') &&
      !user.roles.includes('MANAGE') &&
      !user.roles.includes('CS');
    return <Navigate to={isTeacherOnly ? '/teacher/my-sessions' : '/dashboard'} replace />;
  }

  return <Outlet />;
};
