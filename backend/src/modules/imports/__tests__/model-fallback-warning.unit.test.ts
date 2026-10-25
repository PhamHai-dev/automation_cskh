// Approved owner policy 2026-10-25: model-mapper 1-1 fallback is kept for
// compatibility, but fallback usage for a NEW class must be detectable so the
// preview surfaces it, and blank cells must never rewrite an existing class's
// model. Pure mock-only — no ExcelJS file I/O, no DB.

import { ClassModelType } from '@prisma/client';
import { classModelFallbackUsed, deriveModelFallbackWarning } from '../model-mapper';

describe('classModelFallbackUsed (approved D-rule follow-up)', () => {
  const truth: Array<[string | null | undefined, boolean]> = [
    ['', true],
    ['   ', true],
    [null, true],
    [undefined, true],
    ['khong hieu', true], // unrecognized → fallback
    ['1-1', false],
    ['1:1', false],
    ['1-2', false],
    ['1:2', false],
    ['1-n', false],
    ['Nhóm 4', false],
    ['nhom 5', false],
  ];
  for (const [input, expected] of truth) {
    it(`${JSON.stringify(input)} → fallback=${expected}`, () => {
      expect(classModelFallbackUsed(input)).toBe(expected);
    });
  }
});

describe('deriveModelFallbackWarning', () => {
  it('warns when the class is new AND the model cell falls back', () => {
    const w = deriveModelFallbackWarning('Lớp A', '', false);
    expect(w).toContain('Lớp A');
    expect(w).toContain('1-1');
  });

  it('no warning when the class already exists (blank cell must not rewrite model)', () => {
    expect(deriveModelFallbackWarning('Lớp A', '', true)).toBeNull();
  });

  it('no warning when the cell explicitly says nhóm', () => {
    expect(deriveModelFallbackWarning('Lớp A', 'Nhóm', false)).toBeNull();
  });

  it('no warning when the cell explicitly says 1-1', () => {
    expect(deriveModelFallbackWarning('Lớp A', '1-1', false)).toBeNull();
  });

  it('no warning without a class name (row creates no class)', () => {
    expect(deriveModelFallbackWarning('', null, false)).toBeNull();
    expect(deriveModelFallbackWarning(null, null, false)).toBeNull();
  });
});

describe('existing-class model immutability rule (audit pin)', () => {
  // The import paths only ever set model_type inside a class CREATION branch
  // (createClassIfNotExist findFirst→create; workbook tx.class.create under
  // `if (!cls)`; sheet-sync create under cache-miss). This test pins the pure
  // helper contract they all share: classification never mutates an existing
  // class — deriveModelFallbackWarning(classExists=true) ⇒ null (no rewrite,
  // no warn), for ANY raw value including fallback cases.
  it('every raw on an existing class yields no warning action', () => {
    for (const raw of ['', 'loan', '1:1', 'Nhóm', undefined, null]) {
      expect(deriveModelFallbackWarning('Lớp Exist', raw, true)).toBeNull();
    }
  });

  it('fallback and supported values are disjoint', () => {
    // Sanity: nothing that classifyClassModel treats as an explicit answer is
    // simultaneously flagged as a fallback.
    const supported = ['1-1', '1:1', '1-2', '1:2', '1-n', '1:N', 'Nhóm', 'nhom'];
    for (const raw of supported) {
      expect(classModelFallbackUsed(raw)).toBe(false);
    }
  });
});
