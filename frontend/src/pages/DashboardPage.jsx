import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Send, CheckCircle2, XCircle, Plus, RefreshCw } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { StatCard } from "@/components/common/StatCard";
import { EmailTable } from "@/components/email/EmailTable";
import { ComposeModal } from "@/components/email/ComposeModal";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { emailService } from "@/services/emailService";
import { useEmailList } from "@/hooks/useEmailList";
import { formatNumber } from "@/utils/format";
import { getErrorMessage } from "@/lib/apiClient";
import { toast } from "sonner";

export default function DashboardPage() {
  const [stats, setStats] = useState({ scheduled: 0, processing: 0, sent: 0, failed: 0 });
  const [composeOpen, setComposeOpen] = useState(false);
  const scheduled = useEmailList("scheduled", { limit: 8 });
  const sent = useEmailList("sent", { limit: 8 });

  const loadStats = useCallback(async () => {
    try {
      setStats(await emailService.getStats());
    } catch (_e) {
      /* non-blocking */
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleScheduled = () => {
    loadStats();
    scheduled.reload();
    sent.reload();
  };

  const handleRetry = async (id) => {
    try {
      await emailService.retry(id);
      toast.success("Email queued for retry");
      handleScheduled();
    } catch (err) {
      toast.error(getErrorMessage(err, "Retry failed"));
    }
  };

  const cards = [
    { label: "Scheduled", value: formatNumber(stats.scheduled), icon: CalendarClock, accent: "bg-blue-50 text-blue-600", testId: "stat-scheduled" },
    { label: "Sending", value: formatNumber(stats.processing), icon: Send, accent: "bg-amber-50 text-amber-600", testId: "stat-sending" },
    { label: "Sent", value: formatNumber(stats.sent), icon: CheckCircle2, accent: "bg-emerald-50 text-emerald-600", testId: "stat-sent" },
    { label: "Failed", value: formatNumber(stats.failed), icon: XCircle, accent: "bg-rose-50 text-rose-600", testId: "stat-failed" },
  ];

  return (
    <DashboardLayout title="Emails">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Overview</h2>
          <p className="text-sm text-muted-foreground">
            Track your scheduled and sent email campaigns.
          </p>
        </div>
        <Button onClick={() => setComposeOpen(true)} data-testid="compose-new-button" className="gap-2">
          <Plus className="h-4 w-4" /> Compose New Email
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>

      <div className="mt-8">
        <Tabs defaultValue="scheduled">
          <div className="flex items-center justify-between">
            <TabsList data-testid="dashboard-tabs">
              <TabsTrigger value="scheduled" data-testid="tab-scheduled">
                Scheduled Emails
              </TabsTrigger>
              <TabsTrigger value="sent" data-testid="tab-sent">
                Sent Emails
              </TabsTrigger>
            </TabsList>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              data-testid="dashboard-refresh"
              onClick={handleScheduled}
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>

          <TabsContent value="scheduled" className="mt-4">
            <EmailTable
              mode="scheduled"
              items={scheduled.items}
              pagination={scheduled.pagination}
              loading={scheduled.loading}
              error={scheduled.error}
              onRetry={scheduled.reload}
              onRetryJob={handleRetry}
              onPageChange={scheduled.setPage}
              onCompose={() => setComposeOpen(true)}
            />
          </TabsContent>
          <TabsContent value="sent" className="mt-4">
            <EmailTable
              mode="sent"
              items={sent.items}
              pagination={sent.pagination}
              loading={sent.loading}
              error={sent.error}
              onRetry={sent.reload}
              onPageChange={sent.setPage}
            />
          </TabsContent>
        </Tabs>
      </div>

      <ComposeModal open={composeOpen} onOpenChange={setComposeOpen} onScheduled={handleScheduled} />
    </DashboardLayout>
  );
}
