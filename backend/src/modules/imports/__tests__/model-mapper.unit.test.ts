// E.1 canonical model mapper (mock-only). Proves the single decision rule is
// stable across cases AND that the workbook path (classifyClassModel directly)
// and the sheet-sync path (mapClassModelType) now yield the SAME class model
// for the same logical input. No file I/O, no ExcelJS workbook built, no DB.

import { ClassModelType } from '@prisma/client';
import { classifyClassModel } from '../model-mapper';
import { mapClassModelType } from '../sheet-sync.parser';

describe('classifyClassModel — canonical rule (E.1)', () => {
  const cases: Array<[string, string | null | undefined, ClassModelType]> = [
    ['unambiguous group (1-n)', '1-n', ClassModelType.ONE_TO_N],
    ['unambiguous group (1:n)', '1:N', ClassModelType.ONE_TO_N],
    ['unambiguous group (nhóm)', 'Nhóm 4 người', ClassModelType.ONE_TO_N],
    ['unambiguous group (nhom, no diacritics)', 'nhom 5', ClassModelType.ONE_TO_N],
    ['small group 1-2', '1-2', ClassModelType.ONE_TO_TWO],
    ['small group 1:2', '1:2', ClassModelType.ONE_TO_TWO],
    ['1-1 explicit', '1-1', ClassModelType.ONE_TO_ONE],
    ['flexible 1-1 with underlying schedule hint (model still from cell)', '1-1', ClassModelType.ONE_TO_ONE],
    ['missing hint falls back to 1-1', null, ClassModelType.ONE_TO_ONE],
    ['empty hint falls back to 1-1', '', ClassModelType.ONE_TO_ONE],
    ['unrecognized hint falls back to 1-1', 'whatever', ClassModelType.ONE_TO_ONE],
  ];

  for (const [name, input, expected] of cases) {
    it(name, () => {
      expect(classifyClassModel(input)).toBe(expected);
    });
  }

  it('is case-insensitive on the raw text', () => {
    expect(classifyClassModel('1-N')).toBe(ClassModelType.ONE_TO_N);
    expect(classifyClassModel('NHÓM')).toBe(ClassModelType.ONE_TO_N);
  });

  it('checks 1-2 BEFORE nhóm so "1-2 nhóm" is one-to-two, not a broad group', () => {
    expect(classifyClassModel('1-2')).toBe(ClassModelType.ONE_TO_TWO);
  });
});

describe('workbook path and sheet-sync path agree (E.1 golden pairing)', () => {
  const paired: Array<{ label: string; input: string | null }> = [
    { label: 'group', input: 'Nhóm' },
    { label: '1-2', input: '1-2' },
    { label: 'blank', input: '' },
    { label: 'unrecognized', input: 'x' },
    { label: '1-1', input: '1-1' },
  ];

  for (const { label, input } of paired) {
    it(`${label}: mapper == sheet-sync parser`, () => {
      expect(classifyClassModel(input)).toBe(mapClassModelType(input));
    });
  }
});
