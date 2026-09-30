import { useCallback, useEffect, useRef, useState } from "react";
import {
  RefreshCw,
  ExternalLink,
  Clock,
  Play,
  Timer,
  CheckCircle2,
  XCircle,
  Info,
  Server,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/common/StatCard";
import { ErrorState } from "@/components/common/ErrorState";
import { TableSkeleton } from "@/components/common/TableSkeleton";
import { emailService } from "@/services/emailService";
import { formatNumber } from "@/utils/format";
import { API_BASE } from "@/lib/apiClient";

/**
 * Live BullMQ queue state, pushed over Server-Sent Events.
 *
 * These counts describe the shared queue, not one account's email — `completed`
 * is jobs processed, and rate-limit reschedules or retries complete without
 * sending anything. The per-account totals live on the dashboard overview.
 */
export default function QueueMonitorPage() {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [live, setLive] = useState(false);
  const gotFrame = useRef(false);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await emailService.getQueueHealth();
      setCounts(res.counts);
    } catch (_e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const stopPolling = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    if (typeof EventSource === "undefined") {
      load();
      pollRef.current = setInterval(load, 5000);
      return stopPolling;
    }

    const es = new EventSource(`${API_BASE}/health/queue/stream`);

    es.addEventListener("counts", (e) => {
      try {
        const payload = JSON.parse(e.data);
        setCounts(payload.counts);
        gotFrame.current = true;
        setLive(true);
        setError(false);
      } catch (_e) {
        /* ignore malformed frame */
      }
      setLoading(false);
    });

    es.onerror = () => {
      setLive(false);
      // EventSource retries on its own; fall back to polling only if the stream
      // never delivered a single frame.
      if (!gotFrame.current) {
        es.close();
        load();
        if (!pollRef.current) pollRef.current = setInterval(load, 5000);
      }
    };

    return () => {
      es.close();
      stopPolling();
    };
  }, [load]);

  const queueCards = counts
    ? [
        { label: "Waiting", value: formatNumber(counts.waiting), icon: Clock, accent: "bg-slate-100 text-slate-600", testId: "queue-waiting" },
        { label: "Active", value: formatNumber(counts.active), icon: Play, accent: "bg-blue-50 text-blue-600", testId: "queue-active" },
        { label: "Delayed", value: formatNumber(counts.delayed), icon: Timer, accent: "bg-amber-50 text-amber-600", testId: "queue-delayed" },
        { label: "Completed", value: formatNumber(counts.completed), icon: CheckCircle2, accent: "bg-emerald-50 text-emerald-600", testId: "queue-completed" },
        { label: "Failed", value: formatNumber(counts.failed), icon: XCircle, accent: "bg-rose-50 text-rose-600", testId: "queue-failed" },
      ]
    : [];

  return (
    <DashboardLayout title="Queue Monitor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
            Queue Monitor
            <span
              data-testid="queue-live-indicator"
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                live ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  live ? "animate-pulse bg-emerald-500" : "bg-amber-500"
                }`}
              />
              {live ? "LIVE" : "RECONNECTING"}
            </span>
          </h2>
          <p className="text-sm text-muted-foreground">
            Live BullMQ <code className="font-mono">email-send-queue</code> state · streamed over
            Server-Sent Events.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={load} data-testid="queue-refresh">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          <a href={`${API_BASE}/admin/queues`} target="_blank" rel="noreferrer">
            <Button className="gap-2" data-testid="open-bullboard">
              Bull Board <ExternalLink className="h-4 w-4" />
            </Button>
          </a>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            Queue — <code className="font-mono">email-send-queue</code>
          </h3>
          <span className="text-xs text-muted-foreground">Shared across all accounts</span>
        </div>
        {loading && !counts ? (
          <TableSkeleton rows={2} cols={5} />
        ) : error ? (
          <ErrorState onRetry={load} description="Could not reach the queue." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {queueCards.map((c) => (
              <StatCard key={c.label} {...c} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-accent/40 p-5 text-sm text-muted-foreground">
        <p className="flex items-center gap-2 font-semibold text-accent-foreground">
          <Info className="h-4 w-4" /> Reading these numbers
        </p>
        <p className="mt-1">
          <strong>Completed</strong> counts queue <em>jobs</em>, not emails delivered. A rate-limit
          reschedule or a retry completes without sending anything, so this figure is always higher
          than the number of emails actually sent. The queue is shared infrastructure, so its counts
          include every account on this instance. Per-account totals are on the dashboard overview.
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-accent/40 p-5 text-sm text-muted-foreground">
        <p className="font-semibold text-accent-foreground">About the queue</p>
        <p className="mt-1">
          Scheduling uses BullMQ delayed jobs backed by Redis — no cron, no timers. Delayed jobs
          persist across restarts. The Bull Board dashboard is protected by basic auth
          (default <code className="font-mono">admin</code>).
        </p>
      </div>
    </DashboardLayout>
  );
}
