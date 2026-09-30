import { PrismaClient, EmailStatus } from '@prisma/client';
import { enqueueEmail } from '../src/queues/email.queue';

const prisma = new PrismaClient();

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 3600_000);
}
function hoursAhead(h: number): Date {
  return new Date(Date.now() + h * 3600_000);
}

async function main() {
  console.log('Seeding demo data...');

  // Clean existing demo data (idempotent seed)
  await prisma.emailJob.deleteMany({});
  await prisma.emailCampaign.deleteMany({});
  await prisma.sender.deleteMany({});
  await prisma.slackIntegration.deleteMany({});
  await prisma.user.deleteMany({});

  const user = await prisma.user.create({
    data: {
      name: 'Vishnu Prasad',
      email: 'vishnu@reachinbox.ai',
      avatarUrl: 'https://api.dicebear.com/7.x/initials/svg?seed=Vishnu%20Prasad',
    },
  });

  const sender1 = await prisma.sender.create({
    data: { userId: user.id, name: 'Vishnu Prasad', email: 'vishnu@reachinbox.ai' },
  });
  const sender2 = await prisma.sender.create({
    data: { userId: user.id, name: 'Growth Team', email: 'growth@reachinbox.ai' },
  });

  const campaign1 = await prisma.emailCampaign.create({
    data: {
      userId: user.id,
      subject: 'AI Internship Opportunity at ReachInbox',
      body: '<p>Hi there,</p><p>We are hiring interns for our AI team. Interested?</p>',
      startTime: hoursAhead(1),
      delayMs: 2000,
      hourlyLimit: 200,
    },
  });

  const campaign2 = await prisma.emailCampaign.create({
    data: {
      userId: user.id,
      subject: 'Product Launch: ReachInbox 2.0',
      body: '<p>Our new release is live. Check it out!</p>',
      startTime: hoursAgo(3),
      delayMs: 3000,
      hourlyLimit: 150,
    },
  });

  const scheduledRecipients = [
    'rahul@example.com',
    'arun@example.com',
    'priya@example.com',
    'sneha@example.com',
    'karan@example.com',
  ];
  await prisma.emailJob.createMany({
    data: scheduledRecipients.map((recipient, i) => ({
      campaignId: campaign1.id,
      senderId: sender1.id,
      recipient,
      subject: campaign1.subject,
      body: campaign1.body,
      scheduledAt: new Date(hoursAhead(1).getTime() + i * 2000),
      status: 'scheduled' as EmailStatus,
    })),
  });

  // Enqueue the scheduled jobs so they actually send. Without this the rows exist
  // as 'scheduled' in Postgres but are absent from Redis — they would never fire,
  // and the queue monitor would read zero while the dashboard showed scheduled mail.
  let enqueued = 0;
  try {
    const scheduledJobs = await prisma.emailJob.findMany({
      where: { campaignId: campaign1.id, status: 'scheduled' },
    });
    for (const job of scheduledJobs) {
      const delay = Math.max(0, job.scheduledAt.getTime() - Date.now());
      const bullJob = await enqueueEmail(job.id, delay);
      if (bullJob.id) {
        await prisma.emailJob.update({
          where: { id: job.id },
          data: { bullJobId: bullJob.id },
        });
      }
      enqueued += 1;
    }
  } catch (err) {
    // Seeding still succeeds without Redis; `npm run reconcile` re-enqueues later.
    console.warn(
      'Could not enqueue scheduled jobs (is Redis running?):',
      err instanceof Error ? err.message : err,
    );
  }

  const sentRecipients = ['aditya@example.com', 'meera@example.com', 'rohit@example.com'];
  await prisma.emailJob.createMany({
    data: sentRecipients.map((recipient, i) => ({
      campaignId: campaign2.id,
      senderId: sender2.id,
      recipient,
      subject: campaign2.subject,
      body: campaign2.body,
      scheduledAt: new Date(hoursAgo(3).getTime() + i * 3000),
      sentAt: new Date(hoursAgo(3).getTime() + i * 3000 + 500),
      status: 'sent' as EmailStatus,
      previewUrl: 'https://ethereal.email/message/demo',
    })),
  });

  await prisma.emailJob.create({
    data: {
      campaignId: campaign2.id,
      senderId: sender2.id,
      recipient: 'bounced@example.com',
      subject: campaign2.subject,
      body: campaign2.body,
      scheduledAt: hoursAgo(3),
      status: 'failed',
      attempts: 3,
      errorMessage: 'SMTP: recipient mailbox unavailable',
    },
  });

  console.log('Seed complete:', {
    user: user.email,
    senders: 2,
    campaigns: 2,
    scheduled: scheduledRecipients.length,
    enqueued,
    sent: sentRecipients.length,
    failed: 1,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
