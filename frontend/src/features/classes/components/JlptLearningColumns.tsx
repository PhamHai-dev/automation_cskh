import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import { jlptLearningRecordsApi } from '../api/jlpt-records.api';
import { Attendance, ClassSession, JlptLearningRecordField, JlptLearningRecordPatch, JlptLearningRecordRow } from '../types/classes.types';
import { isJlptTeacherAbsent, jlptInlinePatch } from '../utils/jlpt-inline-rules';
import './jlpt-learning-columns.css';

export const JLPT_LEARNING_FIELDS: { field: JlptLearningRecordField; label: string; hint: string }[] = [
  { field: 'preparation_rating', label: 'Chuẩn bị bài', hint: 'A / B / C' },
  { field: 'attitude_rating', label: 'Thái độ học tập', hint: 'A / B / C' },
  { field: 'homework_completed', label: 'Bài tập về nhà', hint: 'Có / Không' },
  { field: 'test_correct_answers', label: 'Số câu đúng', hint: 'Bài kiểm tra' },
];

type Entry = { status: 'loading' | 'ready' | 'error'; rows: JlptLearningRecordRow[] };
type Store = {
  entries: Map<string, Entry>;
  load: (classId: number, sessionId: number, retry?: boolean) => Promise<void>;
  save: (classId: number, sessionId: number, ecId: number, patch: JlptLearningRecordPatch) => Promise<void>;
};
const LearningContext = createContext<Store | null>(null);
const sessionKey = (classId: number, sessionId: number) => `${classId}:${sessionId}`;

/** Cache lifetime is the visible attendance view, not the browser/user session. */
export const JlptLearningProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const entries = useRef(new Map<string, Entry>()).current;
  const [, setRevision] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const notify = useCallback(() => { if (mounted.current) setRevision(v => v + 1); }, []);
  const load = useCallback(async (classId: number, sessionId: number, retry = false) => {
    const key = sessionKey(classId, sessionId);
    if (entries.get(key)?.status === 'loading' || (entries.has(key) && !retry)) return;
    entries.set(key, { status: 'loading', rows: [] });
    notify();
    try {
      const rows = await jlptLearningRecordsApi.list(classId, sessionId);
      entries.set(key, { status: 'ready', rows });
    } catch {
      entries.set(key, { status: 'error', rows: [] });
    }
    notify();
  }, [entries, notify]);
  const save = useCallback(async (classId: number, sessionId: number, ecId: number, patch: JlptLearningRecordPatch) => {
    const record = await jlptLearningRecordsApi.update(classId, sessionId, ecId, patch);
    const entry = entries.get(sessionKey(classId, sessionId));
    const row = entry?.rows.find(item => item.enrollment_class_id === ecId);
    // Merge only the saved field: concurrent saves of other columns may finish out of order.
    if (row) row.learning_record = row.learning_record
      ? { ...row.learning_record, [patch.field]: record[patch.field] }
      : record;
    notify();
  }, [entries, notify]);
  return <LearningContext.Provider value={{ entries, load, save }}>{children}</LearningContext.Provider>;
};

export const JlptLearningHeaders: React.FC = () => <>{JLPT_LEARNING_FIELDS.map(({ field, label, hint }) => (
  <th key={field} scope="col" className="jlpt-learning-heading"><div>{label}</div><small>{hint}</small></th>
))}</>;

