import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { studentsApi } from '../api/students.api';
import {
  Student,
  JlptAttendanceReportRow,
  JlptNkhtSessionItem,
  UpdateJlptAttendanceReportDTO,
} from '../types/students.types';
import { Enrollment } from '../../enrollments/types/enrollments.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import { JlptChuyenCanTable } from './JlptAttendanceReportPage';
import {
  ArrowLeft,
  Save,
  CheckCircle2,
  Printer,
  Plus,
  Trash2,
  Lock,
} from 'lucide-react';

export interface StageBlockData {
  date_range: string;
  absent_excused: string;
  absent_unexcused: string;
  teacher_absent: string;
  preparation: string;
  homework_completed: string;
  interaction: string;
  comprehension: string;
  strengths: string;
  weaknesses: string;
  additional_notes: string;
}

export interface ExamBlockData {
  vocabulary: string;
  grammar: string;
  intonation: string;
  fluency: string;
  score: string;
  additional_notes: string;
}

export interface JlptDailyReportItem {
  date: string;
  summary_note: string;
}

export interface StudyReportData {
  exchange_with_student: string;
  session_1: {
    preparation: string;
    interaction: string;
    comprehension: string;
  };
  session_3: {
    preparation: string;
    interaction: string;
    comprehension: string;
  };
  sessions_1_10: StageBlockData;
  sessions_11_20: StageBlockData;
  sessions_21_30: StageBlockData;
  midterm: ExamBlockData;
  final_exam: ExamBlockData;
  jlpt_daily_reports?: JlptDailyReportItem[];
}

type StudyReportTemplateMode = 'KAIWA' | 'JLPT';

const emptyStageBlock = (): StageBlockData => ({
  date_range: '',
  absent_excused: '',
  absent_unexcused: '',
  teacher_absent: '',
  preparation: '',
  homework_completed: '',
  interaction: '',
  comprehension: '',
  strengths: '',
  weaknesses: '',
  additional_notes: '',
});

const emptyExamBlock = (): ExamBlockData => ({
  vocabulary: '',
  grammar: '',
  intonation: '',
  fluency: '',
  score: '',
  additional_notes: '',
});

const normalizeStageBlock = (raw?: any): StageBlockData => ({
  ...emptyStageBlock(),
  ...(raw || {}),
  homework_completed: raw?.homework_completed ?? raw?.homework_completion ?? '',
  strengths: raw?.strengths ?? raw?.strengths_progress ?? '',
  additional_notes: raw?.additional_notes ?? raw?.additional_comments ?? '',
});

const normalizeExamBlock = (raw?: any): ExamBlockData => ({
  ...emptyExamBlock(),
  ...(raw || {}),
  intonation: raw?.intonation ?? raw?.pronunciation ?? '',
  score: raw?.score ?? raw?.total_score ?? '',
  additional_notes: raw?.additional_notes ?? raw?.additional_comments ?? '',
});

const createInitialReportData = (raw?: Partial<StudyReportData> | null): StudyReportData => ({
  exchange_with_student: raw?.exchange_with_student ?? '',
  session_1: {
    preparation: raw?.session_1?.preparation ?? '',
    interaction: raw?.session_1?.interaction ?? '',
    comprehension: raw?.session_1?.comprehension ?? '',
  },
  session_3: {
    preparation: raw?.session_3?.preparation ?? '',
    interaction: raw?.session_3?.interaction ?? '',
    comprehension: raw?.session_3?.comprehension ?? '',
  },
  sessions_1_10: normalizeStageBlock(raw?.sessions_1_10),
  sessions_11_20: normalizeStageBlock(raw?.sessions_11_20),
  sessions_21_30: normalizeStageBlock(raw?.sessions_21_30),
  midterm: normalizeExamBlock(raw?.midterm),
  final_exam: normalizeExamBlock(raw?.final_exam),
  jlpt_daily_reports: Array.isArray(raw?.jlpt_daily_reports)
    ? raw!.jlpt_daily_reports.map((r: any) => ({
        date: r?.date ?? r?.dateLabel ?? '',
        summary_note: r?.summary_note ?? r?.comment ?? '',
      }))
    : [],
});

const hydrateReportFromEnrollment = (enr?: Enrollment): StudyReportData => {
  const savedReport = (enr?.program_metadata as any)?.study_report as
    | Partial<StudyReportData>
    | null
    | undefined;
  return createInitialReportData({
    ...(savedReport || {}),
    exchange_with_student:
      savedReport?.exchange_with_student !== undefined
        ? savedReport.exchange_with_student
        : enr?.exchange_info || '',
  });
};

const detectTemplateMode = (enr?: Enrollment): StudyReportTemplateMode => {
  const savedReport = (enr?.program_metadata as any)?.study_report;
  const programUpper = (enr?.program_type || '').toUpperCase();
  if (programUpper === 'JLPT') return 'JLPT';
  if (
    Array.isArray(savedReport?.jlpt_daily_reports) &&
    savedReport.jlpt_daily_reports.length > 0 &&
    savedReport.jlpt_daily_reports.some((r: any) => Boolean(r?.summary_note?.trim()))
  ) {
    return 'JLPT';
  }
  return 'KAIWA';
};

