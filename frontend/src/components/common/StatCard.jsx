import { cn } from "@/lib/utils";

export function StatCard({ label, value, icon: Icon, accent, testId }) {
  return (
    <div
      data-testid={testId}
      className="rounded-2xl border border-border bg-card p-5 surface-shadow transition-all hover:-translate-y-0.5 hover:surface-shadow-lg"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl", accent)}>
          {Icon ? <Icon className="h-4.5 w-4.5" /> : null}
        </span>
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-foreground">
        {value}
      </div>
    </div>
  );
}
