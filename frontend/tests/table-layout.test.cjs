const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

require.extensions['.tsx'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  module._compile(output.outputText, filename);
};
const { DataTable } = require('../src/components/common/DataTable.tsx');

test('headers stay independent of left/center/right body alignment and wrapping', () => {
  const html = renderToStaticMarkup(React.createElement(DataTable, {
    pagination: false, data: [{ name: 'Nguyễn Văn Tên Rất Dài', count: -12, status: 'Đã kết nối' }],
    columns: [
      { header: 'Họ và tên', accessorKey: 'name', align: 'left', wrap: true },
      { header: 'Số buổi', accessorKey: 'count', align: 'right' },
      { header: 'Trạng thái', accessorKey: 'status', align: 'center' },
    ],
  }));
  assert.equal((html.match(/scope="col"/g) || []).length, 3);
  assert.match(html, /data-align="left" data-wrap="normal"/);
  assert.match(html, /data-align="right" data-wrap="nowrap"/);
  assert.match(html, /data-align="center" data-wrap="nowrap"/);
  assert.match(html, />-12<\/td>/);
});

test('empty and loading states retain valid full-width table rows', () => {
  const columns = [{ header: 'Tên', accessorKey: 'name', align: 'left' }, { header: 'Số', accessorKey: 'count', align: 'right' }];
  const empty = renderToStaticMarkup(React.createElement(DataTable, { columns, data: [], pagination: false }));
  assert.match(empty, /colSpan="2"/i);
  const loading = renderToStaticMarkup(React.createElement(DataTable, { columns, data: [], isLoading: true, pagination: false }));
  assert.equal((loading.match(/animate-pulse/g) || []).length, 5);
});

test('every project table and column explicitly declares the layout contract', () => {
  const root = path.join(__dirname, '../src');
  const files = fs.readdirSync(root, { recursive: true }).filter(file => file.endsWith('.tsx'));
  const issues = [];
  let tables = 0, columns = 0;
  for (const file of files) {
    const filename = path.join(root, file);
    const sf = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const location = node => `${file}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
    const attr = (node, key) => node.attributes.properties.find(prop => prop.name?.getText(sf) === key);
    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(sf);
        if (tag === 'table') { tables++; if (!attr(node, 'data-table')) issues.push(`${location(node)} table has no contract`); }
        if (tag === 'th' && !attr(node, 'scope')) issues.push(`${location(node)} header has no scope`);
        if (tag === 'td' && ts.isJsxOpeningElement(node) && !filename.endsWith('DataTable.tsx') && !attr(node, 'data-align')) issues.push(`${location(node)} cell has no alignment`);
      }
      if (ts.isObjectLiteralExpression(node) && node.properties.some(prop => prop.name?.getText(sf) === 'header')) {
        columns++;
        if (!node.properties.some(prop => prop.name?.getText(sf) === 'align')) issues.push(`${location(node)} column has no alignment`);
        if (!node.properties.some(prop => prop.name?.getText(sf) === 'wrap')) issues.push(`${location(node)} column has no wrap policy`);
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
  }
  assert.ok(tables > 0 && columns > 0, 'The scan must discover native tables and shared column definitions');
  assert.deepEqual(issues, []);
});
