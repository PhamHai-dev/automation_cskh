import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { ImportWizard } from '../components/ImportWizard';
import { ImportHistoryTable } from '../components/ImportHistoryTable';
import { GoogleSheetSyncPanel } from '../components/GoogleSheetSyncPanel';
import { AttendanceExcelImportPanel } from '../../attendance/components/AttendanceExcelImportPanel';
import { importsApi } from '../api/imports.api';
import { CalendarCheck, Download, History, RefreshCw, UploadCloud } from 'lucide-react';

export const ImportsPage: React.FC = () => {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'sheet-sync' | 'wizard' | 'attendance' | 'history'>(() => {
    const tab = searchParams.get('tab');
    if (tab === 'attendance') return 'attendance';
    if (tab === 'wizard') return 'wizard';
    if (tab === 'history') return 'history';
    return 'sheet-sync';
  });
  const [isExportingStudents, setIsExportingStudents] = useState(false);
  const [isExportingAttendance, setIsExportingAttendance] = useState(false);

  useEffect(() => {
    if (searchParams.get('tab') === 'attendance') setActiveTab('attendance');
  }, [searchParams]);

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
        value={activeTab}
        onChange={setActiveTab}
        className="mb-6"
        items={[
          { value: 'sheet-sync', label: 'Đồng bộ Google Sheet (JLPT & Kaiwa)', icon: <RefreshCw /> },
          { value: 'wizard', label: 'Upload Hồ sơ (Sheet 1)', icon: <UploadCloud /> },
          { value: 'attendance', label: 'Điểm danh CSKH / GV', icon: <CalendarCheck /> },
          { value: 'history', label: 'Lịch sử nhập', icon: <History /> },
        ]}
      />

      {activeTab === 'sheet-sync' && <GoogleSheetSyncPanel />}
      {activeTab === 'wizard' && <ImportWizard onImportComplete={() => setActiveTab('history')} />}
      {activeTab === 'attendance' && <AttendanceExcelImportPanel />}
      {activeTab === 'history' && <ImportHistoryTable />}
    </PageContainer>
  );
};
