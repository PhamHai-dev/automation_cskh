/**
 * Simple structured logger for the automation_cskh backend.
 * Format: [TIMESTAMP] [LEVEL] [MODULE] message {metadata}
 *
 * In production, logs are JSON-structured for log aggregation tools.
 * In development, they are human-readable with colors.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
};

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',  // gray
  info: '\x1b[36m',   // cyan
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
};

const RESET = '\x1b[0m';
const minLevel = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) || 'debug'];

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, module: string, message: string, meta?: Record<string, unknown>): string {
  const ts = formatTimestamp();
  const label = LEVEL_LABELS[level];
  const base = `${ts} [${label}] [${module}] ${message}`;
  if (meta && Object.keys(meta).length > 0) {
    const metaStr = JSON.stringify(meta);
    return `${base} ${metaStr}`;
  }
  return base;
}

function formatDevMessage(level: LogLevel, module: string, message: string, meta?: Record<string, unknown>): string {
  const ts = formatTimestamp();
  const label = LEVEL_LABELS[level];
  const color = COLORS[level];
  const base = `${color}${ts} [${label}] [${module}]${RESET} ${message}`;
  if (meta && Object.keys(meta).length > 0) {
    const metaStr = JSON.stringify(meta, null, 2);
    return `${base}\n  ${metaStr}`;
  }
  return base;
}

function log(level: LogLevel, module: string, message: string, meta?: Record<string, unknown>): void {
  if (LOG_LEVELS[level] < minLevel) return;

  const isDev = process.env.NODE_ENV !== 'production';
  const formatted = isDev
    ? formatDevMessage(level, module, message, meta)
    : formatMessage(level, module, message, meta);

  if (level === 'error') {
    console.error(formatted);
  } else if (level === 'warn') {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

/**
 * Create a scoped logger for a specific module.
 *
 * @example
 * ```ts
 * const logger = createLogger('ZaloPool');
 * logger.info('QR code generated', { accountId: 123 });
 * ```
 */
export function createLogger(module: string): Logger {
  return {
    debug: (message: string, meta?: Record<string, unknown>) => log('debug', module, message, meta),
    info: (message: string, meta?: Record<string, unknown>) => log('info', module, message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => log('warn', module, message, meta),
    error: (message: string, meta?: Record<string, unknown>) => log('error', module, message, meta),
  };
}

/** Default root logger (use createLogger for module-specific logging). */
export const logger = createLogger('App');
