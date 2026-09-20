
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { LoginPage } from './pages/auth/LoginPage';
import { UsersPage } from './pages/admin/UsersPage';
import { PackagesPage } from './features/packages/pages/PackagesPage';
import { TeachersPage } from './features/teachers/pages/TeachersPage';
import { StudentsPage } from './features/students/pages/StudentsPage';
import { ClassesPage } from './features/classes/pages/ClassesPage';
import { ClassSessionsPage } from './features/classes/pages/ClassSessionsPage';
import { AttendanceSheetPage } from './features/classes/pages/AttendanceSheetPage';
import { EnrollmentsPage } from './features/enrollments/pages/EnrollmentsPage';
import { ImportsPage } from './features/imports/pages/ImportsPage';
import './styles/globals.css';
import './styles/tokens.css';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        
        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={
            <div className="p-8 max-w-4xl mx-auto">
              <h1 className="text-3xl font-bold mb-6">Trang chủ Hệ thống CSKH</h1>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <a href="/packages" className="p-4 bg-white rounded-lg shadow border border-gray-200 hover:border-blue-500 hover:shadow-md transition">Quản lý Gói học</a>
                <a href="/teachers" className="p-4 bg-white rounded-lg shadow border border-gray-200 hover:border-blue-500 hover:shadow-md transition">Quản lý Giáo viên</a>
                <a href="/students" className="p-4 bg-white rounded-lg shadow border border-gray-200 hover:border-blue-500 hover:shadow-md transition">Quản lý Học viên</a>
                <a href="/classes" className="p-4 bg-white rounded-lg shadow border border-gray-200 hover:border-blue-500 hover:shadow-md transition">Quản lý Lớp học</a>
                <a href="/enrollments" className="p-4 bg-white rounded-lg shadow border border-gray-200 hover:border-blue-500 hover:shadow-md transition">Quản lý Ghi danh</a>
                <a href="/imports" className="p-4 bg-blue-50/60 rounded-lg shadow border border-blue-200 hover:border-blue-500 hover:shadow-md transition font-semibold text-blue-900">Nhập & Xuất Excel (Sheet 1 & 3)</a>
                <a href="/settings/users" className="p-4 bg-gray-50 rounded-lg shadow border border-gray-200 hover:border-blue-500 hover:shadow-md transition">Quản trị Hệ thống (Admin)</a>
              </div>
            </div>
          } />
          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/settings/users" element={<UsersPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGE']} />}>
            <Route path="/packages" element={<PackagesPage />} />
            <Route path="/teachers" element={<TeachersPage />} />
            <Route path="/imports" element={<ImportsPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGE', 'CS']} />}>
            <Route path="/students" element={<StudentsPage />} />
            <Route path="/classes" element={<ClassesPage />} />
            <Route path="/classes/:classId/sessions" element={<ClassSessionsPage />} />
            <Route path="/classes/:classId/sessions/:sessionId/attendance" element={<AttendanceSheetPage />} />
            <Route path="/enrollments" element={<EnrollmentsPage />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
