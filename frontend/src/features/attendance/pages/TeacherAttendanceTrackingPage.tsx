import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, ClipboardCheck, History, Search, UserRoundCheck } from 'lucide-react';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { DataTable, type Column } from '../../../components/common/DataTable';
import { HorizontalTabs } from '../../../components/ui/HorizontalTabs';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { Modal } from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { classesApi } from '../../classes/api/classes.api';
import type { Class } from '../../classes/types/classes.types';
import { teachersApi } from '../../teachers/api/teachers.api';
import type { Teacher } from '../../teachers/types/teachers.types';
import { reconciliationApi } from '../api/reconciliation.api';
import type {
  AttendanceStatus,
  TeacherTrackingHistoryItem,
  TeacherTrackingPendingItem,
} from '../types/reconciliation.types';

type TrackingTab = 'pending' | 'history';

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: 'ATTENDED', label: 'Có mặt' },
  { value: 'ABSENT_APPROVED_A', label: 'Vắng có phép (A)' },
  { value: 'LEAVE_B', label: 'Nghỉ phép (B)' },
  { value: 'ABSENT_UNAPPROVED_C', label: 'Vắng không phép (C)' },
  { value: 'TEACHER_ABSENT_D', label: 'Giáo viên vắng (D)' },
  { value: 'TECH_ERROR_E', label: 'Lỗi kỹ thuật (E)' },
];

const statusLabel = (status: AttendanceStatus) =>
  STATUS_OPTIONS.find((option) => option.value === status)?.label || status;

const dateLabel = (value: string) => new Date(value).toLocaleDateString('vi-VN');
const dateTimeLabel = (value: string) => new Date(value).toLocaleString('vi-VN');

export const TeacherAttendanceTrackingPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();
  const isPrivileged = !!user?.roles.some((role) => role === 'ADMIN' || role === 'MANAGE');

  const [tab, setTab] = useState<TrackingTab>('pending');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [teacherId, setTeacherId] = useState<number | undefined>();
  const [classId, setClassId] = useState<number | undefined>();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [pending, setPending] = useState<TeacherTrackingPendingItem[]>([]);
  const [history, setHistory] = useState<TeacherTrackingHistoryItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<TeacherTrackingPendingItem | null>(null);
  const [status, setStatus] = useState<AttendanceStatus | ''>('');
  const [lessonTopic, setLessonTopic] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const hasContext = !isPrivileged || !!teacherId;
  const query = useMemo(() => ({
    teacherId,
    classId,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    search: appliedSearch || undefined,
    page,
    pageSize,
  }), [teacherId, classId, startDate, endDate, appliedSearch, page, pageSize]);

  useEffect(() => {
    Promise.all([
      classesApi.list(),
      isPrivileged ? teachersApi.list() : Promise.resolve([]),
    ]).then(([classItems, teacherItems]) => {
      setClasses(classItems.filter((item) => item.active));
      setTeachers(teacherItems.filter((item) => item.active && item.user_id));
    }).catch(() => toast.error('Không thể tải dữ liệu bộ lọc'));
  }, [isPrivileged, toast]);

  const loadCount = useCallback(async () => {
    if (!hasContext) return setPendingCount(0);
    try {
      const result = await reconciliationApi.getTeacherTrackingCount({ teacherId, classId });
      setPendingCount(result.count);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thể tải số lượt chờ điểm danh');
    }
  }, [hasContext, teacherId, classId, toast]);

  const loadData = useCallback(async () => {
    if (!hasContext) {
      setPending([]);
      setHistory([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      if (tab === 'pending') {
        const result = await reconciliationApi.getTeacherTrackingPending(query);
        setPending(result.items);
        setTotal(result.total);
      } else {
        const result = await reconciliationApi.getTeacherTrackingHistory(query);
        setHistory(result.items);
        setTotal(result.total);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thể tải dữ liệu theo dõi điểm danh');
    } finally {
      setLoading(false);
    }
  }, [hasContext, query, tab, toast]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadCount(); }, [loadCount]);

  const openMarkModal = (item: TeacherTrackingPendingItem) => {
    setSelected(item);
    setStatus('');
    setLessonTopic('');
    setNote('');
  };

  const submitMark = async () => {
    if (!selected || !status) return;
    setSubmitting(true);
    try {
      await reconciliationApi.markByTeacher(selected.id, {
        status,
        teacherId,
        lessonTopic: status === 'ATTENDED' ? lessonTopic.trim() || undefined : undefined,
        note: note.trim() || undefined,
      });
      toast.success('Đã ghi nhận điểm danh và gửi đối soát');
      setSelected(null);
      await Promise.all([loadData(), loadCount()]);
      window.dispatchEvent(new Event('teacher-attendance-updated'));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thể ghi nhận điểm danh');
    } finally {
      setSubmitting(false);
    }
  };

  const resetFilters = () => {
    setClassId(undefined);
    setStartDate('');
    setEndDate('');
    setSearch('');
    setAppliedSearch('');
    setPage(1);
  };

  const pendingColumns: Column<TeacherTrackingPendingItem>[] = [
    { header: 'Ngày / giờ', cell: (item) => <div><div className="font-semibold">{dateLabel(item.session.session_date)}</div><div className="text-xs text-text-muted">{item.session.start_time || '—'} – {item.session.end_time || '—'}</div></div> },
    { header: 'Học viên', cell: (item) => <div><div className="font-semibold">{item.student.full_name}</div><div className="text-xs text-text-muted">{item.student.external_id || 'Chưa có mã'} · {item.student.phone || 'Chưa có SĐT'}</div></div> },
    { header: 'Lớp / buổi', cell: (item) => <div><div className="font-medium">{item.class.class_name}</div><div className="text-xs text-text-muted">Buổi {item.session.session_number}</div></div> },
    { header: 'Trạng thái', cell: () => <Badge variant="warning" dot>Chưa điểm danh</Badge> },
    { header: '', className: 'text-right', cell: (item) => <Button id={`mark-attendance-${item.id}`} size="sm" onClick={() => openMarkModal(item)}><ClipboardCheck className="h-4 w-4 mr-1.5" />Điểm danh</Button> },
  ];

  const historyColumns: Column<TeacherTrackingHistoryItem>[] = [
    { header: 'Thời gian đổi', cell: (item) => <span className="whitespace-nowrap">{dateTimeLabel(item.created_at)}</span> },
    { header: 'Học viên', cell: (item) => <div><div className="font-semibold">{item.student?.full_name || '—'}</div><div className="text-xs text-text-muted">{item.student?.external_id || 'Chưa có mã'}</div></div> },
    { header: 'Lớp / buổi', cell: (item) => <div><div className="font-medium">{item.class?.class_name || '—'}</div><div className="text-xs text-text-muted">{item.session ? `${dateLabel(item.session.session_date)} · Buổi ${item.session.session_number}` : '—'}</div></div> },
    { header: 'Thay đổi', cell: (item) => <div className="flex items-center gap-2 whitespace-nowrap"><Badge variant="neutral">{statusLabel(item.from_status)}</Badge><span className="text-text-muted">→</span><Badge variant="accent">{statusLabel(item.to_status)}</Badge></div> },
    { header: 'Ghi chú', cell: (item) => <span className="text-text-secondary">{item.note || '—'}</span> },
    { header: 'Người thao tác', cell: (item) => <span className="font-medium">{item.performed_by}</span> },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Theo dõi điểm danh"
        description="Hoàn tất các lượt CSKH đã ghi nhận và xem lịch sử thay đổi trạng thái của giáo viên."
      />

      {isPrivileged && (
        <Card className="mb-5 p-4 sm:p-5 bg-gradient-to-r from-primary-soft/80 to-surface">
          <div className="max-w-md">
            <Select
              id="tracking-teacher-select"
              label="Giáo viên cần theo dõi"
              value={teacherId || ''}
              onChange={(event) => { setTeacherId(event.target.value ? Number(event.target.value) : undefined); setPage(1); }}
              options={[{ value: '', label: 'Chọn giáo viên...' }, ...teachers.map((teacher) => ({ value: teacher.user_id!, label: `${teacher.name} · ${teacher.code}` }))]}
              helperText="Dữ liệu và thao tác điểm danh sẽ được giới hạn theo giáo viên đã chọn."
            />
          </div>
        </Card>
      )}

      <HorizontalTabs
        ariaLabel="Theo dõi điểm danh giáo viên"
        value={tab}
        onChange={(value) => { setTab(value); setPage(1); }}
        className="mb-5"
        items={[
          { value: 'pending', label: 'CSKH đã điểm danh', icon: <CalendarClock />, badge: pendingCount },
          { value: 'history', label: 'Lịch sử thay đổi', icon: <History /> },
        ]}
      />

      {!hasContext ? (
        <Card className="p-10 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary"><UserRoundCheck className="h-7 w-7" /></div>
          <h2 className="font-bold text-text-primary">Chọn giáo viên để bắt đầu</h2>
          <p className="mt-1 text-sm text-text-muted">Hệ thống không trộn dữ liệu của nhiều giáo viên trong cùng một danh sách.</p>
        </Card>
      ) : (
        <>
          <Card className="mb-5 p-4">
            <form className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={(event) => { event.preventDefault(); setAppliedSearch(search.trim()); setPage(1); }}>
              <Input id="tracking-search" label="Tìm học viên" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tên, mã hoặc SĐT" leftIcon={<Search className="h-4 w-4" />} />
              <Select id="tracking-class" label="Lớp học" value={classId || ''} onChange={(event) => { setClassId(event.target.value ? Number(event.target.value) : undefined); setPage(1); }} options={[{ value: '', label: 'Tất cả lớp' }, ...classes.map((item) => ({ value: item.id, label: item.class_name }))]} />
              <Input id="tracking-start-date" label="Từ ngày" type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} />
              <Input id="tracking-end-date" label="Đến ngày" type="date" value={endDate} min={startDate || undefined} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} />
              <div className="flex items-end gap-2"><Button id="tracking-apply-filter" type="submit" className="flex-1">Lọc</Button><Button id="tracking-reset-filter" type="button" variant="outline" onClick={resetFilters}>Xóa</Button></div>
            </form>
          </Card>

          {tab === 'pending' ? (
            <DataTable columns={pendingColumns} data={pending} isLoading={loading} emptyMessage="Không còn lượt nào chờ giáo viên điểm danh" serverPagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          ) : (
            <DataTable columns={historyColumns} data={history} isLoading={loading} emptyMessage="Chưa có lần thay đổi trạng thái nào" serverPagination total={total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          )}
        </>
      )}

      <Modal
        isOpen={!!selected}
        onClose={() => !submitting && setSelected(null)}
        title="Điểm danh học viên"
        description={selected ? `${selected.student.full_name} · ${selected.class.class_name} · Buổi ${selected.session.session_number}` : undefined}
        closeOnOutsideClick={!submitting}
        footer={<><Button id="cancel-teacher-mark" variant="outline" onClick={() => setSelected(null)} disabled={submitting}>Hủy</Button><Button id="submit-teacher-mark" onClick={submitMark} disabled={!status || submitting}>{submitting ? 'Đang lưu...' : 'Xác nhận điểm danh'}</Button></>}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-info/20 bg-blue-50/70 p-3 text-sm text-text-secondary">Hãy tự chọn kết quả theo thực tế buổi học. Kết quả do CSKH ghi nhận không được hiển thị tại đây.</div>
          <Select id="teacher-mark-status" label="Trạng thái điểm danh" value={status} onChange={(event) => setStatus(event.target.value as AttendanceStatus)} options={[{ value: '', label: 'Chọn trạng thái...' }, ...STATUS_OPTIONS]} />
          {status === 'ATTENDED' && <Input id="teacher-mark-lesson" label="Nội dung bài học" value={lessonTopic} onChange={(event) => setLessonTopic(event.target.value)} placeholder="Nội dung đã học trong buổi" />}
          <Textarea id="teacher-mark-note" label="Ghi chú giáo viên" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú thêm (không bắt buộc)" />
        </div>
      </Modal>
    </PageContainer>
  );
};
