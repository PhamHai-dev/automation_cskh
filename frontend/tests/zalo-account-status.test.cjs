const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  module._compile(output.outputText, filename);
};
const { normalizeZaloStatus, normalizeZaloAccount } = require('../src/features/zalo/utils/zaloAccountStatus.ts');

test('provider pool status connected resolves to ACTIVE after successful phone login', () => {
  const account = normalizeZaloAccount({ id: 5, status: 'ACTIVE', liveStatus: 'connected' });
  assert.equal(account.liveStatus || account.status, 'ACTIVE');
  assert.equal(normalizeZaloStatus('connected'), 'ACTIVE');
});

test('live disconnect and in-progress states take precedence over old ACTIVE database status', () => {
  for (const [liveStatus, expected] of [['disconnected', 'NOT_LOGGED_IN'], ['qr_pending', 'QR_PENDING'], ['connecting', 'CONNECTING'], ['expired', 'EXPIRED'], ['error', 'ERROR']]) {
    const account = normalizeZaloAccount({ status: 'ACTIVE', liveStatus });
    assert.equal(account.liveStatus || account.status, expected);
  }
});

test('persisted disabled and banned states cannot be made active by stale live status', () => {
  for (const status of ['DISABLED', 'BANNED']) {
    const account = normalizeZaloAccount({ status, liveStatus: 'connected' });
    assert.equal(account.liveStatus, status);
  }
});

test('enum values stay compatible, and absent/unknown live status falls back to database status', () => {
  for (const status of ['ACTIVE', 'QR_PENDING', 'NOT_LOGGED_IN', 'CONNECTING', 'EXPIRED', 'BANNED', 'DISABLED', 'ERROR']) assert.equal(normalizeZaloStatus(status), status);
  for (const liveStatus of [null, undefined, 'unexpected-provider-value']) {
    const account = normalizeZaloAccount({ status: 'ACTIVE', liveStatus });
    assert.equal(account.liveStatus, null);
    assert.equal(account.liveStatus || account.status, 'ACTIVE');
  }
});
