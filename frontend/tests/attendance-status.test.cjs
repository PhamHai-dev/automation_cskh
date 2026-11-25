const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(process.cwd(), 'src/features/classes/components');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const source = read('AttendanceStatusStack.tsx');
const compiled = { exports: {} };
const js = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const Dropdown = () => null;
new Function('require', 'module', 'exports', js)(name => name === 'react' ? React : { AttendanceStatusDropdown: Dropdown }, compiled, compiled.exports);
const Stack = compiled.exports.AttendanceStatusStack;
function selectors(props) {
  const found = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === Dropdown) found.push(node.props);
    React.Children.forEach(node.props?.children, visit);
  }
  visit(Stack(props));
  return found;
}
const base = { id: 'student-11', studentName: 'Học viên', sessions: [], readStatus: () => null, onSelect() {}, onDelete() {} };

test('empty row exposes an unmarked selector and does not create anything until a status is chosen', () => {
  const calls = [];
  const [add] = selectors({ ...base, onSelect: (...args) => calls.push(args) });
  assert.equal(add.value, undefined);
  assert.equal(add.emptyLabel, '-');
  assert.equal(calls.length, 0);
  add.onChange(null);
  assert.equal(calls.length, 0);
  add.onChange('ATTENDED');
  assert.deepEqual(calls, [[undefined, 1, 'ATTENDED']]);
});

test('minus deletes exactly the selected student session via its scoped callback', () => {
  const session = { id: 101 };
  const deleted = [];
  const [marked] = selectors({ ...base, sessions: [session], readStatus: () => 'ATTENDED', onDelete: value => deleted.push(value) });
  marked.onChange(null);
  assert.deepEqual(deleted, [session]);
});

test('deleted/unmarked rows disappear and + reuses their shared session rather than creating duplicates', () => {
  const sessions = [{ id: 101 }, { id: 102 }];
  const calls = [];
  const controls = selectors({ ...base, sessions, readStatus: session => session.id === 102 ? 'LEAVE_B' : null, onSelect: (...args) => calls.push(args) });
  assert.equal(controls.length, 2);
  assert.equal(controls[0].value, 'LEAVE_B');
  controls[1].onChange('TECH_ERROR_E');
  assert.deepEqual(calls, [[sessions[0], 1, 'TECH_ERROR_E']]);
});

test('both entry views share the stack without role-specific dropdown branches', () => {
  for (const name of ['../pages/ClassesPage.tsx', 'AttendanceMatrix.tsx']) assert.match(read(name), /<AttendanceStatusStack/);
});

test('dropdown uses six canonical colored statuses plus minus and no icons', () => {
  const dropdown = read('AttendanceStatusDropdown.tsx');
  assert.match(dropdown, /Object\.entries\(ATTENDANCE_CODE_CONFIG\)/);
  assert.ok(dropdown.includes("emptyLabel = '-'"));
  assert.ok(dropdown.includes('selectedOption?.label ?? emptyLabel'));
  assert.match(dropdown, /config\.solidBg/);
  assert.match(dropdown, /config\.solidText/);
  assert.match(dropdown, /<span>-<\/span>/);
  assert.doesNotMatch(dropdown, /lucide-react|<Check|<ChevronDown|<Trash2|<Plus|<span>Xóa/);
  assert.match(read('attendance-status.css'), /width: max-content/);
});

test('marked status has one plus selector beside it, not a separate unmarked row', () => {
  const session = { id: 101 };
  const props = { ...base, sessions: [session], readStatus: () => 'ATTENDED' };
  const controls = selectors(props);
  assert.equal(controls.length, 2);
  assert.equal(controls[1].emptyLabel, '+');
  const stack = Stack(props);
  const row = React.Children.toArray(stack.props.children)[0];
  const statusLine = React.Children.toArray(row.props.children)[0];
  const siblings = React.Children.toArray(statusLine.props.children).filter(child => child.type === Dropdown);
  assert.equal(siblings.length, 2);
  assert.equal(siblings[0].props.value, 'ATTENDED');
  assert.equal(siblings[1].props.emptyLabel, '+');
});
