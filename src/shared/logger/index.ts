import pino, { type Logger, type LoggerOptions } from 'pino';

const REDACT_PATHS = [
  'password',
  'passwordHash',
  'password_hash',
  'twoFactorSecret',
  'two_factor_secret',
  'sessionToken',
  'session_token',
  'authorization',
  'cookie',
  '*.password',
  '*.passwordHash',
  '*.sessionToken',
];

export type CreateLoggerOptions = {
  level?: LoggerOptions['level'];
  pretty?: boolean;
  stream?: NodeJS.WritableStream;
};

export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  const level = opts.level ?? 'info';
  const options: LoggerOptions = {
    level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    base: { service: 'padel-league', env: process.env.NODE_ENV },
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
