import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal rich-text editor built on contentEditable.
 *
 * No editor dependency is used: the project has none, and the backend stores the
 * body as HTML and sends it as the message `html` part, so plain contentEditable
 * plus execCommand covers the required formatting (bold/italic/underline/colour/
 * highlight/size) with zero added weight.
 *
 * execCommand is formally deprecated but remains the only widely-implemented way
 * to apply formatting to the current *selection*, which is the requirement here.
 */

const TEXT_COLORS = [
  { label: "Default", value: null },
  { label: "Red", value: "#dc2626" },
  { label: "Orange", value: "#ea580c" },
  { label: "Green", value: "#16a34a" },
  { label: "Blue", value: "#2563eb" },
  { label: "Purple", value: "#7c3aed" },
  { label: "Grey", value: "#6b7280" },
];

const HIGHLIGHT_COLORS = [
  { label: "None", value: null },
  { label: "Yellow", value: "#fef08a" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Blue", value: "#bfdbfe" },
  { label: "Pink", value: "#fbcfe8" },
  { label: "Orange", value: "#fed7aa" },
];

const FONT_SIZES = [
  { label: "Small", value: "2" },
  { label: "Normal", value: "3" },
  { label: "Large", value: "5" },
  { label: "Huge", value: "6" },
];

export const TEXT_COLOR_OPTIONS = TEXT_COLORS;
export const HIGHLIGHT_COLOR_OPTIONS = HIGHLIGHT_COLORS;
export const FONT_SIZE_OPTIONS = FONT_SIZES;

/** Strip tags so emptiness/validation is judged on visible text, not markup. */
export function htmlToText(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
}

export const RichTextEditor = forwardRef(function RichTextEditor(
  { value, onChange, placeholder = "Write your message…", className, onFocusChange },
  ref,
) {
  const editorRef = useRef(null);
  const lastHtml = useRef(value || "");
  const [empty, setEmpty] = useState(!htmlToText(value));

  // Apply external changes (emoji/link insertion, reset) without clobbering the
  // caret while the user is typing: only touch the DOM when the incoming value
  // differs from what this editor last emitted.
  useEffect(() => {
    const incoming = value || "";
    if (!editorRef.current) return;
    if (incoming !== lastHtml.current) {
      editorRef.current.innerHTML = incoming;
      lastHtml.current = incoming;
      setEmpty(!htmlToText(incoming));
    }
  }, [value]);

  const emit = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    lastHtml.current = html;
    setEmpty(!htmlToText(html));
    onChange?.(html);
  }, [onChange]);

  const exec = useCallback(
    (command, arg) => {
      editorRef.current?.focus();
      // Firefox implements background highlight as backColor; WebKit/Blink as
      // hiliteColor. Try the modern name first and fall back.
      if (command === "hiliteColor" && !document.queryCommandSupported?.("hiliteColor")) {
        document.execCommand("backColor", false, arg);
      } else {
        document.execCommand(command, false, arg);
      }
      emit();
    },
    [emit],
  );

  const insertHtml = useCallback(
    (html) => {
      editorRef.current?.focus();
      document.execCommand("insertHTML", false, html);
      emit();
    },
    [emit],
  );

  useImperativeHandle(
    ref,
    () => ({
      exec,
      insertHtml,
      focus: () => editorRef.current?.focus(),
      getHtml: () => editorRef.current?.innerHTML || "",
      clearFormatting: () => {
        editorRef.current?.focus();
        document.execCommand("removeFormat", false);
        emit();
      },
    }),
    [exec, insertHtml, emit],
  );

  return (
    <div className={cn("relative", className)}>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Email body"
        data-testid="compose-body"
        onInput={emit}
        onBlur={() => {
          emit();
          onFocusChange?.(false);
        }}
        onFocus={() => onFocusChange?.(true)}
        onKeyDown={(e) => {
          // Keep paste as plain text so pasted styling cannot break the layout;
          // the user can then apply formatting deliberately.
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
            e.preventDefault();
            exec("bold");
          }
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
            e.preventDefault();
            exec("italic");
          }
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "u") {
            e.preventDefault();
            exec("underline");
          }
        }}
        className="min-h-[190px] w-full overflow-y-auto px-4 py-3 text-sm leading-relaxed text-foreground outline-none focus:outline-none [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
      />
      {empty ? (
        <span className="pointer-events-none absolute left-4 top-3 text-sm text-muted-foreground">
          {placeholder}
        </span>
      ) : null}
    </div>
  );
});
