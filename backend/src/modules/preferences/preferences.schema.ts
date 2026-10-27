import { z } from 'zod';

// Whitelist of valid preference scopes — all column visibility configs
export const PREFERENCE_SCOPES = [
  'enrollments.quick',
  'enrollments.detailed',
  'enrollments.stats',
  'students.tab1',
  'students.tab2',
  'home.quick_links',
] as const;

export type PreferenceScope = (typeof PREFERENCE_SCOPES)[number];

export const preferenceParamsSchema = z.object({
  scope: z.enum(PREFERENCE_SCOPES),
});

export const preferenceBodySchema = z.object({
  // Map of columnKey -> boolean (only delta from default is stored)
  value: z.record(z.string(), z.boolean()).refine(
    (v) => Object.keys(v).length <= 80,
    { message: 'Too many column keys (max 80)' }
  ),
});
