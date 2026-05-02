import * as React from 'react';
import { EmailService } from '@/shared/email/service';
import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';
import { InvitationEmail, invitationSubject } from '../email-templates/invitation';
import { PasswordResetEmail, passwordResetSubject } from '../email-templates/password-reset';
import { ResultSubmittedEmail, resultSubmittedSubject } from '../email-templates/result-submitted';
import { ResultConfirmedEmail, resultConfirmedSubject } from '../email-templates/result-confirmed';
import { IndMatchInviteEmail, indMatchInviteSubject } from '../email-templates/ind-match-invite';
import { IndMatchChallengeEmail, indMatchChallengeSubject } from '../email-templates/ind-match-challenge';
import { IndMatchChallengeResponseEmail, indMatchChallengeResponseSubject } from '../email-templates/ind-match-challenge-response';
import type { JobMap } from '@/shared/queue/jobs';

type EmailData = JobMap['send-email']['data'];

/** Safely coerce an unknown value to a non-empty string, falling back to a default. */
function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

// react-dom/server is loaded lazily to keep it out of the Next.js app-route
// build graph (Next 15 refuses to bundle it). At runtime it resolves from
// node_modules in both the worker process and the Vercel serverless cron.
let renderToStaticMarkupRef:
  | ((node: React.ReactElement) => string)
  | null = null;

async function getRenderToStaticMarkup(): Promise<(node: React.ReactElement) => string> {
  if (renderToStaticMarkupRef) return renderToStaticMarkupRef;
  const mod = (await import(
    /* webpackIgnore: true */ 'react-dom/server'
  )) as { renderToStaticMarkup: (node: React.ReactElement) => string };
  renderToStaticMarkupRef = mod.renderToStaticMarkup;
  return renderToStaticMarkupRef;
}

async function renderTemplate(template: string, data: EmailData): Promise<{ subject: string; html: string }> {
  const renderToStaticMarkup = await getRenderToStaticMarkup();
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
    case 'result-submitted':
      return {
        subject: resultSubmittedSubject,
        html: renderToStaticMarkup(
          React.createElement(ResultSubmittedEmail, {
            matchTeamA: str(data['matchTeamA'], '?'),
            matchTeamB: str(data['matchTeamB'], '?'),
            submitterTeam: str(data['submitterTeam'], '?'),
            matchUrl: str(data['matchUrl'], ''),
          }),
        ),
      };
    case 'result-confirmed':
      return {
        subject: resultConfirmedSubject,
        html: renderToStaticMarkup(
          React.createElement(ResultConfirmedEmail, {
            matchTeamA: str(data['matchTeamA'], '?'),
            matchTeamB: str(data['matchTeamB'], '?'),
            winnerTeamName: typeof data['winnerTeamName'] === 'string' ? data['winnerTeamName'] : null,
            matchUrl: str(data['matchUrl'], ''),
          }),
        ),
      };
    case 'ind-match-invite':
      return {
        subject: indMatchInviteSubject,
        html: renderToStaticMarkup(
          React.createElement(IndMatchInviteEmail, {
            organizerName: str(data['organizerName'], 'Organizador'),
            matchName: str(data['matchName'], 'Partido'),
            matchUrl: str(data['matchUrl'], ''),
            scheduledAt: typeof data['scheduledAt'] === 'string' ? data['scheduledAt'] : undefined,
            location: typeof data['location'] === 'string' ? data['location'] : undefined,
          }),
        ),
      };
    case 'ind-match-challenge':
      return {
        subject: indMatchChallengeSubject,
        html: renderToStaticMarkup(
          React.createElement(IndMatchChallengeEmail, {
            organizerTeamName: str(data['organizerTeamName'], 'Equipo'),
            matchName: str(data['matchName'], 'Reto'),
            matchUrl: str(data['matchUrl'], ''),
            scheduledAt: typeof data['scheduledAt'] === 'string' ? data['scheduledAt'] : undefined,
            location: typeof data['location'] === 'string' ? data['location'] : undefined,
          }),
        ),
      };
    case 'ind-match-challenge-response':
      return {
        subject: indMatchChallengeResponseSubject(data['accepted'] === true),
        html: renderToStaticMarkup(
          React.createElement(IndMatchChallengeResponseEmail, {
            challengedTeamName: str(data['challengedTeamName'], 'Equipo'),
            matchName: str(data['matchName'], 'Reto'),
            accepted: data['accepted'] === true,
            matchUrl: str(data['matchUrl'], ''),
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
    const { subject, html } = await renderTemplate(template, templateData);
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