const LearningControl: React.FC<{
  classId: number; session: ClassSession; ecId: number; field: JlptLearningRecordField;
  readonly: boolean; attendance?: Attendance;
}> = ({ classId, session, ecId, field, readonly, attendance }) => {
  const store = useContext(LearningContext)!;
  const entry = store.entries.get(sessionKey(classId, session.id));
  const row = entry?.rows.find(item => item.enrollment_class_id === ecId);
  const stored = row?.learning_record?.[field] ?? null;
  const [draft, setDraft] = useState(stored === null ? '' : String(stored));
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const retriedAttendance = useRef<string>('');
  useEffect(() => { setDraft(stored === null ? '' : String(stored)); }, [stored]);
  useEffect(() => { void store.load(classId, session.id); }, [store.load, classId, session.id]);
  useEffect(() => {
    const key = attendance ? `${session.id}:${attendance.id}:${attendance.updated_at ?? ''}` : '';
    if (entry?.status === 'ready' && !row && key && retriedAttendance.current !== key) {
      retriedAttendance.current = key;
      void store.load(classId, session.id, true);
    }
  }, [attendance, classId, session.id, entry?.status, row, store.load]);
  const status = (attendance ?? row?.attendance)?.teacher_status;
  const absent = isJlptTeacherAbsent(status);
  const locked = readonly || absent || session.status === 'CANCELLED' || !row || entry?.status !== 'ready';
  const label = JLPT_LEARNING_FIELDS.find(item => item.field === field)!.label;
  const id = `jlpt-${field}-${session.id}-${ecId}`;
  const persist = async (value: string) => {
    if (locked || savingRef.current) return;
    let patch: JlptLearningRecordPatch;
    try { patch = jlptInlinePatch(field, value); }
    catch (error) { setFeedback((error as Error).message); return; }
    if (patch.value === stored) { setFeedback(''); return; }
    savingRef.current = true;
    setSaving(true); setFeedback('Đang lưu…');
    try {
      await store.save(classId, session.id, ecId, patch);
      setFeedback('Đã lưu');
    } catch {
      setDraft(stored === null ? '' : String(stored));
      setFeedback('Lưu thất bại. Vui lòng nhập lại.');
    } finally { savingRef.current = false; setSaving(false); }
  };
  if (entry?.status === 'error') return <Button id={`${id}-retry`} title="Không tải được nhật ký. Nhấn để thử lại." variant="ghost" size="sm" onClick={() => void store.load(classId, session.id, true)}>Tải lại</Button>;
  const helper = entry?.status !== 'ready' ? 'Đang tải…' : absent ? 'GV đánh dấu vắng' : !row ? 'Chưa đủ điều kiện nhập trong ca này' : readonly ? 'Chỉ xem' : feedback;
  return <div className="jlpt-learning-control" title={absent ? 'Khóa nhập khi giáo viên đánh dấu vắng; dữ liệu cũ được giữ nguyên.' : undefined}>
    {field === 'test_correct_answers' ? <Input id={id} aria-label={label} type="number" min={0} step={1}
      disabled={locked || saving} value={draft} onChange={e => { setDraft(e.target.value); setFeedback(''); }}
      onBlur={() => void persist(draft)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      : <Select id={id} aria-label={label} disabled={locked || saving} value={draft}
        onChange={e => { setDraft(e.target.value); void persist(e.target.value); }}
        options={field === 'homework_completed'
          ? [{ value: '', label: '—' }, { value: 'true', label: 'Có' }, { value: 'false', label: 'Không' }]
          : [{ value: '', label: '—' }, { value: 'A', label: 'A · Tốt' }, { value: 'B', label: 'B · Đạt' }, { value: 'C', label: 'C · Cần cải thiện' }]} />}
    {helper && <span role="status" className={`jlpt-learning-feedback ${feedback.includes('thất bại') || feedback.includes('không âm') ? 'jlpt-learning-error' : ''}`}>{helper}</span>}
  </div>;
};

export const JlptLearningColumns: React.FC<{
  classId?: number; enrollmentClassId?: number; sessions: ClassSession[]; enabled: boolean;
  readonly?: boolean; attendanceForSession?: (sessionId: number) => Attendance | undefined;
}> = ({ classId, enrollmentClassId, sessions, enabled, readonly = false, attendanceForSession }) => <>
  {JLPT_LEARNING_FIELDS.map(({ field }) => <td data-align={field === 'test_correct_answers' ? 'right' : 'center'} data-wrap="nowrap" data-cell-layout="custom" key={field} className="jlpt-learning-cell">
    {!enabled || !classId || !enrollmentClassId || enrollmentClassId <= 0 ? <span className="text-text-muted">—</span>
      : sessions.length === 0 ? <span className="text-text-muted text-[10px] whitespace-nowrap">Chưa có ca học</span>
      : <div className="jlpt-learning-stack">{sessions.map((session, index) => <div key={session.id} className="jlpt-learning-entry">
        {sessions.length > 1 && <span>Ca {index + 1}</span>}
        <LearningControl key={`${session.id}:${enrollmentClassId}:${field}`} classId={classId} session={session}
          ecId={enrollmentClassId} field={field} readonly={readonly} attendance={attendanceForSession?.(session.id)} />
      </div>)}</div>}
  </td>)}
</>;
