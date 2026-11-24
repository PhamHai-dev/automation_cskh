const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.join(__dirname, '../src/features/classes');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const moduleSource = ts.transpileModule(read('utils/jlpt-inline-rules.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const compiled = { exports: {} };
new Function('module', 'exports', moduleSource)(compiled, compiled.exports);
const { isJlptTeacherAbsent, jlptInlinePatch } = compiled.exports;

test('all five teacher absence statuses lock criteria without treating an empty status as absent', () => {
  for (const status of ['ABSENT_APPROVED_A', 'LEAVE_B', 'ABSENT_UNAPPROVED_C', 'TEACHER_ABSENT_D', 'TECH_ERROR_E']) assert.equal(isJlptTeacherAbsent(status), true);
  for (const status of ['ATTENDED', null, undefined]) assert.equal(isJlptTeacherAbsent(status), false);
});
test('rating blanks clear only their field; valid A/B/C ratings are preserved', () => {
  for (const field of ['preparation_rating', 'attitude_rating']) {
    for (const value of ['A', 'B', 'C']) assert.deepEqual(jlptInlinePatch(field, value), { field, value });
    assert.deepEqual(jlptInlinePatch(field, ''), { field, value: null });
    assert.throws(() => jlptInlinePatch(field, 'D'));
  }
});
test('homework false and null are distinct', () => {
  assert.equal(jlptInlinePatch('homework_completed', 'false').value, false);
  assert.equal(jlptInlinePatch('homework_completed', 'true').value, true);
  assert.equal(jlptInlinePatch('homework_completed', '').value, null);
  assert.throws(() => jlptInlinePatch('homework_completed', 'yes'));
});
test('scores accept zero, positive integers and clear; reject negative, fractions, nonnumbers and unsafe integers', () => {
  for (const [raw, value] of [['', null], [' ', null], ['0', 0], ['23', 23]]) assert.deepEqual(jlptInlinePatch('test_correct_answers', raw), { field: 'test_correct_answers', value });
  for (const raw of ['-1', '1.5', 'abc', 'Infinity', '9007199254740992']) assert.throws(() => jlptInlinePatch('test_correct_answers', raw));
});
test('both quick attendance views render inline columns, not a standalone modal', () => {
  const page = read('pages/ClassesPage.tsx');
  const matrix = read('components/AttendanceMatrix.tsx');
  for (const source of [page, matrix]) {
    assert.match(source, /<JlptLearningHeaders/);
    assert.match(source, /<JlptLearningColumns/);
    assert.match(source, /attendanceForSession=/);
  }
  assert.equal((page.match(/<JlptLearningColumns/g) || []).length, 2);
  assert.doesNotMatch(page, /JlptLearningGrid|open-jlpt-learning-|setJlptLearningClass/);
});
test('inline controls deduplicate session reads and never create attendance/session records', () => {
  const source = read('components/JlptLearningColumns.tsx');
  assert.match(source, /entries\.has\(key\) && !retry/);
  assert.match(source, /jlptLearningRecordsApi\.update\(classId, sessionId, ecId, patch\)/);
  assert.match(source, /readonly \|\| absent/);
  assert.match(source, /session\.status === 'CANCELLED'/);
  assert.match(source, /savingRef\.current/);
  assert.match(source, /store\.load\(classId, session\.id, true\)/);
  assert.doesNotMatch(source, /classSessionsApi|attendanceApi|bulkUpdate/);
});

test('class view groups one-to-one and group models with the same parent/child hierarchy', () => {
  const page = read('pages/ClassesPage.tsx');
  const table = page.slice(page.indexOf('tableClasses.map((cls) =>'));
  assert.doesNotMatch(table, /\bisOneToOne\b|singleStudent/);
  assert.match(table, /data-row-kind="class"/);
  assert.match(table, /data-row-kind="student"/);
  assert.match(table, /aria-expanded=\{isExpanded\}/);
  assert.match(table, /\{isExpanded &&\s*\(students\.length === 0/);
  assert.match(table, /\{students\.length\} học viên/);
  assert.match(table, /renderQuickStatusCell\(cls, st, selectedDate\)/);
  assert.match(table, /enrollmentClassId=\{st\.enrollment_class_id\}/);
});
test('expand all includes one-to-one classes without mutating class model or student view', () => {
  const page = read('pages/ClassesPage.tsx');
  assert.match(page, /const allExpanded = filteredClasses\.every/);
  assert.match(page, /new Set\(filteredClasses\.map\(\(c\) => c\.id\)\)/);
  assert.doesNotMatch(page, /multiStudentClasses|Thu gọn lớp 1:n/);
  assert.match(page, /Thu gọn tất cả lớp/);
  assert.match(page, /displayMode === 'students'/);
});