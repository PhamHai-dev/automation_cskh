import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Calendar,
  Clock,
  Upload,
  CheckCircle2,
  BookOpen,
  User,
  FileSpreadsheet,
  Check,
} from 'lucide-react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { useToast } from '../../../components/ui/Toast';
import { reconciliationApi } from '../api/reconciliation.api';
import { AttendanceStatus } from '../types/reconciliation.types';

export const MyTeachingSessionsPage: React.FC = () => {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Date filters
  const [dateRangeFilter, setDateRangeFilter] = useState<'today' | 'week' | 'month'>('today');

  // Mark Attendance Modal
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [selectedEnrollmentClass, setSelectedEnrollmentClass] = useState<any | null>(null);
  const [selectedAttendance, setSelectedAttendance] = useState<any | null>(null);
  const [isMarkModalOpen, setIsMarkModalOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<AttendanceStatus>('ATTENDED');
  const [lessonTopic, setLessonTopic] = useState('');
  const [teacherNote, setTeacherNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Upload modal & summary
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any | null>(null);

  const calculateDates = useCallback(() => {
    const today = new Date();
    if (dateRangeFilter === 'today') {
      const ymd = today.toISOString().slice(0, 10);
      return { start: ymd, end: ymd };
    }
    if (dateRangeFilter === 'week') {
      const curr = new Date(today);
      const first = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1);
      const firstDay = new Date(curr.setDate(first));
      const lastDay = new Date(firstDay);
      lastDay.setDate(firstDay.getDate() + 6);
      return {
        start: firstDay.toISOString().slice(0, 10),
        end: lastDay.toISOString().slice(0, 10),
      };
    }
    // month
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      start: firstDay.toISOString().slice(0, 10),
      end: lastDay.toISOString().slice(0, 10),
    };
  }, [dateRangeFilter]);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const { start, end } = calculateDates();
      const data = await reconciliationApi.getTeacherSessions({ startDate: start, endDate: end });
      setSessions(data || []);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể tải lịch dạy của bạn');
    } finally {
      setIsLoading(false);
    }
  }, [calculateDates, toast]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleOpenMarkModal = (session: any, ec: any, status: AttendanceStatus) => {
    setSelectedSession(session);
    setSelectedEnrollmentClass(ec);
    const existingAtt = ec.attendance?.[0];
    setSelectedAttendance(existingAtt || null);
    setSelectedStatus(status);
    setLessonTopic(existingAtt?.lesson_topic || '');
    setTeacherNote(existingAtt?.teacher_note || '');
    setIsMarkModalOpen(true);
  };

  const handleConfirmMark = async () => {
    if (!selectedSession || !selectedEnrollmentClass) return;

    setIsSubmitting(true);
    try {
      const attendanceId = selectedAttendance?.id;

      if (!attendanceId) {
        toast.warning('Buổi học chưa có hồ sơ điểm danh ban đầu. Vui lòng liên hệ CSKH.');
        return;
      }

      await reconciliationApi.markByTeacher(attendanceId, {
        status: selectedStatus,
        lessonTopic: selectedStatus === 'ATTENDED' ? lessonTopic.trim() || undefined : undefined,
        note: teacherNote.trim() || undefined,
        rawValue: selectedStatus === 'ATTENDED' ? `${selectedEnrollmentClass.enrollment?.student?.external_id || ''}-${lessonTopic.trim()}` : undefined,
      });

      toast.success('Điểm danh thành công! Dữ liệu đã được gửi đối soát với CSKH.');
      setIsMarkModalOpen(false);
      loadSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Không thể ghi nhận điểm danh');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadResult(null);
    try {
      const result = await reconciliationApi.uploadTeacherExcel(file);
      setUploadResult(result);
      toast.success(`Tải lên thành công! Đã xử lý ${result.processedCount} lượt điểm danh.`);
      loadSessions();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi tải file giao_vien.xlsx');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Lịch Dạy & Điểm Danh Của Tôi"
        description="Xem ca học hôm nay/tuần này, điểm danh nhanh bài học hoặc nhập workbook qua luồng preview/xác nhận an toàn."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              onClick={() => { window.location.assign('/imports?tab=attendance'); }}
            >
              <Upload className="w-4 h-4 mr-1.5" />
              Nhập workbook điểm danh
            </Button>
          </div>
        }
      />

      {/* Date Filter Bar */}
      <Card className="p-4 mb-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={dateRangeFilter === 'today' ? 'primary' : 'outline'}
              onClick={() => setDateRangeFilter('today')}
            >
              Hôm nay
            </Button>
            <Button
              size="sm"
              variant={dateRangeFilter === 'week' ? 'primary' : 'outline'}
              onClick={() => setDateRangeFilter('week')}
            >
              Tuần này
            </Button>
            <Button
              size="sm"
              variant={dateRangeFilter === 'month' ? 'primary' : 'outline'}
              onClick={() => setDateRangeFilter('month')}
            >
              Tháng này
            </Button>
          </div>

          <div className="text-xs text-text-muted flex items-center gap-2">
            <Calendar className="w-4 h-4 text-text-muted" />
            <span>
              Tổng số ca dạy: <strong className="text-text-primary font-bold">{sessions.length}</strong>
            </span>
          </div>
        </div>
      </Card>

      {/* Sessions Grid */}
      {isLoading ? (
        <div className="py-12 text-center text-text-muted">Đang tải lịch dạy...</div>
      ) : sessions.length === 0 ? (
        <Card className="py-12 text-center">
          <Calendar className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-60" />
          <h3 className="text-base font-semibold text-text-primary">Không có ca dạy nào trong khoảng thời gian này</h3>
          <p className="text-xs text-text-secondary mt-1">
            Chọn bộ lọc "Tuần này" hoặc "Tháng này" để xem các buổi học sắp tới.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((session) => {
            const dateStr = new Date(session.session_date).toLocaleDateString('vi-VN', {
              weekday: 'short',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            });

            return (
              <Card key={session.id} className="p-4 flex flex-col justify-between border-border/80 hover:border-teal-500/50 transition-all">
                <div>
                  {/* Top Header */}
                  <div className="flex items-center justify-between border-b border-border/60 pb-2.5 mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-teal-600" />
                      <span className="font-bold text-sm text-text-primary">
                        {session.start_time || '19:00'} - {session.end_time || '19:30'}
                      </span>
                    </div>
                    <span className="text-xs text-text-muted font-medium">{dateStr}</span>
                  </div>

                  {/* Class & Student info */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-muted">Lớp học:</span>
                      <span className="font-semibold text-text-primary">{session.class?.class_name}</span>
                    </div>

                    {session.class?.enrollment_classes?.map((ec: any) => {
                      const student = ec.enrollment?.student;
                      const att = ec.attendance?.find((a: any) => a.class_session_id === session.id) || ec.attendance?.[0];

                      return (
                        <div key={ec.id} className="bg-surface-muted/60 p-3 rounded-xl border border-border/60">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="font-bold text-sm text-text-primary flex items-center gap-1.5">
                                <User className="w-3.5 h-3.5 text-text-muted" />
                                {student?.full_name}
                              </div>
                              <div className="text-xs text-text-muted mt-0.5">
                                Mã HV: {student?.external_id || 'N/A'} • {student?.phone || 'Chưa có SĐT'}
                              </div>
                            </div>
                            <div>
                              {att?.reconciliation_state === 'MATCHED' ? (
                                <Badge variant="success" size="sm" dot>
                                  Khớp CSKH
                                </Badge>
                              ) : att?.reconciliation_state === 'CONFLICT' ? (
                                <Badge variant="danger" size="sm" dot>
                                  Lệch ý kiến
                                </Badge>
                              ) : att?.teacher_status ? (
                                <Badge variant="warning" size="sm" dot>
                                  Chờ CS duyệt
                                </Badge>
                              ) : (
                                <Badge variant="neutral" size="sm">
                                  Chưa điểm danh
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Attendance Info if marked */}
                          {att?.teacher_status && (
                            <div className="mt-2 text-xs text-text-secondary bg-surface p-2 rounded-lg border border-border/40">
                              <span className="font-semibold text-teal-700">Đã báo: </span>
                              {att.teacher_status === 'ATTENDED' ? (
                                <span>Đã học {att.lesson_topic ? `(Bài: ${att.lesson_topic})` : ''}</span>
                              ) : (
                                <span>{att.teacher_status}</span>
                              )}
                              {att.teacher_note && <div className="italic mt-0.5">"{att.teacher_note}"</div>}
                            </div>
                          )}

                          {/* Quick Mark Buttons for this student */}
                          <div className="mt-3 pt-2.5 border-t border-border/40">
                            <span className="text-[11px] font-semibold text-text-muted block mb-1.5">
                              Điểm danh nhanh:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              <Button
                                size="sm"
                                variant="primary"
                                className="h-7 text-xs px-2.5 bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => handleOpenMarkModal(session, ec, 'ATTENDED')}
                              >
                                <Check className="w-3.5 h-3.5 mr-1" />
                                Đã học
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2"
                                onClick={() => handleOpenMarkModal(session, ec, 'ABSENT_APPROVED_A')}
                              >
                                Nghỉ phép (A)
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2 text-rose-600 border-rose-300 hover:bg-rose-50"
                                onClick={() => handleOpenMarkModal(session, ec, 'ABSENT_UNAPPROVED_C')}
                              >
                                Vắng (C)
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs px-2 text-text-muted"
                                onClick={() => handleOpenMarkModal(session, ec, 'LEAVE_B')}
                              >
                                Bảo lưu (B)
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* MODAL: Điểm danh buổi học */}
      <Modal
        isOpen={isMarkModalOpen}
        onClose={() => setIsMarkModalOpen(false)}
        title={
          <div className="flex items-center gap-2 text-text-primary font-bold">
            <BookOpen className="w-5 h-5 text-teal-600" />
            <span>Điểm danh ca dạy: {selectedSession?.start_time || '19:00'} - {selectedSession?.end_time || '19:30'}</span>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => setIsMarkModalOpen(false)}
              disabled={isSubmitting}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmMark}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu Điểm Danh'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-surface-muted/60 p-3 rounded-xl border border-border/60 text-xs">
            <p className="font-bold text-text-primary text-sm">
              {selectedEnrollmentClass?.enrollment?.student?.full_name}
            </p>
            <p className="text-text-muted mt-0.5">
              Mã HV: {selectedEnrollmentClass?.enrollment?.student?.external_id || 'N/A'} • Lớp: {selectedSession?.class?.class_name}
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Trạng thái điểm danh
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={selectedStatus === 'ATTENDED' ? 'primary' : 'outline'}
                className="justify-start text-xs h-9"
                onClick={() => setSelectedStatus('ATTENDED')}
              >
                🟢 Đã học (ATTENDED)
              </Button>
              <Button
                type="button"
                variant={selectedStatus === 'ABSENT_APPROVED_A' ? 'primary' : 'outline'}
                className="justify-start text-xs h-9"
                onClick={() => setSelectedStatus('ABSENT_APPROVED_A')}
              >
                🟡 Nghỉ có phép (A)
              </Button>
              <Button
                type="button"
                variant={selectedStatus === 'ABSENT_UNAPPROVED_C' ? 'primary' : 'outline'}
                className="justify-start text-xs h-9"
                onClick={() => setSelectedStatus('ABSENT_UNAPPROVED_C')}
              >
                🔴 Nghỉ không phép (C)
              </Button>
              <Button
                type="button"
                variant={selectedStatus === 'LEAVE_B' ? 'primary' : 'outline'}
                className="justify-start text-xs h-9"
                onClick={() => setSelectedStatus('LEAVE_B')}
              >
                ⚪ Bảo lưu (B)
              </Button>
            </div>
          </div>

          {selectedStatus === 'ATTENDED' && (
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Tên bài học / Chủ đề bài giảng <span className="text-teal-600 font-normal">(VD: K2 L4, K1-L1...)</span>
              </label>
              <Input
                placeholder="Ví dụ: K2 L4 hoặc Kaiwa 2 Bài 4"
                value={lessonTopic}
                onChange={(e) => setLessonTopic(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1">
              Ghi chú của giáo viên (tùy chọn)
            </label>
            <Textarea
              placeholder="Ghi nhận thái độ học viên, lỗi phát âm, nhắc nhở làm BTVN..."
              rows={2}
              value={teacherNote}
              onChange={(e) => setTeacherNote(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* MODAL: Upload file giao_vien.xlsx */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => {
          setIsUploadModalOpen(false);
          setUploadResult(null);
        }}
        title={
          <div className="flex items-center gap-2 text-text-primary font-bold">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <span>Tải lên file lịch dạy giáo viên (giao_vien.xlsx)</span>
          </div>
        }
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => {
                setIsUploadModalOpen(false);
                setUploadResult(null);
              }}
            >
              Đóng
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="border-2 border-dashed border-border/80 hover:border-teal-500 rounded-2xl p-6 text-center bg-surface-muted/30 transition-all">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileUpload}
            />
            <FileSpreadsheet className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <p className="font-semibold text-sm text-text-primary">
              Chọn file Excel giao_vien.xlsx của bạn
            </p>
            <p className="text-xs text-text-secondary mt-1">
              Hệ thống tự động đọc sheet "2026 スケジュール", bóc tách mã học viên và tên bài học (VD: 420289324-K2 L4).
            </p>
            <Button
              variant="primary"
              className="mt-4"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? 'Đang đọc và đối soát file...' : 'Chọn file từ máy tính'}
            </Button>
          </div>

          {uploadResult && (
            <div className="bg-surface p-4 rounded-xl border border-border/80 space-y-2">
              <h4 className="font-bold text-sm text-text-primary flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Kết quả đối soát file Excel:
              </h4>
              <div className="grid grid-cols-3 gap-2 pt-2 text-center">
                <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg">
                  <span className="text-xs text-emerald-700 font-medium">Khớp CSKH</span>
                  <p className="text-lg font-bold text-emerald-700">{uploadResult.matchedCount}</p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg">
                  <span className="text-xs text-amber-700 font-medium">Chờ đối soát</span>
                  <p className="text-lg font-bold text-amber-700">{uploadResult.pendingCount}</p>
                </div>
                <div className="bg-rose-500/10 border border-rose-500/20 p-2 rounded-lg">
                  <span className="text-xs text-rose-700 font-medium">Lệch ý kiến</span>
                  <p className="text-lg font-bold text-rose-700">{uploadResult.conflictCount}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </PageContainer>
  );
};
