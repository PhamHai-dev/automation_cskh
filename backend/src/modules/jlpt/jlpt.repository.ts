import {
  ClassSessionType,
  JlptTemplateChangeRequestStatus,
  Prisma,
  ProgramType,
} from '@prisma/client';
import { prisma } from '../../prisma/client';
import {
  ClassTemplatePreview,
  JlptLearningRecordPatchInput,
  JlptTemplateInput,
  JlptTemplateItemInput,
} from './jlpt.types';

export const GLOBAL_JLPT_TEMPLATE_KEY = 'GLOBAL';

const templateInclude = {
  items: { orderBy: { session_number: 'asc' as const } },
} satisfies Prisma.JlptSessionTemplateInclude;

// A historical transfer does not erase participation in a specific existing session.
export const jlptLearningEnrollmentEligibility = (sessionId: number): Prisma.EnrollmentClassWhereInput => ({
  OR: [
    { status: 'ACTIVE' },
    { status: 'TRANSFERRED', attendance: { some: { class_session_id: sessionId, deleted_at: null } } },
  ],
});

export class JlptRepository {
  listTemplates(active?: boolean) {
    return prisma.jlptSessionTemplate.findMany({
      where: active === undefined ? undefined : { active },
      include: templateInclude,
      orderBy: { id: 'asc' },
      take: 1,
    });
  }

  findGlobalTemplate() {
    return prisma.jlptSessionTemplate.findUnique({
      where: { singleton_key: GLOBAL_JLPT_TEMPLATE_KEY },
      include: templateInclude,
    });
  }

  findTemplateById(id: number) {
    return prisma.jlptSessionTemplate.findFirst({
      where: { id, singleton_key: GLOBAL_JLPT_TEMPLATE_KEY },
      include: templateInclude,
    });
  }

