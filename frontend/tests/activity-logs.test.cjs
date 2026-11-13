const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '../src/features/activity-logs');
const page = fs.readFileSync(path.join(root, 'pages/ActivityLogsPage.tsx'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api/activityLogs.api.ts'), 'utf8');
const types = fs.readFileSync(path.join(root, 'types/activityLogs.types.ts'), 'utf8');
const dates = fs.readFileSync(path.join(root, 'components/ActivityDateControls.tsx'), 'utf8');

const has = (source, tokens) => tokens.forEach(token => assert.ok(source.includes(token), token));

test('activity filters and pagination are URL-backed with debounced keyword search', () => {
  has(page, [
    'useSearchParams()',
    "searchParams.get('page')",
    "searchParams.get('pageSize')",
    "searchParams.get('q')",
    "searchParams.get('from')",
    "searchParams.get('to')",
    "searchParams.get('module')",
    'useDebouncedValue(queryDraft, 400)',
    'pageSizeOptions={PAGE_SIZES}',
  ]);
  has(dates, ["['today', 'Hôm nay']", "['7d', '7 ngày']", "['30d', '30 ngày']", "['custom', 'Tùy chỉnh']"]);
});

test('CSV export is delegated to the backend for the whole filtered view', () => {
  has(page, ['activityLogsApi.downloadExport(params)', 'view: activeTab', 'programType:', 'actorId:']);
  has(api, ["apiClient.get('/activity-logs/export'", "responseType: 'blob'", 'content-disposition']);
  has(types, ['export type ActivityExportView', 'view: ActivityExportView']);
  assert.doesNotMatch(page, /downloadCsvFile|rows\.map\(.*CSV/s);
});

test('desktop tables and mobile cards coexist with explicit detail actions', () => {
  has(page, [
    'className="hidden lg:block"',
    'className="space-y-3 lg:hidden"',
    "header: 'Chi tiết'",
    'setSelectedAudit(item)',
    'loadSyncDetail(item)',
    'setSelectedBackup(batch)',
    '<MobilePagination',
  ]);
  assert.doesNotMatch(page, /onRowClick=/);
});

test('sync rollback is permission-aware and backup detail stays batch-oriented', () => {
  has(page, [
    'syncData.canRollback',
    "selectedSync.status !== 'ROLLED_BACK'",
    'rollbackSheetSyncHistory',
    'selectedBackup.items.map',
    "'Hồ sơ / Chăm sóc'",
    "'Chấm buổi / Báo cáo'",
    "'Điểm danh chốt'",
  ]);
});

test('technical audit data is collapsed and only rendered when returned by backend', () => {
  has(page, [
    '(selectedAudit.beforeData || selectedAudit.afterData)',
    '<details className=',
    'Dữ liệu kỹ thuật',
    'JSON.stringify(selectedAudit.beforeData',
  ]);
});
