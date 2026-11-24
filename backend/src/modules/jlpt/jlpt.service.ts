import {
  ClassSessionType,
  JlptTemplateChangeRequestStatus,
  ProgramType,
} from '@prisma/client';
import { AppError } from '../../middlewares/error.middleware';
import { AuthUser } from '../../middlewares/auth.middleware';
import { assertClassAccess, getAccessibleClassIds } from '../classes/classes.scope';
import { presentAttendanceForActor } from '../attendance/attendance.presenter';
import { findEffectiveAssignment } from '../attendance/teacher-assignment';
import { getStudentCsScope } from '../students/students.repository';
import { JlptRepository } from './jlpt.repository';
import {
  ClassTemplatePreview,
  JlptLearningRecordBulkInput,
  JlptLearningRecordPatchInput,
  JlptTemplateChangeRequestInput,
  JlptTemplateInput,
  JlptTemplateItemInput,
} from './jlpt.types';

export class JlptService {
  private repository: JlptRepository;

  constructor(repository = new JlptRepository()) {
    this.repository = repository;
  }

  async listTemplates(active?: boolean) {
    return this.repository.listTemplates(active);
  }

  async getTemplate(templateId: number) {
    this.assertPositiveId(templateId, 'templateId');
    const template = await this.repository.findTemplateById(templateId);
    if (!template) throw new AppError(404, 'Không tìm thấy template JLPT toàn cục');
    return template;
  }

  async createTemplate(data: JlptTemplateInput, actor: AuthUser) {
    this.assertAdmin(actor);
    this.validateTemplateItems(data.items, data.total_sessions);
    const created = await this.repository.createTemplate(this.normalizeTemplateInput(data), actor.id);
    if (!created) throw new AppError(409, 'Template JLPT toàn cục đã tồn tại');
    return created;
  }

  async updateTemplate(templateId: number, data: JlptTemplateInput, actor: AuthUser) {
    this.assertPositiveId(templateId, 'templateId');
    await this.assertCanChangeGlobalTemplate(actor);
    this.validateTemplateItems(data.items, data.total_sessions);
    const updated = await this.repository.updateTemplate(templateId, this.normalizeTemplateInput(data), actor.id);
    if (!updated) throw new AppError(404, 'Không tìm thấy template JLPT toàn cục');
    return updated;
  }

  async deleteTemplate(templateId: number, actor: AuthUser) {
    this.assertAdmin(actor);
    this.assertPositiveId(templateId, 'templateId');
    const existing = await this.repository.findTemplateById(templateId);
    if (!existing) throw new AppError(404, 'Không tìm thấy template JLPT toàn cục');
    const [classCount, recordCount, requestCount] = await this.repository.countJlptDependencies();
    if (classCount > 0 || recordCount > 0 || requestCount > 0) {
      throw new AppError(409, 'Không thể xóa template khi còn lớp hoặc dữ liệu JLPT phụ thuộc');
    }
    await this.repository.deleteTemplate(templateId, actor.id);
  }

  async previewTemplate(templateId: number, classIds: number[], actor: AuthUser) {
    const template = await this.getTemplate(templateId);
    await this.assertClassesInScope(actor, classIds);
    const classes = await this.repository.findClassesForPreview(classIds);
    if (classes.length !== classIds.length) throw new AppError(404, 'Không tìm thấy một hoặc nhiều lớp trong phạm vi');
    if (classes.some((item) => item.program_type !== ProgramType.JLPT)) {
      throw new AppError(409, 'Chỉ có thể áp template cho lớp JLPT');
    }
    return {
      template,
      classes: this.buildPreviews(template.items, classes),
    };
  }

  async getClassTemplateStatus(classId: number, actor: AuthUser) {
    await assertClassAccess(actor, classId, 'xem trạng thái template JLPT');
    const template = await this.repository.findGlobalTemplate();
    if (!template) throw new AppError(404, 'Chưa có template JLPT toàn cục');
    const classes = await this.repository.findClassesForPreview([classId]);
    if (!classes[0]) throw new AppError(404, 'Không tìm thấy lớp học');
    if (classes[0].program_type !== ProgramType.JLPT) throw new AppError(409, 'Lớp không thuộc chương trình JLPT');
    return { template, class: this.buildPreviews(template.items, classes)[0] };
  }

