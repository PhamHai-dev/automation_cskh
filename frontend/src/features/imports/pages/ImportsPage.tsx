import React, { useState } from 'react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
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
        description="Nhập dữ liệu thực tế từ Sheet 1 (Hồ sơ học viên) và Sheet 3 (Chấm điểm danh theo ngày), kiểm tra lỗi và xuất dữ liệu đối soát."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportStudents}
              isLoading={isExportingStudents}
            >
              <Download className="w-4 h-4 mr-1.5 text-blue-600" /> Xuất DS Học viên
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportAttendance}
              isLoading={isExportingAttendance}
            >
              <Download className="w-4 h-4 mr-1.5 text-teal-600" /> Xuất Bảng Điểm danh
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="border-b border-slate-200 mb-6">
        <nav className="flex space-x-6">
          <button
            type="button"
            onClick={() => setActiveTab('wizard')}
            className={`pb-3 px-1 border-b-2 font-bold text-xs flex items-center transition-all ${activeTab === 'wizard'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
          >
            <UploadCloud className="w-4 h-4 mr-2" />
            Nhập dữ liệu mới (Wizard)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-3 px-1 border-b-2 font-bold text-xs flex items-center transition-all ${activeTab === 'history'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
          >
            <History className="w-4 h-4 mr-2" />
            Lịch sử Import
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'wizard' ? (
        <ImportWizard onImportComplete={() => setActiveTab('history')} />
      ) : (
        <ImportHistoryTable />
      )}
    </PageContainer>
  );
};
