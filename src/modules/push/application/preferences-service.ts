import { prisma } from '@/shared/db/client';
import { DEFAULT_PREFERENCES, type PreferenceFlags } from './notification-categories';

export const PreferencesService = {
  async get(userId: string): Promise<PreferenceFlags> {
    const row = await prisma.notificationPreference.findUnique({
      where: { userId },
      select: {
        pushInvitations: true,
        pushMatchDates: true,
        pushResults: true,
        pushPhotos: true,
        pushChat: true,
        pushLeagueEvents: true,
      },
    });
    return row ?? DEFAULT_PREFERENCES;
  },

  async upsert(userId: string, patch: Partial<PreferenceFlags>): Promise<PreferenceFlags> {
    const row = await prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...DEFAULT_PREFERENCES, ...patch },
      update: patch,
      select: {
        pushInvitations: true,
        pushMatchDates: true,
        pushResults: true,
        pushPhotos: true,
        pushChat: true,
        pushLeagueEvents: true,
      },
    });
    return row;
  },
};
