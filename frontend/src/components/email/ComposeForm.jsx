import { useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  ChevronDown,
  Info,
  Loader2,
  Send,
  CalendarClock,
  UserRound,
  Paperclip,
  FileText,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CsvUpload } from "@/components/email/CsvUpload";
import { RecipientField } from "@/components/email/RecipientField";
import { RichTextEditor, htmlToText } from "@/components/email/RichTextEditor";
import { ComposerToolbar } from "@/components/email/ComposerToolbar";
import { SchedulePopover, formatSchedule } from "@/components/email/SchedulePopover";
import { useAuth } from "@/context/AuthContext";
import { emailService } from "@/services/emailService";
import { getErrorMessage } from "@/lib/apiClient";
import { DEFAULTS, ATTACHMENT_LIMITS, formatBytes } from "@/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const schema = z.object({
  subject: z.string().trim().min(1, "Subject is required"),
  delaySeconds: z.coerce.number().min(0, "Delay must be 0 or more"),
  hourlyLimit: z.coerce.number().min(1, "Hourly limit must be at least 1"),
});

function defaultSchedule() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setSeconds(0, 0);
  return d;
}

export function ComposeForm({ onSuccess, onCancel }) {
  const { user } = useAuth();
  const editorRef = useRef(null);

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState([]);
  const [delaySeconds, setDelaySeconds] = useState(DEFAULTS.delayMs / 1000);
  const [hourlyLimit, setHourlyLimit] = useState(DEFAULTS.hourlyLimit);
  const [scheduledAt, setScheduledAt] = useState(defaultSchedule);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const [csvResult, setCsvResult] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  /**
   * Validate and upload selected files. Files are uploaded immediately so the
   * composer only ever shows attachments the server has actually accepted —
   * nothing is displayed as attached before it exists on the backend.
   */
  const handleFiles = async (fileList) => {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;

    const remaining = ATTACHMENT_LIMITS.maxCount - attachments.length;
    if (remaining <= 0) {
      toast.error(`You can attach at most ${ATTACHMENT_LIMITS.maxCount} files`);
      return;
    }

    const accepted = [];
    for (const file of incoming.slice(0, remaining)) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!ATTACHMENT_LIMITS.extensions.includes(ext)) {
        toast.error(`${file.name}: unsupported file type`);
        continue;
      }
      if (file.size > ATTACHMENT_LIMITS.maxBytes) {
        toast.error(`${file.name}: larger than ${formatBytes(ATTACHMENT_LIMITS.maxBytes)}`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) return;

    setUploading(true);
    try {
      const saved = await emailService.uploadAttachments(accepted);
      setAttachments((prev) => [...prev, ...saved]);
      toast.success(`${saved.length} file${saved.length === 1 ? "" : "s"} attached`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Attachment upload failed"));
    } finally {
      setUploading(false);
      // Clear the input so picking the same file again still fires onChange.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (id) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  // CSV recipients take precedence, matching the previous behaviour.
  const effectiveRecipients = useMemo(
    () => (csvResult?.valid?.length ? csvResult.valid : recipients),
    [csvResult, recipients],
  );

  const validate = () => {
    const fieldErrors = {};
    const parsed = schema.safeParse({ subject, delaySeconds, hourlyLimit });
    if (!parsed.success) {
      for (const [k, v] of Object.entries(parsed.error.flatten().fieldErrors)) {
        fieldErrors[k] = v?.[0];
      }
    }
    if (htmlToText(body).length === 0) fieldErrors.body = "Body is required";
    if (effectiveRecipients.length === 0) fieldErrors.recipients = "Add at least one valid recipient";
    setErrors(fieldErrors);
    return Object.keys(fieldErrors).length === 0;
  };

  const submit = async (mode) => {
    if (submitting) return; // guard against double submission
    if (!validate()) {
      toast.error("Please fix the highlighted fields");
      return;
    }

    const startTime = mode === "now" ? new Date() : scheduledAt;
    if (mode === "schedule" && startTime.getTime() <= Date.now()) {
      setErrors((e) => ({ ...e, schedule: "Pick a time in the future" }));
      toast.error("The scheduled time must be in the future");
      return;
    }

    setErrors((e) => ({ ...e, schedule: undefined }));
    setSubmitting(true);
    try {
      // Same endpoint for both actions — the backend schedules at startTime, so
      // "send now" is simply startTime = now. Local time is converted to UTC here.
      const payload = {
        subject: subject.trim(),
        body: body.trim(),
        startTime: startTime.toISOString(),
        delayMs: Number(delaySeconds) * 1000,
        hourlyLimit: Number(hourlyLimit),
        recipients: effectiveRecipients,
        attachmentIds: attachments.map((a) => a.id),
      };
      const result = await emailService.scheduleEmail(payload);
      if (mode === "now") {
        toast.success(`Queued ${result.jobsCreated} email(s) for immediate sending`);
      } else {
        toast.success(
          `Scheduled ${result.jobsCreated} email(s) for ${formatSchedule(startTime)}`,
        );
      }
      onSuccess?.(result);
    } catch (err) {
      toast.error(getErrorMessage(err, "Unable to schedule emails. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit("now");
      }}
      className="space-y-0"
      data-testid="compose-form"
    >
      {/* Header */}
      <div className="pb-3">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">New Message</h3>
        <p className="text-xs text-muted-foreground">
          Emails are paced by delayed background jobs, not sent all at once.
        </p>
      </div>

      {/* Fields */}
      <div className="rounded-xl border border-border">
        <div className="flex items-center gap-3 border-b border-border px-3.5 py-2">
          <Label className="flex w-16 shrink-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" /> From
          </Label>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              data-testid="compose-from"
              className="truncate rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground"
            >
              {user?.name ? `${user.name} <${user.email}>` : user?.email || "—"}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-3 border-b border-border px-3.5 py-2">
          <Label className="flex w-16 shrink-0 items-center pt-2 text-xs font-semibold text-muted-foreground">
            To
          </Label>
          <div className="min-w-0 flex-1">
            <RecipientField
              recipients={recipients}
              onChange={(next) => {
                setRecipients(next);
                setErrors((e) => ({ ...e, recipients: undefined }));
              }}
              error={errors.recipients}
              disabled={Boolean(csvResult?.valid?.length)}
            />
            {csvResult?.valid?.length ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Using the {csvResult.valid.length} recipients from the uploaded file.
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3 px-3.5 py-2">
          <Label
            htmlFor="subject"
            className="w-16 shrink-0 text-xs font-semibold text-muted-foreground"
          >
            Subject
          </Label>
          <div className="min-w-0 flex-1">
            <input
              id="subject"
              data-testid="compose-subject"
              placeholder="Subject"
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setErrors((er) => ({ ...er, subject: undefined }));
              }}
              className="w-full bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
            />
            {errors.subject ? (
              <p className="text-xs text-rose-600">{errors.subject}</p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mt-3 overflow-hidden rounded-xl border border-border">
        <ComposerToolbar
          editorRef={editorRef}
          onOpenSchedule={() => setScheduleOpen(true)}
          onAttachFiles={() => fileInputRef.current?.click()}
          scheduleLabel={formatSchedule(scheduledAt)}
        />
        <RichTextEditor ref={editorRef} value={body} onChange={setBody} />
      </div>
      {errors.body ? <p className="mt-1 text-xs text-rose-600">{errors.body}</p> : null}

      {/* Attachments — uploaded on pick, so nothing is shown that the server
          has not already accepted. */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ATTACHMENT_LIMITS.accept}
        data-testid="attachment-input"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {uploading || attachments.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="attachment-list">
          {uploading ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
            </span>
          ) : null}
          {attachments.map((a) => (
            <span
              key={a.id}
              data-testid={`attachment-chip-${a.filename}`}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-2.5 pr-1 text-xs"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="max-w-[180px] truncate font-medium text-foreground">
                {a.filename}
              </span>
              <span className="shrink-0 text-muted-foreground">{formatBytes(a.size)}</span>
              <button
                type="button"
                aria-label={`Remove ${a.filename}`}
                data-testid={`attachment-remove-${a.filename}`}
                onClick={() => removeAttachment(a.id)}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {/* Delivery options (preserved from the previous composer) */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setShowOptions((v) => !v)}
          data-testid="toggle-options"
          className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/30 px-3.5 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent"
        >
          <span>Delivery options — recipients file, delay, hourly limit</span>
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", showOptions && "rotate-180")}
          />
        </button>

        {showOptions ? (
          <div className="mt-2 space-y-4 rounded-xl border border-border p-3.5">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">
                Upload recipients (CSV / TXT)
              </Label>
              <div className="mt-1.5">
                <CsvUpload
                  result={csvResult}
                  onParsed={setCsvResult}
                  onClear={() => setCsvResult(null)}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="delay" className="text-xs">
                  Delay between sends (seconds)
                </Label>
                <Input
                  id="delay"
                  type="number"
                  min={0}
                  data-testid="compose-delay"
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(e.target.value)}
                />
                {errors.delaySeconds ? (
                  <p className="text-xs text-rose-600">{errors.delaySeconds}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hourly" className="text-xs">
                  Hourly limit per sender
                </Label>
                <Input
                  id="hourly"
                  type="number"
                  min={1}
                  data-testid="compose-hourly-limit"
                  value={hourlyLimit}
                  onChange={(e) => setHourlyLimit(e.target.value)}
                />
                {errors.hourlyLimit ? (
                  <p className="text-xs text-rose-600">{errors.hourlyLimit}</p>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer: schedule summary + separate Send / Schedule actions */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          <span data-testid="schedule-label">{formatSchedule(scheduledAt)}</span>
          {/* The popover anchors here; the toolbar clock opens the same one. */}
          <SchedulePopover
            value={scheduledAt}
            onChange={setScheduledAt}
            open={scheduleOpen}
            onOpenChange={setScheduleOpen}
          >
            <button
              type="button"
              data-testid="schedule-edit"
              className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Change
            </button>
          </SchedulePopover>
        </div>

        <div className="flex items-center gap-2">
          {onCancel ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={submitting}
              data-testid="compose-cancel"
            >
              Cancel
            </Button>
          ) : null}

          {/* Submits with the selected time. This previously only opened the
              schedule popover, so the chosen time was never sent and every
              "scheduled" email went out immediately. */}
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => submit("schedule")}
            data-testid="compose-schedule"
            className="gap-2"
          >
            <CalendarClock className="h-4 w-4" /> Schedule send
          </Button>

          <Button
            type="submit"
            disabled={submitting}
            data-testid="compose-submit"
            className="gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Sending…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> Send
              </>
            )}
          </Button>
        </div>
      </div>

      {errors.schedule ? (
        <p className="mt-2 text-right text-xs text-rose-600">{errors.schedule}</p>
      ) : null}

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          <strong>Send</strong> queues immediately; <strong>Schedule send</strong> queues now and
          delivers at the chosen time. Both use the same scheduling API.{" "}
          <Paperclip className="inline h-3 w-3" /> Up to {ATTACHMENT_LIMITS.maxCount} attachments,
          {" "}{formatBytes(ATTACHMENT_LIMITS.maxBytes)} each.
        </span>
      </p>
    </form>
  );
}
