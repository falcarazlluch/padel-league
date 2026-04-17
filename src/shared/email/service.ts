import { Resend } from 'resend';
import { env } from '@/shared/config/env';

let _resend: Resend | undefined;

function getResend(): Resend {
  _resend ??= new Resend(env().RESEND_API_KEY);
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
    const replyTo = opts.replyTo ?? env().EMAIL_REPLY_TO;

    const { data, error } = await getResend().emails.send({
      from: opts.from ?? env().RESEND_FROM_EMAIL,
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
