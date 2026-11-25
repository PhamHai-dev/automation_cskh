const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
const { setInflightPromise, getInflightPromise, clearQueryCache } = require('../src/lib/queryCache.ts');

test('failed HTTP requests are cleaned up without an extra unhandled rejection', async () => {
  clearQueryCache();
  const error = new Error('HTTP 500');
  const request = Promise.reject(error);
  setInflightPromise('students', request);
  await assert.rejects(request, (err) => err === error);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(getInflightPromise('students'), undefined);
});

test('completion of an old request does not remove the replacement request', async () => {
  clearQueryCache();
  let rejectOld, resolveNew;
  const old = new Promise((_, reject) => { rejectOld = reject; });
  const current = new Promise((resolve) => { resolveNew = resolve; });
  setInflightPromise('students', old);
  setInflightPromise('students', current);
  rejectOld(new Error('old request failed'));
  await assert.rejects(old);
  assert.equal(getInflightPromise('students'), current);
  resolveNew([]);
  await current;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(getInflightPromise('students'), undefined);
});
