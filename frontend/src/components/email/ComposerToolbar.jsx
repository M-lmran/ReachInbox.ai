import { useState } from "react";
import {
  ALargeSmall,
  Bold,
  Eraser,
  Highlighter,
  Italic,
  Link2,
  MoreVertical,
  Palette,
  Paperclip,
  Smile,
  Clock,
  Underline,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FONT_SIZE_OPTIONS,
  HIGHLIGHT_COLOR_OPTIONS,
  TEXT_COLOR_OPTIONS,
} from "@/components/email/RichTextEditor";
import { cn } from "@/lib/utils";

/**
 * Composer toolbar.
 *
 * Icons appear in the required left-to-right order. Controls the backend cannot
 * support are rendered disabled with a tooltip stating why, rather than being
 * wired to a no-op that looks functional.
 */

const EMOJIS = [
  "😀", "😃", "😄", "😁", "😊", "🙂", "😉", "😍", "😎", "🤝",
  "👍", "👏", "🙏", "💪", "✨", "🔥", "🎉", "🚀", "💡", "📌",
  "📎", "📅", "⏰", "✅", "❌", "⚠️", "📈", "📊", "💬", "📧",
  "❤️", "⭐", "🎯", "🧠", "☕", "🌟", "📢", "🔔", "🛠️", "🌍",
];

function ToolbarButton({ label, disabled, disabledReason, onClick, children, testId, active }) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "h-8 w-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground",
        active && "bg-accent text-foreground",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
      )}
    >
      {children}
    </Button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button swallows pointer events, so wrap it to keep the
            tooltip (and the reason) reachable. */}
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent>
        {disabled && disabledReason ? `${label} — ${disabledReason}` : label}
      </TooltipContent>
    </Tooltip>
  );
}