  async applyTemplateToClass(classId: number, actor: AuthUser) {
    this.assertAdminOrManage(actor);
    const preview = await this.previewTemplateByClass(classId, actor);
    const result = await this.repository.applyTemplateToClasses(preview.template.id, [preview.class], actor.id);
    if (!result) throw new AppError(404, 'Không tìm thấy template JLPT toàn cục');
    return preview;
  }

  async submitChangeRequest(templateId: number, data: JlptTemplateChangeRequestInput, actor: AuthUser) {
    if (!actor.roles.includes('TEACHER')) throw new AppError(403, 'Chỉ giáo viên được gửi yêu cầu thay đổi template');
    await assertClassAccess(actor, data.class_id, 'gửi yêu cầu thay đổi template từ lớp này');
    const classes = await this.repository.findClassesForPreview([data.class_id]);
    if (!classes[0]) throw new AppError(404, 'Không tìm thấy lớp học');
    if (classes[0].program_type !== ProgramType.JLPT) throw new AppError(409, 'Lớp nguồn không thuộc chương trình JLPT');
    this.validateTemplateItems(data.proposed_items);
    const proposedItems = this.normalizeTemplateItems(data.proposed_items);
    const created = await this.repository.createChangeRequest(
      templateId,
      data.class_id,
      proposedItems,
      data.request_note?.trim() || null,
      actor.id,
    );
    if (!created) throw new AppError(404, 'Không tìm thấy template JLPT toàn cục');
    return created;
  }

  async approveChangeRequest(requestId: number, reviewReason: string | null, actor: AuthUser) {
    await this.assertCanChangeGlobalTemplate(actor);
    const request = await this.repository.findChangeRequest(requestId);
    if (!request) throw new AppError(404, 'Không tìm thấy yêu cầu thay đổi template');
    if (request.status !== JlptTemplateChangeRequestStatus.PENDING) {
      throw new AppError(409, 'Yêu cầu thay đổi template không còn ở trạng thái chờ');
    }
    const snapshot = request.proposed_snapshot as unknown as { items?: JlptTemplateItemInput[] };
    if (!Array.isArray(snapshot.items)) throw new AppError(409, 'Snapshot đề xuất của yêu cầu không hợp lệ');
    this.validateTemplateItems(snapshot.items);
    const allJlptClasses = await this.getAllJlptPreviews(snapshot.items, actor);
    const reviewed = await this.repository.reviewChangeRequest(
      requestId,
      actor.id,
      JlptTemplateChangeRequestStatus.APPROVED,
      reviewReason,
      allJlptClasses,
    );
    if (!reviewed) throw new AppError(409, 'Yêu cầu thay đổi template không còn ở trạng thái chờ');
    return { request: reviewed, classes: allJlptClasses };
  }

  async rejectChangeRequest(requestId: number, reviewReason: string, actor: AuthUser) {
    await this.assertCanChangeGlobalTemplate(actor);
    const request = await this.repository.findChangeRequest(requestId);
    if (!request) throw new AppError(404, 'Không tìm thấy yêu cầu thay đổi template');
    if (request.status !== JlptTemplateChangeRequestStatus.PENDING) {
      throw new AppError(409, 'Yêu cầu thay đổi template không còn ở trạng thái chờ');
    }
    const reviewed = await this.repository.reviewChangeRequest(
      requestId,
      actor.id,
      JlptTemplateChangeRequestStatus.REJECTED,
      reviewReason,
      [],
    );
    if (!reviewed) throw new AppError(409, 'Yêu cầu thay đổi template không còn ở trạng thái chờ');
    return reviewed;
  }