const enrollmentLabel = (enr: Enrollment): string => {
  const program = enr.program_type || 'Không rõ chương trình';
  const pkg = enr.package?.code || enr.package?.name || 'Gói';
  const className = enr.enrollment_classes?.[0]?.class?.class_name || 'chưa có lớp';
  return `${program} • ${pkg} • Lớp ${className}`;
};

export const StudentStudyReportPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user } = useAuth();

  const isTeacherOnly = Boolean(
    user?.roles?.includes('TEACHER') &&
      !user?.roles?.includes('ADMIN') &&
      !user?.roles?.includes('MANAGE') &&
      !user?.roles?.includes('CS')
  );
  const isCSOnly = Boolean(
    user?.roles?.includes('CS') &&
      !user?.roles?.includes('ADMIN') &&
      !user?.roles?.includes('MANAGE')
  );
  const fromPath = (location.state as { from?: string } | null)?.from;
  const backTarget =
    fromPath === '/teacher/student-info' || isTeacherOnly
      ? '/teacher/student-info'
      : fromPath?.startsWith('/dashboard')
      ? fromPath
      : fromPath === '/students'
      ? '/students'
      : '/students/care-reports';
  const backLabel =
    backTarget === '/teacher/student-info'
      ? 'Quay lại Thông tin HV & Buổi học'
      : backTarget.startsWith('/dashboard')
      ? 'Quay lại Dashboard Chuyên cần HV'
      : backTarget === '/students'
      ? 'Quay lại Hồ sơ học viên'
      : 'Quay lại Báo cáo & Chăm sóc HV';

  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [report, setReport] = useState<StudyReportData>(() => createInitialReportData());
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState<number | null>(null);
  const [templateMode, setTemplateMode] = useState<StudyReportTemplateMode>('KAIWA');
  const [hydratedSnapshot, setHydratedSnapshot] = useState<string>(() =>
    JSON.stringify(createInitialReportData())
  );

  const [jlptReportRow, setJlptReportRow] = useState<JlptAttendanceReportRow | null>(null);
  const [jlptNkhtSessions, setJlptNkhtSessions] = useState<JlptNkhtSessionItem[]>([]);

  const fetchJlptReport = async (studentId: number, enrollmentId?: number | null) => {
    try {
      const res = await studentsApi.getJlptAttendanceReport({
        student_id: studentId,
        pageSize: 20,
      });
      const list = res.data || [];
      const matched =
        (enrollmentId ? list.find((r) => r.enrollment_id === enrollmentId) : null) ||
        list[0] ||
        null;
      if (matched) {
        setJlptReportRow(matched);
        setJlptNkhtSessions(Array.isArray(matched.nkht_sessions) ? matched.nkht_sessions : []);
      }
    } catch {
      // ignore if student has no JLPT enrollment
    }
  };

  useEffect(() => {
    const fetchDetail = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const data = await studentsApi.get(Number(id));
        setStudent(data);
        const list = data.enrollments ?? [];
        const defaultEnrId = list.length === 1 ? list[0].id : null;
        setSelectedEnrollmentId(defaultEnrId);
        await fetchJlptReport(Number(id), defaultEnrId);
      } catch (err: any) {
        toast.error(
          err.response?.data?.error?.message ||
            'Không thể tải báo cáo học tập của học viên'
        );
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [id]);

  useEffect(() => {
    if (!student || selectedEnrollmentId == null) return;
    const enr = student.enrollments?.find((e) => e.id === selectedEnrollmentId);
    if (!enr) return;
    const next = hydrateReportFromEnrollment(enr);
    setReport(next);
    const mode = detectTemplateMode(enr);
    setTemplateMode(mode);
    setHydratedSnapshot(JSON.stringify(next));
    fetchJlptReport(student.id, enr.id);
  }, [student, selectedEnrollmentId]);

  const enrollments = student?.enrollments ?? [];
  const selectedEnrollment =
    selectedEnrollmentId != null
      ? enrollments.find((e) => e.id === selectedEnrollmentId)
      : undefined;
  const isReadonlyForCs = Boolean(
    jlptReportRow?.is_readonly ||
      (isCSOnly &&
        user?.id &&
        selectedEnrollment &&
        selectedEnrollment.cs_id !== user.id)
  );
  const isDirty = JSON.stringify(report) !== hydratedSnapshot;

  const handleEnrollmentChange = (val: string) => {
    const nextId = val ? Number(val) : null;
    if (nextId === selectedEnrollmentId) return;
    if (isDirty) {
      toast.info('Phiếu chưa lưu sẽ bị bỏ khi đổi gói');
    }
    setSelectedEnrollmentId(nextId);
    setSavedAt(null);
  };

  const handleInlineUpdateJlptRow = async (
    row: JlptAttendanceReportRow,
    payload: UpdateJlptAttendanceReportDTO
  ) => {
    const updated = await studentsApi.updateJlptAttendanceReport(row.student_id, {
      enrollment_id: row.enrollment_id,
      ...payload,
    });
    setJlptReportRow(updated);
    setJlptNkhtSessions(updated.nkht_sessions || []);
    if (payload.exchange_info !== undefined) {
      setReport((prev) => ({ ...prev, exchange_with_student: payload.exchange_info || '' }));
    }
    setSavedAt(new Date().toLocaleTimeString('vi-VN'));
    toast.success('Đã cập nhật');
  };

  const handleSave = async () => {
    if (!student) return;
    const enr = selectedEnrollment;
    if (!enr?.id) {
      toast.error('Không xác định được gói ghi danh để cập nhật');
      return;
    }
    try {
      setSaving(true);
      if (templateMode === 'JLPT') {
        const updated = await studentsApi.updateJlptAttendanceReport(student.id, {
          enrollment_id: enr.id,
          nkht_sessions: jlptNkhtSessions,
        });
        setJlptReportRow(updated);
        setJlptNkhtSessions(updated.nkht_sessions || []);
      } else {
        const nextMeta = {
          ...(enr.program_metadata || {}),
          study_report: report,
        };
        await studentsApi.update(student.id, {
          enrollment_id: enr.id,
          program_type: (enr.program_type as any) || templateMode,
          program_metadata: nextMeta,
          exchange_info: report.exchange_with_student,
          study_report_url: `/students/${student.id}/study-report`,
        });
      }

      setSavedAt(new Date().toLocaleTimeString('vi-VN'));
      setHydratedSnapshot(JSON.stringify(report));
      toast.success('Đã lưu Báo cáo học tập thành công!');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Không thể lưu báo cáo học tập');
    } finally {
      setSaving(false);
    }
  };

  const updateStage = (
    stageKey: 'sessions_1_10' | 'sessions_11_20' | 'sessions_21_30',
    field: keyof StageBlockData,
    val: string
  ) => {
    setReport((prev) => ({
      ...prev,
      [stageKey]: {
        ...prev[stageKey],
        [field]: val,
      },
    }));
  };

  const updateExam = (
    examKey: 'midterm' | 'final_exam',
    field: keyof ExamBlockData,
    val: string
  ) => {
    setReport((prev) => ({
      ...prev,
      [examKey]: {
        ...prev[examKey],
        [field]: val,
      },
    }));
  };

  const handleAddNkhtSession = () => {
    setJlptNkhtSessions((prev) => {
      const nextNum =
        prev.length > 0
          ? Math.max(...prev.map((s) => Number(s.session_number) || 0)) + 1
          : 1;
      return [
        ...prev,
        {
          session_number: nextNum,
          session_label: `Buổi ${nextNum}`,
          attendance: 'O',
          preparation: 'A',
          attitude: 'A',
          homework_status: 'Có',
          exam_score: null,
          note: '',
        },
      ];
    });
  };

  const handleUpdateNkhtSession = (
    idx: number,
    patch: Partial<JlptNkhtSessionItem>
  ) => {
    setJlptNkhtSessions((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const handleRemoveNkhtSession = (idx: number) => {
    setJlptNkhtSessions((prev) => prev.filter((_, i) => i !== idx));
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="py-16 text-center text-sm text-text-muted">
          Đang tải Báo cáo học tập...
        </div>
      </PageContainer>
    );
  }

  if (!student) {
    return (
      <PageContainer>
        <div className="py-16 text-center space-y-3">
          <div className="text-sm text-text-muted">Không tìm thấy thông tin học viên.</div>
          <Button variant="outline" size="sm" onClick={() => navigate(backTarget)}>
            {backLabel}
          </Button>
        </div>
      </PageContainer>
    );
  }

  const enr = selectedEnrollment;
  const ec = enr?.enrollment_classes?.[0];
  const teacher =
    ec?.class?.class_teachers?.[0]?.teacher?.name ||
    (ec?.class as any)?.teacher_name ||
    '—';
  const courseCode =
    enr?.package?.code ||
    enr?.package?.name ||
    enr?.course_content ||
    enr?.level ||
    '—';
  const studentCode = student.external_id || `HV_${student.id}`;

  const fallbackJlptRow: JlptAttendanceReportRow = jlptReportRow || {
    student_id: student.id,
    enrollment_id: enr?.id || 0,
    external_id: student.external_id || null,
    is_readonly: isReadonlyForCs,
    class_code: ec?.class?.class_code || ec?.class?.class_name || '',
    full_name: student.full_name,
    attended_sessions: 0,
    total_marked_sessions: 0,
    attendance_rate: null,
    average_exam_score: null,
    homework_completed_sessions: 0,
    max_consecutive_absent: 0,
    absent_warning: '',
    max_consecutive_no_homework: 0,
    no_homework_warning: '',
    exchange_info: enr?.exchange_info || '',
    status: enr?.status || 'STUDYING',
    status_label: 'Đang học',
    cvht_code: enr?.cs?.staff_code || '',
    cs_id: enr?.cs_id || null,
    cs_name: enr?.cs?.name || null,
    course_track: courseCode,
    last_exam_name: '',
    last_exam_session: null,
    sessions_since_last_exam: null,
    next_exam_name: '',
    next_exam_session: null,
    sessions_until_next_exam: null,
    exam_schedule_warning: '',
    test_scores: {},
    overrides: {},
    nkht_sessions: jlptNkhtSessions,
  };

  const renderShortSessionSection = (
    title: string,
    sessionKey: 'session_1' | 'session_3'
  ) => {
    const data = report[sessionKey];
    return (
      <>
        <tr>
          <td
            colSpan={2}
            className="bg-[#FFE599] border border-slate-400 px-3 py-2 font-bold text-slate-900 text-sm text-left"
          >
            {title}
          </td>
        </tr>
        <tr className="bg-[#FFE599] font-bold text-slate-900 text-center">
          <td className="border border-slate-400 px-3 py-2 w-[34%]">Nội dung</td>
          <td className="border border-slate-400 px-3 py-2 w-[66%]">Nhận xét</td>
        </tr>
        <tr>
          <td className="border border-slate-400 px-3 py-2 font-medium text-slate-800 align-middle">
            Chuẩn bị bài mới
          </td>
          <td className="border border-slate-400 p-1.5">
            <textarea
              rows={2}
              value={data.preparation}
              onChange={(e) =>
                setReport((prev) => ({
                  ...prev,
                  [sessionKey]: { ...prev[sessionKey], preparation: e.target.value },
                }))
              }
              placeholder="Nhập nhận xét chuẩn bị bài mới..."
              className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded focus:bg-amber-50/40 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </td>
        </tr>
        <tr>
          <td className="border border-slate-400 px-3 py-2 font-medium text-slate-800 align-middle">
            Mức độ tương tác trong lớp
          </td>
          <td className="border border-slate-400 p-1.5">
            <textarea
              rows={2}
              value={data.interaction}
              onChange={(e) =>
                setReport((prev) => ({
                  ...prev,
                  [sessionKey]: { ...prev[sessionKey], interaction: e.target.value },
                }))
              }
              placeholder="Nhập nhận xét mức độ tương tác..."
              className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded focus:bg-amber-50/40 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </td>
        </tr>
        <tr>
          <td className="border border-slate-400 px-3 py-2 font-medium text-slate-800 align-middle">
            Khả năng tiếp thu trong lớp
          </td>
          <td className="border border-slate-400 p-1.5">
            <textarea
              rows={2}
              value={data.comprehension}
              onChange={(e) =>
                setReport((prev) => ({
                  ...prev,
                  [sessionKey]: { ...prev[sessionKey], comprehension: e.target.value },
                }))
              }
              placeholder="Nhập nhận xét khả năng tiếp thu..."
              className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded focus:bg-amber-50/40 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </td>
        </tr>
      </>
    );
  };

  const renderTenSessionSection = (
    title: string,
    stageKey: 'sessions_1_10' | 'sessions_11_20' | 'sessions_21_30'
  ) => {
    const data = report[stageKey];
    return (
      <>
        <tr>
          <td
            colSpan={2}
            className="bg-[#FFE599] border border-slate-400 px-3 py-2 font-bold text-slate-900 text-sm text-left"
          >
            {title}
          </td>
        </tr>
        <tr className="bg-[#FFE599] font-bold text-slate-900 text-center">
          <td rowSpan={2} className="border border-slate-400 px-3 py-2 align-middle w-[34%]">
            Nội dung
          </td>
          <td className="border border-slate-400 px-3 py-2 w-[66%]">Nhận xét</td>
        </tr>
        <tr className="bg-[#FFE599]">
          <td className="border border-slate-400 px-3 py-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <span className="shrink-0">Ngày từ:</span>
              <input
                type="text"
                value={data.date_range}
                onChange={(e) => updateStage(stageKey, 'date_range', e.target.value)}
                placeholder=".../.../... - .../.../..."
                className="flex-1 bg-white/80 border border-slate-400/80 rounded px-2 py-1 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </td>
        </tr>

        <tr>
          <td
            rowSpan={3}
            className="border border-slate-400 px-3 py-2 font-medium text-slate-800 align-middle"
          >
            Độ chuyên cần
          </td>
          <td className="border border-slate-400 px-3 py-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-800">
                Học viên xin nghỉ có phép (buổi):
              </span>
              <input
                type="text"
                value={data.absent_excused}
                onChange={(e) => updateStage(stageKey, 'absent_excused', e.target.value)}
                placeholder="Nhập số buổi..."
                className="w-48 border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </td>
        </tr>
        <tr>
          <td className="border border-slate-400 px-3 py-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-800">
                Học viên nghỉ không phép (buổi):
              </span>
              <input
                type="text"
                value={data.absent_unexcused}
                onChange={(e) => updateStage(stageKey, 'absent_unexcused', e.target.value)}
                placeholder="Nhập số buổi..."
                className="w-48 border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </td>
        </tr>
        <tr>
          <td className="border border-slate-400 px-3 py-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-800">Giáo viên xin nghỉ (buổi):</span>
              <input
                type="text"
                value={data.teacher_absent}
                onChange={(e) => updateStage(stageKey, 'teacher_absent', e.target.value)}
                placeholder="Nhập số buổi..."
                className="w-48 border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </td>
        </tr>

        <tr>
          <td className="border border-slate-400 px-3 py-2 font-medium text-slate-800 align-middle">
            Chuẩn bị bài mới
          </td>
          <td className="border border-slate-400 p-1.5">
            <textarea
              rows={2}
              value={data.preparation}
              onChange={(e) => updateStage(stageKey, 'preparation', e.target.value)}
              placeholder="Nhập nhận xét chuẩn bị bài mới..."
              className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded focus:bg-amber-50/40 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </td>
        </tr>

        <tr>
          <td className="border border-slate-400 px-3 py-2 font-medium text-slate-800 align-middle">
            Hoàn thành bài tập về nhà
          </td>
          <td className="border border-slate-400 px-3 py-1.5">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={data.homework_completed}
                onChange={(e) => updateStage(stageKey, 'homework_completed', e.target.value)}
                placeholder="..."
                className="w-24 border border-slate-300 rounded px-2.5 py-1 text-xs font-semibold text-slate-800 text-right focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-xs font-bold text-slate-700">/ 10</span>
            </div>
          </td>
        </tr>

        <tr>
          <td className="border border-slate-400 px-3 py-2 font-medium text-slate-800 align-middle">
            Mức độ tương tác trong lớp
          </td>
          <td className="border border-slate-400 p-1.5">
            <textarea
              rows={2}
              value={data.interaction}
              onChange={(e) => updateStage(stageKey, 'interaction', e.target.value)}
              placeholder="Nhập nhận xét mức độ tương tác..."
              className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded focus:bg-amber-50/40 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </td>
        </tr>

        <tr>
          <td className="border border-slate-400 px-3 py-2 font-medium text-slate-800 align-middle">
            Khả năng tiếp thu trong lớp
          </td>
          <td className="border border-slate-400 p-1.5">
            <textarea
              rows={2}
              value={data.comprehension}
              onChange={(e) => updateStage(stageKey, 'comprehension', e.target.value)}
              placeholder="Nhập nhận xét khả năng tiếp thu..."
              className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded focus:bg-amber-50/40 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </td>
        </tr>

        <tr>
          <td className="border border-slate-400 px-3 py-2 font-medium text-slate-800 align-middle">
            <div>Điểm mạnh - Tiến bộ</div>
            <div className="text-[11px] text-slate-500 font-normal">
              (Từ vựng / ngữ pháp / phát âm / phản xạ)
            </div>
          </td>
          <td className="border border-slate-400 p-1.5">
            <textarea
              rows={2}
              value={data.strengths}
              onChange={(e) => updateStage(stageKey, 'strengths', e.target.value)}
              placeholder="Nhập điểm mạnh - tiến bộ..."
              className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded focus:bg-amber-50/40 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </td>
        </tr>

        <tr>
          <td className="border border-slate-400 px-3 py-2 font-medium text-slate-800 align-middle">
            <div>Điểm hạn chế</div>
            <div className="text-[11px] text-slate-500 font-normal">
              (Từ vựng / ngữ pháp / phát âm / phản xạ)
            </div>
          </td>
          <td className="border border-slate-400 p-1.5">
            <textarea
              rows={2}
              value={data.weaknesses}
              onChange={(e) => updateStage(stageKey, 'weaknesses', e.target.value)}
              placeholder="Nhập điểm hạn chế..."
              className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded focus:bg-amber-50/40 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </td>
        </tr>

        <tr>
          <td className="border border-slate-400 px-3 py-2 font-medium text-slate-800 align-middle">
            Nhận xét bổ sung (nếu có)
          </td>
          <td className="border border-slate-400 p-1.5">
            <textarea
              rows={2}
              value={data.additional_notes}
              onChange={(e) => updateStage(stageKey, 'additional_notes', e.target.value)}
              placeholder="Nhập nhận xét bổ sung..."
              className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded focus:bg-amber-50/40 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </td>
        </tr>
      </>
    );
  };

  const renderExamSection = (title: string, examKey: 'midterm' | 'final_exam') => {
    const data = report[examKey];
    return (
      <>
        <tr>
          <td
            colSpan={2}
            className="bg-[#FFE599] border border-slate-400 px-3 py-2.5 font-extrabold text-slate-900 text-sm text-center uppercase"
          >
            {title}
          </td>
        </tr>
        <tr>
          <td
            rowSpan={4}
            className="border border-slate-400 px-3 py-2 font-semibold text-slate-800 align-middle w-[34%]"
          >
            Kết quả kiểm tra
          </td>
          <td className="border border-slate-400 px-3 py-1.5 w-[66%]">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="w-36 shrink-0 text-xs font-medium text-slate-800">Từ vựng:</span>
              <input
                type="text"
                value={data.vocabulary}
                onChange={(e) => updateExam(examKey, 'vocabulary', e.target.value)}
                placeholder="Nhập đánh giá / điểm từ vựng..."
                className="flex-1 border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </td>
        </tr>
        <tr>
          <td className="border border-slate-400 px-3 py-1.5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="w-36 shrink-0 text-xs font-medium text-slate-800">Ngữ pháp:</span>
              <input
                type="text"
                value={data.grammar}
                onChange={(e) => updateExam(examKey, 'grammar', e.target.value)}
                placeholder="Nhập đánh giá / điểm ngữ pháp..."
                className="flex-1 border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </td>
        </tr>
        <tr>
          <td className="border border-slate-400 px-3 py-1.5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="w-36 shrink-0 text-xs font-medium text-slate-800">Ngữ âm:</span>
              <input
                type="text"
                value={data.intonation}
                onChange={(e) => updateExam(examKey, 'intonation', e.target.value)}
                placeholder="Nhập đánh giá / điểm ngữ âm..."
                className="flex-1 border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </td>
        </tr>
        <tr>
          <td className="border border-slate-400 px-3 py-1.5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="w-36 shrink-0 text-xs font-medium text-slate-800">
                Độ trôi chảy:
              </span>
              <input
                type="text"
                value={data.fluency}
                onChange={(e) => updateExam(examKey, 'fluency', e.target.value)}
                placeholder="Nhập đánh giá / điểm độ trôi chảy..."
                className="flex-1 border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </td>
        </tr>
        <tr>
          <td colSpan={2} className="border border-slate-400 px-3 py-2 bg-slate-50">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-xs">
              <span>--&gt; Điểm:</span>
              <input
                type="text"
                value={data.score}
                onChange={(e) => updateExam(examKey, 'score', e.target.value)}
                placeholder="..."
                className="w-24 border border-slate-400 bg-white rounded px-2.5 py-1 text-xs font-extrabold text-slate-900 text-right focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span>/ 100</span>
            </div>
          </td>
        </tr>
        <tr>
          <td className="border border-slate-400 px-3 py-2 font-medium text-slate-800 align-middle">
            Nhận xét bổ sung (nếu có)
          </td>
          <td className="border border-slate-400 p-1.5">
            <textarea
              rows={2}
              value={data.additional_notes}
              onChange={(e) => updateExam(examKey, 'additional_notes', e.target.value)}
              placeholder="Nhập nhận xét bổ sung..."
              className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded focus:bg-amber-50/40 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
            />
          </td>
        </tr>
      </>
    );
  };

  return (
    <PageContainer>
      <PageHeader
        title={`Báo cáo học tập — ${student.full_name}`}
        description={`${studentCode} · Khóa ${courseCode} · Giáo viên: ${teacher}`}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(backTarget)}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              {backLabel}
            </Button>

            {savedAt && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Đã lưu lúc {savedAt}
              </span>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              leftIcon={<Printer className="w-4 h-4" />}
            >
              In / PDF
            </Button>

            {isReadonlyForCs && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-300 text-xs font-bold">
                <Lock className="w-3.5 h-3.5" />
                <span>Chỉ xem</span>
              </span>
            )}

            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              isLoading={saving}
              disabled={isReadonlyForCs || (enrollments.length > 1 && selectedEnrollmentId == null)}
              leftIcon={<Save className="w-4 h-4" />}
            >
              Lưu báo cáo
            </Button>
          </div>
        }
      />

      {enrollments.length > 1 && (
        <div className="mb-4 print:hidden">
          <div className="w-80 max-w-full">
            <Select
              label="Gói ghi danh"
              value={selectedEnrollmentId ?? ''}
              onChange={(e) => handleEnrollmentChange(e.target.value)}
            >
              <option value="">-- Chọn gói ghi danh --</option>
              {enrollments.map((e) => (
                <option key={e.id} value={e.id}>
                  {enrollmentLabel(e)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      )}

      {enrollments.length > 1 && selectedEnrollmentId == null ? (
        <div className="py-16 text-center text-sm text-text-muted bg-surface rounded-2xl border border-border/80 shadow-soft">
          Vui lòng chọn gói ghi danh
        </div>
      ) : templateMode === 'JLPT' ? (
        <div className="space-y-6 mb-10">
          {/* Bảng 1: Bảng Chuyên cần HV (22 cột chuẩn sheet Excel cho học viên này) */}
          <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/80 bg-slate-50/60 p-3 sm:px-4 text-xs">
              <span className="font-bold text-text-primary uppercase tracking-wider">
                Chuyên cần HV
              </span>
            </div>

            <JlptChuyenCanTable
              rows={[fallbackJlptRow]}
              onUpdateRow={handleInlineUpdateJlptRow}
            />
          </div>

          {/* Bảng 2: Nhật ký từng buổi học (NKHT) */}
          <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border/80 bg-slate-50/60 p-3 sm:px-4 text-xs">
              <span className="font-bold text-text-primary uppercase tracking-wider">
                Nhật ký học tập theo buổi (NKHT)
              </span>

              <div className="flex items-center gap-2 print:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isReadonlyForCs}
                  onClick={handleAddNkhtSession}
                  leftIcon={<Plus className="w-3.5 h-3.5" />}
                >
                  Thêm buổi
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isReadonlyForCs}
                  onClick={handleSave}
                  isLoading={saving}
                  leftIcon={<Save className="w-3.5 h-3.5" />}
                >
                  Lưu nhật ký
                </Button>
              </div>
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-surface-muted/90 text-text-secondary border-b border-border/80 text-[11px] font-bold text-center">
                    <th className="px-3 py-3 border-r border-border/60 w-24">Buổi số</th>
                    <th className="px-3 py-3 border-r border-border/60 w-36">Chuyên cần</th>
                    <th className="px-3 py-3 border-r border-border/60 w-36">
                      Chuẩn bị bài ở nhà
                    </th>
                    <th className="px-3 py-3 border-r border-border/60 w-40">
                      Thái độ học tập trong lớp
                    </th>
                    <th className="px-3 py-3 border-r border-border/60 w-40">
                      Điểm bài tập về nhà
                    </th>
                    <th className="px-3 py-3 border-r border-border/60 w-32">
                      Điểm kiểm tra
                    </th>
                    <th className="px-3 py-3 border-r border-border/60 text-left">
                      Ghi chú
                    </th>
                    <th className="px-2 py-3 w-16 print:hidden" />
                  </tr>
                </thead>
                <tbody>
                  {jlptNkhtSessions.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-10 text-center text-text-muted border-b border-border/60"
                      >
                        Chưa có dữ liệu buổi học.
                      </td>
                    </tr>
                  ) : (
                    jlptNkhtSessions.map((sess, idx) => (
                      <tr
                        key={idx}
                        className={`border-b border-border/60 hover:bg-slate-50/80 transition-colors ${
                          idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-surface'
                        }`}
                      >
                        <td className="px-2 py-2 border-r border-border/60 text-center">
                          <input
                            type="number"
                            min={1}
                            disabled={isReadonlyForCs}
                            value={sess.session_number}
                            onChange={(e) =>
                              handleUpdateNkhtSession(idx, {
                                session_number: Number(e.target.value) || idx + 1,
                                session_label: `Buổi ${Number(e.target.value) || idx + 1}`,
                              })
                            }
                            className="w-16 border border-border rounded-lg px-2 py-1 text-center font-bold bg-surface"
                          />
                        </td>
                        <td className="px-2 py-2 border-r border-border/60 text-center">
                          <select
                            disabled={isReadonlyForCs}
                            value={sess.attendance || ''}
                            onChange={(e) =>
                              handleUpdateNkhtSession(idx, {
                                attendance: e.target.value as 'O' | 'X' | '',
                              })
                            }
                            className={`border rounded-lg px-2.5 py-1 font-bold text-xs ${
                              sess.attendance === 'O'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : sess.attendance === 'X'
                                ? 'bg-rose-50 text-rose-800 border-rose-200'
                                : 'bg-surface border-border'
                            }`}
                          >
                            <option value="">—</option>
                            <option value="O">O (Có mặt)</option>
                            <option value="X">X (Vắng)</option>
                          </select>
                        </td>
                        <td className="px-2 py-2 border-r border-border/60 text-center">
                          <select
                            disabled={isReadonlyForCs}
                            value={sess.preparation || ''}
                            onChange={(e) =>
                              handleUpdateNkhtSession(idx, { preparation: e.target.value })
                            }
                            className="border border-border rounded-lg px-2.5 py-1 font-semibold bg-surface"
                          >
                            <option value="">—</option>
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                          </select>
                        </td>
                        <td className="px-2 py-2 border-r border-border/60 text-center">
                          <select
                            disabled={isReadonlyForCs}
                            value={sess.attitude || ''}
                            onChange={(e) =>
                              handleUpdateNkhtSession(idx, { attitude: e.target.value })
                            }
                            className="border border-border rounded-lg px-2.5 py-1 font-semibold bg-surface"
                          >
                            <option value="">—</option>
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                          </select>
                        </td>
                        <td className="px-2 py-2 border-r border-border/60 text-center">
                          <select
                            disabled={isReadonlyForCs}
                            value={sess.homework_status || ''}
                            onChange={(e) =>
                              handleUpdateNkhtSession(idx, {
                                homework_status: e.target.value,
                              })
                            }
                            className={`border rounded-lg px-2.5 py-1 font-semibold text-xs ${
                              sess.homework_status === 'Không'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : sess.homework_status === 'Có'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-surface border-border'
                            }`}
                          >
                            <option value="">—</option>
                            <option value="Có">Có</option>
                            <option value="Không">Không</option>
                          </select>
                        </td>
                        <td className="px-2 py-2 border-r border-border/60 text-center">
                          <input
                            type="number"
                            step="0.1"
                            min={0}
                            max={100}
                            disabled={isReadonlyForCs}
                            placeholder="—"
                            value={sess.exam_score ?? ''}
                            onChange={(e) =>
                              handleUpdateNkhtSession(idx, {
                                exam_score:
                                  e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                            className="w-20 border border-border rounded-lg px-2 py-1 text-center font-bold bg-surface"
                          />
                        </td>
                        <td className="px-2.5 py-2 border-r border-border/60">
                          <input
                            type="text"
                            disabled={isReadonlyForCs}
                            placeholder="Nhập ghi chú..."
                            value={sess.note || ''}
                            onChange={(e) =>
                              handleUpdateNkhtSession(idx, { note: e.target.value })
                            }
                            className="w-full border border-border rounded-lg px-2.5 py-1 bg-surface"
                          />
                        </td>
                        <td className="px-2 py-2 text-center print:hidden">
                          {!isReadonlyForCs && (
                            <button
                              type="button"
                              onClick={() => handleRemoveNkhtSession(idx)}
                              className="inline-flex items-center justify-center p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Xóa buổi"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* MẪU BÁO CÁO HỌC TẬP KAIWA (Giữ nguyên 100%) */
        <fieldset
          disabled={isReadonlyForCs}
          className="max-w-5xl mx-auto bg-white rounded-xl border border-slate-400 shadow-soft overflow-hidden mb-10 disabled:opacity-90"
        >
          <table className="w-full border-collapse text-xs text-slate-900">
            <tbody>
              <tr>
                <td
                  colSpan={2}
                  className="bg-[#B6D7A8] border border-slate-400 py-4 px-4 text-center font-extrabold text-lg tracking-wide text-slate-900 uppercase"
                >
                  BÁO CÁO HỌC TẬP
                </td>
              </tr>

              <tr className="h-3 bg-white">
                <td colSpan={2} className="border-x border-slate-400" />
              </tr>

              <tr>
                <td
                  colSpan={2}
                  className="border border-slate-400 px-4 py-2 font-extrabold text-sm text-slate-900 bg-slate-50 uppercase"
                >
                  THÔNG TIN HỌC VIÊN
                </td>
              </tr>
              <tr>
                <td colSpan={2} className="border border-slate-400 px-4 py-2 text-xs">
                  <span className="font-semibold text-slate-700 inline-block w-48">
                    - Họ tên học viên:
                  </span>
                  <strong className="text-slate-900 text-sm">{student.full_name}</strong>
                </td>
              </tr>
              <tr>
                <td colSpan={2} className="border border-slate-400 px-4 py-2 text-xs">
                  <span className="font-semibold text-slate-700 inline-block w-48">
                    - Mã học viên:
                  </span>
                  <strong className="font-mono text-slate-900">{studentCode}</strong>
                </td>
              </tr>
              <tr>
                <td colSpan={2} className="border border-slate-400 px-4 py-2 text-xs">
                  <span className="font-semibold text-slate-700 inline-block w-48">
                    - Khóa học:
                  </span>
                  <strong className="text-slate-900">{courseCode}</strong>
                </td>
              </tr>
              <tr>
                <td colSpan={2} className="border border-slate-400 px-4 py-2 text-xs">
                  <span className="font-semibold text-slate-700 inline-block w-48">
                    - Giáo viên giảng dạy:
                  </span>
                  <strong className="text-slate-900">{teacher}</strong>
                </td>
              </tr>

              <tr>
                <td className="bg-[#C9DAF8] border border-slate-400 px-3 py-2.5 font-bold text-slate-900 align-middle w-[34%]">
                  Thông tin trao đổi với HV
                </td>
                <td className="border border-slate-400 p-1.5 w-[66%]">
                  <textarea
                    rows={2}
                    value={report.exchange_with_student}
                    onChange={(e) =>
                      setReport((prev) => ({
                        ...prev,
                        exchange_with_student: e.target.value,
                      }))
                    }
                    placeholder="Nhập thông tin trao đổi với học viên..."
                    className="w-full px-2.5 py-1.5 text-xs text-slate-800 bg-transparent rounded focus:bg-blue-50/40 focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                  />
                </td>
              </tr>

              <tr className="h-3 bg-white">
                <td colSpan={2} className="border-x border-slate-400" />
              </tr>

              {renderShortSessionSection('Buổi 1', 'session_1')}

              <tr className="h-3 bg-white">
                <td colSpan={2} className="border-x border-slate-400" />
              </tr>

              {renderShortSessionSection('Buổi 3', 'session_3')}

              <tr className="h-3 bg-white">
                <td colSpan={2} className="border-x border-slate-400" />
              </tr>

              {renderTenSessionSection('Buổi 1-10', 'sessions_1_10')}

              <tr className="h-3 bg-white">
                <td colSpan={2} className="border-x border-slate-400" />
              </tr>

              {renderTenSessionSection('Buổi 11-20', 'sessions_11_20')}

              <tr className="h-3 bg-white">
                <td colSpan={2} className="border-x border-slate-400" />
              </tr>

              {renderTenSessionSection('Buổi 21-30', 'sessions_21_30')}

              <tr className="h-3 bg-white">
                <td colSpan={2} className="border-x border-slate-400" />
              </tr>

              {renderExamSection('KẾT QUẢ GIỮA KỲ', 'midterm')}

              <tr className="h-3 bg-white">
                <td colSpan={2} className="border-x border-slate-400" />
              </tr>

              {renderExamSection('KẾT QUẢ CUỐI KHOÁ', 'final_exam')}
            </tbody>
          </table>
        </fieldset>
      )}
    </PageContainer>
  );
};
