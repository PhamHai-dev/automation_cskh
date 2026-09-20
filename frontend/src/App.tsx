import { Routes, Route, Navigate } from 'react-router-dom';
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
import { DashboardPage } from './features/dashboard/pages/DashboardPage';
import { CarePage } from './features/care/pages/CarePage';
import './styles/globals.css';
import './styles/tokens.css';

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Auth Route */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dang-nhap" element={<Navigate to="/login" replace />} />
        
        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route
            path="/"
            element={
              <div className="p-8 max-w-5xl mx-auto">
                <h1 className="text-3xl font-bold mb-2">Hệ thống Tự động hóa CSKH</h1>
                <p className="text-gray-500 mb-6">
                  Nền tảng quản trị học viên, điều phối lớp học và tự động hóa quy trình chăm sóc khách hàng
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <a
                    href="/dashboard"
                    className="p-5 bg-emerald-50/70 rounded-xl shadow-sm border border-emerald-200 hover:border-emerald-500 hover:shadow transition font-semibold text-emerald-900 flex flex-col justify-between"
                  >
                    <div>
                      <div className="text-base font-bold text-emerald-800">Tổng quan & Thống kê</div>
                      <div className="text-xs text-emerald-700 font-normal mt-1">
                        Báo cáo tỷ lệ chuyên cần, ma trận mốc buổi học và tiến độ CS
                      </div>
                    </div>
                    <span className="text-xs text-emerald-600 font-bold mt-3 inline-block">Truy cập Tổng quan &rarr;</span>
                  </a>

                  <a
                    href="/care"
                    className="p-5 bg-indigo-50/70 rounded-xl shadow-sm border border-indigo-200 hover:border-indigo-500 hover:shadow transition font-semibold text-indigo-900 flex flex-col justify-between"
                  >
                    <div>
                      <div className="text-base font-bold text-indigo-800">Chăm sóc Học viên & Việc cần làm</div>
                      <div className="text-xs text-indigo-700 font-normal mt-1">
                        Nhật ký trao đổi sau buổi học, việc cần gọi lại & điểm nóng
                      </div>
                    </div>
                    <span className="text-xs text-indigo-600 font-bold mt-3 inline-block">Xem Nhiệm vụ CS &rarr;</span>
                  </a>

                  <a
                    href="/enrollments"
                    className="p-5 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-blue-500 hover:shadow transition"
                  >
                    <div className="text-base font-bold text-gray-800">Quản lý Ghi danh</div>
                    <div className="text-xs text-gray-500 mt-1">Theo dõi tiến độ học tập và phân công nhân viên CS</div>
                  </a>

                  <a
                    href="/classes"
                    className="p-5 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-blue-500 hover:shadow transition"
                  >
                    <div className="text-base font-bold text-gray-800">Quản lý Lớp học</div>
                    <div className="text-xs text-gray-500 mt-1">Lịch học, danh sách buổi và điểm danh chuyên cần</div>
                  </a>

                  <a
                    href="/students"
                    className="p-5 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-blue-500 hover:shadow transition"
                  >
                    <div className="text-base font-bold text-gray-800">Quản lý Học viên</div>
                    <div className="text-xs text-gray-500 mt-1">Danh bạ học viên, phụ huynh và tài khoản Zalo</div>
                  </a>

                  <a
                    href="/packages"
                    className="p-5 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-blue-500 hover:shadow transition"
                  >
                    <div className="text-base font-bold text-gray-800">Quản lý Gói học</div>
                    <div className="text-xs text-gray-500 mt-1">Cấu hình các khóa học và số buổi định mức</div>
                  </a>

                  <a
                    href="/teachers"
                    className="p-5 bg-white rounded-xl shadow-sm border border-gray-200 hover:border-blue-500 hover:shadow transition"
                  >
                    <div className="text-base font-bold text-gray-800">Quản lý Giáo viên</div>
                    <div className="text-xs text-gray-500 mt-1">Hồ sơ giảng viên Việt Nam và Bản ngữ</div>
                  </a>

                  <a
                    href="/imports"
                    className="p-5 bg-blue-50/60 rounded-xl shadow-sm border border-blue-200 hover:border-blue-500 hover:shadow transition font-semibold text-blue-900"
                  >
                    <div className="text-base font-bold text-blue-800">Nhập & Xuất Excel</div>
                    <div className="text-xs text-blue-700 font-normal mt-1">Import Sheet 1 (Ghi danh) & Sheet 3 (Điểm danh)</div>
                  </a>

                  <a
                    href="/settings/users"
                    className="p-5 bg-gray-50 rounded-xl shadow-sm border border-gray-200 hover:border-blue-500 hover:shadow transition"
                  >
                    <div className="text-base font-bold text-gray-800">Quản trị Hệ thống</div>
                    <div className="text-xs text-gray-500 mt-1">Phân quyền tài khoản, nhóm CS và quản lý Admin</div>
                  </a>
                </div>
              </div>
            }
          />

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

            <Route path="/imports" element={<ImportsPage />} />
            <Route path="/nhap-xuat-excel" element={<Navigate to="/imports" replace />} />
          </Route>

          {/* Core Staff: Admin, Manage, CS */}
          <Route element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGE', 'CS']} />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/tong-quan" element={<Navigate to="/dashboard" replace />} />

            <Route path="/care" element={<CarePage />} />
            <Route path="/cham-soc" element={<Navigate to="/care" replace />} />

            <Route path="/students" element={<StudentsPage />} />
            <Route path="/hoc-vien" element={<Navigate to="/students" replace />} />

            <Route path="/classes" element={<ClassesPage />} />
            <Route path="/lop-hoc" element={<Navigate to="/classes" replace />} />

            <Route path="/classes/:classId/sessions" element={<ClassSessionsPage />} />
            <Route path="/lop-hoc/:classId/buoi-hoc" element={<ClassSessionsPage />} />

            <Route path="/classes/:classId/sessions/:sessionId/attendance" element={<AttendanceSheetPage />} />
            <Route path="/lop-hoc/:classId/buoi-hoc/:sessionId/diem-danh" element={<AttendanceSheetPage />} />

            <Route path="/enrollments" element={<EnrollmentsPage />} />
            <Route path="/ghi-danh" element={<Navigate to="/enrollments" replace />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
