import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageContainer } from '../../../components/common/PageContainer';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { ImportWizard } from '../components/ImportWizard';
import { ImportHistoryTable } from '../components/ImportHistoryTable';
import { GoogleSheetSyncPanel } from '../components/GoogleSheetSyncPanel';
import { CsSheetBackupPanel } from '../components/CsSheetBackupPanel';
import { AttendanceExcelImportPanel } from '../../attendance/components/AttendanceExcelImportPanel';
import { importsApi } from '../api/imports.api';
import { useAuth } from '../../../contexts/AuthContext';
import { ChevronRight, Download } from 'lucide-react';

type ImportTabValue = 'sheet-sync' | 'sheet-backup' | 'wizard' | 'attendance' | 'history';

const TAB_ORDER: ImportTabValue[] = ['sheet-sync', 'sheet-backup', 'wizard', 'attendance', 'history'];

const TAB_META: Record<ImportTabValue, { label: string; subtitle: string }> = {
  'sheet-sync': {
    label: 'Đồng bộ dữ liệu học viên',
    subtitle: 'Quản lý đồng bộ danh sách học viên từ Google Sheet về hệ thống theo mã CVHT',
  },
  'sheet-backup': {
    label: 'Backup sổ CSKH',
    subtitle: 'Quản lý sao lưu dữ liệu học viên và điểm danh',
  },
  wizard: {
    label: 'Upload Hồ sơ',
    subtitle: 'Tải lên file Excel hồ sơ học viên và ghi danh để đối chiếu nhập liệu',
  },
  attendance: {
    label: 'Điểm danh CSHV/GV',
    subtitle: 'Nhập bảng điểm danh từ file Excel của CSKH hoặc Giáo viên',
  },
  history: {
    label: 'Lịch sử nhập',
    subtitle: 'Theo dõi các đợt tải lên, trạng thái xử lý và tải danh sách dòng lỗi',
  },
};

export const ImportsPage: React.FC = () => {
  const toast = useToast();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isExportingStudents, setIsExportingStudents] = useState(false);
  const [isExportingAttendance, setIsExportingAttendance] = useState(false);

  const roles = useMemo(() => user?.roles ?? [], [user]);
  const isAdminOrManage = roles.includes('ADMIN') || roles.includes('MANAGE');
  const isCS = roles.includes('CS');

  const allowedTabs = useMemo<ImportTabValue[]>(() => {
    if (isAdminOrManage) return TAB_ORDER;
    if (isCS) return ['sheet-backup', 'wizard', 'attendance', 'history'];
    return ['sheet-backup', 'attendance', 'history'];
  }, [isAdminOrManage, isCS]);

  const defaultTab = allowedTabs[0];

  const resolveAllowedTab = useCallback(
    (rawTab: string | null): ImportTabValue => {
      if (rawTab && (allowedTabs as string[]).includes(rawTab)) {
        return rawTab as ImportTabValue;
      }
      return defaultTab;
    },
    [allowedTabs, defaultTab],
  );

  const [activeTab, setActiveTab] = useState<ImportTabValue>(() =>
    resolveAllowedTab(searchParams.get('tab')),
  );

  useEffect(() => {
    setActiveTab(resolveAllowedTab(searchParams.get('tab')));
  }, [searchParams, resolveAllowedTab]);

  const effectiveTab: ImportTabValue = allowedTabs.includes(activeTab) ? activeTab : defaultTab;

  const selectTab = (value: ImportTabValue) => {
    const next = resolveAllowedTab(value);
    setActiveTab(next);
    setSearchParams(
      (prev) => {
        prev.set('tab', next);
        return prev;
      },
      { replace: true },
    );
  };

  const handleExportStudents = async () => {
    try {
      setIsExportingStudents(true);
      await importsApi.exportStudents();
      toast.success('Xuất file danh sách học viên thành công!');
    } catch {
      toast.error('Không thể xuất file dữ liệu học viên. Vui lòng thử lại.');
    } finally {
      setIsExportingStudents(false);
    }
  };

  const handleExportAttendance = async () => {
    try {
      setIsExportingAttendance(true);
      await importsApi.exportAttendance();
      toast.success('Xuất bảng điểm danh thành công!');
    } catch {
      toast.error('Không thể xuất file điểm danh. Vui lòng thử lại.');
    } finally {
      setIsExportingAttendance(false);
    }
  };

  if (effectiveTab === 'sheet-sync') {
    return (
      <PageContainer>
        <GoogleSheetSyncPanel />
      </PageContainer>
    );
  }

  if (effectiveTab === 'sheet-backup') {
    return (
      <PageContainer>
        <CsSheetBackupPanel />
      </PageContainer>
    );
  }

  const currentMeta = TAB_META[effectiveTab];

  return (
    <PageContainer>
      <div className="space-y-5">
        {/* Breadcrumb & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <nav className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-1">
              <span>Nhập xuất dữ liệu</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-700 font-semibold">{currentMeta.label}</span>
            </nav>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {currentMeta.label}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">{currentMeta.subtitle}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportStudents}
              isLoading={isExportingStudents}
              leftIcon={<Download className="w-4 h-4 text-blue-600" />}
            >
              Xuất DS Học viên
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportAttendance}
              isLoading={isExportingAttendance}
              leftIcon={<Download className="w-4 h-4 text-teal-600" />}
            >
              Xuất Bảng Điểm danh
            </Button>
          </div>
        </div>

        {effectiveTab === 'wizard' && (
          <ImportWizard onImportComplete={() => selectTab('history')} />
        )}
        {effectiveTab === 'attendance' && <AttendanceExcelImportPanel />}
        {effectiveTab === 'history' && <ImportHistoryTable />}
      </div>
    </PageContainer>
  );
};
