import { prisma } from '../config/prisma';

export const userRepository = {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  async upsertByEmail(data: {
    email: string;
    name: string;
    avatarUrl?: string | null;
    googleId?: string | null;
    /**
     * When true, an existing avatar is preserved on update. Dev sign-in sets this
     * so its placeholder picture cannot overwrite a real Google profile photo.
     */
    preserveAvatarOnUpdate?: boolean;
  }) {
    return prisma.user.upsert({
      where: { email: data.email },
      create: {
        email: data.email,
        name: data.name,
        avatarUrl: data.avatarUrl ?? null,
        googleId: data.googleId ?? null,
      },
      update: {
        name: data.name,
        ...(data.preserveAvatarOnUpdate ? {} : { avatarUrl: data.avatarUrl ?? undefined }),
        googleId: data.googleId ?? undefined,
      },
    });
  },

  async ensureDefaultSender(userId: string, name: string, email: string) {
    const existing = await prisma.sender.findFirst({ where: { userId } });
    if (existing) return existing;
    return prisma.sender.create({
      data: { userId, name, email },
    });
  },

  firstSender(userId: string) {
    return prisma.sender.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
  },
};
