import React from 'react';
import { MyTeachingSessionsPage } from './MyTeachingSessionsPage';

export const TeacherAttendanceTrackingPage: React.FC = () => {
  return (
    <MyTeachingSessionsPage
      initialMainTab="pending"
      pageTitle="Việc cần xử lý"
      showMainTabs={false}
    />
  );
};

export default TeacherAttendanceTrackingPage;
