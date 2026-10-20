import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { studentsApi } from '../api/students.api';
import { Student } from '../types/students.types';
import { PageContainer } from '../../../components/common/PageContainer';
import { Button } from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import { ArrowLeft, Save, CheckCircle2, Printer } from 'lucide-react';

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
}

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
  sessions_1_10: {
    ...emptyStageBlock(),
    ...(raw?.sessions_1_10 || {}),
  },
  sessions_11_20: {
    ...emptyStageBlock(),
    ...(raw?.sessions_11_20 || {}),
  },
  sessions_21_30: {
    ...emptyStageBlock(),
    ...(raw?.sessions_21_30 || {}),
  },
  midterm: {
    ...emptyExamBlock(),
    ...(raw?.midterm || {}),
  },
  final_exam: {
    ...emptyExamBlock(),
    ...(raw?.final_exam || {}),
  },
});

export const StudentStudyReportPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [report, setReport] = useState<StudyReportData>(() => createInitialReportData());

  useEffect(() => {
    const fetchDetail = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const data = await studentsApi.get(Number(id));
        setStudent(data);
        const enr = data.enrollments?.[0];
        const savedReport = (enr?.program_metadata as any)?.study_report;
        setReport(
          createInitialReportData({
            ...savedReport,
            exchange_with_student:
              savedReport?.exchange_with_student !== undefined
                ? savedReport.exchange_with_student
                : enr?.exchange_info || '',
          })
        );
      } catch (err: any) {
        toast.error(err.response?.data?.error?.message || 'Không thể tải báo cáo học tập của học viên');
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [id]);

  const handleSave = async () => {
    if (!student) return;
    const enr = student.enrollments?.[0];
    try {
      setSaving(true);
      const nextMeta = {
        ...(enr?.program_metadata || {}),
        study_report: report,
      };
      await studentsApi.update(student.id, {
        program_type: (enr?.program_type as any) || 'KAIWA',
        program_metadata: nextMeta,
        exchange_info: report.exchange_with_student,
        study_report_url: `/students/${student.id}/study-report`,
      });
      setSavedAt(new Date().toLocaleTimeString('vi-VN'));
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
          <Button variant="outline" size="sm" onClick={() => navigate('/students')}>
            Quay lại Danh sách học viên
          </Button>
        </div>
      </PageContainer>
    );
  }

  const enr = student.enrollments?.[0];
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

        {/* Độ chuyên cần (gộp 3 dòng bên cột trái giống Excel A25:A27) */}
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
      {/* Top Action Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/students')}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          >
            Quay lại Danh sách học viên
          </Button>
          {savedAt && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Đã lưu lúc {savedAt}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            leftIcon={<Printer className="w-4 h-4" />}
          >
            In / Xuất PDF
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            isLoading={saving}
            leftIcon={<Save className="w-4 h-4" />}
          >
            Lưu báo cáo
          </Button>
        </div>
      </div>

      {/* Sheet 1 Container (giống bố cục Theo_doi_hoc_tap.xlsx) */}
      <div className="max-w-5xl mx-auto bg-white rounded-xl border border-slate-400 shadow-soft overflow-hidden mb-10">
        <table className="w-full border-collapse text-xs text-slate-900">
          <tbody>
            {/* Row 1: BÁO CÁO HỌC TẬP */}
            <tr>
              <td
                colSpan={2}
                className="bg-[#B6D7A8] border border-slate-400 py-4 px-4 text-center font-extrabold text-lg tracking-wide text-slate-900 uppercase"
              >
                BÁO CÁO HỌC TẬP
              </td>
            </tr>

            {/* Row 2: Spacer */}
            <tr className="h-3 bg-white">
              <td colSpan={2} className="border-x border-slate-400" />
            </tr>

            {/* Row 3-7: THÔNG TIN HỌC VIÊN (Điền sẵn) */}
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

            {/* Row 8: Thông tin trao đổi với HV */}
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

            {/* Spacer */}
            <tr className="h-3 bg-white">
              <td colSpan={2} className="border-x border-slate-400" />
            </tr>

            {/* Buổi 1 */}
            {renderShortSessionSection('Buổi 1', 'session_1')}

            {/* Spacer */}
            <tr className="h-3 bg-white">
              <td colSpan={2} className="border-x border-slate-400" />
            </tr>

            {/* Buổi 3 */}
            {renderShortSessionSection('Buổi 3', 'session_3')}

            {/* Spacer */}
            <tr className="h-3 bg-white">
              <td colSpan={2} className="border-x border-slate-400" />
            </tr>

            {/* Buổi 1-10 */}
            {renderTenSessionSection('Buổi 1-10', 'sessions_1_10')}

            {/* Spacer */}
            <tr className="h-3 bg-white">
              <td colSpan={2} className="border-x border-slate-400" />
            </tr>

            {/* Buổi 11-20 */}
            {renderTenSessionSection('Buổi 11-20', 'sessions_11_20')}

            {/* Spacer */}
            <tr className="h-3 bg-white">
              <td colSpan={2} className="border-x border-slate-400" />
            </tr>

            {/* Buổi 21-30 */}
            {renderTenSessionSection('Buổi 21-30', 'sessions_21_30')}

            {/* Spacer */}
            <tr className="h-3 bg-white">
              <td colSpan={2} className="border-x border-slate-400" />
            </tr>

            {/* KẾT QUẢ GIỮA KỲ */}
            {renderExamSection('KẾT QUẢ GIỮA KỲ', 'midterm')}

            {/* Spacer */}
            <tr className="h-3 bg-white">
              <td colSpan={2} className="border-x border-slate-400" />
            </tr>

            {/* KẾT QUẢ CUỐI KHOÁ */}
            {renderExamSection('KẾT QUẢ CUỐI KHOÁ', 'final_exam')}
          </tbody>
        </table>
      </div>
    </PageContainer>
  );
};
