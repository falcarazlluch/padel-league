import { z } from 'zod';

const booleanString = z
  .union([z.literal('true'), z.literal('false')])
  .transform((v) => v === 'true');

// Preprocess raw env: turn whitespace-only strings into `undefined` so optional
// fields don't fail validation just because someone set `FOO=` in Vercel.
function normalizeEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = typeof v === 'string' && v.trim() === '' ? undefined : v;
  }
  return out;
}

// Optional email: a non-email value gets coerced to `undefined` and warned in
// stderr instead of tearing down the entire app at boot. Reason: a typo in
// RESEND_FROM_EMAIL on Vercel was crashing every request that touched env(),
// which is most of the app.
const optionalEmail = z.preprocess((v) => {
  if (typeof v !== 'string') return undefined;
  const trimmed = v.trim();
  if (trimmed === '') return undefined;
  // RFC 5322 is overkill — this catches the realistic typos
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
    console.warn(`[env] discarding non-email value for optional email field: ${trimmed.slice(0, 40)}`);
    return undefined;
  }
  return trimmed;
}, z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  APP_URL: z.string().url(),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),

  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),
  ENCRYPTION_KEY_PREVIOUS: z.string().min(32).optional(),

  // Email (Resend) is optional — when missing or malformed, EmailService throws
  // on send. Keeps the app booting in environments without proper config.
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: optionalEmail,
  EMAIL_REPLY_TO: optionalEmail,

  AI_PROVIDER: z.enum(['claude', 'openai']).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  AI_MODEL_CLAUDE: z.string().min(1).optional(),
  AI_MODEL_OPENAI: z.string().min(1).optional(),

  SENTRY_DSN: z.string().url().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  CRON_SECRET: z.string().min(32),

  FEATURE_2FA: booleanString.default(false),
  FEATURE_AI_COMMENTARY: booleanString.default(true),
  FEATURE_INDEPENDENT_MATCHES: booleanString.default(true),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),

  SEED_SUPERADMIN_EMAIL: optionalEmail,
  SEED_SUPERADMIN_PASSWORD: z.string().min(10).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(normalizeEnv(raw));
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}

let cached: Env | undefined;
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
