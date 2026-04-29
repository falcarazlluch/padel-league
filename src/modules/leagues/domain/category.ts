import type { TeamCategory } from '@prisma/client';

export const CATEGORY_VALUES = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const satisfies readonly TeamCategory[];

export const CATEGORY_LABEL: Record<TeamCategory, string> = {
  BEGINNER: 'Principiante',
  INTERMEDIATE: 'Intermedio',
  ADVANCED: 'Avanzado',
};

export function categoryBadgeClass(category: TeamCategory): string {
  switch (category) {
    case 'BEGINNER':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'INTERMEDIATE':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'ADVANCED':
      return 'bg-rose-50 text-rose-700 border-rose-200';
  }
}

const CATEGORY_ORDER: TeamCategory[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

export function nextCategoryUp(category: TeamCategory): TeamCategory | null {
  const idx = CATEGORY_ORDER.indexOf(category);
  return idx >= 0 && idx < CATEGORY_ORDER.length - 1 ? CATEGORY_ORDER[idx + 1]! : null;
}

export function nextCategoryDown(category: TeamCategory): TeamCategory | null {
  const idx = CATEGORY_ORDER.indexOf(category);
  return idx > 0 ? CATEGORY_ORDER[idx - 1]! : null;
}
