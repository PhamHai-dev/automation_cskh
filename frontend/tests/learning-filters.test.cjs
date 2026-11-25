const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.join(__dirname, '..');
const req = createRequire(path.join(root, 'package.json'));
const ts = req('typescript');
const React = req('react');
const { renderToStaticMarkup } = req('react-dom/server');
for (const extension of ['.tsx', '.ts']) {
  require.extensions[extension] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    module._compile(ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText, filename);
  };
}
const source = file => fs.readFileSync(path.join(root, 'src', file), 'utf8');
const { FilterBar } = req('./src/components/common/FilterBar.tsx');

test('learning filter always renders active row with disabled empty reset and one title', () => {
  const html = renderToStaticMarkup(React.createElement(FilterBar, { variant: 'learning', onClear() {}, viewControls: React.createElement('span', null, 'Table tools') }, React.createElement('input', { id: 'search' })));
  assert.equal((html.match(/<h2/g) || []).length, 1);
  assert.match(html, /Tìm kiếm &amp; Bộ lọc/);
  assert.match(html, /data-filter-row="active"/);
  assert.match(html, /Chưa áp dụng bộ lọc/);
  assert.match(html.match(/<button[^>]*id="learning-clear-filters"[^>]*>/)[0], /disabled=""/);
  assert.ok(html.indexOf('data-filter-row="conditions"') < html.indexOf('data-filter-row="display"'));
  assert.ok(html.indexOf('data-filter-row="display"') < html.indexOf('data-filter-row="active"'));
});

test('applied conditions enable reset and omit empty message', () => {
  const html = renderToStaticMarkup(React.createElement(FilterBar, { variant: 'learning', onClear() {}, chips: [{ id: 'schedule', label: 'Lịch/ca', value: 'Ngày đang chọn', onRemove() {} }] }, 'Search'));
  assert.doesNotMatch(html, /Chưa áp dụng bộ lọc/);
  assert.match(html, /Lịch\/ca/);
  assert.doesNotMatch(html.match(/<button[^>]*id="learning-clear-filters"[^>]*>/)[0], /disabled=/);
});

test('legacy filter variants do not gain the persistent learning empty row', () => {
  const html = renderToStaticMarkup(React.createElement(FilterBar, { variant: 'toolbar' }, 'Legacy'));
  assert.doesNotMatch(html, /Chưa áp dụng bộ lọc|data-filter-row="active"/);
});

