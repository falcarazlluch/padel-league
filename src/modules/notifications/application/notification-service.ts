import { prisma } from '@/shared/db/client';
import type { NotificationType, Prisma } from '@prisma/client';

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export const NotificationService = {
  async create(input: {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  },

  async createMany(inputs: Array<{
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
  }>): Promise<void> {
    if (inputs.length === 0) return;
    await prisma.notification.createMany({
      data: inputs.map((n) => ({
        userId: n.userId,
        type: n.type,
        title: n.title,
        body: n.body,
        metadata: n.metadata as Prisma.InputJsonValue | undefined,
      })),
    });
  },

  async getUnread(userId: string): Promise<{ count: number; items: NotificationItem[] }> {
    const [items, count] = await prisma.$transaction([
      prisma.notification.findMany({
        where: { userId, readAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, type: true, title: true, body: true, metadata: true, createdAt: true },
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      count,
      items: items.map((n) => ({
        ...n,
        metadata: n.metadata as Record<string, unknown> | null,
      })),
    };
  },

  async markRead(notificationId: string, userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });
  },

  async markAllRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  },
} as const;