  async createTemplate(data: JlptTemplateInput, actorId: number) {
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.jlptSessionTemplate.findUnique({
          where: { singleton_key: GLOBAL_JLPT_TEMPLATE_KEY },
          select: { id: true },
        });
        if (existing) return null;

        const created = await tx.jlptSessionTemplate.create({
          data: {
            singleton_key: GLOBAL_JLPT_TEMPLATE_KEY,
            name: data.name,
            total_sessions: data.total_sessions,
            active: data.active ?? true,
            created_by_id: actorId,
            updated_by_id: actorId,
            items: {
              create: data.items.map((item) => ({
                session_number: item.session_number,
                session_type: item.session_type,
                session_title: item.session_title ?? null,
              })),
            },
          },
          include: templateInclude,
        });
        await this.createAudit(
          tx,
          actorId,
          'JLPT_TEMPLATE_CREATED',
          'JlptSessionTemplate',
          String(created.id),
          null,
          created,
        );
        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return null;
      }
      throw error;
    }
  }

  updateTemplate(id: number, data: JlptTemplateInput, actorId: number) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.jlptSessionTemplate.findFirst({
        where: { id, singleton_key: GLOBAL_JLPT_TEMPLATE_KEY },
        include: templateInclude,
      });
      if (!existing) return null;

      await tx.jlptSessionTemplateItem.deleteMany({ where: { template_id: id } });
      const updated = await tx.jlptSessionTemplate.update({
        where: { id },
        data: {
          name: data.name,
          total_sessions: data.total_sessions,
          active: data.active ?? true,
          updated_by_id: actorId,
          items: {
            create: data.items.map((item) => ({
              session_number: item.session_number,
              session_type: item.session_type,
              session_title: item.session_title ?? null,
            })),
          },
        },
        include: templateInclude,
      });
      await this.createAudit(tx, actorId, 'JLPT_TEMPLATE_UPDATED', 'JlptSessionTemplate', String(id), existing, updated);
      return updated;
    });
  }

  async deleteTemplate(id: number, actorId: number) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.jlptSessionTemplate.findFirst({
        where: { id, singleton_key: GLOBAL_JLPT_TEMPLATE_KEY },
        include: templateInclude,
      });
      if (!existing) return null;
      await tx.jlptSessionTemplate.delete({ where: { id } });
      await this.createAudit(tx, actorId, 'JLPT_TEMPLATE_DELETED', 'JlptSessionTemplate', String(id), existing, { deleted: true });
      return existing;
    });
  }

  countJlptDependencies() {
    return prisma.$transaction([
      prisma.class.count({ where: { program_type: ProgramType.JLPT } }),
      prisma.jlptLearningRecord.count(),
      prisma.jlptTemplateChangeRequest.count(),
    ]);
  }

  findClassesForPreview(classIds: number[]) {
    return prisma.class.findMany({
      where: { id: { in: classIds } },
      select: {
        id: true,
        class_code: true,
        class_name: true,
        program_type: true,
        class_sessions: {
          select: { id: true, session_number: true, session_type: true, session_title: true },
          orderBy: { session_number: 'asc' },
        },
      },
      orderBy: { id: 'asc' },
    });
  }

  applyTemplateToClasses(
    templateId: number,
    previews: ClassTemplatePreview[],
    actorId: number,
    action: string = 'JLPT_TEMPLATE_APPLIED',
  ) {
    return prisma.$transaction(async (tx) => {
      const template = await tx.jlptSessionTemplate.findFirst({
        where: { id: templateId, singleton_key: GLOBAL_JLPT_TEMPLATE_KEY },
        include: templateInclude,
      });
      if (!template) return null;

      const classIds = previews.map((preview) => preview.class_id);
      const itemsByNumber = new Map(template.items.map((item) => [item.session_number, item]));
      const sessions = await tx.classSession.findMany({
        where: { class_id: { in: classIds }, session_number: { in: [...itemsByNumber.keys()] } },
        select: { id: true, class_id: true, session_number: true, session_type: true, session_title: true },
      });

      for (const session of sessions) {
        const item = itemsByNumber.get(session.session_number);
        if (!item) continue;
        const nextTitle = item.session_title ?? null;
        if (session.session_type === item.session_type && (session.session_title ?? null) === nextTitle) continue;
        await tx.classSession.update({
          where: { id: session.id },
          data: { session_type: item.session_type, session_title: nextTitle },
        });
        await this.createAudit(tx, actorId, action, 'ClassSession', String(session.id), session, {
          ...session,
          session_type: item.session_type,
          session_title: nextTitle,
        });
      }

      return { template, previews };
    });
  }

  findAllJlptClassIds() {
    return prisma.class.findMany({
      where: { program_type: ProgramType.JLPT },
      select: { id: true },
      orderBy: { id: 'asc' },
    }).then((rows) => rows.map((row) => row.id));
  }

  findClassProgramState(classId: number) {
    return prisma.class.findUnique({
      where: { id: classId },
      select: {
        id: true,
        program_type: true,
        jlpt_template_change_requests: { where: { status: JlptTemplateChangeRequestStatus.PENDING }, select: { id: true }, take: 1 },
        enrollment_classes: {
          select: { jlpt_learning_records: { select: { id: true }, take: 1 } },
        },
      },
    });
  }

  findClassById(classId: number) {
    return prisma.class.findUnique({ where: { id: classId } });
  }

  updateClassProgram(classId: number, programType: ProgramType, actorId: number) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.class.findUnique({ where: { id: classId } });
      if (!before) return null;
      const updated = await tx.class.update({ where: { id: classId }, data: { program_type: programType } });
      await this.createAudit(tx, actorId, 'CLASS_PROGRAM_CHANGED', 'Class', String(classId), before, updated);
      return updated;
    });
  }

  createChangeRequest(
    templateId: number,
    classId: number,
    proposedItems: JlptTemplateItemInput[],
    requestNote: string | null,
    actorId: number,
  ) {
    return prisma.$transaction(async (tx) => {
      const template = await tx.jlptSessionTemplate.findFirst({
        where: { id: templateId, singleton_key: GLOBAL_JLPT_TEMPLATE_KEY },
        include: templateInclude,
      });
      if (!template) return null;
      const created = await tx.jlptTemplateChangeRequest.create({
        data: {
          template_id: templateId,
          class_id: classId,
          requested_by_id: actorId,
          before_snapshot: this.templateSnapshot(template) as Prisma.InputJsonValue,
          proposed_snapshot: { items: proposedItems } as unknown as Prisma.InputJsonValue,
          request_note: requestNote,
        },
      });
      await this.createAudit(tx, actorId, 'JLPT_TEMPLATE_CHANGE_REQUESTED', 'JlptTemplateChangeRequest', String(created.id), null, created);
      return created;
    });
  }

  findChangeRequest(id: number) {
    return prisma.jlptTemplateChangeRequest.findUnique({
      where: { id },
      include: { template: { include: templateInclude }, class: true },
    });
  }

  async reviewChangeRequest(
    requestId: number,
    reviewerId: number,
    status: JlptTemplateChangeRequestStatus,
    reviewReason: string | null,
    previews: ClassTemplatePreview[],
  ) {
    return prisma.$transaction(async (tx) => {
      const request = await tx.jlptTemplateChangeRequest.findUnique({
        where: { id: requestId },
        include: { template: { include: templateInclude } },
      });
      if (!request || request.status !== JlptTemplateChangeRequestStatus.PENDING) return null;

      const before = request;
      if (status === JlptTemplateChangeRequestStatus.APPROVED) {
        const proposed = request.proposed_snapshot as unknown as { items: JlptTemplateItemInput[] };
        await tx.jlptSessionTemplateItem.deleteMany({ where: { template_id: request.template_id } });
        await tx.jlptSessionTemplateItem.createMany({
          data: proposed.items.map((item) => ({
            template_id: request.template_id,
            session_number: item.session_number,
            session_type: item.session_type,
            session_title: item.session_title ?? null,
          })),
        });
        await tx.jlptSessionTemplate.update({
          where: { id: request.template_id },
          data: {
            total_sessions: proposed.items.length,
            updated_by_id: reviewerId,
          },
        });

        const itemByNumber = new Map(proposed.items.map((item) => [item.session_number, item]));
        const classIds = previews.map((preview) => preview.class_id);
        const sessions = classIds.length === 0 ? [] : await tx.classSession.findMany({
          where: { class_id: { in: classIds }, session_number: { in: [...itemByNumber.keys()] } },
          select: { id: true, class_id: true, session_number: true, session_type: true, session_title: true },
        });
        for (const session of sessions) {
          const item = itemByNumber.get(session.session_number);
          if (!item) continue;
          const nextTitle = item.session_title ?? null;
          if (session.session_type === item.session_type && (session.session_title ?? null) === nextTitle) continue;
          await tx.classSession.update({
            where: { id: session.id },
            data: { session_type: item.session_type, session_title: nextTitle },
          });
          await this.createAudit(tx, reviewerId, 'JLPT_TEMPLATE_CHANGE_APPLIED', 'ClassSession', String(session.id), session, {
            ...session,
            session_type: item.session_type,
            session_title: nextTitle,
          });
        }
      }

      const reviewed = await tx.jlptTemplateChangeRequest.update({
        where: { id: requestId },
        data: {
          status,
          reviewed_by_id: reviewerId,
          reviewed_at: new Date(),
          review_reason: reviewReason,
        },
      });
      await this.createAudit(tx, reviewerId, `JLPT_TEMPLATE_CHANGE_${status}`, 'JlptTemplateChangeRequest', String(requestId), before, reviewed);
      return reviewed;
    });
  }

  countJlptClasses() {
    return prisma.class.count({ where: { program_type: ProgramType.JLPT } });
  }

  templateSnapshot(template: { name: string; total_sessions: number; active: boolean; items: any[] }) {
    return {
      name: template.name,
      total_sessions: template.total_sessions,
      active: template.active,
      items: template.items.map((item) => ({
        session_number: item.session_number,
        session_type: item.session_type,
        session_title: item.session_title ?? null,
      })),
    };
  }

  findLearningContext(classId: number, sessionId: number) {
    return prisma.classSession.findFirst({
      where: { id: sessionId, class_id: classId },
      select: {
        id: true,
        class_id: true,
        session_date: true,
        session_type: true,
        session_title: true,
        class: { select: { id: true, program_type: true } },
      },
    });
  }

  findTeacherAssignments(classId: number, actorId: number) {
    return prisma.classTeacher.findMany({
      where: { class_id: classId, teacher: { user_id: actorId } },
      select: { active: true, start_date: true, end_date: true },
    });
  }

  listLearningRecordRows(classId: number, sessionId: number, allowedCsIds?: number[]) {
    return prisma.enrollmentClass.findMany({
      where: {
        class_id: classId,
        ...jlptLearningEnrollmentEligibility(sessionId),
        enrollment: {
          student: { deleted_at: null },
          ...(allowedCsIds === undefined
            ? {}
            : {
                OR: [
                  { cs_id: { in: allowedCsIds } },
                  { cs_viewers: { some: { cs_id: { in: allowedCsIds } } } },
                ],
              }),
        },
      },
      select: {
        id: true,
        enrollment: {
          select: {
            student: {
              select: {
                id: true,
                external_id: true,
                full_name: true,
                phone: true,
                email: true,
                created_at: true,
              },
            },
          },
        },
        attendance: {
          where: { class_session_id: sessionId, deleted_at: null },
          take: 1,
        },
        jlpt_learning_records: {
          where: { class_session_id: sessionId },
          take: 1,
        },
      },
      orderBy: [
        { enrollment: { student: { full_name: 'asc' } } },
        { id: 'asc' },
      ],
    });
  }

  findEnrollmentClassIdentity(enrollmentClassId: number) {
    return prisma.enrollmentClass.findUnique({
      where: { id: enrollmentClassId },
      select: { id: true, class_id: true, status: true },
    });
  }

  findEnrollmentClassesForLearningWrite(
    classId: number,
    sessionId: number,
    enrollmentClassIds: number[],
    allowedCsIds?: number[],
  ) {
    return prisma.enrollmentClass.findMany({
      where: {
        id: { in: enrollmentClassIds },
        class_id: classId,
        ...jlptLearningEnrollmentEligibility(sessionId),
        enrollment: {
          student: { deleted_at: null },
          ...(allowedCsIds === undefined
            ? {}
            : {
                OR: [
                  { cs_id: { in: allowedCsIds } },
                  { cs_viewers: { some: { cs_id: { in: allowedCsIds } } } },
                ],
              }),
        },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
  }

  saveLearningRecord(
    sessionId: number,
    enrollmentClassId: number,
    patch: JlptLearningRecordPatchInput,
    actorId: number,
  ) {
    return prisma.$transaction(async (tx) => this.upsertLearningRecord(
      tx,
      sessionId,
      enrollmentClassId,
      patch,
      actorId,
    ));
  }

  saveLearningRecordsBulk(
    sessionId: number,
    enrollmentClassIds: number[],
    patch: JlptLearningRecordPatchInput,
    actorId: number,
  ) {
    return prisma.$transaction(async (tx) => {
      const records = [];
      for (const enrollmentClassId of enrollmentClassIds) {
        records.push(await this.upsertLearningRecord(
          tx,
          sessionId,
          enrollmentClassId,
          patch,
          actorId,
        ));
      }
      return records;
    });
  }

  private async upsertLearningRecord(
    tx: Prisma.TransactionClient,
    sessionId: number,
    enrollmentClassId: number,
    patch: JlptLearningRecordPatchInput,
    actorId: number,
  ) {
    const uniqueKey = {
      enrollment_class_id: enrollmentClassId,
      class_session_id: sessionId,
    };
    const before = await tx.jlptLearningRecord.findUnique({
      where: { enrollment_class_id_class_session_id: uniqueKey },
    });
    const fieldData = { [patch.field]: patch.value } as Prisma.JlptLearningRecordUncheckedUpdateInput;
    const record = await tx.jlptLearningRecord.upsert({
      where: { enrollment_class_id_class_session_id: uniqueKey },
      create: {
        ...uniqueKey,
        [patch.field]: patch.value,
        created_by_id: actorId,
        updated_by_id: actorId,
      },
      update: {
        ...fieldData,
        updated_by_id: actorId,
      },
    });
    await this.createAudit(
      tx,
      actorId,
      before ? 'JLPT_LEARNING_RECORD_UPDATED' : 'JLPT_LEARNING_RECORD_CREATED',
      'JlptLearningRecord',
      String(record.id),
      before,
      record,
    );
    return record;
  }

  private createAudit(
    tx: Prisma.TransactionClient,
    userId: number,
    action: string,
    entityType: string,
    entityId: string,
    beforeData: unknown,
    afterData: unknown,
  ) {
    return tx.auditLog.create({
      data: {
        user_id: userId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        before_data: beforeData === null ? Prisma.DbNull : beforeData as Prisma.InputJsonValue,
        after_data: afterData === null ? Prisma.DbNull : afterData as Prisma.InputJsonValue,
      },
    });
  }
}
