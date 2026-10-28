import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '../../components/common/PageContainer';
import { PageHeader } from '../../components/common/PageHeader';
import { Button } from '../../components/ui/Button';
import { AutoAttendanceConfigCard } from './components/AutoAttendanceConfigCard';
import { SheetBackupAdminConfigCard } from './components/SheetBackupAdminConfigCard';
import { ArrowLeft, CalendarCheck, DatabaseBackup, ChevronRight } from 'lucide-react';

interface ConfigEntry {
  key: string;
  title: string;
  description: string;
  path: string;
  icon: React.ReactNode;
  iconWrap: string;
  border: string;
  hoverBorder: string;
}

/**
 * Trang Cấu hình Hệ thống (chỉ ADMIN) - dạng hub:
 * hiển thị 2 card ngang hàng, bấm vào card nào thì mở trang cấu hình đó.
 */
export const AdminConfigPage: React.FC = () => {
  const navigate = useNavigate();

  const entries: ConfigEntry[] = [
    {
      key: 'auto-attendance',
      title: 'Điểm danh tự động',
      description:
        'Cấu hình chu kỳ tự động điểm danh học viên dựa trên giờ vào lớp, số phút trễ cho phép và chạy quét ngay.',
      path: '/settings/config/auto-attendance',
      icon: <CalendarCheck className="w-6 h-6 text-blue-600" />,
      iconWrap: 'bg-blue-50 border-blue-100',
      border: 'border-blue-200/80',
      hoverBorder: 'hover:border-blue-400',
    },
    {
      key: 'sheet-backup',
      title: 'Cấu hình Backup dữ liệu',
      description:
        'Cấu hình Google Service Account JSON và chọn cột được đổ data ra Sheet cho học viên Kaiwa (1.Chăm sóc & 3.Chấm buổi) và JLPT (Data JLPT_Inhouse & Chấm buổi).',
      path: '/settings/config/sheet-backup',
      icon: <DatabaseBackup className="w-6 h-6 text-indigo-600" />,
      iconWrap: 'bg-indigo-50 border-indigo-100',
      border: 'border-indigo-200/80',
      hoverBorder: 'hover:border-indigo-400',
    },
  ];

  return (
    <PageContainer>
      <PageHeader title="Cấu hình Hệ thống" />

      <p className="text-xs text-slate-600 -mt-2 mb-4">
        Chọn một mục bên dưới để mở trang cấu hình tương ứng.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl">
        {entries.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => navigate(entry.path)}
            className={`group text-left bg-surface rounded-2xl border ${entry.border} ${entry.hoverBorder} p-5 shadow-soft transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-12 h-12 rounded-xl border flex items-center justify-center shrink-0 shadow-xs ${entry.iconWrap}`}
              >
                {entry.icon}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-1.5">
                  {entry.title}
                  <ChevronRight className="w-4 h-4 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-600" />
                </h3>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{entry.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </PageContainer>
  );
};

export const AutoAttendanceConfigPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <PageContainer>
      <PageHeader
        title="Điểm danh tự động"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/settings/config')}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          >
            Quay lại Cấu hình
          </Button>
        }
      />
      <AutoAttendanceConfigCard />
    </PageContainer>
  );
};

export const SheetBackupAdminConfigPage: React.FC = () => {
  const navigate = useNavigate();
  return (
    <PageContainer>
      <PageHeader
        title="Cấu hình Backup dữ liệu"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/settings/config')}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          >
            Quay lại Cấu hình
          </Button>
        }
      />
      <SheetBackupAdminConfigCard />
    </PageContainer>
  );
};

