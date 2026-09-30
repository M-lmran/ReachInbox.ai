import { useRef, useState } from "react";
import { X } from "lucide-react";
import { isValidEmail, normalizeRecipients } from "@/utils/emailValidator";
import { cn } from "@/lib/utils";

/**
 * Recipient field with chips.
 *
 * Accepts typed addresses (Enter / comma / semicolon / space commits), pasted
 * lists, and removal or editing of existing chips. Validation mirrors the shared
 * emailValidator used by the CSV path so both produce the same normalized set.
 */
export function RecipientField({ recipients, onChange, error, disabled }) {
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const inputRef = useRef(null);

  const commit = (raw) => {
    const parts = String(raw)
      .split(/[\s,;]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    const invalid = parts.filter((p) => !isValidEmail(p));
    if (invalid.length > 0) {
      setDraftError(`Not a valid email address: ${invalid.join(", ")}`);
      return;
    }

    const { valid } = normalizeRecipients([...recipients, ...parts]);
    onChange(valid);
    setDraft("");
    setDraftError("");
  };

  const remove = (email) => onChange(recipients.filter((r) => r !== email));

  const edit = (email) => {
    remove(email);
    setDraft(email);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === "Tab") {
      if (draft.trim()) {
        e.preventDefault();
        commit(draft);
      }
      return;
    }
    if (e.key === "Backspace" && !draft && recipients.length > 0) {
      remove(recipients[recipients.length - 1]);
    }
  };

  return (
    <div>
      <div
        data-testid="recipient-field"
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 transition-colors",
          error || draftError ? "border-rose-300" : "border-border",
          "focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        {recipients.map((email) => (
          <span
            key={email}
            data-testid={`recipient-chip-${email}`}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent py-0.5 pl-2.5 pr-1 text-xs font-medium text-accent-foreground"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                edit(email);
              }}
              title="Click to edit"
              className="max-w-[220px] truncate hover:underline"
            >
              {email}
            </button>
            <button
              type="button"
              aria-label={`Remove ${email}`}
              data-testid={`recipient-remove-${email}`}
              onClick={(e) => {
                e.stopPropagation();
                remove(email);
              }}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          inputMode="email"
          autoComplete="off"
          data-testid="recipient-input"
          disabled={disabled}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setDraftError("");
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => draft.trim() && commit(draft)}
          onPaste={(e) => {
            const text = e.clipboardData?.getData("text") || "";
            if (/[\s,;]/.test(text.trim())) {
              e.preventDefault();
              commit(text);
            }
          }}
          placeholder={recipients.length === 0 ? "name@example.com" : ""}
          className="min-w-[160px] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {draftError ? (
        <p className="mt-1 text-xs text-rose-600" data-testid="recipient-draft-error">
          {draftError}
        </p>
      ) : null}
      {error ? (
        <p className="mt-1 text-xs text-rose-600" data-testid="recipient-error">
          {error}
        </p>
      ) : null}
      {recipients.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground" data-testid="recipient-count">
          {recipients.length} recipient{recipients.length === 1 ? "" : "s"} · press Enter or comma to
          add another
        </p>
      ) : null}
    </div>
  );
}
