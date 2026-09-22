import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { HomePage } from './pages/home/HomePage';
import { UsersPage } from './pages/admin/UsersPage';
import { PackagesPage } from './features/packages/pages/PackagesPage';
import { TeachersPage } from './features/teachers/pages/TeachersPage';
import { StudentsPage } from './features/students/pages/StudentsPage';
import { ClassesPage } from './features/classes/pages/ClassesPage';
import { ClassSessionsPage } from './features/classes/pages/ClassSessionsPage';
import { AttendanceSheetPage } from './features/classes/pages/AttendanceSheetPage';
import { EnrollmentsPage } from './features/enrollments/pages/EnrollmentsPage';
import { ImportsPage } from './features/imports/pages/ImportsPage';
import { DashboardPage } from './features/dashboard/pages/DashboardPage';
import { CarePage } from './features/care/pages/CarePage';
import { ToastProvider } from './components/ui/Toast';
import { ZaloAccountsPage } from './features/zalo/pages/ZaloAccountsPage';
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

            {/* Admin Settings */}
            <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
              <Route path="/settings/users" element={<UsersPage />} />
              <Route path="/cai-dat/nguoi-dung" element={<Navigate to="/settings/users" replace />} />
            </Route>

            {/* Admin & Manage */}
            <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGE']} />}>
              <Route path="/packages" element={<PackagesPage />} />
              <Route path="/goi-hoc" element={<Navigate to="/packages" replace />} />

              <Route path="/teachers" element={<TeachersPage />} />
              <Route path="/giao-vien" element={<Navigate to="/teachers" replace />} />
            </Route>

            {/* Core Staff: Admin, Manage, CS */}
            <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGE', 'CS']} />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/tong-quan" element={<Navigate to="/dashboard" replace />} />

              <Route path="/care" element={<CarePage />} />
              <Route path="/cham-soc" element={<Navigate to="/care" replace />} />

              <Route path="/students" element={<StudentsPage />} />
              <Route path="/hoc-vien" element={<Navigate to="/students" replace />} />

              <Route path="/enrollments" element={<EnrollmentsPage />} />
              <Route path="/ghi-danh" element={<Navigate to="/enrollments" replace />} />

              <Route path="/zalo" element={<ZaloAccountsPage />} />
              <Route path="/zalo/tai-khoan" element={<Navigate to="/zalo" replace />} />
            </Route>

            {/* Classes, Attendance, Imports/Exports: Admin, Manage, CS, Teacher */}
            <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGE', 'CS', 'TEACHER']} />}>
              <Route path="/imports" element={<ImportsPage />} />
              <Route path="/nhap-xuat-excel" element={<Navigate to="/imports" replace />} />

              <Route path="/classes" element={<ClassesPage />} />
              <Route path="/lop-hoc" element={<Navigate to="/classes" replace />} />

              <Route path="/classes/:classId/sessions" element={<ClassSessionsPage />} />
              <Route path="/lop-hoc/:classId/buoi-hoc" element={<ClassSessionsPage />} />

              <Route path="/classes/:classId/attendance" element={<AttendanceSheetPage />} />
              <Route path="/lop-hoc/:classId/diem-danh" element={<AttendanceSheetPage />} />

              <Route path="/classes/:classId/sessions/:sessionId/attendance" element={<AttendanceSheetPage />} />
              <Route path="/lop-hoc/:classId/buoi-hoc/:sessionId/diem-danh" element={<AttendanceSheetPage />} />
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
