import http from 'node:http';
import jwt from 'jsonwebtoken';
import { EventEmitter } from 'node:events';
import { env } from '../../src/config/env';
import { prisma } from '../../src/prisma/client';
import { setupIo, closeIo, emitToAccount } from '../../src/shared/realtime/socket-singleton';
import { registerZaloSocketHandlers } from '../../src/modules/zalo/zalo-socket';
import { registerLineSocketHandlers, emitLineMessage } from '../../src/modules/line/line-socket';
import { LinePersonalAdapter, createProxyFetch } from '../../src/modules/line/line-personal.adapter';
import { lineRepository } from '../../src/modules/line/line-repository';
import { LineAccountPool } from '../../src/modules/line/line-pool';
import { lineWebhookHandler } from '../../src/modules/line/line-webhook.handler';
import { linePool } from '../../src/modules/line/line-pool';
import { encryptJson } from '../../src/shared/crypto/aes-gcm';
import { LineOaAdapter } from '../../src/modules/line/line-oa.adapter';
import { io as connectClient } from 'socket.io-client';

jest.mock('../../src/prisma/client', () => ({ prisma: {
  user: { findUnique: jest.fn() },
  zaloAccount: { findUnique: jest.fn() },
  lineAccount: { findUnique: jest.fn(), update: jest.fn() },
} }));
jest.mock('../../src/shared/queue/redis-connection', () => ({ getRedisClient: () => null }));
jest.mock('../../src/shared/logger/logger', () => ({ createLogger: () => ({ info() {}, warn() {}, error() {}, debug() {} }) }));

