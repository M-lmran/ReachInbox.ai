import { useNavigate } from "react-router-dom";
import { LogOut, Settings, User as UserIcon, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

function initials(name = "") {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    toast.success("Signed out");
    navigate("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="user-menu-trigger"
          className="flex items-center gap-2.5 rounded-full border border-border bg-card py-1 pl-1 pr-2.5 transition-colors hover:bg-accent"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatarUrl} alt={user.name} referrerPolicy="no-referrer" />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-left sm:block">
            <div className="text-sm font-semibold leading-tight text-foreground">
              {user.name}
            </div>
            <div className="text-xs leading-tight text-muted-foreground">
              {user.email}
            </div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="font-semibold">{user.name}</div>
          <div className="text-xs font-normal text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid="menu-profile" onClick={() => navigate("/dashboard/settings")}>
          <UserIcon className="mr-2 h-4 w-4" /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem data-testid="menu-settings" onClick={() => navigate("/dashboard/settings")}>
          <Settings className="mr-2 h-4 w-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid="menu-logout"
          onClick={handleLogout}
          className="text-rose-600 focus:text-rose-600"
        >
          <LogOut className="mr-2 h-4 w-4" /> Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
