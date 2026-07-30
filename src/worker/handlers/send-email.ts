import { EmailService } from '@/shared/email/service';
import { prisma } from '@/shared/db/client';
import { logger } from '@/shared/logger';
import { env } from '@/shared/config/env';
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
  renderFriendInvite,
  friendInviteSubject,
  renderTournamentPartnerInvite,
  tournamentPartnerInviteSubject,
} from '../email-templates/render';
import type { JobMap } from '@/shared/queue/jobs';

type EmailData = JobMap['send-email']['data'];

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function renderTemplate(template: string, data: EmailData): { subject: string; html: string } {
  const appUrl = env().APP_URL;
  switch (template) {
    case 'invitation':
      return {
        subject: invitationSubject,
        html: renderInvitation({
          appUrl,
          name: str(data['name'], 'Jugador'),
          inviteUrl: str(data['inviteUrl'], ''),
        }),
      };
    case 'password-reset':
      return {
        subject: passwordResetSubject,
        html: renderPasswordReset({
          appUrl,
          name: str(data['name'], 'Jugador'),
          resetUrl: str(data['resetUrl'], ''),
        }),
      };
    case 'result-submitted':
      return {
        subject: resultSubmittedSubject,
        html: renderResultSubmitted({
          appUrl,
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
          appUrl,
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
          appUrl,
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
          appUrl,
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
          appUrl,
          challengedTeamName: str(data['challengedTeamName'], 'Equipo'),
          matchName: str(data['matchName'], 'Reto'),
          accepted: data['accepted'] === true,
          matchUrl: str(data['matchUrl'], ''),
        }),
      };
    case 'friend-invite': {
      const inviterName = str(data['inviterName'], 'Un amigo');
      return {
        subject: friendInviteSubject(inviterName),
        html: renderFriendInvite({
          appUrl,
          inviterName,
          registerUrl: str(data['registerUrl'], ''),
          code: str(data['code'], ''),
        }),
      };
    }
    case 'tournament-partner-invite': {
      const inviterName = str(data['inviterName'], 'Un jugador');
      const competitionName = str(data['competitionName'], 'una competición');
      const brandLogoUrl = str(data['brandLogoUrl'], '');
      const brandUrl = str(data['brandUrl'], '');
      return {
        subject: tournamentPartnerInviteSubject(inviterName, competitionName),
        html: renderTournamentPartnerInvite({
          appUrl,
          inviterName,
          competitionName,
          partnerName: str(data['partnerName'], 'Hola'),
          acceptUrl: str(data['acceptUrl'], ''),
          brandName: str(data['brandName'], 'Padel League'),
          ...(brandLogoUrl ? { brandLogoUrl } : {}),
          ...(brandUrl ? { brandUrl } : {}),
        }),
      };
    }
    case 'ind-match-update': {
      const kind: 'cancelled' | 'left' = data['kind'] === 'left' ? 'left' : 'cancelled';
      const matchName = str(data['matchName'], 'Partido');
      return {
        subject: indMatchUpdateSubject(matchName, kind),
        html: renderIndMatchUpdate({
          appUrl,
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

  // Resolve the EmailLog row to use for this attempt: reuse an existing one if
  // dedupKey already produced one (so retries don't blow the unique
  // constraint), short-circuit if it already succeeded.
  let log: { id: string };
  if (dedupKey) {
    const existing = await prisma.emailLog.findUnique({ where: { dedupKey } });
    if (existing?.status === 'SENT' || existing?.status === 'DELIVERED') {
      logger().info({ dedupKey }, 'send-email.skipped.duplicate');
      return;
    }
    if (existing) {
      // Retry of a previously QUEUED/FAILED attempt — reuse the row so we
      // don't violate the unique(dedup_key) constraint, and reset the
      // status/error fields so the new attempt is observable.
      log = await prisma.emailLog.update({
        where: { id: existing.id },
        data: {
          toEmail: to,
          template,
          subject: '',
          status: 'QUEUED',
          attempt: { increment: 1 },
          errorMessage: null,
        },
        select: { id: true },
      });
    } else {
      log = await prisma.emailLog.create({
        data: { toEmail: to, template, subject: '', status: 'QUEUED', dedupKey },
        select: { id: true },
      });
    }
  } else {
    log = await prisma.emailLog.create({
      data: { toEmail: to, template, subject: '', status: 'QUEUED' },
      select: { id: true },
    });
  }

  try {
    const { subject, html } = renderTemplate(template, templateData);
    await prisma.emailLog.update({ where: { id: log.id }, data: { subject } });

    const providerId = await EmailService.send({ to, subject, html });

    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: 'SENT', providerMessageId: providerId, sentAt: new Date() },
    });

    // Don't log the recipient address (PII / GDPR). The EmailLog row carries
    // the full address for audit; logs only need the providerId + template
    // and a domain hint for high-level monitoring.
    const toDomain = to.includes('@') ? `…@${to.split('@').pop() ?? '?'}` : '…';
    logger().info({ toDomain, template, providerId }, 'send-email.sent');
  } catch (err) {
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', errorMessage: (err as Error).message },
    });
    throw err;
  }
}
