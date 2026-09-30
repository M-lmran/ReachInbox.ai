import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { EmailTable } from "@/components/email/EmailTable";
import { ComposeModal } from "@/components/email/ComposeModal";
import { Button } from "@/components/ui/button";
import { useEmailList } from "@/hooks/useEmailList";
import { emailService } from "@/services/emailService";
import { getErrorMessage } from "@/lib/apiClient";
import { toast } from "sonner";

export default function ScheduledPage() {
  const [composeOpen, setComposeOpen] = useState(false);
  const list = useEmailList("scheduled", { limit: 15 });

  const handleRetry = async (id) => {
    try {
      await emailService.retry(id);
      toast.success("Email queued for retry");
      list.reload();
    } catch (err) {
      toast.error(getErrorMessage(err, "Retry failed"));
    }
  };

  return (
    <DashboardLayout title="Scheduled Emails">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Scheduled Emails</h2>
          <p className="text-sm text-muted-foreground">
            Emails waiting to be sent by delayed background jobs.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={list.reload} data-testid="scheduled-refresh">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <Button className="gap-2" onClick={() => setComposeOpen(true)} data-testid="scheduled-compose">
            <Plus className="h-4 w-4" /> Compose
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <EmailTable
          mode="scheduled"
          items={list.items}
          pagination={list.pagination}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          onRetryJob={handleRetry}
          onPageChange={list.setPage}
          onCompose={() => setComposeOpen(true)}
        />
      </div>

      <ComposeModal
        open={composeOpen}
        onOpenChange={setComposeOpen}
        onScheduled={() => list.reload()}
      />
    </DashboardLayout>
  );
}
