import { STATUS_META } from "@/constants";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }) {
  const meta = STATUS_META[status] || STATUS_META.scheduled;
  return (
    <span
      data-testid={`status-badge-${status}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        meta.className,
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}
