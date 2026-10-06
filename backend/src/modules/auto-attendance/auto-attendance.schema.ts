import { z } from 'zod';

export const updateAutoAttendanceSettingsSchema = z.object({
  body: z.object({
    delay_minutes: z.number().int().min(0).max(1440),
  }),
});
