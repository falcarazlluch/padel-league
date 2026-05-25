import type { CompetitionType } from '@prisma/client';

// Labels y estilos del discriminador `League.type`. El modelo Prisma sigue
// llamándose `League` por compatibilidad histórica, pero en la UX hablamos de
// "Competición" y todas sus variantes.

export const COMPETITION_TYPE_LABEL: Record<CompetitionType, string> = {
  LEAGUE: 'Liga',
  AMERICANA: 'Americana',
  TOURNAMENT: 'Torneo',
};

export const COMPETITION_TYPE_DESCRIPTION: Record<CompetitionType, string> = {
  LEAGUE: 'Round-robin entre parejas: todas se enfrentan a todas.',
  AMERICANA: 'Formato social con rotación por rondas.',
  TOURNAMENT: 'Eliminación directa con Oro y Plata, opcionalmente con fase de grupos.',
};

// Color por tipo: azul = Liga, morado = Americana, naranja = Torneo. Aplicado
// al badge en el listado y al header del detalle.
export const COMPETITION_TYPE_BADGE_CLASS: Record<CompetitionType, string> = {
  LEAGUE: 'bg-blue-50 text-blue-700 border border-blue-200',
  AMERICANA: 'bg-purple-50 text-purple-700 border border-purple-200',
  TOURNAMENT: 'bg-orange-50 text-orange-700 border border-orange-200',
};

export const COMPETITION_TYPE_VALUES: readonly CompetitionType[] = [
  'LEAGUE',
  'AMERICANA',
  'TOURNAMENT',
] as const;
