import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "@/constants";
import { Logo } from "@/components/common/Logo";
import { cn } from "@/lib/utils";

export function Sidebar({ onNavigate }) {
  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-6">
        <Logo variant="mark" size={36} className="shrink-0" />
        <div>
          <div className="text-[15px] font-bold leading-none tracking-tight text-foreground">
            ReachInbox
          </div>
          <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Scheduler
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-5">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground surface-shadow"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )
            }
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* <div className="border-t border-border px-5 py-4">
        <div className="rounded-xl bg-accent/60 p-3 text-xs text-muted-foreground">
          <span className="font-semibold text-accent-foreground"></span>
        </div>
      </div> */}
    </aside>
  );
}