  async changeClassProgram(classId: number, programType: ProgramType, actor: AuthUser) {
    this.assertAdminOrManage(actor);
    await assertClassAccess(actor, classId, 'đổi chương trình lớp học');
    const state = await this.repository.findClassProgramState(classId);
    if (!state) throw new AppError(404, 'Không tìm thấy lớp học');
    if (state.program_type === programType) {
      const current = await this.repository.findClassById(classId);
      if (!current) throw new AppError(404, 'Không tìm thấy lớp học');
      return current;
    }

    if (programType === ProgramType.JLPT) {
      const template = await this.repository.findGlobalTemplate();
      if (!template?.active) throw new AppError(409, 'Phải có template JLPT toàn cục đang hoạt động trước khi đổi lớp sang JLPT');
    } else {
      const hasRecords = state.enrollment_classes.some((item) => item.jlpt_learning_records.length > 0);
      if (hasRecords || state.jlpt_template_change_requests.length > 0) {
        throw new AppError(409, 'Không thể đổi sang Kaiwa khi lớp đã có dữ liệu hoặc yêu cầu JLPT');
      }
    }

    const updated = await this.repository.updateClassProgram(classId, programType, actor.id);
    if (!updated) throw new AppError(404, 'Không tìm thấy lớp học');
    return updated;
  }

  async listLearningRecords(classId: number, sessionId: number, actor: AuthUser) {
    this.assertPositiveId(classId, 'classId');
    this.assertPositiveId(sessionId, 'sessionId');
    await assertClassAccess(actor, classId, 'xem nhật ký học tập JLPT');
    await this.assertJlptLearningContext(classId, sessionId);
    const allowedCsIds = await this.resolveLearningRowScope(actor);
    const rows = await this.repository.listLearningRecordRows(classId, sessionId, allowedCsIds);
    return rows.map((row: any) => ({
      enrollment_class_id: row.id,
      student: row.enrollment.student,
      attendance: row.attendance[0]
        ? presentAttendanceForActor(row.attendance[0], actor)
        : null,
      learning_record: row.jlpt_learning_records[0] ?? null,
    }));
  }

  async updateLearningRecord(
    classId: number,
    sessionId: number,
    enrollmentClassId: number,
    patch: JlptLearningRecordPatchInput,
    actor: AuthUser,
  ) {
    this.assertLearningWriteRole(actor);
    this.assertPositiveId(enrollmentClassId, 'enrollmentClassId');
    await assertClassAccess(actor, classId, 'cập nhật nhật ký học tập JLPT');
    const context = await this.assertJlptLearningContext(classId, sessionId);
    await this.assertTeacherLearningWrite(actor, classId, context.session_date);
    const allowedCsIds = await this.resolveLearningRowScope(actor);
    await this.assertLearningEnrollmentClasses(classId, sessionId, [enrollmentClassId], allowedCsIds);
    return this.repository.saveLearningRecord(sessionId, enrollmentClassId, patch, actor.id);
  }

  async updateLearningRecordsBulk(
    classId: number,
    sessionId: number,
    input: JlptLearningRecordBulkInput,
    actor: AuthUser,
  ) {
    this.assertLearningWriteRole(actor);
    await assertClassAccess(actor, classId, 'cập nhật hàng loạt nhật ký học tập JLPT');
    const context = await this.assertJlptLearningContext(classId, sessionId);
    await this.assertTeacherLearningWrite(actor, classId, context.session_date);
    const allowedCsIds = await this.resolveLearningRowScope(actor);
    await this.assertLearningEnrollmentClasses(classId, sessionId, input.enrollment_class_ids, allowedCsIds);
    const { enrollment_class_ids, field, value } = input;
    return this.repository.saveLearningRecordsBulk(
      sessionId,
      enrollment_class_ids,
      { field, value } as JlptLearningRecordPatchInput,
      actor.id,
    );
  }

