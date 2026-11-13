const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
// Compile TSX in-memory: no additional test framework or generated project files.
require.extensions['.tsx'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  module._compile(output.outputText, filename);
};
require.extensions['.css'] = () => {};
const { DataGroups, DataFilters, DataRowMenu } = require('../src/features/imports/components/DataManagementControls.tsx');
const source = name => fs.readFileSync(path.join(__dirname, '../src/features/imports/components', name), 'utf8');

test('group selector exposes selected state, counts, tones and all groups', () => {
  const html = renderToStaticMarkup(React.createElement(DataGroups, { label: 'Groups', value: 'ALL', onChange() {}, items: [{ value: 'ALL', label: 'All sources', count: 24, tone: 'all' }, { value: 'REPORT', label: 'Reports', count: 4, tone: 'report' }] }));
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /data-tone="report"/);
  assert.match(html, /24/);
  assert.match(html, /Reports/);
});
test('secondary filters remain mounted but hidden until expanded', () => {
  const html = renderToStaticMarkup(React.createElement(DataFilters, { search: '', onSearch() {}, placeholder: 'Search', program: 'ALL', onProgram() {}, status: 'ALL', onStatus() {}, activeCount: 2, onReset() {}, children: React.createElement('select', { 'aria-label': 'Source type' }) }));
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /class="hidden"/);
  assert.match(html, /Source type/);
  assert.match(html, /\(2\)/);
});
test('closed row menu is accessible and does not expose destructive actions', () => {
  const html = renderToStaticMarkup(React.createElement(DataRowMenu, { label: 'Source A', actions: [{ label: 'Delete', danger: true, onClick() {} }] }));
  assert.match(html, /aria-haspopup="menu"/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, />Delete</);
});
test('sync keeps preview route, system protection, file replacement and mapping', () => {
  const code = source('GoogleSheetSyncPanel.tsx');
  for (const token of ['/data-sync/preview/', '!isSystemMaster', 'handleTriggerInlineFileUpload(cfg.code)', 'handleSaveCvhtMapping(cfg.code)', 'renderFilterSummaryCell(cfg)', '<th>Kết nối</th><th>Phạm vi</th>']) assert.ok(code.includes(token), token);
});
test('backup retains batch scope, per-row run, download and protected deletion', () => {
  const code = source('CsSheetBackupPanel.tsx');
  for (const token of ['handleRunBatchOrAll', 'handleRunOne(cfg)', 'handleDownloadExcel(cfg)', 'canManage && !isAdminSystem', 'cfg.backup_year', '<th>Nơi lưu</th><th>Phạm vi</th>']) assert.ok(code.includes(token), token);
});
test('both forms keep save handlers and advanced controls inside native details', () => {
  for (const file of ['SyncConfigModal.tsx', 'BackupConfigModal.tsx']) {
    const code = source(file);
    assert.match(code, /footer=\{/);
    assert.match(code, /onClick=\{handleSubmit\}/);
    assert.match(code, /<details className="data-advanced">/);
  }
});

test('sync content does not duplicate the sidebar navigation tabs', () => {
  const code = source('GoogleSheetSyncPanel.tsx');
  assert.doesNotMatch(code, /Danh sách nguồn đồng bộ \(\{configs\.length\}\)/);
  assert.doesNotMatch(code, /<span>Lịch sử đồng bộ<\/span>/);
  assert.doesNotMatch(code, /<span>Ánh xạ CSKH &amp; Kết nối<\/span>/);
});

test('both data pages expose premium KPI cards and flow-colored rows', () => {
  const sync = source('GoogleSheetSyncPanel.tsx');
  const backup = source('CsSheetBackupPanel.tsx');
  for (const code of [sync, backup]) {
    for (const token of ['data-summary-card is-total', 'data-summary-card is-auto', 'data-summary-card is-success', 'data-summary-card is-warning', 'data-flow=']) assert.ok(code.includes(token), token);
  }
});

test('data source tables are flat columns without per-row dropdown details', () => {
  const sync = source('GoogleSheetSyncPanel.tsx');
  const backup = source('CsSheetBackupPanel.tsx');
  for (const code of [sync, backup]) {
    assert.doesNotMatch(code, /expandedRows|data-row-details|data-expand/);
    assert.match(code, /data-auto-switch/);
    assert.match(code, /<th>Phạm vi<\/th>/);
  }
});
