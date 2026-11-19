import { prisma } from '../../src/prisma/client';
import { zaloPool } from '../../src/modules/zalo/zalo-pool';
import { ZaloService } from '../../src/modules/zalo/zalo.service';
import { encryptJson } from '../../src/shared/crypto/aes-gcm';

const mockApi = { getOwnId: jest.fn(() => 'self'), listener: { on: jest.fn(), start: jest.fn(), stop: jest.fn() } };
const mockLogin = jest.fn();
const mockQr = jest.fn();
jest.mock('zca-js', () => ({ Zalo: class {
  login(...args: any[]) { return mockLogin(...args); }
  loginQR(...args: any[]) { return mockQr(...args); }
} }));
jest.mock('../../src/prisma/client', () => ({ prisma: {
  zaloAccount: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
} }));
jest.mock('../../src/modules/zalo/status-log-service', () => ({ writeTransition: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/shared/logger/logger', () => ({ createLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }) }));

describe('Zalo QR, listener startup and encrypted-session reconnect', () => {
  const saved = encryptJson({ cookies: [], imei: 'audit', userAgent: 'audit' });
  beforeEach(() => {
    jest.restoreAllMocks();
    (prisma.zaloAccount.findUnique as jest.Mock).mockResolvedValue({ id: 1, archived_at: null, zalo_uid: 'self', disconnect_reason: null, encrypted_session_data: saved });
    (prisma.zaloAccount.update as jest.Mock).mockResolvedValue({});
    (prisma.zaloAccount.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    mockLogin.mockResolvedValue(mockApi);
    mockQr.mockImplementation(async (_opts, callback) => { callback({ type: 0, data: { image: 'AAAA' } }); return mockApi; });
    jest.spyOn(zaloPool as any, 'autoSyncOnConnect').mockImplementation(() => {});
  });
  afterEach(async () => { await zaloPool.shutdown(); });

  it('returns QR without waiting for the phone and starts receive listener after successful login', async () => {
    await expect(zaloPool.loginQR(1, 1)).resolves.toEqual({ qrImage: 'data:image/png;base64,AAAA' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockApi.listener.start).toHaveBeenCalledTimes(1);
    expect(mockApi.listener.on).toHaveBeenCalledWith('closed', expect.any(Function));
  });

  it('starts receive listener when restoring a saved session', async () => {
    await zaloPool.reconnect(1, saved);
    expect(mockApi.listener.start).toHaveBeenCalledTimes(1);
    expect(mockLogin).toHaveBeenCalledWith({ cookie: [], imei: 'audit', userAgent: 'audit' });
  });

  it('keeps encrypted credentials and reports disconnected on a transient network error', async () => {
    mockLogin.mockRejectedValueOnce(new Error('fetch failed'));
    await expect(zaloPool.reconnect(1, saved)).resolves.toBeUndefined();
    await new Promise((resolve) => setImmediate(resolve));
    expect(zaloPool.getStatus(1)).toBe('disconnected');
    expect(prisma.zaloAccount.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ encrypted_session_data: null }) }));
  });

  it('passes saved ciphertext unchanged through the HTTP service reconnect', async () => {
    const reconnect = jest.spyOn(zaloPool, 'reconnect').mockResolvedValue();
    await expect(new ZaloService().reconnectAccount(1)).resolves.toEqual({ message: 'Reconnect initiated' });
    expect(reconnect).toHaveBeenCalledWith(1, saved);
  });
});
