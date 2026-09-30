import { RotateCw, ExternalLink, ChevronLeft, ChevronRight, Clock, Mail } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { TableSkeleton } from "@/components/common/TableSkeleton";
import { formatDateTime } from "@/utils/format";

export function EmailTable({
  mode = "scheduled",
  items,
  pagination,
  loading,
  error,
  onRetry,
  onRetryJob,
  onPageChange,
  onCompose,
}) {
  const isScheduled = mode === "scheduled";

  if (loading) return <TableSkeleton cols={4} />;
  if (error) return <ErrorState onRetry={onRetry} />;

  if (!items || items.length === 0) {
    return isScheduled ? (
      <EmptyState
        icon={Clock}
        title="No scheduled emails yet"
        description="Create your first email campaign to get started."
        actionLabel="Compose New Email"
        onAction={onCompose}
        testId="scheduled-empty"
      />
    ) : (
      <EmptyState
        icon={Mail}
        title="No sent emails yet"
        description="Once your scheduled emails go out, they'll appear here."
        testId="sent-empty"
      />
    );
  }

  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.limit)) : 1;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-border bg-card surface-shadow">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="min-w-[200px]">Email</TableHead>
                <TableHead className="min-w-[220px]">Subject</TableHead>
                <TableHead className="min-w-[170px]">
                  {isScheduled ? "Scheduled Time" : "Sent Time"}
                </TableHead>
                <TableHead className="min-w-[120px]">Status</TableHead>
                <TableHead className="text-right">
                  {isScheduled ? "Action" : "Preview"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((job) => (
                <TableRow key={job.id} data-testid={`email-row-${job.id}`}>
                  <TableCell className="font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      {job.recipient}
                      {job.rescheduledForRateLimit && (
                        <span
                          title="Delayed due to hourly rate limit"
                          className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200"
                        >
                          throttled
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate text-muted-foreground">
                    {job.subject}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(isScheduled ? job.scheduledAt : job.sentAt)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={job.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {isScheduled ? (
                      job.status === "failed" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`retry-${job.id}`}
                          onClick={() => onRetryJob?.(job.id)}
                        >
                          <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Retry
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )
                    ) : job.previewUrl ? (
                      <a
                        href={job.previewUrl}
                        target="_blank"
                        rel="noreferrer"
                        data-testid={`preview-${job.id}`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      >
                        Preview <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {pagination && pagination.total > pagination.limit && (
        <div className="flex items-center justify-between px-1 text-sm text-muted-foreground">
          <span>
            Page {pagination.page} of {totalPages} · {pagination.total} total
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              data-testid="pagination-prev"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.page >= totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
              data-testid="pagination-next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