test('all scoped student and report pages place existing toolbar in viewControls', () => {
  for (const file of ['features/students/pages/StudentsPage.tsx', 'features/students/pages/JlptAttendanceReportPage.tsx', 'features/attendance/pages/TeacherStudentInfoPage.tsx']) {
    const page = source(file);
    assert.match(page, /viewControls=\{<>/);
    assert.equal((page.match(/Hiển thị:/g) || []).length, 1, file);
    assert.doesNotMatch(page, /\{\/\* Table Toolbar \*\/\}/);
  }
});

test('attendance keeps labeled schedule checkboxes and omits daily teacher-match actions from row two', () => {
  const page = source('features/classes/pages/ClassesPage.tsx');
  const matrix = source('features/classes/components/AttendanceMatrix.tsx');
  assert.match(page, /id="attendance-only-scheduled" type="checkbox"/);
  assert.match(page, /Chỉ có lịch\/ca ngày đang chọn/);
  assert.match(page, /contextChips=\{contextFilterChips\}/);
  assert.doesNotMatch(page, /handleMatchTeacherForDayInClasses|tableToolsTarget|toolbarTarget/);
  assert.match(matrix, /\{!externalViewControls && tableToolbar\}/);
  assert.doesNotMatch(matrix, /createPortal/);
  // Matching selected students remains a separate table action, not the removed daily action.
  assert.match(matrix, /onClick=\{handleBulkMatchSelectedRows\}/);
});

test('display row contains exactly one set of contextual chips and no local active-row duplicate', () => {
  const bar = source('features/enrollments/components/EnrollmentFilterBar.tsx');
  assert.match(bar, /chips=\{\[\.\.\.activeChips, \.\.\.contextChips\]\}/);
  assert.match(bar, /viewControls=\{contextControls\}/);
});

test('attendance puts counts and column visibility first, and the date control last in every tab', () => {
  const page = source('features/classes/pages/ClassesPage.tsx');
  const controls = page.slice(page.indexOf('contextControls={'), page.indexOf('/* NỘI DUNG CHÍNH:'));
  assert.ok(controls.indexOf('Hiển thị:') < controls.indexOf('<ColumnVisibilityDropdown'));
  assert.ok(controls.indexOf('<ColumnVisibilityDropdown') < controls.indexOf('attendance-only-scheduled'));
  assert.ok(controls.indexOf('Đang đồng bộ...') < controls.indexOf('<AttendanceViewControls'));
  assert.match(controls, /<AttendanceViewControls[^]*\/>\s*<\/>\s*\}\s*\/>/);
  const { AttendanceViewControls } = req('./src/features/classes/components/AttendanceViewControls.tsx');
  for (const activeTab of ['quick', 'detailed', 'stats']) {
    const html = renderToStaticMarkup(React.createElement(AttendanceViewControls, {
      activeTab, selectedDate: '2026-11-25', onDateChange() {},
      periodDate: new Date(2026, 10, 25), onPeriodChange() {},
      periodMode: 'month', onPeriodModeChange() {}, viewMode: 'matrix', onViewModeChange() {},
    }));
    assert.equal((html.match(/data-display-control="date"/g) || []).length, 1);
    assert.match(html, /class="learning-filter-date /);
    if (activeTab === 'detailed') {
      assert.ok(html.indexOf('attendance-period-mode-month') < html.indexOf('data-display-control="date"'));
    }
  }
});

test('student table column controls stay beside counts before loading and legends', () => {
  const students = source('features/students/pages/StudentsPage.tsx');
  const studentTools = students.slice(students.indexOf('viewControls={<>'), students.indexOf('variant="learning"'));
  assert.ok(studentTools.indexOf('Hiển thị:') < studentTools.indexOf('<ColumnVisibilityDropdown'));
  assert.ok(studentTools.indexOf('<ColumnVisibilityDropdown') < studentTools.indexOf('{isFetching'));
  const teacher = source('features/attendance/pages/TeacherStudentInfoPage.tsx');
  const teacherTools = teacher.slice(teacher.indexOf('viewControls={<>'), teacher.indexOf('variant="learning"'));
  assert.ok(teacherTools.indexOf('Hiển thị:') < teacherTools.indexOf('Cột hiển thị:'));
  assert.ok(teacherTools.indexOf('Cột hiển thị:') < teacherTools.indexOf('Đã điểm danh Có mặt'));
});

test('learning condition fields share flexible sizing and fixed gaps without changing legacy filters', () => {
  const css = source('styles/globals.css');
  assert.match(css, /\.learning-filter-row\[data-filter-row="conditions"\]\s*\{\s*justify-content: flex-start;/);
  assert.match(css, /\.learning-filter-row\[data-filter-row="conditions"\] > \.learning-filter-search\s*\{\s*flex: 2 1 20rem;\s*max-width: none;/);
  assert.match(css, /\.learning-filter-date\s*\{\s*margin-left: auto;/);
  assert.match(css, /\.learning-filter-display-start \.column-visibility-menu\s*\{\s*left: 0;\s*right: auto;\s*max-width: min\(100%, calc\(100vw - 2rem\)\);/);
  assert.match(css, /@media \(max-width: 639px\)[^]*flex: 1 1 100%;/);
  for (const file of ['features/enrollments/components/EnrollmentFilterBar.tsx', 'features/students/pages/StudentsPage.tsx', 'features/students/pages/JlptAttendanceReportPage.tsx', 'features/attendance/pages/TeacherStudentInfoPage.tsx']) {
    assert.match(source(file), /className="learning-filter-search/);
  }
});
