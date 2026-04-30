import { Resend } from 'resend';
import { env } from '@/shared/config/env';

let _resend: Resend | undefined;

function getResend(apiKey: string): Resend {
  _resend ??= new Resend(apiKey);
  return _resend;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

export const EmailService = {
  async send(opts: SendEmailOptions): Promise<string> {
    const apiKey = env().RESEND_API_KEY;
    const fromAddr = opts.from ?? env().RESEND_FROM_EMAIL;

    if (!apiKey || !fromAddr) {
      throw new Error(
        'Email no configurado: faltan RESEND_API_KEY y/o RESEND_FROM_EMAIL.',
      );
    }

    const replyTo = opts.replyTo ?? env().EMAIL_REPLY_TO;

    const { data, error } = await getResend(apiKey).emails.send({
      from: fromAddr,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(replyTo !== undefined ? { replyTo } : {}),
    });

    if (error) {
      throw new Error(`Resend error: ${error.message}`);
    }
    if (!data?.id) {
      throw new Error('Resend error: unknown — no message id returned');
    }

    return data.id;
  },
} as const;
