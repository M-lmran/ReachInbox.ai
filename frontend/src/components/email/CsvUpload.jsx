import { useRef, useState } from "react";
import { UploadCloud, FileText, CheckCircle2, AlertCircle, X } from "lucide-react";
import { parseRecipientFile } from "@/utils/csv";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CsvUpload({ result, onParsed, onClear }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    const okType = /\.(csv|txt)$/i.test(file.name);
    if (!okType) {
      toast.error("Please upload a .csv or .txt file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5MB)");
      return;
    }
    setParsing(true);
    try {
      const parsed = await parseRecipientFile(file);
      onParsed(parsed);
      if (parsed.valid.length === 0) {
        toast.warning("No valid email addresses found in this file");
      } else {
        toast.success(`${parsed.valid.length} valid recipients detected`);
      }
    } catch (_e) {
      toast.error("Could not parse file");
    } finally {
      setParsing(false);
    }
  };

  if (result && result.valid.length > 0) {
    return (
      <div
        data-testid="csv-result"
        className="rounded-xl border border-border bg-card p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">{result.fileName}</div>
              <div className="text-sm text-emerald-600">
                {result.valid.length} valid recipients
              </div>
            </div>
          </div>
          <button
            type="button"
            data-testid="csv-clear"
            onClick={onClear}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> {result.valid.length} valid
          </span>
          {result.duplicatesRemoved > 0 && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
              {result.duplicatesRemoved} duplicates removed
            </span>
          )}
          {result.invalidIgnored > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700">
              <AlertCircle className="h-3.5 w-3.5" /> {result.invalidIgnored} invalid ignored
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="csv-dropzone"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFile(e.dataTransfer.files?.[0]);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
        dragging ? "border-primary bg-accent" : "border-border hover:border-primary/50 hover:bg-accent/40"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt"
        data-testid="csv-file-input"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-accent-foreground">
        <UploadCloud className="h-5 w-5" />
      </div>
      <div className="text-sm font-medium text-foreground">
        {parsing ? "Parsing file…" : "Upload CSV or TXT"}
      </div>
      <div className="text-xs text-muted-foreground">
        Drag & drop or click to browse. Emails are validated in your browser.
      </div>
    </div>
  );
}
