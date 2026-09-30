import { EmailStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export const emailJobRepository = {
  createMany(data: Prisma.EmailJobCreateManyInput[]) {
    return prisma.emailJob.createMany({ data });
  },

  create(data: Prisma.EmailJobUncheckedCreateInput) {
    return prisma.emailJob.create({ data });
  },

  findByCampaign(campaignId: string) {
    return prisma.emailJob.findMany({ where: { campaignId }, orderBy: { scheduledAt: 'asc' } });
  },

  findByIdWithRelations(id: string) {
    return prisma.emailJob.findUnique({
      where: { id },
      include: { campaign: true, sender: true },
    });
  },

  findByIdForUser(id: string, userId: string) {
    return prisma.emailJob.findFirst({
      where: { id, campaign: { userId } },
      include: { campaign: true, sender: true },
    });
  },

  update(id: string, data: Prisma.EmailJobUncheckedUpdateInput) {
    return prisma.emailJob.update({ where: { id }, data });
  },

  updateBullJobId(id: string, bullJobId: string) {
    return prisma.emailJob.update({ where: { id }, data: { bullJobId } });
  },

  async paginateForUser(params: {
    userId: string;
    statuses: EmailStatus[];
    page: number;
    limit: number;
    status?: EmailStatus;
    search?: string;
    orderBy: 'scheduledAt' | 'sentAt';
    order: 'asc' | 'desc';
  }) {
    const { userId, statuses, page, limit, status, search, orderBy, order } = params;
    const where: Prisma.EmailJobWhereInput = {
      campaign: { userId },
      status: status ? status : { in: statuses },
      ...(search
        ? {
            OR: [
              { recipient: { contains: search, mode: 'insensitive' } },
              { subject: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.emailJob.findMany({
        where,
        orderBy: { [orderBy]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.emailJob.count({ where }),
    ]);

    return { items, total };
  },

  async statsForUser(userId: string) {
    const grouped = await prisma.emailJob.groupBy({
      by: ['status'],
      where: { campaign: { userId } },
      _count: { _all: true },
    });
    const base: Record<EmailStatus, number> = {
      scheduled: 0,
      processing: 0,
      sent: 0,
      failed: 0,
    };
    for (const row of grouped) {
      base[row.status] = row._count._all;
    }
    return base;
  },

  searchForUser(userId: string, query: string, limit = 25) {
    return prisma.emailJob.findMany({
      where: {
        campaign: { userId },
        OR: [
          { recipient: { contains: query, mode: 'insensitive' } },
          { subject: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  /**
   * Hydrate full rows for a set of ids, scoped to the owning user, preserving the
   * order of `ids` (used to keep Elasticsearch relevance order after search).
   */
  async findManyByIdsForUser(ids: string[], userId: string) {
    if (ids.length === 0) return [];
    const rows = await prisma.emailJob.findMany({
      where: { id: { in: ids }, campaign: { userId } },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
  },
};
