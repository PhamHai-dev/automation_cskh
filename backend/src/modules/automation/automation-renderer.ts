/**
 * Automation Renderer — Template variable resolution for automation messages.
 *
 * Renders {{variable_name}} placeholders in message_content with actual values.
 * Missing variables are left as-is (graceful fallback).
 */

import { createLogger } from '../../shared/logger/logger';
import { TRIGGER_EVENT_LABELS } from './automation.types';

const log = createLogger('AutomationRenderer');

/** All supported template variable keys */
export type TemplateVars = Record<string, string | number | undefined>;

/**
 * Render a message template by replacing {{variable}} placeholders with values.
 * Missing or undefined variables are kept as-is (no crash, no empty string).
 */
export function render(messageContent: string, vars: TemplateVars): string {
  return messageContent.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = vars[key];
    if (val === undefined || val === null) {
      log.warn('Missing template variable', { variable: key });
      return match; // keep original {{variable}} as fallback
    }
    return String(val);
  });
}

/**
 * Resolve all template variables from an attendance context.
 * Called by the trigger service before creating a delivery.
 */
export function resolveVars(ctx: {
  studentName: string;
  studentPhone?: string;
  packageName?: string;
  sessionNumber: number;
  className?: string;
  teacherName?: string;
  attendanceStatus: string;
  remainingSessions?: number;
  csName?: string;
}): TemplateVars {
  const statusLabel =
    TRIGGER_EVENT_LABELS[ctx.attendanceStatus as keyof typeof TRIGGER_EVENT_LABELS] ??
    ctx.attendanceStatus;

  return {
    student_name: ctx.studentName,
    student_phone: ctx.studentPhone ?? '',
    enrollment_package: ctx.packageName ?? '',
    session_number: ctx.sessionNumber,
    class_name: ctx.className ?? '',
    teacher_name: ctx.teacherName ?? '',
    attendance_status: statusLabel,
    remaining_sessions: ctx.remainingSessions ?? '',
    cs_name: ctx.csName ?? '',
  };
}