export function ComposerToolbar({ editorRef, onOpenSchedule, onAttachFiles, scheduleLabel }) {
  const [formatOpen, setFormatOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");

  const exec = (cmd, arg) => editorRef.current?.exec(cmd, arg);

  const insertEmoji = (emoji) => {
    editorRef.current?.insertHtml(emoji);
    setEmojiOpen(false);
  };

  const insertLink = () => {
    const raw = linkUrl.trim();
    if (!raw) {
      setLinkError("Enter a URL");
      return;
    }
    // Accept bare domains by defaulting the scheme, then require a valid URL.
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const parsed = new URL(withScheme);
      if (!parsed.hostname.includes(".")) throw new Error("bad host");
    } catch {
      setLinkError("Enter a valid URL, e.g. https://example.com");
      return;
    }
    const text = linkText.trim() || withScheme;
    const safeText = text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
    editorRef.current?.insertHtml(
      `<a href="${withScheme}" target="_blank" rel="noopener noreferrer">${safeText}</a>&nbsp;`,
    );
    setLinkOpen(false);
    setLinkText("");
    setLinkUrl("");
    setLinkError("");
  };

  const insertDate = () => {
    editorRef.current?.insertHtml(
      new Date().toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div
        data-testid="composer-toolbar"
        className="flex flex-wrap items-center gap-0.5 border-y border-border bg-muted/30 px-2 py-1.5"
      >
        {/* 1. Formatting options (A) */}
        <Popover open={formatOpen} onOpenChange={setFormatOpen}>
          <PopoverTrigger asChild>
            <span className="inline-flex">
              <ToolbarButton label="Formatting options" testId="tb-format" active={formatOpen}>
                <ALargeSmall className="h-4 w-4" />
              </ToolbarButton>
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3">
            <div className="flex items-center gap-1">
              <ToolbarButton label="Bold" testId="fmt-bold" onClick={() => exec("bold")}>
                <Bold className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton label="Italic" testId="fmt-italic" onClick={() => exec("italic")}>
                <Italic className="h-4 w-4" />
              </ToolbarButton>
              <ToolbarButton
                label="Underline"
                testId="fmt-underline"
                onClick={() => exec("underline")}
              >
                <Underline className="h-4 w-4" />
              </ToolbarButton>
            </div>

            <div className="mt-3">
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Palette className="h-3.5 w-3.5" /> Text colour
              </Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {TEXT_COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    title={c.label}
                    aria-label={`Text colour ${c.label}`}
                    data-testid={`fmt-color-${c.label.toLowerCase()}`}
                    onClick={() => exec("foreColor", c.value || "#111827")}
                    className="h-6 w-6 rounded-full border border-border transition-transform hover:scale-110"
                    style={{ background: c.value || "#111827" }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-3">
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Highlighter className="h-3.5 w-3.5" /> Highlight
              </Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {HIGHLIGHT_COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    title={c.label}
                    aria-label={`Highlight ${c.label}`}
                    data-testid={`fmt-highlight-${c.label.toLowerCase()}`}
                    onClick={() => exec("hiliteColor", c.value || "transparent")}
                    className="h-6 w-6 rounded-md border border-border transition-transform hover:scale-110"
                    style={{
                      background:
                        c.value ||
                        "repeating-linear-gradient(45deg,#fff,#fff 4px,#e5e7eb 4px,#e5e7eb 8px)",
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="mt-3">
              <Label className="text-xs text-muted-foreground">Font size</Label>
              <div className="mt-1.5 flex gap-1.5">
                {FONT_SIZE_OPTIONS.map((s) => (
                  <Button
                    key={s.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid={`fmt-size-${s.value}`}
                    onClick={() => exec("fontSize", s.value)}
                    className="h-7 px-2 text-xs"
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>

            <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
              Select text first, then apply formatting. It applies to the selection only.
            </p>
          </PopoverContent>
        </Popover>

        {/* 2. Attach files */}
        <ToolbarButton label="Attach files" testId="tb-attach" onClick={onAttachFiles}>
          <Paperclip className="h-4 w-4" />
        </ToolbarButton>

        {/* 3. Insert link */}
        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <PopoverTrigger asChild>
            <span className="inline-flex">
              <ToolbarButton label="Insert link" testId="tb-link" active={linkOpen}>
                <Link2 className="h-4 w-4" />
              </ToolbarButton>
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-3">
            <div className="space-y-2">
              <div className="space-y-1">
                <Label htmlFor="link-text" className="text-xs">
                  Link text (optional)
                </Label>
                <Input
                  id="link-text"
                  data-testid="link-text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="Read more"
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="link-url" className="text-xs">
                  URL
                </Label>
                <Input
                  id="link-url"
                  data-testid="link-url"
                  value={linkUrl}
                  onChange={(e) => {
                    setLinkUrl(e.target.value);
                    setLinkError("");
                  }}
                  placeholder="https://example.com"
                  className="h-8"
                />
              </div>
              {linkError ? <p className="text-xs text-rose-600">{linkError}</p> : null}
              <Button
                type="button"
                size="sm"
                onClick={insertLink}
                data-testid="link-insert"
                className="w-full"
              >
                Insert link
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* 4. Insert emoji */}
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <span className="inline-flex">
              <ToolbarButton label="Insert emoji" testId="tb-emoji" active={emojiOpen}>
                <Smile className="h-4 w-4" />
              </ToolbarButton>
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-label={`Insert ${e}`}
                  data-testid={`emoji-${e}`}
                  onClick={() => insertEmoji(e)}
                  className="rounded-md p-1.5 text-lg leading-none transition-colors hover:bg-accent"
                >
                  {e}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* 5. More options */}
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="More options"
                  data-testid="tb-more"
                  className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>More options</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              data-testid="more-clear-formatting"
              onSelect={() => editorRef.current?.clearFormatting()}
            >
              <Eraser className="mr-2 h-4 w-4" /> Clear formatting
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="more-insert-date" onSelect={insertDate}>
              <CalendarDays className="mr-2 h-4 w-4" /> Insert current date
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 6. Schedule send — visually separated from the compose actions */}
        <div className="ml-auto flex items-center gap-2 pl-2">
          <span className="hidden text-[11px] font-medium text-muted-foreground sm:inline">
            {scheduleLabel}
          </span>
          <ToolbarButton
            label="Schedule send"
            testId="tb-schedule"
            onClick={onOpenSchedule}
          >
            <Clock className="h-4 w-4 text-primary" />
          </ToolbarButton>
        </div>
      </div>
    </TooltipProvider>
  );
}
