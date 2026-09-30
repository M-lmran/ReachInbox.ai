import { RefreshCw } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { EmailTable } from "@/components/email/EmailTable";
import { Button } from "@/components/ui/button";
import { useEmailList } from "@/hooks/useEmailList";

export default function SentPage() {
  const list = useEmailList("sent", { limit: 15 });

  return (
    <DashboardLayout title="Sent Emails">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Sent Emails</h2>
          <p className="text-sm text-muted-foreground">
            Delivered and failed emails. Sent emails include an Ethereal preview link.
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={list.reload} data-testid="sent-refresh">
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <div className="mt-6">
        <EmailTable
          mode="sent"
          items={list.items}
          pagination={list.pagination}
          loading={list.loading}
          error={list.error}
          onRetry={list.reload}
          onPageChange={list.setPage}
        />
      </div>
    </DashboardLayout>
  );
}
