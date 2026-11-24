const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/features/classes/pages/ClassesPage.tsx'), 'utf8');
const tree = ts.createSourceFile('ClassesPage.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, node.initializer);
  ts.forEachChild(node, visit);
}
visit(tree);
function evaluate(name, context) {
  const expression = declarations.get(name).getText(tree);
  const js = ts.transpileModule(`const value = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
  return new Function(...Object.keys(context), `${js}; return value;`)(...Object.values(context));
}

test('teacher selection is quick-only while staff keep their existing selection column', () => {
  for (const isTeacher of [true, false]) for (const activeTab of ['quick', 'detailed', 'stats']) {
    assert.equal(evaluate('showClassSelection', { isTeacher, activeTab }), !isTeacher || activeTab === 'quick');
  }
});

test('selection policy wraps entire header, class and student cells with accessible inputs', () => {
  const cells = [];
  function inspect(node) {
    if (ts.isJsxExpression(node) && node.expression && ts.isBinaryExpression(node.expression) &&
        node.expression.left.getText(tree) === 'showClassSelection') {
      const elements = [];
      function collect(child) {
        if (ts.isJsxElement(child)) elements.push(child);
        ts.forEachChild(child, collect);
      }
      collect(node.expression.right);
      cells.push(elements[0]);
    }
    ts.forEachChild(node, inspect);
  }
  inspect(tree);
  assert.deepEqual(cells.map(cell => cell.openingElement.tagName.getText(tree)), ['th', 'td', 'td']);
  const expectedIds = ['select-all-class-attendance', 'select-attendance-class-', 'select-attendance-student-'];
  cells.forEach((cell, index) => {
    assert.ok(cell.getText(tree).includes(expectedIds[index]));
    assert.match(cell.getText(tree), /aria-label=/);
    assert.doesNotMatch(cell.getText(tree), /!isTeacher/);
  });
  assert.equal((source.match(/showClassSelection \? 'left-10' : 'left-0'/g) || []).length, 3);
  assert.equal((source.match(/showClassSelection \? 'left-\[152px\]' : 'left-\[112px\]'/g) || []).length, 3);
});

test('class, student and select-all handlers share selection state and preserve partial indicators', () => {
  let selected = new Set();
  let classes = new Set();
  const context = () => ({
    selectedEnrollmentIds: selected,
    setSelectedEnrollmentIds: update => { selected = typeof update === 'function' ? update(selected) : update; },
    setSelectedClassIds: update => { classes = typeof update === 'function' ? update(classes) : update; },
  });
  const students = [{ enrollment_class_id: 11 }, { enrollment_class_id: 12 }, { enrollment_class_id: 0 }];
  evaluate('handleToggleSelectClassRow', context())({ id: 7 }, students);
  assert.deepEqual([...selected], [11, 12]);
  evaluate('handleToggleSelectSingleEcId', context())(11);
  assert.deepEqual([...selected], [12]);
  evaluate('handleToggleSelectClassRow', context())({ id: 7 }, students);
  assert.deepEqual([...selected].sort(), [11, 12]);
  evaluate('handleToggleSelectClassRow', context())({ id: 7 }, students);
  assert.equal(selected.size, 0);
  evaluate('handleToggleSelectSingleEcId', context())(0);
  assert.equal(selected.size, 0);
  evaluate('handleToggleSelectClassRow', context())({ id: 9 }, []);
  assert.deepEqual([...classes], [9]);
  for (const allVisibleInClassesSelected of [false, true]) {
    evaluate('handleToggleSelectAllInClasses', {
      ...context(), allVisibleInClassesSelected,
      validVisibleEnrollmentIdsInClasses: [11, 12], validVisibleEmptyClassIds: [9],
    })();
    assert.equal(selected.size, allVisibleInClassesSelected ? 0 : 2);
    assert.equal(classes.size, allVisibleInClassesSelected ? 0 : 1);
  }
  assert.match(source, /el\.indeterminate = someVisibleInClassesSelected/);
  assert.match(source, /el\.indeterminate = someInClassSelected/);
});

test('empty row spans match actual role, optional, date, action and JLPT columns', () => {
  for (const isTeacher of [true, false]) for (const isCSOnly of [true, false]) {
    if (isTeacher && isCSOnly) continue;
    for (const activeTab of ['quick', 'detailed']) for (const optional of [0, 3, 5]) {
      const showClassSelection = !isTeacher || activeTab === 'quick';
      const canManageClasses = !isTeacher && !isCSOnly;
      const identity = evaluate('classIdentityColumnCount', { showClassSelection, visibleOptionalColsCount: optional });
      const attendance = evaluate('classAttendanceColumnCount', {
        activeTab, isCSOnly, visiblePeriodDates: Array(7), canManageClasses, showJlptLearningColumns: true,
      });
      const expected = 2 + optional + Number(showClassSelection) + 1 +
        (activeTab === 'quick' ? (isCSOnly ? 4 : 3) + 4 : 2 + 7) + Number(canManageClasses);
      assert.equal(identity + attendance, expected);
    }
  }
  assert.equal((source.match(/colSpan=\{classIdentityColumnCount \+ classAttendanceColumnCount\}/g) || []).length, 2);
  assert.match(source, /colSpan=\{classIdentityColumnCount\}/);
  assert.match(source, /colSpan=\{classAttendanceColumnCount\}/);
});

test('teacher history clears selection and cannot expose the bulk action toolbar', () => {
  assert.match(source, /if \(!isTeacher \|\| activeTab !== 'detailed'\) return;\s*setSelectedEnrollmentIds\(new Set\(\)\);\s*setSelectedClassIds\(new Set\(\)\);/);
  assert.match(source, /activeTab === 'quick' \|\| \(activeTab === 'detailed' && !isTeacher\)/);
});
