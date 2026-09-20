import React, { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import { importsApi } from '../api/imports.api';
import { ImportType, UploadResponse, SheetPreviewData, ValidationReport, ImportBatchSummary } from '../types/imports.types';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowRight, Download, RefreshCw, FileText } from 'lucide-react';

interface ImportWizardProps {
  onImportComplete?: () => void;
}

export const ImportWizard: React.FC<ImportWizardProps> = ({ onImportComplete }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [importType, setImportType] = useState<ImportType>('STUDENT_ENROLLMENT');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Step 2 states
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);
  const [previewData, setPreviewData] = useState<SheetPreviewData | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [selectedSheet, setSelectedSheet] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Step 3 states
  const [isValidating, setIsValidating] = useState(false);
  const [validationReport, setValidationReport] = useState<ValidationReport | null>(null);

  // Step 4 states
  const [isConfirming, setIsConfirming] = useState(false);
  const [importResult, setImportResult] = useState<ImportBatchSummary | null>(null);

  // Field definitions for Sheet 1
  const sheet1Fields = [
    { key: 'external_id', label: 'ID Học viên (External ID)', required: false, desc: 'Cột A trong file' },
    { key: 'full_name', label: 'Họ tên Học viên', required: true, desc: 'Cột E trong file' },
    { key: 'phone', label: 'Số điện thoại', required: false, desc: 'Cột G trong file' },
    { key: 'email', label: 'Email', required: false, desc: 'Cột H trong file' },
    { key: 'package_code', label: 'Mã gói học', required: false, desc: 'Cột K trong file' },
    { key: 'total_sessions', label: 'Tổng số buổi', required: false, desc: 'Cột N trong file' },
    { key: 'remaining_sessions', label: 'Số buổi còn lại', required: false, desc: 'Cột T trong file' },
    { key: 'start_date', label: 'Ngày bắt đầu học', required: false, desc: 'Cột U trong file' },
    { key: 'status', label: 'Trạng thái học', required: false, desc: 'Cột V trong file' },
    { key: 'level', label: 'Trình độ / Level', required: false, desc: 'Cột M trong file' },
    { key: 'class_name', label: 'Tên lớp học', required: false, desc: 'Tên lớp phân công' },
    { key: 'sale_name', label: 'Sale phụ trách', required: false, desc: 'Cột C trong file' },
  ];

  // Field definitions for Sheet 3
  const sheet3Fields = [
    { key: 'external_id', label: 'ID Học viên (để khớp với Sheet 1)', required: true, desc: 'Cột A trong Sheet 3' },
    { key: 'full_name', label: 'Họ tên Học viên', required: false, desc: 'Cột B' },
    { key: 'class_name', label: 'Tên lớp học', required: false, desc: 'Cột W' },
  ];

  // Step 1: Upload File
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setErrorMsg('');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMsg('Vui lòng chọn file Excel');
      return;
    }

    try {
      setIsUploading(true);
      setErrorMsg('');
      const res = await importsApi.upload(selectedFile, importType);
      setUploadData(res);
      setSelectedSheet(res.selectedSheet);
      setPreviewData(res.preview);
      setColumnMapping(res.preview.suggestedMapping || {});
      setStep(2);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Có lỗi xảy ra khi tải file lên');
    } finally {
      setIsUploading(false);
    }
  };

  // Step 2: Switch sheet
  const handleSheetChange = async (newSheet: string) => {
    if (!uploadData) return;
    try {
      setIsLoadingPreview(true);
      setSelectedSheet(newSheet);
      const res = await importsApi.getPreview(uploadData.importId, newSheet);
      setPreviewData(res);
      setColumnMapping(res.suggestedMapping || {});
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Không thể tải sheet đã chọn');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleMappingChange = (field: string, colLetter: string) => {
    setColumnMapping((prev) => ({
      ...prev,
      [field]: colLetter,
    }));
  };

  const handleProceedToValidate = async () => {
    if (!uploadData) return;
    try {
      setIsValidating(true);
      setErrorMsg('');
      // Save mapping
      await importsApi.saveMapping(uploadData.importId, {
        sheetName: selectedSheet,
        columnMapping,
      });
      // Run validation
      const report = await importsApi.validate(uploadData.importId);
      setValidationReport(report);
      setStep(3);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Kiểm tra dữ liệu thất bại');
    } finally {
      setIsValidating(false);
    }
  };

  // Step 3: Confirm Import
  const handleConfirmImport = async () => {
    if (!uploadData) return;
    try {
      setIsConfirming(true);
      setErrorMsg('');
      const result = await importsApi.confirm(uploadData.importId, true);
      setImportResult(result);
      setStep(4);
      if (onImportComplete) onImportComplete();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || 'Thực hiện import thất bại');
    } finally {
      setIsConfirming(false);
    }
  };

  // Reset wizard
  const handleReset = () => {
    setStep(1);
    setSelectedFile(null);
    setUploadData(null);
    setPreviewData(null);
    setColumnMapping({});
    setValidationReport(null);
    setImportResult(null);
    setErrorMsg('');
  };

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between overflow-x-auto">
        {[
          { num: 1, title: 'Tải file lên' },
          { num: 2, title: 'Xem trước & Ánh xạ cột' },
          { num: 3, title: 'Kiểm tra dữ liệu' },
          { num: 4, title: 'Kết quả Import' },
        ].map((s, idx) => (
          <div key={s.num} className="flex items-center space-x-3 min-w-[160px]">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                step === s.num
                  ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                  : step > s.num
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {step > s.num ? <CheckCircle2 className="w-5 h-5" /> : s.num}
            </div>
            <span className={`text-sm font-medium ${step === s.num ? 'text-blue-600 font-semibold' : 'text-gray-600'}`}>
              {s.title}
            </span>
            {idx < 3 && <div className="hidden sm:block w-8 h-[2px] bg-gray-200 mx-2" />}
          </div>
        ))}
      </div>

      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center text-red-700 text-sm">
          <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* STEP 1: Upload & Type Selection */}
      {step === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">1. Chọn loại dữ liệu cần nhập</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div
                  onClick={() => setImportType('STUDENT_ENROLLMENT')}
                  className={`p-5 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                    importType === 'STUDENT_ENROLLMENT'
                      ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-100'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-gray-900">Sheet 1: Hồ sơ & Gói học</span>
                      {importType === 'STUDENT_ENROLLMENT' && <Badge variant="info">Đang chọn</Badge>}
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Nhập danh sách học viên, thông tin liên hệ, gói học, số buổi, ngày bắt đầu và trạng thái học.
                    </p>
                  </div>
                </div>

                <div
                  onClick={() => setImportType('ATTENDANCE')}
                  className={`p-5 rounded-xl border-2 cursor-pointer transition flex flex-col justify-between ${
                    importType === 'ATTENDANCE'
                      ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-100'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-gray-900">Sheet 3: Chấm buổi điểm danh</span>
                      {importType === 'ATTENDANCE' && <Badge variant="info">Đang chọn</Badge>}
                    </div>
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Nhập lịch sử điểm danh theo từng buổi học (mã 1, A, B, C, D, E) tự động khớp với ID học viên.
                    </p>
                  </div>
                </div>
              </div>

              <h2 className="text-lg font-bold text-gray-900 mb-2">2. Tải file Excel lên (.xlsx)</h2>
              <div className="border-2 border-dashed border-gray-300 hover:border-blue-500 rounded-xl p-8 text-center transition bg-gray-50/50">
                <FileSpreadsheet className="w-12 h-12 mx-auto text-blue-600 mb-3" />
                <label className="cursor-pointer">
                  <span className="inline-flex items-center px-4 py-2 border border-blue-600 rounded-lg text-sm font-medium text-blue-600 bg-white hover:bg-blue-50 transition shadow-sm">
                    <Upload className="w-4 h-4 mr-2" /> Chọn file từ máy tính
                  </span>
                  <input type="file" accept=".xlsx, .xls" onChange={handleFileChange} className="hidden" />
                </label>
                {selectedFile ? (
                  <p className="mt-3 text-sm text-green-700 font-medium">
                    File đã chọn: <span className="font-bold">{selectedFile.name}</span> ({(selectedFile.size / 1024).toFixed(1)} KB)
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">Chỉ chấp nhận file định dạng .xlsx hoặc .xls (Tối đa 25MB)</p>
                )}
              </div>

              <div className="mt-6 flex justify-end">
                <Button variant="primary" onClick={handleUpload} isLoading={isUploading} disabled={!selectedFile}>
                  Tiếp tục bước xem trước <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="p-6 bg-gradient-to-br from-blue-50 to-white border-blue-100">
              <h3 className="text-base font-bold text-gray-900 flex items-center mb-3">
                <FileText className="w-5 h-5 text-blue-600 mr-2" /> Tải file mẫu chuẩn
              </h3>
              <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                Để đảm bảo import không gặp lỗi định dạng, bạn có thể tải về file Excel mẫu đã chuẩn hóa các cột.
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => importsApi.downloadTemplate('student_enrollment')}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition text-xs font-semibold text-gray-800 flex items-center justify-between"
                >
                  <span>Mẫu Sheet 1 (Học viên & Gói)</span>
                  <Download className="w-4 h-4 text-gray-500" />
                </button>
                <button
                  type="button"
                  onClick={() => importsApi.downloadTemplate('attendance')}
                  className="w-full text-left p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition text-xs font-semibold text-gray-800 flex items-center justify-between"
                >
                  <span>Mẫu Sheet 3 (Chấm điểm danh)</span>
                  <Download className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* STEP 2: Preview & Column Mapping */}
      {step === 2 && previewData && uploadData && (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Xem trước & Ánh xạ cột dữ liệu</h2>
                <p className="text-xs text-gray-500 mt-1">
                  File: <span className="font-semibold text-gray-800">{uploadData.fileName}</span> — Tổng số dòng ước tính:{' '}
                  <span className="font-semibold text-blue-600">{previewData.totalRows}</span>
                </p>
              </div>

              {/* Sheet selector */}
              {uploadData.sheets.length > 1 && (
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-medium text-gray-600">Chọn Sheet:</span>
                  <select
                    value={selectedSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    disabled={isLoadingPreview}
                    className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {uploadData.sheets.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Column Mapping Section */}
            <div className="mb-6">
              <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center">
                <span>Cấu hình ánh xạ cột (Hệ thống đã tự động nhận diện)</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-gray-50/70 p-4 rounded-xl border border-gray-200">
                {(importType === 'STUDENT_ENROLLMENT' ? sheet1Fields : sheet3Fields).map((field) => (
                  <div key={field.key} className="space-y-1">
                    <label className="text-xs font-semibold text-gray-700 flex items-center justify-between">
                      <span>
                        {field.label} {field.required && <span className="text-red-500">*</span>}
                      </span>
                    </label>
                    <select
                      value={columnMapping[field.key] || ''}
                      onChange={(e) => handleMappingChange(field.key, e.target.value)}
                      className={`w-full text-xs rounded-lg px-3 py-2 border bg-white focus:outline-none focus:ring-2 ${
                        columnMapping[field.key]
                          ? 'border-blue-500 ring-1 ring-blue-200 font-semibold text-blue-900'
                          : 'border-gray-300 text-gray-500'
                      }`}
                    >
                      <option value="">-- Bỏ qua cột này --</option>
                      {previewData.headers.map((h) => (
                        <option key={h.col} value={h.col}>
                          Cột {h.col}: {h.title.substring(0, 30)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview Sample Rows Table */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-gray-800">Dữ liệu xem trước (5 dòng đầu tiên)</h3>
              <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-inner max-h-72">
                <table className="min-w-full divide-y divide-gray-200 text-xs text-left">
                  <thead className="bg-gray-100 font-semibold text-gray-700 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 border-r">Dòng</th>
                      {previewData.headers.slice(0, 15).map((h) => (
                        <th key={h.col} className="px-3 py-2 border-r whitespace-nowrap">
                          <span className="text-blue-600 font-bold mr-1">[{h.col}]</span>
                          {h.title || '(Trống)'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {previewData.rows.slice(0, 5).map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/40">
                        <td className="px-3 py-2 font-mono text-gray-500 border-r">{row._rowNumber}</td>
                        {previewData.headers.slice(0, 15).map((h) => (
                          <td key={h.col} className="px-3 py-2 border-r whitespace-nowrap text-gray-800">
                            {String(row[h.col] !== undefined ? row[h.col] : '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 flex justify-between items-center pt-4 border-t border-gray-100">
              <Button variant="outline" onClick={() => setStep(1)}>
                Quay lại
              </Button>
              <Button variant="primary" onClick={handleProceedToValidate} isLoading={isValidating}>
                Kiểm tra tính hợp lệ dữ liệu <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* STEP 3: Validation Report */}
      {step === 3 && validationReport && (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Báo cáo kiểm tra dữ liệu trước khi Import</h2>

            {/* Summary Stat Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-center">
                <span className="text-xs text-gray-500 font-medium">Tổng số dòng</span>
                <p className="text-2xl font-bold text-gray-900 mt-1">{validationReport.totalRows}</p>
              </div>

              <div className="p-4 bg-green-50 rounded-xl border border-green-200 text-center">
                <span className="text-xs text-green-700 font-medium">Dòng hợp lệ</span>
                <p className="text-2xl font-bold text-green-700 mt-1">{validationReport.validRows}</p>
              </div>

              <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-center">
                <span className="text-xs text-red-700 font-medium">Dòng phát hiện lỗi</span>
                <p className="text-2xl font-bold text-red-700 mt-1">{validationReport.invalidRows}</p>
              </div>

              <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-200 text-center">
                <span className="text-xs text-yellow-700 font-medium">Cảnh báo format</span>
                <p className="text-2xl font-bold text-yellow-700 mt-1">{validationReport.warnings.length}</p>
              </div>
            </div>

            {/* Status explanation */}
            {validationReport.invalidRows === 0 ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center text-green-800 text-sm mb-6">
                <CheckCircle2 className="w-5 h-5 text-green-600 mr-3 flex-shrink-0" />
                <span>
                  Tuyệt vời! Toàn bộ <strong>{validationReport.validRows}</strong> dòng dữ liệu đều hợp lệ và sẵn sàng để nhập vào hệ thống.
                </span>
              </div>
            ) : (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start text-amber-800 text-sm mb-6">
                <AlertTriangle className="w-5 h-5 text-amber-600 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Hệ thống phát hiện {validationReport.invalidRows} dòng dữ liệu có vấn đề.</p>
                  <p className="text-xs mt-1 text-amber-700 leading-relaxed">
                    Theo quy định, hệ thống sẽ nhập các dòng hợp lệ và ghi nhận các dòng lỗi riêng biệt để bạn tải file Excel về đối soát, tuyệt đối không sửa sai dữ liệu âm thầm.
                  </p>
                </div>
              </div>
            )}

            {/* Errors List */}
            {validationReport.errors.length > 0 && (
              <div className="space-y-3 mb-6">
                <h3 className="text-sm font-bold text-red-700">Chi tiết các dòng lỗi cần lưu ý:</h3>
                <div className="overflow-y-auto max-h-60 border border-red-100 rounded-xl">
                  <table className="min-w-full divide-y divide-gray-200 text-xs text-left">
                    <thead className="bg-red-50 text-red-800 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 font-semibold">Dòng Excel</th>
                        <th className="px-4 py-2 font-semibold">Cột / Trường</th>
                        <th className="px-4 py-2 font-semibold">Nội dung lỗi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {validationReport.errors.map((err, idx) => (
                        <tr key={idx} className="hover:bg-red-50/30">
                          <td className="px-4 py-2 font-mono font-bold text-gray-700">{err.rowNumber}</td>
                          <td className="px-4 py-2 font-medium text-gray-600">{err.field || 'Toàn dòng'}</td>
                          <td className="px-4 py-2 text-red-600 font-medium">{err.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t border-gray-100">
              <Button variant="outline" onClick={() => setStep(2)}>
                Quay lại ánh xạ cột
              </Button>
              <Button variant="primary" onClick={handleConfirmImport} isLoading={isConfirming}>
                Xác nhận bắt đầu Import <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* STEP 4: Import Results */}
      {step === 4 && importResult && (
        <Card className="p-8 text-center max-w-2xl mx-auto space-y-6">
          <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center bg-green-100 text-green-600">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900">Import dữ liệu hoàn tất!</h2>
            <p className="text-sm text-gray-600 mt-1">
              Trạng thái đợt import:{' '}
              <Badge variant={importResult.failed_rows === 0 ? 'success' : 'warning'}>
                {importResult.status === 'COMPLETED' ? 'Hoàn thành' : importResult.status === 'PARTIAL_FAILED' ? 'Lỗi một phần' : importResult.status === 'FAILED' ? 'Thất bại' : importResult.status}
              </Badge>
            </p>
          </div>

          {/* Results grid */}
          <div className="grid grid-cols-3 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200">
            <div>
              <span className="text-xs text-gray-500">Tổng số dòng xử lý</span>
              <p className="text-xl font-bold text-gray-900 mt-1">{importResult.total_rows}</p>
            </div>
            <div>
              <span className="text-xs text-green-700 font-semibold">Thành công</span>
              <p className="text-xl font-bold text-green-600 mt-1">{importResult.success_rows}</p>
            </div>
            <div>
              <span className="text-xs text-red-700 font-semibold">Thất bại</span>
              <p className="text-xl font-bold text-red-600 mt-1">{importResult.failed_rows}</p>
            </div>
          </div>

          {/* Error download button */}
          {importResult.failed_rows > 0 && (
            <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-left flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-red-800">Có {importResult.failed_rows} dòng bị lỗi</p>
                <p className="text-xs text-red-600">Tải file Excel chứa danh sách các dòng lỗi kèm lý do để điều chỉnh.</p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => importsApi.downloadErrors(importResult.id, `loi_import_${importResult.id}.xlsx`)}
              >
                <Download className="w-4 h-4 mr-2" /> Tải báo cáo lỗi (.xlsx)
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-4 pt-4 border-t border-gray-100">
            <Button variant="outline" onClick={handleReset}>
              <RefreshCw className="w-4 h-4 mr-2" /> Thực hiện đợt Import khác
            </Button>
            {importType === 'STUDENT_ENROLLMENT' ? (
              <a href="/students" className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition">
                Xem danh sách Học viên <ArrowRight className="w-4 h-4 ml-2" />
              </a>
            ) : (
              <a href="/classes" className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition">
                Xem Lớp học & Điểm danh <ArrowRight className="w-4 h-4 ml-2" />
              </a>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};
