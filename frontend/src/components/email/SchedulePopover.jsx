import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Schedule-send controls, in the required order: scheduling time (presets),
 * date, then time.
 *
 * Times are handled in the browser's local zone and only converted to UTC at
 * submission (see ComposeForm), so what the user picks is what is displayed and
 * what is sent — no silent shifting.
 */

const PRESETS = [
  { id: "1h", label: "In 1 hour" },
  { id: "3h", label: "In 3 hours" },
  { id: "tomorrow", label: "Tomorrow, 9:00 AM" },
  { id: "monday", label: "Next Monday, 9:00 AM" },
];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function applyPreset(id) {
  const d = new Date();
  if (id === "1h") {
    d.setHours(d.getHours() + 1);
  } else if (id === "3h") {
    d.setHours(d.getHours() + 3);
  } else if (id === "tomorrow") {
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
  } else if (id === "monday") {
    const daysUntilMonday = (8 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMonday);
    d.setHours(9, 0, 0, 0);
  }
  d.setSeconds(0, 0);
  return d;
}

function to12Hour(date) {
  let h = date.getHours();
  const meridiem = h >= 12 ? "PM" : "AM";
  h %= 12;
  if (h === 0) h = 12;
  return { hour: h, minute: date.getMinutes(), meridiem };
}

function withTime(date, { hour, minute, meridiem }) {
  const next = new Date(date);
  let h = Number(hour) % 12;
  if (meridiem === "PM") h += 12;
  const m = Math.min(59, Math.max(0, Number(minute) || 0));
  next.setHours(h, m, 0, 0);
  return next;
}

export function formatSchedule(date) {
  if (!date) return "Not scheduled";
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SchedulePopover({ value, onChange, open, onOpenChange, children }) {
  const [draft, setDraft] = useState(() => value || applyPreset("1h"));
  const [activePreset, setActivePreset] = useState(value ? null : "1h");
  const [error, setError] = useState("");

  // Re-seed from the committed value each time the panel opens, so a reopened
  // panel shows the current selection rather than resetting it.
  useEffect(() => {
    if (open) {
      setDraft(value || applyPreset("1h"));
      setActivePreset(null);
      setError("");
    }
  }, [open, value]);

  const time = useMemo(() => to12Hour(draft), [draft]);
  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );

  const pickPreset = (id) => {
    setDraft(applyPreset(id));
    setActivePreset(id);
    setError("");
  };

  const confirm = () => {
    if (draft.getTime() <= Date.now()) {
      setError("Pick a date and time in the future.");
      return;
    }
    onChange(draft);
    setError("");
    onOpenChange(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-[340px] p-0">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock className="h-4 w-4 text-primary" /> Schedule send
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The email is queued now and sent at this time.
          </p>
        </div>

        <div className="space-y-4 p-4">
          {/* 1. Scheduling time */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Scheduling time</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.id}
                  type="button"
                  variant={activePreset === p.id ? "default" : "outline"}
                  size="sm"
                  data-testid={`preset-${p.id}`}
                  onClick={() => pickPreset(p.id)}
                  className="h-8 justify-start px-2.5 text-xs"
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </div>

          {/* 2. Date */}
          <div>
            <Label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" /> Date
            </Label>
            <div className="mt-1.5 rounded-lg border border-border">
              <Calendar
                mode="single"
                selected={draft}
                onSelect={(d) => {
                  if (!d) return;
                  const merged = new Date(d);
                  merged.setHours(draft.getHours(), draft.getMinutes(), 0, 0);
                  setDraft(merged);
                  setActivePreset(null);
                  setError("");
                }}
                disabled={{ before: startOfToday() }}
                initialFocus
              />
            </div>
          </div>

          {/* 3. Time */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground">Time</Label>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Input
                type="number"
                min={1}
                max={12}
                aria-label="Hour"
                data-testid="schedule-hour"
                value={time.hour}
                onChange={(e) => {
                  setDraft(withTime(draft, { ...time, hour: e.target.value }));
                  setActivePreset(null);
                  setError("");
                }}
                className="h-9 w-16 text-center"
              />
              <span className="text-muted-foreground">:</span>
              <Input
                type="number"
                min={0}
                max={59}
                aria-label="Minute"
                data-testid="schedule-minute"
                value={String(time.minute).padStart(2, "0")}
                onChange={(e) => {
                  setDraft(withTime(draft, { ...time, minute: e.target.value }));
                  setActivePreset(null);
                  setError("");
                }}
                className="h-9 w-16 text-center"
              />
              <Select
                value={time.meridiem}
                onValueChange={(v) => {
                  setDraft(withTime(draft, { ...time, meridiem: v }));
                  setActivePreset(null);
                  setError("");
                }}
              >
                <SelectTrigger aria-label="AM or PM" data-testid="schedule-meridiem" className="h-9 w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AM">AM</SelectItem>
                  <SelectItem value="PM">PM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            className={cn(
              "rounded-lg border p-2.5 text-xs",
              error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-border bg-accent/40",
            )}
            data-testid="schedule-summary"
          >
            {error ? (
              error
            ) : (
              <>
                <span className="font-semibold">{formatSchedule(draft)}</span>
                <span className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                  <Info className="h-3 w-3" /> {timeZone} (converted to UTC on send)
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={confirm} data-testid="schedule-confirm">
            Confirm time
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
