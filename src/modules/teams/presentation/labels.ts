import type { TeamInvitationStatus } from '@prisma/client';

export const INVITATION_STATUS_LABEL: Record<TeamInvitationStatus, string> = {
  PENDING: 'Pendiente',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada',
};
