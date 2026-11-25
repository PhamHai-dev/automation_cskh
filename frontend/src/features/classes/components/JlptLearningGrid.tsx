import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpenCheck,
  Check,
  CheckCircle2,
  CircleSlash2,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { useToast } from '../../../components/ui/Toast';
import { jlptLearningRecordsApi } from '../api/jlpt-records.api';
import {
  ATTENDANCE_STATUS_LABELS,
  Class,
  ClassSession,
  JlptLearningRecord,
  JlptLearningRecordField,
  JlptLearningRecordPatch,
  JlptLearningRecordRow,
  JlptRating,
} from '../types/classes.types';

interface JlptLearningGridProps {
  isOpen: boolean;
  onClose: () => void;
  classItem: Class | null;
  readonly?: boolean;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type BulkDraft = { field: JlptLearningRecordField; value: string };

const ABSENT_STATUSES = new Set([
  'ABSENT_APPROVED_A',
  'LEAVE_B',
  'ABSENT_UNAPPROVED_C',
  'TEACHER_ABSENT_D',
  'TECH_ERROR_E',
]);

const fieldLabels: Record<JlptLearningRecordField, string> = {
  preparation_rating: 'Chuẩn bị bài',
  attitude_rating: 'Thái độ học tập',
  homework_completed: 'Bài tập về nhà',
  test_correct_answers: 'Số câu đúng',
};

const ratingOptions = [
  { value: '', label: '— Chưa nhập' },
  { value: 'A', label: 'A · Tốt' },
  { value: 'B', label: 'B · Đạt' },
  { value: 'C', label: 'C · Cần cải thiện' },
];

const homeworkOptions = [
  { value: '', label: '— Chưa nhập' },
  { value: 'true', label: 'Có' },
  { value: 'false', label: 'Không' },
];

function getErrorMessage(error: any): string {
  return error?.response?.data?.error?.message || error?.response?.data?.message || 'Không thể lưu dữ liệu JLPT';
}

function isAbsent(row: JlptLearningRecordRow): boolean {
  const status = row.attendance?.teacher_status ?? row.attendance?.status;
  return Boolean(status && ABSENT_STATUSES.has(status));
}

function formatSessionLabel(session: ClassSession): string {
  const date = session.session_date ? new Date(session.session_date).toLocaleDateString('vi-VN') : '';
  const title = session.session_title?.trim();
  return `Buổi ${session.session_number}${title ? ` · ${title}` : ''}${date ? ` · ${date}` : ''}`;
}

export const JlptLearningGrid: React.FC<JlptLearningGridProps> = ({
  isOpen,
  onClose,
  classItem,
  readonly = false,
}) => {
  const toast = useToast();
  const sessions = useMemo(
    () => [...(classItem?.class_sessions || [])]
      .filter((session) => session.status !== 'CANCELLED')
      .sort((a, b) => a.session_number - b.session_number),
    [classItem],
  );
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'session' | 'course'>('session');
  const [rows, setRows] = useState<JlptLearningRecordRow[]>([]);
  const [courseRows, setCourseRows] = useState<Record<number, JlptLearningRecordRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [courseLoading, setCourseLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [courseError, setCourseError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [cellStates, setCellStates] = useState<Record<string, SaveState>>({});
  const [cellDrafts, setCellDrafts] = useState<Record<string, string>>({});
  const [scoreDrafts, setScoreDrafts] = useState<Record<number, string>>({});
  const [bulkDraft, setBulkDraft] = useState<BulkDraft>({ field: 'preparation_rating', value: 'A' });
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const selectedSession = sessions.find((session) => session.id === selectedSessionId) || null;
  const courseStudentRows = useMemo(() => {
    const byEnrollment = new Map<number, JlptLearningRecordRow>();
    sessions.forEach((session) => {
      (courseRows[session.id] || []).forEach((row) => {
        if (!byEnrollment.has(row.enrollment_class_id)) {
          byEnrollment.set(row.enrollment_class_id, row);
        }
      });
    });
    return [...byEnrollment.values()];
  }, [courseRows, sessions]);
  const courseRowsBySession = useMemo(() => new Map(
    sessions.map((session) => [
      session.id,
      new Map((courseRows[session.id] || []).map((row) => [row.enrollment_class_id, row])),
    ]),
  ), [courseRows, sessions]);

  useEffect(() => {
    setSelectedSessionId(sessions[0]?.id ?? null);
    setViewMode('session');
    setRows([]);
    setCourseRows({});
    setLoadError('');
    setCourseError('');
    setSelectedIds(new Set());
    setCellStates({});
    setCellDrafts({});
    setScoreDrafts({});
    setConfirmBulk(false);
  }, [classItem?.id]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedSessionId((current) => {
      if (current && sessions.some((session) => session.id === current)) return current;
      return sessions[0]?.id ?? null;
    });
  }, [isOpen, sessions]);

  const loadRows = useCallback(async () => {
    if (!classItem || !selectedSessionId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setLoadError('');
    setRows([]);
    setSelectedIds(new Set());
    setCellStates({});
    setCellDrafts({});
    setScoreDrafts({});
    try {
      const data = await jlptLearningRecordsApi.list(classItem.id, selectedSessionId);
      setRows(data);
      setCellDrafts(Object.fromEntries(data.flatMap((row) => [
        [`${row.enrollment_class_id}:preparation_rating`, row.learning_record?.preparation_rating ?? ''],
        [`${row.enrollment_class_id}:attitude_rating`, row.learning_record?.attitude_rating ?? ''],
        [`${row.enrollment_class_id}:homework_completed`, row.learning_record?.homework_completed == null ? '' : String(row.learning_record.homework_completed)],
      ])));
      setScoreDrafts(Object.fromEntries(data.map((row) => [
        row.enrollment_class_id,
        row.learning_record?.test_correct_answers?.toString() ?? '',
      ])));
    } catch (error) {
      setRows([]);
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [classItem, selectedSessionId]);

  const loadCourseRows = useCallback(async () => {
    if (!classItem || sessions.length === 0) {
      setCourseRows({});
      return;
    }
    setCourseLoading(true);
    setCourseError('');
    try {
      const entries = await Promise.all(sessions.map(async (session) => [
        session.id,
        await jlptLearningRecordsApi.list(classItem.id, session.id),
      ] as const));
      setCourseRows(Object.fromEntries(entries));
    } catch (error) {
      setCourseRows({});
      setCourseError(getErrorMessage(error));
    } finally {
      setCourseLoading(false);
    }
  }, [classItem, sessions]);

  useEffect(() => {
    if (isOpen && viewMode === 'session') void loadRows();
  }, [isOpen, viewMode, loadRows]);

  useEffect(() => {
    if (isOpen && viewMode === 'course') void loadCourseRows();
  }, [isOpen, viewMode, loadCourseRows]);

  const replaceRecord = (enrollmentClassId: number, record: JlptLearningRecord) => {
    setRows((current) => current.map((row) => (
      row.enrollment_class_id === enrollmentClassId ? { ...row, learning_record: record } : row
    )));
  };

  const saveCell = async (row: JlptLearningRecordRow, patch: JlptLearningRecordPatch): Promise<boolean> => {
    if (!classItem || !selectedSessionId || readonly || isAbsent(row)) return false;
    const key = `${row.enrollment_class_id}:${patch.field}`;
    setCellStates((current) => ({ ...current, [key]: 'saving' }));
    try {
      const record = await jlptLearningRecordsApi.update(
        classItem.id,
        selectedSessionId,
        row.enrollment_class_id,
        patch,
      );
      replaceRecord(row.enrollment_class_id, record);
      setCellStates((current) => ({ ...current, [key]: 'saved' }));
      window.setTimeout(() => setCellStates((current) => (
        current[key] === 'saved' ? { ...current, [key]: 'idle' } : current
      )), 1600);
      return true;
    } catch (error) {
      setCellStates((current) => ({ ...current, [key]: 'error' }));
      const previous = row.learning_record?.[patch.field];
      if (patch.field === 'test_correct_answers') {
        setScoreDrafts((current) => ({
          ...current,
          [row.enrollment_class_id]: previous == null ? '' : String(previous),
        }));
      } else {
        setCellDrafts((current) => ({
          ...current,
          [key]: previous == null ? '' : String(previous),
        }));
      }
      toast.error(getErrorMessage(error), `Lỗi lưu ${fieldLabels[patch.field]}`);
      return false;
    }
  };

  const toggleRow = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const editableRows = rows.filter((row) => !isAbsent(row));
  const allEditableSelected = editableRows.length > 0 && editableRows.every((row) => selectedIds.has(row.enrollment_class_id));

  const toggleAll = () => {
    setSelectedIds(allEditableSelected
      ? new Set()
      : new Set(editableRows.map((row) => row.enrollment_class_id)));
  };

  const parseBulkPatch = (): JlptLearningRecordPatch => {
    if (bulkDraft.field === 'preparation_rating' || bulkDraft.field === 'attitude_rating') {
      return { field: bulkDraft.field, value: (bulkDraft.value || null) as JlptRating | null };
    }
    if (bulkDraft.field === 'homework_completed') {
      return { field: bulkDraft.field, value: bulkDraft.value === '' ? null : bulkDraft.value === 'true' };
    }
    const parsed = bulkDraft.value.trim() === '' ? null : Number(bulkDraft.value);
    return { field: 'test_correct_answers', value: parsed };
  };

  const runBulkSave = async () => {
    if (!classItem || !selectedSessionId || selectedIds.size === 0) return;
    const patch = parseBulkPatch();
    if (patch.field === 'test_correct_answers' && patch.value !== null && (!Number.isInteger(patch.value) || patch.value < 0)) {
      toast.error('Số câu đúng phải là số nguyên không âm');
      return;
    }
    setBulkSaving(true);
    try {
      const records = await jlptLearningRecordsApi.bulkUpdate(
        classItem.id,
        selectedSessionId,
        [...selectedIds],
        patch,
      );
      const byEnrollment = new Map(records.map((record) => [record.enrollment_class_id, record]));
      setRows((current) => current.map((row) => ({
        ...row,
        learning_record: byEnrollment.get(row.enrollment_class_id) ?? row.learning_record,
      })));
      if (patch.field === 'test_correct_answers') {
        setScoreDrafts((current) => ({
          ...current,
          ...Object.fromEntries([...selectedIds].map((id) => [id, patch.value?.toString() ?? ''])),
        }));
      } else {
        setCellDrafts((current) => ({
          ...current,
          ...Object.fromEntries([...selectedIds].map((id) => [
            `${id}:${patch.field}`,
            patch.value == null ? '' : String(patch.value),
          ])),
        }));
      }
      setConfirmBulk(false);
      setSelectedIds(new Set());
      toast.success(`Đã cập nhật ${records.length} học viên`, 'Lưu hàng loạt thành công');
    } catch (error) {
      toast.error(getErrorMessage(error), 'Không thể lưu hàng loạt');
    } finally {
      setBulkSaving(false);
    }
  };

  const bulkValueControl = bulkDraft.field === 'test_correct_answers' ? (
    <input
      id="jlpt-bulk-score"
      type="number"
      min={0}
      step={1}
      value={bulkDraft.value}
      onChange={(event) => setBulkDraft((current) => ({ ...current, value: event.target.value }))}
      className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      aria-label="Giá trị số câu đúng hàng loạt"
    />
  ) : (
    <Select
      id="jlpt-bulk-value"
      value={bulkDraft.value}
      options={bulkDraft.field === 'homework_completed' ? homeworkOptions : ratingOptions}
      onChange={(event) => setBulkDraft((current) => ({ ...current, value: event.target.value }))}
      aria-label="Giá trị cập nhật hàng loạt"
    />
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="full"
      title={
        <span className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20">
            <BookOpenCheck className="h-5 w-5" />
          </span>
          Nhật ký học tập JLPT
        </span>
      }
      description={classItem ? `${classItem.class_name} · ${classItem.level || 'Chưa xác định cấp độ'}` : undefined}
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-muted">Mỗi thay đổi được lưu riêng và có nhật ký audit.</p>
          <Button id="jlpt-close-grid" variant="outline" onClick={onClose}>Đóng</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <section className="overflow-hidden rounded-2xl border border-violet-200/70 bg-gradient-to-r from-violet-950 via-indigo-950 to-slate-950 text-white shadow-xl shadow-indigo-950/10">
          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-end">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="accent" size="sm">JLPT</Badge>
                {selectedSession?.session_type === 'TEST' && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-300/15 px-2.5 py-1 text-xs font-bold text-amber-100">
                    <Sparkles className="h-3.5 w-3.5" /> Buổi kiểm tra
                  </span>
                )}
              </div>
              <h4 className="text-lg font-black tracking-tight">Theo dõi đủ 4 tiêu chí trong từng buổi học</h4>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-indigo-100/80">
                Điểm kiểm tra có thể nhập ở mọi buổi. Buổi TEST chỉ được nhấn mạnh, không khóa vị trí nhập điểm.
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-2 lg:min-w-[520px]">
              <div className="flex rounded-xl border border-white/15 bg-white/10 p-1">
                <button
                  id="jlpt-view-session"
                  type="button"
                  onClick={() => setViewMode('session')}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${viewMode === 'session' ? 'bg-white text-indigo-950 shadow-sm' : 'text-indigo-100 hover:bg-white/10'}`}
                >
                  Theo buổi
                </button>
                <button
                  id="jlpt-view-course"
                  type="button"
                  onClick={() => setViewMode('course')}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${viewMode === 'course' ? 'bg-white text-indigo-950 shadow-sm' : 'text-indigo-100 hover:bg-white/10'}`}
                >
                  Toàn khóa
                </button>
              </div>
              {viewMode === 'session' ? (
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <Select
                    id="jlpt-session-select"
                    value={selectedSessionId ?? ''}
                    onChange={(event) => setSelectedSessionId(Number(event.target.value))}
                    disabled={sessions.length === 0}
                    className="border-white/20 bg-white/10 text-white [&>option]:text-slate-900"
                    aria-label="Chọn buổi JLPT"
                  >
                    {sessions.length === 0 && <option value="">Chưa có buổi học</option>}
                    {sessions.map((session) => (
                      <option key={session.id} value={session.id}>{formatSessionLabel(session)}</option>
                    ))}
                  </Select>
                  <Button
                    id="jlpt-refresh-records"
                    variant="outline"
                    className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                    leftIcon={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />}
                    onClick={() => void loadRows()}
                    disabled={!selectedSessionId || loading}
                  >
                    Làm mới
                  </Button>
                </div>
              ) : (
                <Button
                  id="jlpt-refresh-course"
                  variant="outline"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  leftIcon={<RefreshCw className={`h-4 w-4 ${courseLoading ? 'animate-spin' : ''}`} />}
                  onClick={() => void loadCourseRows()}
                  disabled={sessions.length === 0 || courseLoading}
                >
                  Làm mới toàn khóa
                </Button>
              )}
            </div>
          </div>
        </section>

        {viewMode === 'session' && !readonly && rows.length > 0 && (
          <section className="rounded-2xl border border-border bg-surface-muted/40 p-3 sm:p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(170px,1fr)_minmax(180px,1fr)_auto] lg:items-end">
              <Select
                id="jlpt-bulk-field"
                label="Tiêu chí cập nhật"
                value={bulkDraft.field}
                options={Object.entries(fieldLabels).map(([value, label]) => ({ value, label }))}
                onChange={(event) => {
                  const field = event.target.value as JlptLearningRecordField;
                  setBulkDraft({ field, value: field === 'test_correct_answers' ? '' : field === 'homework_completed' ? 'true' : 'A' });
                }}
              />
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-text-secondary">Giá trị</label>
                {bulkValueControl}
              </div>
              <Button
                id="jlpt-open-bulk-confirm"
                variant="secondary"
                leftIcon={<ClipboardCheck className="h-4 w-4" />}
                disabled={selectedIds.size === 0}
                onClick={() => setConfirmBulk(true)}
              >
                Áp dụng cho {selectedIds.size} HV
              </Button>
            </div>
          </section>
        )}

        {viewMode === 'course' ? (
          courseLoading ? (
            <div className="grid min-h-[320px] place-items-center rounded-2xl border border-border bg-surface">
              <div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" /><p className="mt-3 text-sm font-semibold text-text-secondary">Đang tải nhật ký toàn khóa...</p></div>
            </div>
          ) : courseError ? (
            <div className="grid min-h-[280px] place-items-center rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center">
              <div><AlertCircle className="mx-auto h-9 w-9 text-rose-600" /><p className="mt-3 font-bold text-rose-900">Không thể tải toàn khóa</p><p className="mt-1 text-sm text-rose-700">{courseError}</p><Button className="mt-4" variant="outline" onClick={() => void loadCourseRows()}>Thử lại</Button></div>
            </div>
          ) : sessions.length === 0 ? (
            <div className="grid min-h-[280px] place-items-center rounded-2xl border border-dashed border-border bg-surface-muted/30 p-6 text-center"><div><CircleSlash2 className="mx-auto h-9 w-9 text-text-muted" /><p className="mt-3 font-bold text-text-primary">Chưa có buổi học</p></div></div>
          ) : courseStudentRows.length === 0 ? (
            <div className="grid min-h-[280px] place-items-center rounded-2xl border border-dashed border-border bg-surface-muted/30 p-6 text-center">
              <div>
                <CircleSlash2 className="mx-auto h-9 w-9 text-text-muted" />
                <p className="mt-3 font-bold text-text-primary">Chưa có học viên trong khóa</p>
                <p className="mt-1 text-sm text-text-muted">Chỉ hiển thị học viên đang hoạt động và thuộc phạm vi truy cập.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
              <table data-table="native" className="min-w-max border-collapse text-xs">
                <thead className="bg-slate-100/90 text-text-secondary">
                  <tr>
                    <th scope="col" className="sticky left-0 z-20 min-w-[220px] border-b border-r-2 border-border bg-slate-100 px-4 py-3 text-left uppercase tracking-wider">Học viên</th>
                    {sessions.map((session) => (
                      <th scope="col" key={session.id} className={`min-w-[190px] border-b border-r border-border px-3 py-3 text-left align-top ${session.session_type === 'TEST' ? 'bg-amber-100 text-amber-950' : ''}`}>
                        <div className="font-black">Buổi {session.session_number}</div>
                        <div className="mt-0.5 normal-case font-semibold">{session.session_title || (session.session_type === 'TEST' ? 'Kiểm tra' : 'Bài học')}</div>
                        <div className="mt-1 font-normal text-text-muted">{new Date(session.session_date).toLocaleDateString('vi-VN')}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {courseStudentRows.map((baseRow) => (
                    <tr key={baseRow.enrollment_class_id} className="border-b border-border/70 last:border-b-0">
                      <td data-align="left" data-wrap="normal" className="sticky left-0 z-10 border-r-2 border-border bg-white px-4 py-3">
                        <div className="font-bold text-text-primary">{baseRow.student.full_name}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-text-muted">{baseRow.student.external_id || `HV-${baseRow.student.id}`}</div>
                      </td>
                      {sessions.map((session) => {
                        const row = courseRowsBySession.get(session.id)?.get(baseRow.enrollment_class_id);
                        const status = row?.attendance?.teacher_status ?? row?.attendance?.status;
                        const absent = row ? isAbsent(row) : false;
                        const record = row?.learning_record;
                        return (
                          <td data-align="left" data-wrap="normal" data-cell-layout="custom" key={session.id} className={`border-r border-border p-2 align-top ${session.session_type === 'TEST' ? 'bg-amber-50/40' : ''}`}>
                            {row ? (
                              <button
                                id={`jlpt-course-cell-${session.id}-${baseRow.enrollment_class_id}`}
                                type="button"
                                onClick={() => { setSelectedSessionId(session.id); setViewMode('session'); }}
                                className="w-full rounded-xl border border-border bg-white p-2.5 text-left transition hover:border-indigo-300 hover:bg-indigo-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                                title="Mở buổi này để chỉnh chi tiết"
                              >
                                <div className="font-bold text-slate-700">{status ? ATTENDANCE_STATUS_LABELS[status] || status : 'Chưa điểm danh'}</div>
                                {absent ? (
                                  <div className="mt-1.5 text-[10px] font-semibold text-slate-400">Tiêu chí đã khóa</div>
                                ) : (
                                  <div className="mt-1.5 space-y-0.5 text-[10px] text-text-muted">
                                    <div>CB: <strong>{record?.preparation_rating || '—'}</strong> · TĐ: <strong>{record?.attitude_rating || '—'}</strong></div>
                                    <div>BTVN: <strong>{record?.homework_completed == null ? '—' : record.homework_completed ? 'Có' : 'Không'}</strong> · Điểm: <strong>{record?.test_correct_answers ?? '—'}</strong></div>
                                  </div>
                                )}
                                {row.attendance?.teacher_note && <div className="mt-1.5 truncate border-t border-border/60 pt-1.5 text-[10px] italic text-text-muted">{row.attendance.teacher_note}</div>}
                              </button>
                            ) : (
                              <div className="grid min-h-[78px] place-items-center rounded-xl border border-dashed border-border bg-slate-50 px-2 text-center text-[10px] font-semibold text-text-muted">
                                Ngoài phạm vi hiển thị
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : loading ? (
          <div className="grid min-h-[320px] place-items-center rounded-2xl border border-border bg-surface">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 text-sm font-semibold text-text-secondary">Đang tải nhật ký học tập...</p>
            </div>
          </div>
        ) : loadError ? (
          <div className="grid min-h-[280px] place-items-center rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center">
            <div>
              <AlertCircle className="mx-auto h-9 w-9 text-rose-600" />
              <p className="mt-3 font-bold text-rose-900">Không thể tải dữ liệu</p>
              <p className="mt-1 text-sm text-rose-700">{loadError}</p>
              <Button className="mt-4" variant="outline" onClick={() => void loadRows()}>Thử lại</Button>
            </div>
          </div>
        ) : !selectedSessionId || rows.length === 0 ? (
          <div className="grid min-h-[280px] place-items-center rounded-2xl border border-dashed border-border bg-surface-muted/30 p-6 text-center">
            <div>
              <CircleSlash2 className="mx-auto h-9 w-9 text-text-muted" />
              <p className="mt-3 font-bold text-text-primary">Chưa có dữ liệu cho buổi này</p>
              <p className="mt-1 text-sm text-text-muted">Lớp cần có buổi học và học viên đang hoạt động.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
            <table data-table="native" className="min-w-[940px] w-full border-collapse text-sm">
              <thead className="bg-slate-100/90 text-left text-xs uppercase tracking-wider text-text-secondary">
                <tr>
                  {!readonly && (
                    <th scope="col" className="sticky left-0 z-20 w-12 border-b border-r border-border bg-slate-100 px-3 py-3 text-center">
                      <input
                        id="jlpt-select-all"
                        type="checkbox"
                        checked={allEditableSelected}
                        onChange={toggleAll}
                        className="h-4 w-4 rounded border-slate-300 accent-primary"
                        aria-label="Chọn tất cả học viên có thể cập nhật"
                      />
                    </th>
                  )}
                  <th scope="col" className={`${readonly ? 'left-0' : 'left-12'} sticky z-20 min-w-[230px] border-b border-r-2 border-border bg-slate-100 px-4 py-3`}>Học viên</th>
                  <th scope="col" className="min-w-[150px] border-b border-r border-border px-3 py-3">Điểm danh</th>
                  <th scope="col" className="min-w-[150px] border-b border-r border-border px-3 py-3">Chuẩn bị bài</th>
                  <th scope="col" className="min-w-[160px] border-b border-r border-border px-3 py-3">Thái độ</th>
                  <th scope="col" className="min-w-[150px] border-b border-r border-border px-3 py-3">Bài tập</th>
                  <th scope="col" className={`min-w-[150px] border-b border-r border-border px-3 py-3 ${selectedSession?.session_type === 'TEST' ? 'bg-amber-100 text-amber-950' : ''}`}>Số câu đúng</th>
                  <th scope="col" className="min-w-[220px] border-b border-border px-3 py-3">Ghi chú giáo viên</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const absent = isAbsent(row);
                  const attendanceStatus = row.attendance?.teacher_status ?? row.attendance?.status;
                  const record = row.learning_record;
                  const renderState = (field: JlptLearningRecordField) => {
                    const state = cellStates[`${row.enrollment_class_id}:${field}`] || 'idle';
                    if (state === 'saving') return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
                    if (state === 'saved') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
                    if (state === 'error') return <AlertCircle className="h-3.5 w-3.5 text-rose-600" />;
                    return null;
                  };
                  return (
                    <tr key={row.enrollment_class_id} className="border-b border-border/70 last:border-b-0 hover:bg-indigo-50/20">
                      {!readonly && (
                        <td data-align="center" data-wrap="nowrap" className="sticky left-0 z-10 border-r border-border bg-white px-3 py-3 text-center">
                          <input
                            id={`jlpt-select-${row.enrollment_class_id}`}
                            type="checkbox"
                            checked={selectedIds.has(row.enrollment_class_id)}
                            onChange={() => toggleRow(row.enrollment_class_id)}
                            disabled={absent}
                            className="h-4 w-4 rounded border-slate-300 accent-primary disabled:opacity-40"
                            aria-label={`Chọn ${row.student.full_name}`}
                          />
                        </td>
                      )}
                      <td data-align="left" data-wrap="normal" className={`${readonly ? 'left-0' : 'left-12'} sticky z-10 border-r-2 border-border bg-white px-4 py-3`}>
                        <div className="font-bold text-text-primary">{row.student.full_name}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-text-muted">{row.student.external_id || `HV-${row.student.id}`}</div>
                        {absent && (
                          <span className="mt-1.5 inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Tiêu chí đang khóa vì vắng</span>
                        )}
                      </td>
                      <td data-align="center" data-wrap="nowrap" className="border-r border-border px-3 py-3">
                        {attendanceStatus ? (
                          <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
                            {ATTENDANCE_STATUS_LABELS[attendanceStatus] || attendanceStatus}
                          </span>
                        ) : <span className="text-xs text-text-muted">Chưa điểm danh</span>}
                      </td>
                      {(['preparation_rating', 'attitude_rating'] as const).map((field) => (
                        <td data-align="center" data-wrap="nowrap" data-cell-layout="custom" key={field} className="border-r border-border px-3 py-3">
                          <div className="flex items-center gap-2">
                            {absent ? (
                              <div className="flex h-10 w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-400">
                                Đã khóa
                              </div>
                            ) : (
                              <Select
                                id={`jlpt-${field}-${row.enrollment_class_id}`}
                                value={cellDrafts[`${row.enrollment_class_id}:${field}`] ?? ''}
                                options={ratingOptions}
                                disabled={readonly || cellStates[`${row.enrollment_class_id}:${field}`] === 'saving'}
                                onChange={(event) => {
                                  const value = event.target.value;
                                  setCellDrafts((current) => ({ ...current, [`${row.enrollment_class_id}:${field}`]: value }));
                                  void saveCell(row, { field, value: (value || null) as JlptRating | null });
                                }}
                                aria-label={`${fieldLabels[field]} của ${row.student.full_name}`}
                              />
                            )}
                            <span className="w-4 shrink-0">{renderState(field)}</span>
                          </div>
                        </td>
                      ))}
                      <td data-align="center" data-wrap="nowrap" data-cell-layout="custom" className="border-r border-border px-3 py-3">
                        <div className="flex items-center gap-2">
                          {absent ? (
                            <div className="flex h-10 w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-400">
                              Đã khóa
                            </div>
                          ) : (
                            <Select
                              id={`jlpt-homework-${row.enrollment_class_id}`}
                              value={cellDrafts[`${row.enrollment_class_id}:homework_completed`] ?? ''}
                              options={homeworkOptions}
                              disabled={readonly || cellStates[`${row.enrollment_class_id}:homework_completed`] === 'saving'}
                              onChange={(event) => {
                                const value = event.target.value;
                                setCellDrafts((current) => ({ ...current, [`${row.enrollment_class_id}:homework_completed`]: value }));
                                void saveCell(row, {
                                  field: 'homework_completed',
                                  value: value === '' ? null : value === 'true',
                                });
                              }}
                              aria-label={`Bài tập về nhà của ${row.student.full_name}`}
                            />
                          )}
                          <span className="w-4 shrink-0">{renderState('homework_completed')}</span>
                        </div>
                      </td>
                      <td data-align="right" data-wrap="nowrap" data-cell-layout="custom" className={`px-3 py-3 ${selectedSession?.session_type === 'TEST' ? 'bg-amber-50/70' : ''}`}>
                        <div className="flex items-center gap-2">
                          {absent ? (
                            <div className="flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-400">
                              Đã khóa
                            </div>
                          ) : (
                            <input
                              id={`jlpt-score-${row.enrollment_class_id}`}
                              type="number"
                              min={0}
                              step={1}
                              value={scoreDrafts[row.enrollment_class_id] ?? ''}
                              disabled={readonly || cellStates[`${row.enrollment_class_id}:test_correct_answers`] === 'saving'}
                              onChange={(event) => setScoreDrafts((current) => ({ ...current, [row.enrollment_class_id]: event.target.value }))}
                              onBlur={async (event) => {
                                const raw = event.target.value.trim();
                                const value = raw === '' ? null : Number(raw);
                                if (value !== null && (!Number.isInteger(value) || value < 0)) {
                                  toast.error('Số câu đúng phải là số nguyên không âm');
                                  setScoreDrafts((current) => ({ ...current, [row.enrollment_class_id]: record?.test_correct_answers?.toString() ?? '' }));
                                  return;
                                }
                                if (value !== (record?.test_correct_answers ?? null)) {
                                  const saved = await saveCell(row, { field: 'test_correct_answers', value });
                                  if (!saved) {
                                    setScoreDrafts((current) => ({ ...current, [row.enrollment_class_id]: record?.test_correct_answers?.toString() ?? '' }));
                                  }
                                }
                              }}
                              className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-white px-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-surface-muted"
                              aria-label={`Số câu đúng của ${row.student.full_name}`}
                            />
                          )}
                          <span className="w-4 shrink-0">{renderState('test_correct_answers')}</span>
                        </div>
                      </td>
                      <td data-align="left" data-wrap="normal" className="px-3 py-3 align-top">
                        {row.attendance?.teacher_note ? (
                          <p className="max-w-[260px] whitespace-pre-wrap text-xs leading-relaxed text-text-secondary">{row.attendance.teacher_note}</p>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={confirmBulk}
        onClose={() => !bulkSaving && setConfirmBulk(false)}
        title="Xác nhận cập nhật hàng loạt"
        description="Thao tác được thực hiện toàn bộ hoặc không cập nhật dòng nào nếu có lỗi."
        size="sm"
        closeOnOutsideClick={!bulkSaving}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={bulkSaving} onClick={() => setConfirmBulk(false)}>Hủy</Button>
            <Button
              id="jlpt-confirm-bulk-save"
              leftIcon={<Save className="h-4 w-4" />}
              isLoading={bulkSaving}
              onClick={() => void runBulkSave()}
            >
              Xác nhận lưu
            </Button>
          </div>
        }
      >
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 text-sm text-indigo-950">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-600 text-white"><Check className="h-4 w-4" /></span>
            <div>
              <p>Bạn sẽ cập nhật <strong>{fieldLabels[bulkDraft.field]}</strong> cho <strong>{selectedIds.size} học viên</strong>.</p>
              <p className="mt-1 text-xs text-indigo-700">Các học viên vắng đã bị loại khỏi vùng chọn; dữ liệu cũ của họ vẫn được giữ nguyên.</p>
            </div>
          </div>
        </div>
      </Modal>
    </Modal>
  );
};
