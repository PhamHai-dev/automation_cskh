import React from 'react';
import { MyTeachingSessionsPage } from './MyTeachingSessionsPage';

export const TeacherAttendanceTrackingPage: React.FC = () => {
  return <MyTeachingSessionsPage initialMainTab="pending" />;
};

export default TeacherAttendanceTrackingPage;