  validateTemplateItems(items: JlptTemplateItemInput[], totalSessions?: number) {
    if (items.length === 0) throw new AppError(400, 'Template phải có ít nhất một vị trí buổi');
    const numbers = items.map((item) => item.session_number);
    if (new Set(numbers).size !== numbers.length) throw new AppError(409, 'Số thứ tự buổi trong template không được trùng');
    const expectedTotal = totalSessions ?? Math.max(...numbers);
    if (items.length !== expectedTotal || numbers.some((number) => number > expectedTotal)) {
      throw new AppError(400, 'Template phải khai báo đủ từng vị trí từ 1 đến tổng số buổi');
    }
    for (let number = 1; number <= expectedTotal; number += 1) {
      if (!numbers.includes(number)) throw new AppError(400, 'Template phải khai báo đủ từng vị trí từ 1 đến tổng số buổi');
    }

    const testTitles = new Set<string>();
    for (const item of items) {
      const title = item.session_title?.trim() || null;
      if (item.session_type === ClassSessionType.TEST && !title) {
        throw new AppError(400, 'Buổi TEST bắt buộc có tên');
      }
      if (item.session_type === ClassSessionType.TEST && title) {
        const key = title.toLocaleLowerCase('vi-VN');
        if (testTitles.has(key)) throw new AppError(409, 'Tên buổi TEST không được trùng trong template');
        testTitles.add(key);
      }
    }
  }

  private async previewTemplateByClass(classId: number, actor: AuthUser) {
    const template = await this.repository.findGlobalTemplate();
    if (!template) throw new AppError(404, 'Chưa có template JLPT toàn cục');
    const result = await this.previewTemplate(template.id, [classId], actor);
    return { template: result.template, class: result.classes[0] };
  }

  private async getAllJlptPreviews(items: JlptTemplateItemInput[], actor: AuthUser) {
    await this.assertCanChangeGlobalTemplate(actor);
    const classIds = await this.repository.findAllJlptClassIds();
    const classes = await this.repository.findClassesForPreview(classIds);
    return this.buildPreviews(items, classes);
  }

  private buildPreviews(items: JlptTemplateItemInput[], classes: any[]): ClassTemplatePreview[] {
    return classes.map((cls) => {
      const sessionsByNumber = new Map<number, any>(cls.class_sessions.map((session: any) => [session.session_number, session]));
      const itemNumbers = new Set(items.map((item) => item.session_number));
      const diffs = items.map((item) => {
        const session = sessionsByNumber.get(item.session_number);
        const expected = { session_type: item.session_type, session_title: item.session_title?.trim() || null };
        const actual = session
          ? { session_type: session.session_type, session_title: session.session_title ?? null }
          : null;
        const state = !session
          ? 'MISSING' as const
          : actual?.session_type === expected.session_type && actual?.session_title === expected.session_title
            ? 'MATCHED' as const
            : 'MISMATCH' as const;
        return {
          session_number: item.session_number,
          class_session_id: session?.id ?? null,
          expected,
          actual,
          state,
        };
      });
      return {
        class_id: cls.id,
        class_code: cls.class_code,
        class_name: cls.class_name,
        diffs,
        extra_session_numbers: cls.class_sessions
          .filter((session: any) => !itemNumbers.has(session.session_number))
          .map((session: any) => session.session_number),
        can_apply: true,
      };
    });
  }

  private normalizeTemplateInput(data: JlptTemplateInput): JlptTemplateInput {
    return {
      ...data,
      name: data.name.trim(),
      items: this.normalizeTemplateItems(data.items),
    };
  }

  private normalizeTemplateItems(items: JlptTemplateItemInput[]): JlptTemplateItemInput[] {
    return items.map((item) => ({
      session_number: item.session_number,
      session_type: item.session_type,
      session_title: item.session_title?.trim() || null,
    }));
  }

  private async assertClassesInScope(actor: AuthUser, classIds: number[]) {
    this.assertAdminOrManage(actor);
    if (actor.roles.includes('ADMIN')) return;
    const accessible = await getAccessibleClassIds(actor);
    if (accessible === null) return;
    if (classIds.some((id) => !accessible.includes(id))) {
      throw new AppError(403, 'Một hoặc nhiều lớp nằm ngoài phạm vi quản lý');
    }
  }

