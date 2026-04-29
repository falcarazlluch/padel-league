import type { LeagueStatus } from '@prisma/client';

export type DisplayLeagueStatus =
  | 'REGISTRATION_FUTURE'   // DRAFT, registration window not started
  | 'REGISTRATION_OPEN'     // DRAFT, in window
  | 'REGISTRATION_CLOSED'   // DRAFT, window passed but league hasn't started yet
  | 'ACTIVE'
  | 'FINISHED'
  | 'ARCHIVED';

export function deriveLeagueStatus(
  status: LeagueStatus,
  registrationStart: Date,
  registrationEnd: Date,
  now: number,
): DisplayLeagueStatus {
  if (status === 'ACTIVE') return 'ACTIVE';
  if (status === 'FINISHED') return 'FINISHED';
  if (status === 'ARCHIVED') return 'ARCHIVED';
  // DRAFT
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
