import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { studentsApi } from '../api/students.api';
import {
  Student,
  JlptAttendanceReportRow,
  UpdateJlptAttendanceReportDTO,
} from '../types/students.types';
import { Enrollment } from '../../enrollments/types/enrollments.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { PageHeader } from '../../../components/common/PageHeader';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../contexts/AuthContext';
import {
   JlptChuyenCanTable,
  renderExamWarningBadge,
} from './JlptAttendanceReportPage';
import {
  AlertTriangle,
  ArrowLeft,
  Award,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Lock,
  Printer,
  Save,
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
    nkht_sessions: [],
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

            {templateMode === 'KAIWA' && (
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
            )}
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
        <div className="space-y-5 mb-10">
          {/* Tổng quan Chuyên cần & Lộ trình Kiểm tra JLPT */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Tổng quan Chuyên cần &amp; Lộ trình Kiểm tra JLPT
              </h2>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {fallbackJlptRow.class_code && (
                  <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 font-mono font-bold">
                    Lớp: {fallbackJlptRow.class_code}
                  </span>
                )}
                {fallbackJlptRow.cvht_code && (
                  <span className="px-2.5 py-0.5 rounded-md bg-violet-50 text-violet-800 border border-violet-200 font-semibold">
                    CVHT: {fallbackJlptRow.cvht_code}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {/* Thẻ 1: A. CHUYÊN CẦN */}
              {(() => {
                const rawRate = fallbackJlptRow.attendance_rate;
                const hasRate =
                  rawRate !== null &&
                  rawRate !== undefined &&
                  !Number.isNaN(Number(rawRate));
                const numRate = hasRate ? Number(rawRate) : 0;
                const pct = hasRate
                  ? Math.round(numRate <= 1 ? numRate * 100 : numRate)
                  : null;
                const clampedPct =
                  pct !== null ? Math.min(100, Math.max(0, pct)) : 0;

                const barColorClass =
                  pct === null
                    ? 'bg-slate-300'
                    : pct >= 85
                    ? 'bg-emerald-500'
                    : pct >= 70
                    ? 'bg-amber-500'
                    : 'bg-rose-500';

                const badgeColorClass =
                  pct === null
                    ? 'bg-slate-100 text-slate-600 border-slate-200'
                    : pct >= 85
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : pct >= 70
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200';

                return (
                  <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                        <CalendarCheck className="w-4 h-4 text-emerald-600" />
                        <span>A. Chuyên cần</span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-extrabold border ${badgeColorClass}`}
                      >
                        {pct !== null ? `${pct}%` : '—'}
                      </span>
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-500">
                        Số buổi tham gia / Tổng đã điểm danh
                      </div>
                      <div className="text-xl font-extrabold text-slate-900 mt-0.5">
                        {fallbackJlptRow.attended_sessions ?? 0}{' '}
                        <span className="text-sm font-semibold text-slate-400">
                          / {fallbackJlptRow.total_marked_sessions ?? 0} buổi
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${barColorClass}`}
                          style={{ width: `${clampedPct}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>Mốc chuẩn: ≥ 85%</span>
                        <span>
                          {pct === null
                            ? 'Chưa chấm buổi'
                            : pct >= 85
                            ? 'Đạt yêu cầu'
                            : pct >= 70
                            ? 'Cần lưu ý'
                            : 'Báo động chuyên cần'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Thẻ 2: B. BÀI TẬP VỀ NHÀ */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-blue-700">
                    <ClipboardList className="w-4 h-4 text-blue-600" />
                    <span>B. Bài tập về nhà</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold">
                    BTVN &amp; Điểm KT
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-2.5">
                    <div className="text-[11px] text-slate-500">
                      Điểm KT trung bình
                    </div>
                    <div className="text-lg font-extrabold text-blue-700 mt-0.5">
                      {fallbackJlptRow.average_exam_score !== null &&
                      fallbackJlptRow.average_exam_score !== undefined
                        ? fallbackJlptRow.average_exam_score
                        : '—'}
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-2.5">
                    <div className="text-[11px] text-slate-500">
                      Số buổi đã làm bài
                    </div>
                    <div className="text-lg font-extrabold text-slate-900 mt-0.5">
                      {fallbackJlptRow.homework_completed_sessions ?? 0}{' '}
                      <span className="text-xs font-semibold text-slate-400">
                        buổi
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500">
                  Trạng thái học:{' '}
                  <strong className="text-slate-800">
                    {fallbackJlptRow.status_label || fallbackJlptRow.status || 'Đang học'}
                  </strong>
                </div>
              </div>

              {/* Thẻ 3: C. CẢNH BÁO LIÊN TIẾP */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>C. Cảnh báo liên tiếp</span>
                  </span>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-2.5 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600">
                        Vắng liên tiếp tối đa:
                      </span>
                      <strong className="text-sm font-extrabold text-slate-900">
                        {fallbackJlptRow.max_consecutive_absent ?? 0} buổi
                      </strong>
                    </div>
                    {fallbackJlptRow.absent_warning ? (
                      <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200 text-[11px] font-semibold">
                        {fallbackJlptRow.absent_warning}
                      </div>
                    ) : (
                      <div className="text-[11px] text-emerald-700 font-medium">
                        Ổn định (Không có cảnh báo vắng)
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-2.5 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-600">
                        Không BTVN liên tiếp:
                      </span>
                      <strong className="text-sm font-extrabold text-slate-900">
                        {fallbackJlptRow.max_consecutive_no_homework ?? 0} buổi
                      </strong>
                    </div>
                    {fallbackJlptRow.no_homework_warning ? (
                      <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-semibold">
                        {fallbackJlptRow.no_homework_warning}
                      </div>
                    ) : (
                      <div className="text-[11px] text-emerald-700 font-medium">
                        Đầy đủ BTVN
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Thẻ 4: Lộ trình Kiểm tra (KT gần nhất & KT tiếp theo) */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-violet-700">
                    <Award className="w-4 h-4 text-violet-600" />
                    <span>Lộ trình Kiểm tra</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-violet-50 text-violet-800 border border-violet-200 font-mono font-bold text-[11px]">
                    Khóa: {fallbackJlptRow.course_track || '—'}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-2">
                    <div className="text-[11px] text-slate-500">KT gần nhất</div>
                    {fallbackJlptRow.last_exam_name ? (
                      <div className="font-bold text-slate-900 mt-0.5">
                        {fallbackJlptRow.last_exam_name}
                        {fallbackJlptRow.last_exam_session !== null &&
                          fallbackJlptRow.last_exam_session !== undefined && (
                            <span className="font-normal text-slate-600">
                              {' '}
                              • Buổi {fallbackJlptRow.last_exam_session}
                            </span>
                          )}
                        {fallbackJlptRow.sessions_since_last_exam !== null &&
                          fallbackJlptRow.sessions_since_last_exam !==
                            undefined && (
                            <span className="block text-[11px] font-normal text-slate-500">
                              Cách đây {fallbackJlptRow.sessions_since_last_exam} buổi
                            </span>
                          )}
                      </div>
                    ) : (
                      <div className="text-slate-400 mt-0.5">Chưa có bài KT</div>
                    )}
                  </div>

                  <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-2">
                    <div className="text-[11px] text-slate-500">KT tiếp theo</div>
                    {fallbackJlptRow.next_exam_name ? (
                      <div className="font-bold text-slate-900 mt-0.5">
                        {fallbackJlptRow.next_exam_name}
                        {fallbackJlptRow.next_exam_session !== null &&
                          fallbackJlptRow.next_exam_session !== undefined && (
                            <span className="font-normal text-slate-600">
                              {' '}
                              • Buổi {fallbackJlptRow.next_exam_session}
                            </span>
                          )}
                        {fallbackJlptRow.sessions_until_next_exam !== null &&
                          fallbackJlptRow.sessions_until_next_exam !==
                            undefined && (
                            <span className="block text-[11px] font-semibold text-blue-700">
                              Còn {fallbackJlptRow.sessions_until_next_exam} buổi nữa
                            </span>
                          )}
                      </div>
                    ) : (
                      <div className="text-slate-400 mt-0.5">Đã hoàn tất lộ trình KT</div>
                    )}
                  </div>
                </div>

                <div className="pt-0.5">
                  {renderExamWarningBadge(fallbackJlptRow.exam_schedule_warning)}
                </div>
              </div>
            </div>
          </div>

          {/* Bảng Chuyên cần HV 22 cột để chỉnh sửa trực tiếp (inline edit) */}
          <div className="bg-surface rounded-2xl border border-border/80 shadow-soft overflow-hidden">
            <JlptChuyenCanTable
              rows={[fallbackJlptRow]}
              onUpdateRow={handleInlineUpdateJlptRow}
            />
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
