import { EnrollmentsService } from '../enrollments.service';
import { StudentsRepository } from '../../students/students.repository';
import { CareService } from '../../care/care.service';
import { SheetSyncService } from '../../imports/sheet-sync.service';
import { prisma } from '../../../prisma/client';

jest.mock('../../../prisma/client', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    manageAssignment: { findMany: jest.fn() },
    enrollment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    enrollmentCsViewer: {
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    careTask: {
      updateMany: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    },
    careLog: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    package: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    sale: {
      upsert: jest.fn(),
    },
    student: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    googleSheetRowState: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockPrisma = prisma as any;

describe('CVHT Transfer (FULL_TRANSFER, KEEP_READONLY, Revoke Viewer, Readonly Guards, Sheet Sync Priority)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (cb: Function) => cb(mockPrisma));
  });

  describe('1. EnrollmentsService.bulkReassignCS & reassignCS', () => {
    it('transfers CS in FULL_TRANSFER mode, removes viewer records, moves PENDING tasks, sets cs_reassigned_on_web, and logs audit', async () => {
      const service = new EnrollmentsService();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 20,
        active: true,
        roles: ['CS'],
      });

      const oldEnr = {
        id: 101,
        cs_id: 10,
        program_metadata: { active_state: 'Active' },
      };

      mockPrisma.enrollment.findMany.mockResolvedValue([oldEnr]);
      mockPrisma.enrollment.update.mockResolvedValue({
        ...oldEnr,
        cs_id: 20,
        cs_viewers: [],
      });
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        ...oldEnr,
        cs_id: 20,
        cs_viewers: [],
      });
      mockPrisma.enrollmentCsViewer.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.careTask.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.auditLog.create.mockResolvedValue({ id: 1 });

      const result = await service.bulkReassignCS(
        {
          enrollment_ids: [101],
          target_cs_id: 20,
          mode: 'FULL_TRANSFER',
          transfer_pending_tasks: true,
          note: 'Bàn giao sang CVHT02',
        },
        1,
        ['ADMIN'],
      );

      expect(result.updated_count).toBe(1);
      expect(result.mode).toBe('FULL_TRANSFER');
      expect(mockPrisma.enrollment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 101 },
          data: expect.objectContaining({
            cs_id: 20,
            handed_over_at: expect.any(Date),
            program_metadata: expect.objectContaining({
              active_state: 'Active',
              cs_reassigned_on_web: true,
              previous_cs_id: 10,
            }),
          }),
        }),
      );

      // Removes targetCsId viewer + oldCsId viewer in FULL_TRANSFER
      expect(mockPrisma.enrollmentCsViewer.deleteMany).toHaveBeenCalledWith({
        where: { enrollment_id: 101, cs_id: 20 },
      });
      expect(mockPrisma.enrollmentCsViewer.deleteMany).toHaveBeenCalledWith({
        where: { enrollment_id: 101, cs_id: 10 },
      });
      expect(mockPrisma.enrollmentCsViewer.upsert).not.toHaveBeenCalled();

      // Moves PENDING care tasks
      expect(mockPrisma.careTask.updateMany).toHaveBeenCalledWith({
        where: { enrollment_id: 101, status: 'PENDING' },
        data: { assigned_to_id: 20 },
      });

      // Logs audit
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          user_id: 1,
          action: 'REASSIGN_CS',
          entity_type: 'Enrollment',
          entity_id: '101',
          before_data: { cs_id: 10 },
          after_data: { cs_id: 20, mode: 'FULL_TRANSFER', note: 'Bàn giao sang CVHT02' },
        },
      });
    });

    it('transfers CS in KEEP_READONLY mode and upserts EnrollmentCsViewer for old CS', async () => {
      const service = new EnrollmentsService();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 20,
        active: true,
        roles: ['CS'],
      });

      const oldEnr = {
        id: 102,
        cs_id: 10,
        program_metadata: null,
      };

      mockPrisma.enrollment.findMany.mockResolvedValue([oldEnr]);
      mockPrisma.enrollment.update.mockResolvedValue({
        ...oldEnr,
        cs_id: 20,
      });
      mockPrisma.enrollment.findUnique.mockResolvedValue({
        ...oldEnr,
        cs_id: 20,
        cs_viewers: [{ id: 1, enrollment_id: 102, cs_id: 10, transferred_to_id: 20 }],
      });

      const result = await service.reassignCS(102, 20, 1, ['ADMIN'], {
        mode: 'KEEP_READONLY',
        transfer_pending_tasks: false,
        note: 'Giữ quyền xem cho CVHT01',
      });

      expect(result.cs_id).toBe(20);
      expect(mockPrisma.enrollmentCsViewer.upsert).toHaveBeenCalledWith({
        where: {
          enrollment_id_cs_id: {
            enrollment_id: 102,
            cs_id: 10,
          },
        },
        update: {
          transferred_to_id: 20,
          transferred_by_id: 1,
          note: 'Giữ quyền xem cho CVHT01',
        },
        create: {
          enrollment_id: 102,
          cs_id: 10,
          transferred_to_id: 20,
          transferred_by_id: 1,
          note: 'Giữ quyền xem cho CVHT01',
        },
      });
      expect(mockPrisma.careTask.updateMany).not.toHaveBeenCalled();
    });

    it('enforces MANAGE scope on both current cs_id and target_cs_id', async () => {
      const service = new EnrollmentsService();

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 30, // outside manage group [5, 10, 20]
        active: true,
        roles: ['CS'],
      });
      mockPrisma.enrollment.findMany.mockResolvedValue([{ id: 101, cs_id: 10 }]);
      mockPrisma.manageAssignment.findMany.mockResolvedValue([
        { cs_group: { members: [{ user_id: 10 }, { user_id: 20 }] } },
      ]);

      await expect(
        service.bulkReassignCS(
          { enrollment_ids: [101], target_cs_id: 30, mode: 'FULL_TRANSFER' },
          5,
          ['MANAGE'],
        ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('revokes viewer access and writes REVOKE_CS_VIEWER audit log', async () => {
      const service = new EnrollmentsService();

      mockPrisma.enrollment.findUnique.mockResolvedValue({
        id: 102,
        cs_id: 20,
        cs_viewers: [{ cs_id: 10 }],
      });
      mockPrisma.enrollmentCsViewer.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.auditLog.create.mockResolvedValue({ id: 99 });

      const res = await service.revokeCsViewer(102, 10, 1, ['ADMIN']);

      expect(res).toEqual({
        enrollment_id: 102,
        cs_id: 10,
        revoked: true,
        deleted_count: 1,
      });
      expect(mockPrisma.enrollmentCsViewer.deleteMany).toHaveBeenCalledWith({
        where: { enrollment_id: 102, cs_id: 10 },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          user_id: 1,
          action: 'REVOKE_CS_VIEWER',
          entity_type: 'Enrollment',
          entity_id: '102',
          before_data: { viewer_cs_id: 10 },
          after_data: { revoked: true, deleted_count: 1 },
        },
      });
    });
  });

  describe('2. Read vs Write separation for KEEP_READONLY viewer (CS1 = 10, Owner CS2 = 20)', () => {
    it('allows CS1 (viewer) to read enrollment detail, but blocks updateEnrollment and transferClass with 403', async () => {
      const service = new EnrollmentsService();

      mockPrisma.enrollment.findUnique.mockResolvedValue({
        id: 102,
        cs_id: 20,
        cs_viewers: [{ cs_id: 10 }],
      });

      // Read is allowed
      const detail = await service.getEnrollmentById(102, 10, ['CS']);
      expect(detail.id).toBe(102);

      // Write is blocked with clear message
      await expect(
        service.updateEnrollment(102, { status: 'PAUSED' }, 10, ['CS']),
      ).rejects.toMatchObject({
        status: 403,
        message: expect.stringContaining('chỉ có quyền xem'),
      });

      await expect(
        service.transferClass(102, { from_class_id: 1, to_class_id: 2 }, 10, ['CS']),
      ).rejects.toMatchObject({
        status: 403,
        message: expect.stringContaining('chỉ có quyền xem'),
      });
    });

    it('blocks StudentsRepository.update with clear 403 message when actor is only in cs_viewers', async () => {
      const repo = new StudentsRepository();
      const tx = {
        enrollment: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(null) // owner check returns null
            .mockResolvedValueOnce({ id: 102 }), // viewer check returns enrollment
        },
      };
      mockPrisma.$transaction.mockImplementationOnce(async (cb: Function) => cb(tx));

      await expect(
        repo.update(50, { enrollment_id: 102, full_name: 'Try Edit' }, { id: 10, roles: ['CS'] }),
      ).rejects.toMatchObject({
        status: 403,
        message: 'Học viên này đã được bàn giao sang CSKH khác, bạn chỉ có quyền xem và không được chỉnh sửa',
      });
    });

    it('allows CS1 (viewer) to getCareLogs (READ), but blocks createCareLog / saveSessionCareLog / updateEnrollmentCare / createCareTask (WRITE)', async () => {
      const mockCareRepo = {
        findEnrollmentById: jest.fn().mockResolvedValue({
          id: 102,
          cs_id: 20,
          cs_viewers: [{ cs_id: 10 }],
        }),
        findCareLogsByEnrollmentId: jest.fn().mockResolvedValue([{ id: 1, content: 'Log 1' }]),
        createCareLog: jest.fn(),
        upsertCareLogBySession: jest.fn(),
        updateEnrollmentCareFields: jest.fn(),
        createCareTask: jest.fn(),
      } as any;

      const careService = new CareService(mockCareRepo);

      // READ is permitted for viewer
      const logs = await careService.getCareLogs(102, 10, ['CS']);
      expect(logs).toHaveLength(1);

      // WRITE operations are blocked for viewer
      await expect(
        careService.createCareLog(102, { after_session_number: 1, outcome: 'POSITIVE' as any, content: 'x' }, 10, ['CS']),
      ).rejects.toMatchObject({
        status: 403,
        message: 'Học viên đã bàn giao sang CSKH khác, bạn chỉ có quyền xem',
      });

      await expect(
        careService.saveSessionCareLog(102, 2, { content: 'x' }, 10, ['CS']),
      ).rejects.toMatchObject({
        status: 403,
        message: 'Học viên đã bàn giao sang CSKH khác, bạn chỉ có quyền xem',
      });

      await expect(
        careService.updateEnrollmentCare(102, { exchange_info: 'x' }, 10, ['CS']),
      ).rejects.toMatchObject({
        status: 403,
        message: 'Học viên đã bàn giao sang CSKH khác, bạn chỉ có quyền xem',
      });

      await expect(
        careService.createCareTask({ enrollment_id: 102, type: 'CALLBACK' as any, title: 'x' }, 10, ['CS']),
      ).rejects.toMatchObject({
        status: 403,
        message: 'Học viên đã bàn giao sang CSKH khác, bạn chỉ có quyền xem',
      });
    });
  });

  describe('3. Google Sheet Sync Web Priority (cs_reassigned_on_web === true)', () => {
    it('keeps existingEnrollment.cs_id when cs_reassigned_on_web is true and sheet has old CVHT', async () => {
      const sheetSync = new SheetSyncService();

      mockPrisma.package.upsert.mockResolvedValue({ id: 5, code: 'KAIWA_30' });
      mockPrisma.student.findUnique.mockResolvedValue({ id: 50, external_id: 'HV001', full_name: 'HV Test' });
      mockPrisma.student.upsert.mockResolvedValue({ id: 50, external_id: 'HV001', full_name: 'HV Test' });

      // Existing enrollment was reassigned on Web to CS 20, while Sheet still says CVHT01 (CS 10)
      const existingEnrollment = {
        id: 102,
        student_id: 50,
        package_id: 5,
        cs_id: 20,
        handed_over_at: new Date('2026-11-01T10:00:00.000Z'),
        status: 'STUDYING',
        total_sessions: 30,
        program_metadata: {
          cs_reassigned_on_web: true,
          cs_reassigned_at: '2026-11-01T10:00:00.000Z',
          previous_cs_id: 10,
        },
        enrollment_classes: [],
        care_logs: [],
      };

      mockPrisma.enrollment.findUnique.mockResolvedValue(existingEnrollment);
      mockPrisma.enrollment.update.mockImplementation(async (args: any) => ({
        ...existingEnrollment,
        ...args.data,
        enrollment_classes: [],
        care_logs: [],
      }));
      mockPrisma.googleSheetRowState.upsert.mockResolvedValue({});

      const item: any = {
        _payload: {
          row: {
            rowNumber: 3,
            externalId: 'HV001',
            syncKey: 'KAIWA::HV001::KAIWA_30',
            programType: 'KAIWA',
            fullName: 'HV Test',
            packageCode: 'KAIWA_30',
            cvhtCode: 'CVHT01', // Maps to CS 10 on Sheet
            status: 'STUDYING',
            totalSessions: 30,
            remainingSessions: 25,
            programMetadata: {},
            careLogs: [],
          },
        },
      };

      await (sheetSync as any).applyStudentEnrollmentItem(
        { id: 1, code: 'KAIWA' },
        item,
        { CVHT01: 10, CVHT02: 20 },
        10,
        1,
      );

      expect(mockPrisma.enrollment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 102 },
          data: expect.objectContaining({
            cs_id: 20, // Preserved Web CS (20) instead of overwriting with Sheet CS (10)
          }),
        }),
      );
    });
  });
});
