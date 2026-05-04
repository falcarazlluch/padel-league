import type { LeagueStatus } from '@prisma/client';

export type DisplayLeagueStatus =
  | 'REGISTRATION_FUTURE'   // registration window not started yet
  | 'REGISTRATION_OPEN'     // currently in registration window
  | 'REGISTRATION_CLOSED'   // window passed but league hasn't started yet
  | 'ACTIVE'                // league has started and not yet ended
  | 'FINISHED'              // endDate passed (or status FINISHED)
  | 'ARCHIVED';

/**
 * Derive a *display* status from the persisted enum + the league's date
 * milestones. This decouples the badge shown to users from the manual admin
 * lifecycle: a DRAFT league whose startDate has passed displays as ACTIVE,
 * an ACTIVE league past its endDate displays as FINISHED, etc.
 *
 * `startDate` and `endDate` are optional for back-compat; when omitted the
 * function falls back to the original registration-window-only logic.
 */
export function deriveLeagueStatus(
  status: LeagueStatus,
  registrationStart: Date,
  registrationEnd: Date,
  now: number,
  startDate?: Date,
  endDate?: Date,
): DisplayLeagueStatus {
  if (status === 'ARCHIVED') return 'ARCHIVED';

  // Time-based overrides ensure the badge always matches the calendar even
  // if an admin forgot to activate / finalize.
  if (endDate && now > endDate.getTime()) return 'FINISHED';
  if (status === 'FINISHED') return 'FINISHED';

  if (startDate && now >= startDate.getTime()) return 'ACTIVE';
  if (status === 'ACTIVE') return 'ACTIVE';

  // DRAFT (or ACTIVE before its startDate, an unusual but tolerated state)
  if (now < registrationStart.getTime()) return 'REGISTRATION_FUTURE';
  if (now > registrationEnd.getTime()) return 'REGISTRATION_CLOSED';
  return 'REGISTRATION_OPEN';
}

export const DISPLAY_STATUS_LABEL: Record<DisplayLeagueStatus, string> = {
  REGISTRATION_FUTURE: 'Inscripción próxima',
  REGISTRATION_OPEN: 'Inscripción abierta',
  REGISTRATION_CLOSED: 'Inscripción cerrada',
  ACTIVE: 'En curso',
  FINISHED: 'Finalizada',
  ARCHIVED: 'Archivada',
};

export const DISPLAY_STATUS_CLASS: Record<DisplayLeagueStatus, string> = {
  REGISTRATION_FUTURE: 'bg-blue-50 text-blue-700 border border-blue-200',
  REGISTRATION_OPEN: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  REGISTRATION_CLOSED: 'bg-slate-100 text-slate-500 border border-slate-200',
  ACTIVE: 'bg-gradient-to-r from-emerald-50 to-green-100 text-emerald-700 border border-emerald-200',
  FINISHED: 'bg-gradient-to-r from-blue-50 to-sky-100 text-blue-700 border border-blue-200',
  ARCHIVED: 'bg-gray-100 text-gray-400 border border-gray-200',
};
