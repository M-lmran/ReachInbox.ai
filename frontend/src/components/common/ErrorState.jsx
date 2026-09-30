import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this data. Please try again.",
  onRetry,
  testId = "error-state",
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/50 px-6 py-14 text-center"
    >
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-100 text-rose-600">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {onRetry ? (
        <Button variant="outline" className="mt-2" onClick={onRetry} data-testid="error-retry">
          Retry
        </Button>
      ) : null}
    </div>
  );
}
