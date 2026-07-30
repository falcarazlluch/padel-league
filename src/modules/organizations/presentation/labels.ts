import type { TournamentEnrollmentStatus } from '../domain/types';

// Re-exported so client components in the app layer can type their props
// without reaching into the domain layer (which the boundaries rule forbids)
// or through the module facade (which drags prisma into the client bundle).
export type { ChecklistItem, TournamentEnrollmentStatus } from '../domain/types';

export const ENROLLMENT_STATUS_LABEL: Record<TournamentEnrollmentStatus | 'NOT_STARTED', string> = {
  NOT_STARTED: 'Sin empezar',
  AWAITING_PARTNER: 'Falta pareja',
  AWAITING_PARTNER_ACCEPT: 'Pendiente de tu pareja',
  COMPLETED: 'Inscripción confirmada',
  CANCELLED: 'Inscripción anulada',
};

export const ENROLLMENT_STATUS_CLASS: Record<TournamentEnrollmentStatus | 'NOT_STARTED', string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-600 border-slate-200',
  AWAITING_PARTNER: 'bg-slate-100 text-slate-700 border-slate-200',
  AWAITING_PARTNER_ACCEPT: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-red-50 text-red-700 border-red-200',
};
