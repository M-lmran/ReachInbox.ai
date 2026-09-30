import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton({ rows = 6, cols = 4 }) {
  return (
    <div data-testid="table-skeleton" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-5 py-3">
        <div className="flex gap-6">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-28" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-6 px-5 py-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={c === 0 ? "h-4 w-48" : "h-4 w-28"} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
