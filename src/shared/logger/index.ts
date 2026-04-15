import pino, { type Logger, type LoggerOptions } from 'pino';

// pino `redact.paths` wildcards (`*`) match exactly ONE level; nested fields below
// need explicit paths. Any code emitting deeper structures should extend this list.
const REDACT_PATHS = [
  // top-level
  'password',
  'passwordHash',
  'password_hash',
  'twoFactorSecret',
  'two_factor_secret',
  'sessionToken',
  'session_token',
  'authorization',
  'cookie',

  // one-level nested — pino wildcards do NOT recurse, so add known shapes explicitly
  '*.password',
  '*.passwordHash',
  '*.password_hash',
  '*.sessionToken',
  '*.session_token',
  '*.twoFactorSecret',

  // two-level nested for common shapes we emit
  '*.*.password',
  '*.*.passwordHash',
  '*.*.sessionToken',
];

export type CreateLoggerOptions = {
  level?: LoggerOptions['level'];
  pretty?: boolean;
  stream?: NodeJS.WritableStream;
  service?: string;
};

export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  const level = opts.level ?? 'info';
  const options: LoggerOptions = {
    level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    base: { service: opts.service ?? 'padel-league', env: process.env.NODE_ENV },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };

  if (opts.pretty) {
    return pino({
      ...options,
      transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
    });
  }
  if (opts.stream) {
    return pino(options, opts.stream);
  }
  return pino(options);
}

// Intentionally bypasses the Zod-validated env() to avoid a circular init hazard:
// the logger must work before env validation runs so we can log env-parse failures.
let defaultLogger: Logger | undefined;
export function logger(): Logger {
  if (!defaultLogger) {
    defaultLogger = createLogger({
      level: (process.env.LOG_LEVEL as LoggerOptions['level']) ?? 'info',
      pretty: process.env.NODE_ENV === 'development',
    });
  }
  return defaultLogger;
}
