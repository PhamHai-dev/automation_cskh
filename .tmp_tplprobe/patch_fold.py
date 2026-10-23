import io

p = 'src/modules/imports/attendance-sheet.util.ts'
s = io.open(p, encoding='utf-8').read()
lines = s.split('\n')

old_block = None
for i, l in enumerate(lines):
    if ".normalize('NFD')" in l:
        old_block = i
        break

if old_block is None:
    raise SystemExit('anchor not found')

new_body = [
    "    .normalize('NFD')",
    "    .split('')",
    '    .filter((ch) => {',
    '      const code = ch.charCodeAt(0);',
    '      // Drop combining diacritical marks (U+0300 - U+036F).',
    '      return code < 0x300 || code > 0x36f;',
    '    })',
    "    .join('')",
]

# Replace the normalize line + the following combining-mark regex line.
lines[old_block:old_block + 2] = new_body
out = '\n'.join(lines)
io.open(p, 'w', encoding='utf-8', newline='\n').write(out)
print('patched OK')
