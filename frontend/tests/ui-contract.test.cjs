const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

require.extensions['.tsx'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  module._compile(output.outputText, filename);
};

test('repeated form labels keep unique controls and correctly associated validation feedback', () => {
  const { Input } = require('../src/components/ui/Input.tsx');
  const { Select } = require('../src/components/ui/Select.tsx');
  const { Textarea } = require('../src/components/ui/Textarea.tsx');
  const html = renderToStaticMarkup(React.createElement('form', null,
    React.createElement(Input, { label: 'Name', defaultValue: 'First', helperText: 'Hint' }),
    React.createElement(Input, { label: 'Name', defaultValue: 'Second', error: 'Required', required: true }),
    React.createElement(Select, { label: 'Name', options: [{ value: 'all', label: 'All' }] }),
    React.createElement(Textarea, { label: 'Name', helperText: 'Details' }),
  ));
  const controlIds = [...html.matchAll(/<(?:input|select|textarea)[^>]* id="([^"]+)"/g)].map(m => m[1]);
  const labelIds = [...html.matchAll(/<label[^>]* for="([^"]+)"/g)].map(m => m[1]);
  assert.equal(controlIds.length, 4);
  assert.equal(new Set(controlIds).size, 4);
  assert.deepEqual(labelIds, controlIds);
  for (const match of html.matchAll(/aria-describedby="([^"]+)"/g)) assert.ok(html.includes(`id="${match[1]}"`));
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /value="Second"/);
});

test('semantic surface, status and provider colors compile with Tailwind opacity modifiers', async () => {
  const postcss = require('postcss');
  const tailwind = require('tailwindcss');
  const config = (await import('../tailwind.config.js')).default;
  const compiled = await postcss([tailwind({
    content: [{ raw: 'bg-primary/20 bg-surface/95 text-text-muted bg-line/15 border-success-border text-danger-foreground' }],
    theme: config.theme, corePlugins: { preflight: false },
  })]).process('@tailwind utilities;', { from: undefined });
  assert.match(compiled.css, /rgb\(var\(--color-primary-rgb\) \/ 0\.2\)/);
  assert.match(compiled.css, /rgb\(var\(--color-surface-rgb\) \/ 0\.95\)/);
  assert.match(compiled.css, /rgb\(var\(--color-line-rgb\) \/ 0\.15\)/);
  assert.match(compiled.css, /--color-success-border-rgb/);
  assert.match(compiled.css, /--color-danger-foreground-rgb/);
});

test('function icons share Lucide and provider SVGs remain in the shared brand catalog', () => {
  const root = path.join(__dirname, '../src');
  const failures = [];
  for (const file of fs.readdirSync(root, { recursive: true }).filter(p => p.endsWith('.tsx'))) {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'svg' && !file.endsWith('BrandIcons.tsx')) {
        failures.push(file + ': inline SVG outside shared catalog');
      }
      if (ts.isImportDeclaration(node) && /react-icons|heroicons|fontawesome|iconify/.test(node.moduleSpecifier.text)) failures.push(file + ': mixed icon library');
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(failures, []);
});
