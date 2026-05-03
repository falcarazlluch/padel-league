import { EmailService } from '@/shared/email/service';
import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';
import {
  renderInvitation,
  invitationSubject,
  renderPasswordReset,
  passwordResetSubject,
  renderResultSubmitted,
  resultSubmittedSubject,
  renderResultConfirmed,
  resultConfirmedSubject,
  renderIndMatchInvite,
  indMatchInviteSubject,
  renderIndMatchChallenge,
  indMatchChallengeSubject,
  renderIndMatchChallengeResponse,
  indMatchChallengeResponseSubject,
  renderIndMatchUpdate,
  indMatchUpdateSubject,
} from '../email-templates/render';
import type { JobMap } from '@/shared/queue/jobs';

type EmailData = JobMap['send-email']['data'];

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function renderTemplate(template: string, data: EmailData): { subject: string; html: string } {
  switch (template) {
    case 'invitation':
      return {
        subject: invitationSubject,
        html: renderInvitation({
          name: str(data['name'], 'Jugador'),
          inviteUrl: str(data['inviteUrl'], ''),
        }),
      };
    case 'password-reset':
      return {
        subject: passwordResetSubject,
        html: renderPasswordReset({
          name: str(data['name'], 'Jugador'),
          resetUrl: str(data['resetUrl'], ''),
        }),
      };
    case 'result-submitted':
      return {
        subject: resultSubmittedSubject,
        html: renderResultSubmitted({
          matchTeamA: str(data['matchTeamA'], '?'),
          matchTeamB: str(data['matchTeamB'], '?'),
          submitterTeam: str(data['submitterTeam'], '?'),
          matchUrl: str(data['matchUrl'], ''),
        }),
      };
    case 'result-confirmed':
      return {
        subject: resultConfirmedSubject,
        html: renderResultConfirmed({
          matchTeamA: str(data['matchTeamA'], '?'),
          matchTeamB: str(data['matchTeamB'], '?'),
          winnerTeamName: typeof data['winnerTeamName'] === 'string' ? data['winnerTeamName'] : null,
          matchUrl: str(data['matchUrl'], ''),
        }),
      };
    case 'ind-match-invite':
      return {
        subject: indMatchInviteSubject,
        html: renderIndMatchInvite({
          organizerName: str(data['organizerName'], 'Organizador'),
          matchName: str(data['matchName'], 'Partido'),
          matchUrl: str(data['matchUrl'], ''),
          scheduledAt: typeof data['scheduledAt'] === 'string' ? data['scheduledAt'] : undefined,
          location: typeof data['location'] === 'string' ? data['location'] : undefined,
          addToCalendarUrl: typeof data['addToCalendarUrl'] === 'string' ? data['addToCalendarUrl'] : undefined,
        }),
      };
    case 'ind-match-challenge':
      return {
        subject: indMatchChallengeSubject,
        html: renderIndMatchChallenge({
          organizerTeamName: str(data['organizerTeamName'], 'Equipo'),
          matchName: str(data['matchName'], 'Reto'),
          matchUrl: str(data['matchUrl'], ''),
          scheduledAt: typeof data['scheduledAt'] === 'string' ? data['scheduledAt'] : undefined,
          location: typeof data['location'] === 'string' ? data['location'] : undefined,
        }),
      };
    case 'ind-match-challenge-response':
      return {
        subject: indMatchChallengeResponseSubject(data['accepted'] === true),
        html: renderIndMatchChallengeResponse({
          challengedTeamName: str(data['challengedTeamName'], 'Equipo'),
          matchName: str(data['matchName'], 'Reto'),
          accepted: data['accepted'] === true,
          matchUrl: str(data['matchUrl'], ''),
        }),
      };
    case 'ind-match-update': {
      const kind: 'cancelled' | 'left' = data['kind'] === 'left' ? 'left' : 'cancelled';
      const matchName = str(data['matchName'], 'Partido');
      return {
        subject: indMatchUpdateSubject(matchName, kind),
        html: renderIndMatchUpdate({
          matchName,
          headline: str(data['headline'], kind === 'cancelled' ? 'Partido cancelado' : 'Un jugador se ha bajado'),
          body: str(data['body'], ''),
          matchUrl: typeof data['matchUrl'] === 'string' ? data['matchUrl'] : undefined,
        }),
      };
    }
    default:
      throw new Error(`Unknown email template: ${template}`);
  }
}

export async function sendEmailHandler(data: JobMap['send-email']): Promise<void> {
  const { template, to, data: templateData, dedupKey } = data;

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
    throw err;
  }
}
