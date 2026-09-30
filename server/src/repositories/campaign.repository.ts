import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export const campaignRepository = {
  create(data: Prisma.EmailCampaignUncheckedCreateInput) {
    return prisma.emailCampaign.create({ data });
  },

  findByIdForUser(id: string, userId: string) {
    return prisma.emailCampaign.findFirst({ where: { id, userId } });
  },

  listForUser(userId: string) {
    return prisma.emailCampaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Delete a campaign; its EmailJob rows cascade. Used to roll back a failed schedule. */
  delete(id: string) {
    return prisma.emailCampaign.delete({ where: { id } });
  },
};
