import { z } from 'zod';

export const DEFAULT_CARE_GROUP_RULES = {
  enabled: true,
  kaiwaTemplate: '{csNumber} - {studentId} {studentName}',
  jlptTemplate: '{csNumber} - {studentId} {studentName} {level}',
  // Kept for backward-compatible settings payloads. It is informational only;
  // the matcher accepts any non-empty JLPT suffix and never compares it to a student field.
  jlptNotes: [],
};
const template = z.string().trim().min(10).max(200);
export const careGroupRulesSchema = z.object({
  enabled: z.boolean(), kaiwaTemplate: template, jlptTemplate: template,
  jlptNotes: z.array(z.string().trim().min(1).max(40)).max(50),
}).strict().superRefine((rules, ctx) => {
  for (const key of ['kaiwaTemplate', 'jlptTemplate'] as const) {
    const required = key === 'kaiwaTemplate' ? ['csNumber', 'studentId', 'studentName'] : ['csNumber', 'studentId', 'studentName', 'level'];
    const tokens = [...rules[key].matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
    if (tokens.length !== required.length || required.some((token) => tokens.filter((value) => value === token).length !== 1) || /[{}]/.test(rules[key].replace(/\{[^{}]+\}/g, ''))) {
      ctx.addIssue({ code: 'custom', path: [key], message: `Mẫu phải chứa đúng một lần: ${required.map((token) => `{${token}}`).join(', ')}` });
    }
    if (key === 'jlptTemplate' && !rules[key].endsWith('{level}')) ctx.addIssue({ code: 'custom', path: [key], message: '{level} phải ở cuối mẫu JLPT' });
    if (/\}\{/.test(rules[key])) ctx.addIssue({ code: 'custom', path: [key], message: 'Các trường phải được phân cách' });
  }
  if (new Set(rules.jlptNotes.map((note) => note.toUpperCase())).size !== rules.jlptNotes.length) ctx.addIssue({ code: 'custom', path: ['jlptNotes'], message: 'Ghi chú minh họa không được trùng' });
});
export type CareGroupRules = z.infer<typeof careGroupRulesSchema>;
export type CareProgram = 'KAIWA' | 'JLPT';
export interface ClassifiedCareGroup { programType: CareProgram; csNumber: string; csCode: string; studentId: string; levelNote: string | null }
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function compile(pattern: string, studentName?: string) {
  const expressions: Record<string, string> = {
    csNumber: '(?<csNumber>\\[?(?:CVHT[-_\\s]*)?0*\\d{1,4}\\]?)',
    studentId: '(?<studentId>[A-Za-z0-9_.-]+)',
    studentName: studentName ? `(?<studentName>${escape(studentName.trim()).replace(/\s+/g, '\\s+')})` : '(?<studentName>.+?)',
    // The suffix is deliberately free-form. It is only the JLPT marker and
    // is never compared with Enrollment.level or any student attribute.
    level: '(?<level>.+?)',
  };
  return new RegExp('^\\s*' + pattern.split(/(\{[^{}]+\})/).map((part) => expressions[part.slice(1, -1)] && part.startsWith('{')
    ? expressions[part.slice(1, -1)] : escape(part).replace(/\s+/g, '\\s+').replace(/-/g, '[-–—]')).join('') + '\\s*$', 'iu');
}
export function parseCareGroupIdentity(name: string | null | undefined, rules: CareGroupRules): Pick<ClassifiedCareGroup, 'csNumber' | 'csCode' | 'studentId'> | null {
  if (!name || name.length > 300) return null;
  const match = compile(rules.kaiwaTemplate).exec(name.normalize('NFC')) || compile(rules.jlptTemplate).exec(name.normalize('NFC'));
  if (!match?.groups) return null;
  const number = Number(match.groups.csNumber.replace(/\D/g, ''));
  if (!number) return null;
  return { csNumber: String(number).padStart(2, '0'), csCode: `CVHT${String(number).padStart(2, '0')}`, studentId: match.groups.studentId };
}
export function classifyCareGroupName(name: string | null | undefined, rules: CareGroupRules, studentName?: string | null): ClassifiedCareGroup | null {
  // A free-form suffix cannot be separated from a multi-word name without the
  // known name. Never guess that part of a person's name is a JLPT suffix.
  if (!name || name.length > 300 || !studentName?.trim()) return null;
  for (const programType of ['JLPT', 'KAIWA'] as const) {
    const match = compile(programType === 'JLPT' ? rules.jlptTemplate : rules.kaiwaTemplate, studentName.normalize('NFC')).exec(name.normalize('NFC').trim());
    if (!match?.groups) continue;
    const number = Number(match.groups.csNumber.replace(/\D/g, ''));
    if (!number) return null;
    return { programType, csNumber: String(number).padStart(2, '0'), csCode: `CVHT${String(number).padStart(2, '0')}`,
      studentId: match.groups.studentId, levelNote: match.groups.level?.trim() || null };
  }
  return null;
}
export function suggestCareGroupName(rules: CareGroupRules, program: CareProgram, values: { csNumber: string; studentId: string; studentName: string; level?: string | null }) {
  return (program === 'JLPT' ? rules.jlptTemplate : rules.kaiwaTemplate).replace(/\{(csNumber|studentId|studentName|level)\}/g, (_, token: keyof typeof values) => values[token] || (token === 'level' ? '[Ghi chú JLPT]' : '')).trim();
}

/** Legacy personal contacts can be shared, but legacy/other-program GROUPs cannot. */
export function programRelationWhere(program: string | null | undefined) {
  return { OR: [{ program_type: program?.toUpperCase() || '__NONE__' }, { program_type: 'ALL', target_type: 'USER', zalo_group_id: null }] };
}
export function lineProgramRelationWhere(program: string | null | undefined) {
  return { OR: [{ program_type: program?.toUpperCase() || '__NONE__' }, { program_type: 'ALL', target_type: 'USER', line_group_id: null,
    OR: [{ friend_line_uid: null }, { NOT: { friend_line_uid: { startsWith: 'C' } } }] }] };
}
