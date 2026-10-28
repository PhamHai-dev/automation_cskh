import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { HomePage } from './pages/home/HomePage';
import { UsersPage } from './pages/admin/UsersPage';
import {
  AdminConfigPage,
  AutoAttendanceConfigPage,
  SheetBackupAdminConfigPage,
} from './pages/admin/AdminConfigPage';
import { PackagesPage } from './features/packages/pages/PackagesPage';
import { TeachersPage } from './features/teachers/pages/TeachersPage';
import { StudentsPage } from './features/students/pages/StudentsPage';
import { StudentStudyReportPage } from './features/students/pages/StudentStudyReportPage';
import { ClassesPage } from './features/classes/pages/ClassesPage';
import { EnrollmentsPage } from './features/enrollments/pages/EnrollmentsPage';
import { ImportsPage } from './features/imports/pages/ImportsPage';
import { ImportApprovalQueuePage } from './features/imports/pages/ImportApprovalQueuePage';
import { DashboardPage } from './features/dashboard/pages/DashboardPage';
import { CarePage } from './features/care/pages/CarePage';
import { ToastProvider } from './components/ui/Toast';
import { ZaloMonitorPage } from './features/zalo/pages/ZaloMonitorPage';
import { OmnichannelAccountsPage } from './features/omnichannel/pages/OmnichannelAccountsPage';
import { OmnichannelInboxPage } from './features/omnichannel/pages/OmnichannelInboxPage';
import { OmnichannelContactsPage } from './features/omnichannel/pages/OmnichannelContactsPage';
import { OmnichannelGroupsPage } from './features/omnichannel/pages/OmnichannelGroupsPage';
import { OmnichannelStudentLinksPage } from './features/omnichannel/pages/OmnichannelStudentLinksPage';
import { AutomationWorkflowsPage } from './features/automation/pages/AutomationWorkflowsPage';
import { AutomationWorkflowDetailPage } from './features/automation/pages/AutomationWorkflowDetailPage';
import { AttendanceReconciliationPage } from './features/attendance/pages/AttendanceReconciliationPage';
import { MyTeachingSessionsPage } from './features/attendance/pages/MyTeachingSessionsPage';
import { TeacherAttendanceTrackingPage } from './features/attendance/pages/TeacherAttendanceTrackingPage';
import { TeacherStudentInfoPage } from './features/attendance/pages/TeacherStudentInfoPage';
import { PreferencesPage } from './features/preferences/pages/PreferencesPage';
import './styles/globals.css';
import './styles/tokens.css';

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          {/* Auth Route */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dang-nhap" element={<Navigate to="/login" replace />} />

        {/* Protected App Routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            {/* Command Center / Home */}
            <Route path="/" element={<HomePage />} />

            {/* Personal preferences — all authenticated users */}
            <Route path="/settings/preferences" element={<PreferencesPage />} />
            <Route path="/cai-dat/cau-hinh" element={<Navigate to="/settings/preferences" replace />} />

            {/* Admin Settings */}
            <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
              <Route path="/settings/users" element={<UsersPage />} />
              <Route path="/cai-dat/nguoi-dung" element={<Navigate to="/settings/users" replace />} />
              <Route path="/settings/config" element={<AdminConfigPage />} />
              <Route path="/settings/config/auto-attendance" element={<AutoAttendanceConfigPage />} />
              <Route path="/settings/config/sheet-backup" element={<SheetBackupAdminConfigPage />} />
              <Route path="/cai-dat/he-thong" element={<Navigate to="/settings/config" replace />} />
            </Route>

            {/* Admin & Manage */}
            <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGE']} />}>
              <Route path="/packages" element={<PackagesPage />} />
              <Route path="/goi-hoc" element={<Navigate to="/packages" replace />} />

              <Route path="/teachers" element={<TeachersPage />} />
              <Route path="/giao-vien" element={<Navigate to="/teachers" replace />} />

              <Route path="/imports/approval-queue" element={<ImportApprovalQueuePage />} />
              <Route path="/nhap-xuat/hang-doi-phe-duyet" element={<Navigate to="/imports/approval-queue" replace />} />
            </Route>

            {/* Core Staff: Admin, Manage, CS */}
            <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGE', 'CS']} />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/tong-quan" element={<Navigate to="/dashboard" replace />} />

              <Route path="/students" element={<StudentsPage />} />
              <Route path="/hoc-vien" element={<Navigate to="/students" replace />} />

              <Route path="/enrollments" element={<EnrollmentsPage />} />
              <Route path="/ghi-danh" element={<Navigate to="/enrollments" replace />} />

              <Route path="/omnichannel" element={<Navigate to="/omnichannel/accounts" replace />} />
              <Route path="/omnichannel/accounts" element={<OmnichannelAccountsPage />} />
              <Route path="/omnichannel/chat" element={<OmnichannelInboxPage />} />
              <Route path="/omnichannel/contacts" element={<OmnichannelContactsPage />} />
              <Route path="/omnichannel/groups" element={<OmnichannelGroupsPage />} />
              <Route path="/omnichannel/student-links" element={<OmnichannelStudentLinksPage />} />

              <Route path="/zalo" element={<OmnichannelAccountsPage />} />
              <Route path="/zalo/tai-khoan" element={<Navigate to="/omnichannel/accounts?channel=ZALO" replace />} />
              <Route path="/zalo/monitor" element={<ZaloMonitorPage />} />
              <Route path="/zalo/lien-ket" element={<OmnichannelStudentLinksPage initialTab="ZALO" />} />
              <Route path="/zalo/danh-ba" element={<OmnichannelContactsPage initialChannel="ZALO" />} />
              <Route path="/zalo/nhom" element={<OmnichannelGroupsPage initialTab="ZALO" />} />
              <Route path="/zalo/chat" element={<OmnichannelInboxPage initialMode="ZALO" />} />
              <Route path="/zalo/standalone" element={<Navigate to="/omnichannel/accounts?channel=ZALO" replace />} />

              <Route path="/line" element={<OmnichannelAccountsPage initialChannel="LINE_OA" />} />
              <Route path="/line/tai-khoan" element={<Navigate to="/omnichannel/accounts?channel=LINE_OA" replace />} />
              <Route path="/line/danh-ba" element={<OmnichannelContactsPage initialChannel="LINE" />} />
              <Route path="/line/nhom" element={<OmnichannelGroupsPage initialTab="LINE" />} />
              <Route path="/line/chat" element={<OmnichannelInboxPage initialMode="LINE" />} />
              <Route path="/line/lien-ket" element={<OmnichannelStudentLinksPage initialTab="LINE" />} />
              <Route path="/line/standalone" element={<Navigate to="/omnichannel/accounts?channel=LINE_OA" replace />} />
              <Route path="/line/standalone-chat" element={<Navigate to="/line/chat" replace />} />
              <Route path="/line/standalone-contacts" element={<Navigate to="/omnichannel/contacts?channel=LINE" replace />} />
              <Route path="/line/standalone-groups" element={<Navigate to="/omnichannel/groups?channel=LINE" replace />} />
              <Route path="/line/standalone-links" element={<Navigate to="/line/lien-ket" replace />} />

              <Route path="/automation" element={<AutomationWorkflowsPage />} />
              <Route path="/automation/:id" element={<AutomationWorkflowDetailPage />} />

              <Route path="/attendance/reconciliation" element={<AttendanceReconciliationPage />} />
              <Route path="/doi-soat-diem-danh" element={<Navigate to="/attendance/reconciliation" replace />} />
            </Route>

            {/* Classes, Attendance, Care, Imports/Exports: Admin, Manage, CS, Teacher */}
            <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGE', 'CS', 'TEACHER']} />}>
              <Route path="/care" element={<CarePage />} />
              <Route path="/cham-soc" element={<Navigate to="/care" replace />} />

              <Route path="/students/:id/study-report" element={<StudentStudyReportPage />} />
              <Route path="/hoc-vien/:id/bao-cao-hoc-tap" element={<StudentStudyReportPage />} />

              <Route path="/teacher/my-sessions" element={<MyTeachingSessionsPage />} />
              <Route path="/lich-day-cua-toi" element={<Navigate to="/teacher/my-sessions" replace />} />
              <Route path="/teacher/student-info" element={<TeacherStudentInfoPage />} />
              <Route path="/thong-tin-hoc-vien-gv" element={<Navigate to="/teacher/student-info" replace />} />
              <Route path="/teacher/attendance-tracking" element={<TeacherAttendanceTrackingPage />} />
              <Route path="/theo-doi-diem-danh" element={<Navigate to="/teacher/attendance-tracking" replace />} />

              <Route path="/imports" element={<ImportsPage />} />
              <Route path="/nhap-xuat-excel" element={<Navigate to="/imports" replace />} />

              <Route path="/classes" element={<ClassesPage />} />
              <Route path="/lop-hoc" element={<Navigate to="/classes" replace />} />
            </Route>
          </Route>
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
