jest.mock('../imports.service', () => ({ ImportsService: jest.fn() }));
jest.mock('../sheet-backup.service', () => ({ SheetBackupService: jest.fn() }));
jest.mock('../jlpt-workbook.service', () => ({ JlptWorkbookService: jest.fn() }));

import { ImportsController } from '../imports.controller';

function response() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as any;
}

const manageUser = { id: 20, email: 'manage@example.com', roles: ['MANAGE'] };
const adminUser = { id: 1, email: 'admin@example.com', roles: ['ADMIN'] };

function sheetSyncService() {
  return {
    findConfigByIdOrCode: jest.fn(),
    createConfig: jest.fn(),
    previewConfig: jest.fn(),
    syncAll: jest.fn(),
  } as any;
}

describe('JLPT learning-log sync controller RBAC', () => {
  it('denies MANAGE when creating a JLPT learning-log config', async () => {
    const service = sheetSyncService();
    const controller = new ImportsController(undefined, service);
    const next = jest.fn();
    await controller.createSheetSyncConfig(
      { user: manageUser, body: { flow_type: 'JLPT_LEARNING_LOG', program_type: 'JLPT' } } as any,
      response(),
      next,
    );

    expect(service.createConfig).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('keeps existing non-JLPT config behavior for MANAGE', async () => {
    const service = sheetSyncService();
    service.createConfig.mockResolvedValue({ id: 5 });
    const controller = new ImportsController(undefined, service);
    const res = response();
    const next = jest.fn();
    await controller.createSheetSyncConfig(
      { user: manageUser, body: { flow_type: 'STUDY_REPORT', program_type: 'JLPT' } } as any,
      res,
      next,
    );

    expect(service.createConfig).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(next).not.toHaveBeenCalled();
  });

  it('denies MANAGE preview for an existing JLPT learning-log config', async () => {
    const service = sheetSyncService();
    service.findConfigByIdOrCode.mockResolvedValue({ code: 'NKHT', flow_type: 'JLPT_LEARNING_LOG' });
    const controller = new ImportsController(undefined, service);
    const next = jest.fn();
    await controller.previewSheetSyncByCode(
      { user: manageUser, params: { code: 'NKHT' }, body: {} } as any,
      response(),
      next,
    );

    expect(service.previewConfig).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('allows ADMIN preview for an existing JLPT learning-log config', async () => {
    const service = sheetSyncService();
    service.findConfigByIdOrCode.mockResolvedValue({ code: 'NKHT', flow_type: 'JLPT_LEARNING_LOG' });
    service.previewConfig.mockResolvedValue({ previewToken: 'token' });
    const controller = new ImportsController(undefined, service);
    const res = response();
    const next = jest.fn();
    await controller.previewSheetSyncByCode(
      { user: adminUser, params: { code: 'NKHT' }, body: {} } as any,
      res,
      next,
    );

    expect(service.previewConfig).toHaveBeenCalledWith('NKHT', expect.any(Object));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes actor roles to sync-all so service can exclude JLPT for non-admin', async () => {
    const service = sheetSyncService();
    service.syncAll.mockResolvedValue({ results: [] });
    const controller = new ImportsController(undefined, service);
    const res = response();
    await controller.syncAllSheets(
      { user: manageUser, body: {} } as any,
      res,
      jest.fn(),
    );

    expect(service.syncAll).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 20,
      actorRoles: ['MANAGE'],
    }));
  });
});
