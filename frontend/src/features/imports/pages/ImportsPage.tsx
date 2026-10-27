import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { ImportWizard } from '../components/ImportWizard';
import { ImportHistoryTable } from '../components/ImportHistoryTable';
import { GoogleSheetSyncPanel } from '../components/GoogleSheetSyncPanel';
import { CsSheetBackupPanel } from '../components/CsSheetBackupPanel';
import { AttendanceExcelImportPanel } from '../../attendance/components/AttendanceExcelImportPanel';
import { importsApi } from '../api/imports.api';
import { useAuth } from '../../../contexts/AuthContext';
import { CalendarCheck, DatabaseBackup, Download, History, RefreshCw, UploadCloud } from 'lucide-react';

type ImportTabValue = 'sheet-sync' | 'sheet-backup' | 'wizard' | 'attendance' | 'history';

const TAB_ORDER: ImportTabValue[] = ['sheet-sync', 'sheet-backup', 'wizard', 'attendance', 'history'];

const TAB_LABELS: Record<ImportTabValue, { label: string; icon: React.ReactNode }> = {
  'sheet-sync': { label: 'Đồng bộ Google Sheet (JLPT & Kaiwa)', icon: <RefreshCw /> },
  'sheet-backup': { label: 'Backup Sổ CSKH (Kaiwa & JLPT)', icon: <DatabaseBackup /> },
  wizard: { label: 'Upload Hồ sơ (Sheet 1)', icon: <UploadCloud /> },
  attendance: { label: 'Điểm danh CSKH / GV', icon: <CalendarCheck /> },
  history: { label: 'Lịch sử nhập', icon: <History /> },
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

  // Tab khả dụng theo vai trò (khớp guard backend trong imports.routes.ts):
  // - ADMIN/MANAGE: toàn bộ 5 tab (sheet-sync guard ADMIN+MANAGE)
  // - CS: sheet-backup (GET configs cho phép CS) + wizard/attendance/history
  // - TEACHER (và vai trò khác): chỉ attendance + history
  const allowedTabs = useMemo<ImportTabValue[]>(() => {
    if (isAdminOrManage) return TAB_ORDER;
    if (isCS) return TAB_ORDER.filter((t) => t !== 'sheet-sync');
    return ['attendance', 'history'];
  }, [isAdminOrManage, isCS]);

  // Tab mặc định = tab đầu tiên được phép (ADMIN/MANAGE→sheet-sync, CS→sheet-backup, TEACHER→attendance)
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
    } catch (err) {
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
    } catch (err) {
      toast.error('Không thể xuất file điểm danh. Vui lòng thử lại.');
    } finally {
      setIsExportingAttendance(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Nhập & Xuất Dữ Liệu Excel"
        actions={
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
        }
      />

      <HorizontalTabs
        ariaLabel="Nhập và xuất dữ liệu"
        value={effectiveTab}
        onChange={selectTab}
        className="mb-6"
        items={allowedTabs.map((tab) => ({
          value: tab,
          ...TAB_LABELS[tab],
        }))}
      />

      {effectiveTab === 'sheet-sync' && <GoogleSheetSyncPanel />}
      {effectiveTab === 'sheet-backup' && <CsSheetBackupPanel />}
      {effectiveTab === 'wizard' && <ImportWizard onImportComplete={() => selectTab('history')} />}
      {effectiveTab === 'attendance' && <AttendanceExcelImportPanel />}
      {effectiveTab === 'history' && <ImportHistoryTable />}
    </PageContainer>
  );
};