  private async assertCanChangeGlobalTemplate(actor: AuthUser) {
    this.assertAdminOrManage(actor);
    if (actor.roles.includes('ADMIN')) return;
    const accessible = await getAccessibleClassIds(actor);
    const allJlptIds = await this.repository.findAllJlptClassIds();
    if (accessible === null) return;
    if (allJlptIds.some((id) => !accessible.includes(id))) {
      throw new AppError(403, 'MANAGE chỉ được thay đổi template khi phạm vi bao phủ toàn bộ lớp JLPT');
    }
  }

  private async assertJlptLearningContext(classId: number, sessionId: number) {
    const context = await this.repository.findLearningContext(classId, sessionId);
    if (!context) throw new AppError(404, 'Không tìm thấy buổi học trong lớp này');
    if (context.class.program_type !== ProgramType.JLPT) {
      throw new AppError(409, 'Nhật ký học tập chỉ áp dụng cho lớp JLPT');
    }
    return context;
  }

  private async resolveLearningRowScope(actor: AuthUser): Promise<number[] | undefined> {
    if (actor.roles.includes('ADMIN') || actor.roles.includes('TEACHER')) return undefined;
    if (actor.roles.includes('MANAGE') || actor.roles.includes('CS')) {
      return getStudentCsScope(actor);
    }
    throw new AppError(403, 'Bạn không có quyền xem nhật ký học tập JLPT');
  }

  private assertLearningWriteRole(actor: AuthUser) {
    if (!actor.roles.some((role) => role === 'ADMIN' || role === 'MANAGE' || role === 'TEACHER')) {
      throw new AppError(403, 'Cần quyền ADMIN, MANAGE hoặc TEACHER để cập nhật nhật ký JLPT');
    }
  }

  private async assertTeacherLearningWrite(actor: AuthUser, classId: number, sessionDate: Date) {
    if (!actor.roles.includes('TEACHER') || actor.roles.some((role) => role === 'ADMIN' || role === 'MANAGE')) return;
    const assignments = await this.repository.findTeacherAssignments(classId, actor.id);
    if (!findEffectiveAssignment(assignments, sessionDate)) {
      throw new AppError(403, 'Bạn không được phân công cho lớp này tại ngày dạy của buổi học');
    }
  }

  private async assertLearningEnrollmentClasses(
    classId: number,
    sessionId: number,
    enrollmentClassIds: number[],
    allowedCsIds?: number[],
  ) {
    const rows = await this.repository.findEnrollmentClassesForLearningWrite(
      classId,
      sessionId,
      enrollmentClassIds,
      allowedCsIds,
    );
    if (rows.length === enrollmentClassIds.length) return;

    if (enrollmentClassIds.length === 1) {
      const identity = await this.repository.findEnrollmentClassIdentity(enrollmentClassIds[0]);
      if (!identity) throw new AppError(404, 'Không tìm thấy học viên trong lớp');
      if (identity.class_id !== classId) throw new AppError(409, 'Học viên không thuộc lớp được chọn');
      if (identity.status === 'TRANSFERRED') throw new AppError(409, 'Học viên đã chuyển lớp và không có điểm danh hợp lệ trong ca này hoặc nằm ngoài phạm vi phụ trách');
      if (identity.status !== 'ACTIVE') throw new AppError(409, 'Học viên không còn trạng thái đang học trong lớp');
      throw new AppError(403, 'Học viên nằm ngoài phạm vi phụ trách');
    }
    throw new AppError(409, 'Một hoặc nhiều học viên không thuộc lớp, không còn hoạt động hoặc ngoài phạm vi');
  }

  private assertAdmin(actor: AuthUser) {
    if (!actor.roles.includes('ADMIN')) throw new AppError(403, 'Chỉ ADMIN được thực hiện thao tác này');
  }

  private assertAdminOrManage(actor: AuthUser) {
    if (!actor.roles.some((role) => role === 'ADMIN' || role === 'MANAGE')) {
      throw new AppError(403, 'Cần quyền ADMIN hoặc MANAGE');
    }
  }

  private assertPositiveId(value: number, name: string) {
    if (!Number.isInteger(value) || value <= 0) throw new AppError(400, `${name} không hợp lệ`);
  }
}
