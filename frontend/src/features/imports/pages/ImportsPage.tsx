import React, { useState } from 'react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { ImportWizard } from '../components/ImportWizard';
import { ImportHistoryTable } from '../components/ImportHistoryTable';
import { importsApi } from '../api/imports.api';
import { Download, UploadCloud, History } from 'lucide-react';

export const ImportsPage: React.FC = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'wizard' | 'history'>('wizard');
  const [isExportingStudents, setIsExportingStudents] = useState(false);
  const [isExportingAttendance, setIsExportingAttendance] = useState(false);

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
          { value: 'wizard', label: 'Nhập dữ liệu', icon: <UploadCloud /> },
          { value: 'history', label: 'Lịch sử nhập', icon: <History /> },
        ]}
      />

      {/* Tab Content */}
      {activeTab === 'wizard' ? (
        <ImportWizard onImportComplete={() => setActiveTab('history')} />
      ) : (
        <ImportHistoryTable />
      )}
    </PageContainer>
  );
};
