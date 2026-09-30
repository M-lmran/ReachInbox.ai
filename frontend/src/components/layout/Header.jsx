import { useState, useRef, useEffect } from "react";
import { Menu, Search, Loader2 } from "lucide-react";
import { UserMenu } from "@/components/common/UserMenu";
import { StatusBadge } from "@/components/common/StatusBadge";
import { emailService } from "@/services/emailService";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "@/components/layout/Sidebar";

export function Header({ title }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleChange = (value) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    if (!value.trim()) {
      setResults(null);
      setOpen(false);
      return;
    }
    setSearching(true);
    setOpen(true);
    timer.current = setTimeout(async () => {
      try {
        const data = await emailService.search(value.trim());
        setResults(data);
      } catch (_e) {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
      <Sheet>
        <SheetTrigger asChild>
          <button
            data-testid="mobile-menu-trigger"
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0">
          <Sidebar />
        </SheetContent>
      </Sheet>

      <h1 className="text-lg font-bold tracking-tight text-foreground">{title}</h1>

      <div ref={boxRef} className="relative ml-auto hidden w-full max-w-xs md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          data-testid="global-search-input"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => query && setOpen(true)}
          placeholder="Search recipients or subjects…"
          className="h-9 w-full rounded-full border border-border bg-card pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {open ? (
          <div
            data-testid="search-results"
            className="absolute mt-2 max-h-80 w-full overflow-auto rounded-xl border border-border bg-popover p-1.5 surface-shadow-lg"
          >
            {searching ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </div>
            ) : results && results.length > 0 ? (
              results.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 hover:bg-accent"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {r.recipient}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.subject}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))
            ) : (
              <div className="px-3 py-3 text-sm text-muted-foreground">
                No results found.
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="ml-auto md:ml-0">
        <UserMenu />
      </div>
    </header>
  );
}
