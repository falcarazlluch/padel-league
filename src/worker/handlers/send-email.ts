import { renderToStaticMarkup } from 'react-dom/server';
import * as React from 'react';
import { EmailService } from '@/shared/email/service';
import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';
import { InvitationEmail, invitationSubject } from '../email-templates/invitation';
import { PasswordResetEmail, passwordResetSubject } from '../email-templates/password-reset';
import type { JobMap } from '@/shared/queue/jobs';

type EmailData = JobMap['send-email']['data'];

/** Safely coerce an unknown value to a non-empty string, falling back to a default. */
function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function renderTemplate(template: string, data: EmailData): { subject: string; html: string } {
  switch (template) {
    case 'invitation':
      return {
        subject: invitationSubject,
        html: renderToStaticMarkup(
          React.createElement(InvitationEmail, {
            name: str(data['name'], 'Jugador'),
            inviteUrl: str(data['inviteUrl'], ''),
          }),
        ),
      };
    case 'password-reset':
      return {
        subject: passwordResetSubject,
        html: renderToStaticMarkup(
          React.createElement(PasswordResetEmail, {
            name: str(data['name'], 'Jugador'),
            resetUrl: str(data['resetUrl'], ''),
          }),
        ),
      };
    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

export async function sendEmailHandler(data: JobMap['send-email']): Promise<void> {
  const { template, to, data: templateData, dedupKey } = data;

  // Idempotency: skip if already sent with this dedupKey
  if (dedupKey) {
    const existing = await prisma.emailLog.findUnique({ where: { dedupKey } });
    if (existing?.status === 'SENT' || existing?.status === 'DELIVERED') {
      logger().info({ dedupKey }, 'send-email.skipped.duplicate');
      return;
    }
  }

  const log = await prisma.emailLog.create({
    data: {
      toEmail: to,
      template,
      subject: '',
      status: 'QUEUED',
      dedupKey: dedupKey ?? null,
    },
  });

  try {
    const { subject, html } = renderTemplate(template, templateData);
    await prisma.emailLog.update({ where: { id: log.id }, data: { subject } });

    const providerId = await EmailService.send({ to, subject, html });

    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: 'SENT', providerMessageId: providerId, sentAt: new Date() },
    });

    logger().info({ to, template, providerId }, 'send-email.sent');
  } catch (err) {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', errorMessage: (err as Error).message },
    });
    throw err; // re-throw so pg-boss retries
  }
}