describe('Authenticated, platform-scoped Socket.IO delivery', () => {
  let server: http.Server;
  let io: ReturnType<typeof setupIo>;
  let url: string;
  const clients: any[] = [];

  beforeAll(async () => {
    server = http.createServer();
    io = setupIo(server);
    registerZaloSocketHandlers(io);
    registerLineSocketHandlers(io);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as any).port}`;
  });
  beforeEach(() => {
    (prisma.user.findUnique as jest.Mock).mockImplementation(({ where }) => Promise.resolve({ id: where.id, active: true, roles: ['CS'] }));
    (prisma.zaloAccount.findUnique as jest.Mock).mockResolvedValue({ id: 901, cs_id: 11 });
    (prisma.lineAccount.findUnique as jest.Mock).mockResolvedValue({ id: 901, cs_id: 22 });
  });
  afterEach(() => { clients.splice(0).forEach((client) => client.disconnect()); });
  afterAll(async () => { await closeIo(); });

  const clientFor = (userId?: number, token?: string) => {
    const client = connectClient(url, { transports: ['websocket'], reconnection: false,
      auth: token ? { token } : userId ? { token: jwt.sign({ id: userId }, env.JWT_SECRET) } : {} });
    clients.push(client);
    return client;
  };
  const connected = (client: any) => new Promise<void>((resolve, reject) => {
    client.once('connect', resolve); client.once('connect_error', reject);
  });
  const joined = async (client: any, room: string) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (io.sockets.sockets.get(client.id)?.rooms.has(room)) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`Account room was not joined: ${room}`);
  };

  it.each([undefined, 'invalid-token', jwt.sign({ id: 11 }, env.JWT_SECRET, { expiresIn: -1 })])('rejects missing/invalid/expired tokens (%s)', async (token) => {
    const client = clientFor(undefined, token);
    const error = await new Promise<any>((resolve) => client.once('connect_error', resolve));
    expect(error.message).toBe('Unauthorized');
    expect(client.connected).toBe(false);
  });

  it('rejects disabled users with otherwise valid JWTs', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 11, active: false, roles: ['CS'] });
    const client = clientFor(11);
    await expect(connected(client)).rejects.toMatchObject({ message: 'Unauthorized' });
  });

  it('delivers each platform only to its owner even when account IDs collide', async () => {
    const zaloClient = clientFor(11), lineClient = clientFor(22);
    await Promise.all([connected(zaloClient), connected(lineClient)]);
    zaloClient.emit('zalo:subscribe', { accountId: 901 });
    lineClient.emit('line:subscribe', { accountId: 901 });
    await Promise.all([joined(zaloClient, 'account:901'), joined(lineClient, 'line:901')]);
    const lineLeak = jest.fn(), zaloLeak = jest.fn();
    zaloClient.on('line:message', lineLeak); lineClient.on('zalo:message', zaloLeak);
    const zaloMessage = new Promise<any>((resolve) => zaloClient.once('zalo:message', resolve));
    const lineMessage = new Promise<any>((resolve) => lineClient.once('line:message', resolve));
    emitToAccount(901, 'zalo:message', { content: 'zalo-only' });
    emitLineMessage({ accountId: 901, message: { content: 'line-only' } } as any);
    expect((await zaloMessage).content).toBe('zalo-only');
    expect((await lineMessage).message.content).toBe('line-only');
    // A round trip on the owner connection drains preceding packets.
    const drained = new Promise<any>((resolve) => zaloClient.once('audit:drained', resolve));
    io.to(zaloClient.id!).emit('audit:drained', {}); await drained;
    expect(lineLeak).not.toHaveBeenCalled(); expect(zaloLeak).not.toHaveBeenCalled();
    lineClient.emit('zalo:subscribe', { accountId: 901 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(io.sockets.sockets.get(lineClient.id!)?.rooms.has('account:901')).toBe(false);
  });
});

describe('LINE QR, SDK payload and receive stream recovery', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(lineRepository, 'updateAccount').mockResolvedValue({ id: 1, status: 'ACTIVE' } as any);
  });

  it.each(['Tên đặt lúc thiết lập', 'LINE CSKH 1 - Hải Yến'])('uses the LINE profile instead of setup name %s on login', async (setupName) => {
    const adapter = new LinePersonalAdapter(1);
    jest.spyOn(lineRepository, 'findAccountById').mockResolvedValue({ id: 1, display_name: setupName } as any);
    jest.spyOn(adapter, 'startPollingListener').mockImplementation(() => {});
    jest.spyOn(adapter, 'syncFriends').mockResolvedValue({ synced: 0 });
    jest.spyOn(adapter, 'syncGroups').mockResolvedValue({ synced: 0 });
    await (adapter as any).finalizeConnectedClient({ authToken: 'test-only',
      getMyProfile: async () => ({ mid: 'u-self', displayName: 'Tên thật trên LINE' }) });
    expect(lineRepository.updateAccount).toHaveBeenCalledWith(1, expect.objectContaining({ display_name: 'Tên thật trên LINE' }));
    adapter.disconnect();
  });

  it('keeps the setup name when the LINE profile is unavailable', async () => {
    const adapter = new LinePersonalAdapter(1);
    jest.spyOn(lineRepository, 'findAccountById').mockResolvedValue({ id: 1, display_name: 'Tên thiết lập' } as any);
    jest.spyOn(adapter, 'startPollingListener').mockImplementation(() => {});
    jest.spyOn(adapter, 'syncFriends').mockResolvedValue({ synced: 0 });
    jest.spyOn(adapter, 'syncGroups').mockResolvedValue({ synced: 0 });
    await (adapter as any).finalizeConnectedClient({ authToken: 'test-only', getMyProfile: async () => { throw new Error('network'); } });
    expect(lineRepository.updateAccount).toHaveBeenCalledWith(1, expect.objectContaining({ display_name: 'Tên thiết lập' }));
    adapter.disconnect();
  });

  it('refreshes the account name during contact sync and ignores a profile from an old connection', async () => {
    const adapter = new LinePersonalAdapter(1);
    adapter.client = { getMyProfile: async () => ({ displayName: 'Tên vừa đổi trên LINE', mid: 'u-self' }) };
    await adapter.syncFriends();
    expect(lineRepository.updateAccount).toHaveBeenCalledWith(1, expect.objectContaining({ display_name: 'Tên vừa đổi trên LINE' }));
    (lineRepository.updateAccount as jest.Mock).mockClear();
    let resolveProfile!: (profile: any) => void;
    adapter.client = { getMyProfile: () => new Promise((resolve) => { resolveProfile = resolve; }) };
    const pending = adapter.syncProfile();
    adapter.disconnect();
    resolveProfile({ displayName: 'Tên của phiên cũ' });
    await pending;
    expect(lineRepository.updateAccount).not.toHaveBeenCalled();
  });

  it('does not clear the saved name when a profile contains an empty display name', async () => {
    const adapter = new LinePersonalAdapter(1);
    adapter.client = { getMyProfile: async () => ({ displayName: '  ', mid: 'u-self' }) };
    await adapter.syncProfile();
    expect(lineRepository.updateAccount).toHaveBeenCalledWith(1, { line_mid: 'u-self' });
    adapter.disconnect();
  });

  it('uses standard HTTPS Talk transport for both QR and saved-session login', async () => {
    const qrAdapter = new LinePersonalAdapter(1);
    const savedAdapter = new LinePersonalAdapter(2, { authToken: 'test-only-token' });
    const options: any[] = [];
    const sdk = {
      loginWithQR: (callbacks: any, init: any) => {
        options.push(init);
        callbacks.onReceiveQRUrl('line://transport-regression');
        return new Promise(() => {});
      },
      loginWithAuthToken: async (_token: string, init: any) => {
        options.push(init);
        return {};
      },
    };
    jest.spyOn(qrAdapter as any, 'loadLineJs').mockResolvedValue(sdk);
    jest.spyOn(savedAdapter as any, 'loadLineJs').mockResolvedValue(sdk);
    jest.spyOn(savedAdapter as any, 'finalizeConnectedClient').mockResolvedValue(undefined);
    try {
      await qrAdapter.startQrLogin();
      expect(await savedAdapter.connectWithSavedSession()).toBe(true);
      expect(options).toHaveLength(2);
      for (const init of options) expect(init.legy).toEqual({ encrypted: false });
    } finally { qrAdapter.disconnect(); savedAdapter.disconnect(); }
  });

  it.each(['provider', 'disconnect'])('cancels native SDK Requests on %s abort', async (source) => {
    const adapter = new LinePersonalAdapter(1);
    (adapter as any).advanceEpoch();
    const options = (adapter as any).buildInitOptions();
    const controller = new AbortController();
    let started!: () => void;
    const received = new Promise<void>((resolve) => { started = resolve; });
    const server = http.createServer((_req, _res) => { started(); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const request = new Request(`http://127.0.0.1:${(server.address() as any).port}/S4`, {
        method: 'POST', body: 'test-thrift-body', signal: controller.signal,
      });
      const pending = options.fetch(request);
      const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      await received;
      if (source === 'provider') controller.abort();
      else adapter.disconnect();
      await rejected;
    } finally {
      adapter.disconnect();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('passes native SDK Requests through a configured proxy without Request-brand errors', async () => {
    const lifecycle = new AbortController();
    const proxy = http.createServer();
    let connected!: () => void;
    const received = new Promise<void>((resolve) => { connected = resolve; });
    proxy.on('connect', (_req, socket) => {
      connected();
      socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');
    });
    await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
    try {
      const transport = createProxyFetch(`http://127.0.0.1:${(proxy.address() as any).port}`, lifecycle.signal)!;
      const pending = transport(new Request('https://line.invalid/S4'));
      const rejected = expect(pending).rejects.toThrow('fetch failed');
      await received;
      await rejected;
    } finally {
      lifecycle.abort();
      proxy.closeAllConnections();
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
  });

  it('rejects initialization failure promptly instead of returning an empty pending QR', async () => {
    const adapter = new LinePersonalAdapter(1);
    jest.spyOn(adapter as any, 'loadLineJs').mockRejectedValue(new Error('SDK unavailable'));
    await expect(adapter.startQrLogin()).rejects.toThrow('Không thể tạo');
    expect(lineRepository.updateAccount).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'NOT_LOGGED_IN', qr_code: null }));
    adapter.disconnect();
  });

  it('returns a locally generated PNG and catches callback persistence errors', async () => {
    const adapter = new LinePersonalAdapter(1);
    jest.spyOn(adapter as any, 'loadLineJs').mockResolvedValue({ loginWithQR: (callbacks: any) => {
      callbacks.onReceiveQRUrl('line://audit-only'); return new Promise(() => {});
    } });
    const result = await adapter.startQrLogin();
    expect(result.qrUrl).toMatch(/^data:image\/png;base64,/);
    const png = Buffer.from(result.qrUrl!.split(',')[1], 'base64');
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(result.qrUrl).not.toContain('qrserver');
    adapter.disconnect();

    const failing = new LinePersonalAdapter(2);
    jest.spyOn(failing as any, 'loadLineJs').mockResolvedValue({ loginWithQR: (callbacks: any) => {
      callbacks.onReceiveQRUrl('line://audit-only'); return new Promise(() => {});
    } });
    (lineRepository.updateAccount as jest.Mock).mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('DB write failed'));
    await expect(failing.startQrLogin()).rejects.toThrow('Không thể tạo');
    failing.disconnect();
  });

  it('times out a QR attempt and aborts the provider transport', async () => {
    jest.useFakeTimers();
    const adapter = new LinePersonalAdapter(1);
    let options: any;
    jest.spyOn(adapter as any, 'loadLineJs').mockResolvedValue({ loginWithQR: (_callbacks: any, init: any) => {
      options = init; return new Promise(() => {});
    } });
    try {
      const pending = adapter.startQrLogin();
      const rejected = expect(pending).rejects.toMatchObject({ statusCode: 504 });
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      await jest.advanceTimersByTimeAsync(20_000);
      await rejected;
      expect(adapter.client).toBeNull();
      await expect(options.fetch('https://unused.invalid')).rejects.toMatchObject({ name: 'AbortError' });
    } finally { adapter.disconnect(); jest.useRealTimers(); }
  });

  it('rejects a cancelled QR request and ignores a late provider QR callback', async () => {
    const adapter = new LinePersonalAdapter(1);
    let callbacks: any;
    jest.spyOn(adapter as any, 'loadLineJs').mockResolvedValue({ loginWithQR: (opts: any) => {
      callbacks = opts; return new Promise(() => {});
    } });
    const pending = adapter.startQrLogin();
    const rejected = expect(pending).rejects.toThrow('hủy');
    await new Promise((resolve) => setImmediate(resolve));
    adapter.disconnect(); await rejected;
    (lineRepository.updateAccount as jest.Mock).mockClear();
    callbacks.onReceiveQRUrl('line://stale-attempt');
    await new Promise((resolve) => setImmediate(resolve));
    expect(lineRepository.updateAccount).not.toHaveBeenCalled();
  });

  it.each([
    { toType: 'USER', from: 'u-peer', to: 'u-self', isSelf: false, thread: 'u-peer', type: 'user' },
    { toType: 'USER', from: 'u-self', to: 'u-peer', isSelf: true, thread: 'u-peer', type: 'user' },
    { toType: 'GROUP', from: 'u-peer', to: 'c-group', isSelf: false, thread: 'c-group', type: 'group' },
    { toType: 'ROOM', from: 'u-peer', to: 'r-room', isSelf: false, thread: 'r-room', type: 'group' },
  ])('persists SDK wrapper $toType / self=$isSelf in the correct thread', async (sample) => {
    const handlers = new Map<string, (...args: any[]) => any>();
    const adapter = new LinePersonalAdapter(1);
    adapter.client = { on: (event: string, handler: any) => handlers.set(event, handler), listen() {} };
    jest.spyOn(lineRepository, 'upsertConversation').mockResolvedValue({ id: 9 } as any);
    jest.spyOn(lineRepository, 'saveMessage').mockImplementation(async (data) => ({ id: 7, ...data } as any));
    adapter.startPollingListener();
    await handlers.get('message')!({ raw: { id: 'provider-id', createdTime: 1700000000000, toType: sample.toType },
      from: { id: sample.from, type: 'USER' }, to: { id: sample.to, type: sample.toType }, text: 'hello', isMyMessage: sample.isSelf });
    expect(lineRepository.upsertConversation).toHaveBeenCalledWith(expect.objectContaining({ external_thread_id: sample.thread, thread_type: sample.type }));
    expect(lineRepository.saveMessage).toHaveBeenCalledWith(expect.objectContaining({ line_msg_id: 'provider-id', sender_uid: sample.from, is_self: sample.isSelf }));
    adapter.disconnect();
  });

  it('detects SDK log stream failures and invalidates readiness', async () => {
    const base = new EventEmitter();
    const adapter = new LinePersonalAdapter(1);
    adapter.client = { base, on() {}, listen() {} };
    adapter.startPollingListener();
    base.emit('log', { type: 'LegyPusherError', data: { error: new Error('network lost') } });
    await new Promise((resolve) => setImmediate(resolve));
    expect(adapter.client).toBeNull(); expect(adapter.isListening).toBe(false);
    expect(lineRepository.updateAccount).toHaveBeenCalledWith(1, expect.objectContaining({ status: 'NOT_LOGGED_IN' }));
    expect(base.listenerCount('log')).toBe(0);
  });

  it('does not attempt a second send after a network timeout', async () => {
    const adapter = new LinePersonalAdapter(1);
    const send = jest.fn().mockRejectedValue(new Error('socket timeout'));
    adapter.client = { base: { talk: { sendMessage: send } } };
    await expect(adapter.sendMessage('u-peer', 'hello')).rejects.toThrow('socket timeout');
    expect(send).toHaveBeenCalledTimes(1); adapter.disconnect();
  });

  it('does not push after an OA reply with an uncertain result', async () => {
    (prisma as any).lineConversation = { findUnique: jest.fn().mockResolvedValue({ id: 1, reply_token: 'test', reply_token_expires_at: new Date(Date.now() + 50000) }), update: jest.fn().mockResolvedValue({}) };
    const adapter = new LineOaAdapter(1, { mode: 'OA', channelId: 'fake', channelSecret: 'fake', channelAccessToken: 'fake' });
    jest.spyOn(adapter.client, 'replyMessage').mockRejectedValue(new Error('socket timeout'));
    const push = jest.spyOn(adapter.client, 'pushMessage');
    await expect(adapter.sendMessageWithReplyFallback({ lineAccountId: 1, to: 'U-fake', text: 'test' })).rejects.toMatchObject({ code: 'LINE_UNCERTAIN_SEND' });
    expect(push).not.toHaveBeenCalled();
  });

  it('never restores a manually disconnected account through automatic readiness', async () => {
    jest.spyOn(lineRepository, 'findAccountById').mockResolvedValue({ id: 1, status: 'NOT_LOGGED_IN', account_type: 'OA',
      disconnect_reason: 'manual_disconnect', encrypted_session_data: encryptJson({ mode: 'OA', channelAccessToken: 'fake', channelSecret: 'fake' }) } as any);
    expect(await new LineAccountPool().ensureAccountReady(1)).toBe(false);
  });

  it('rejects an unsigned webhook before restoring adapters or writing events', async () => {
    jest.spyOn(lineRepository, 'findAccountById').mockResolvedValue({ id: 1, account_type: 'OA', webhook_secret: 'fake-secret' } as any);
    const ready = jest.spyOn(linePool, 'ensureAccountReady');
    await expect(lineWebhookHandler.handleWebhook({ accountId: 1, rawBody: '{}', body: { events: [] } })).rejects.toMatchObject({ statusCode: 401 });
    expect(ready).not.toHaveBeenCalled();
  });
});
