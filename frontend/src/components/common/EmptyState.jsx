import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  testId = "empty-state",
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center"
    >
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {actionLabel ? (
        <Button className="mt-2" onClick={onAction} data-testid="empty-state-action">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
