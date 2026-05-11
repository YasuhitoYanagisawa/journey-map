import { NavLink, useLocation } from "react-router-dom";
import { Home, Sparkles, MessageCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Home", icon: Home, color: "text-foreground" },
  { to: "/festivals", label: "Festivals", icon: Sparkles, color: "text-omamori-gold" },
  { to: "/communicate", label: "Talk", icon: MessageCircle, color: "text-foreground" },
  { to: "/emergency", label: "Emergency", icon: AlertTriangle, color: "text-omamori-red" },
];

export default function BottomNav() {
  const loc = useLocation();
  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-4">
        {items.map((it) => {
          const active = loc.pathname === it.to;
          const Icon = it.icon;
          return (
            <li key={it.to}>
              <NavLink
                to={it.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-xs transition-colors",
                  active ? it.color : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{it.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DesktopOmamoriBar() {
  return (
    <div className="hidden md:flex fixed top-2 right-2 z-40 gap-1 rounded-lg bg-card/80 backdrop-blur-md border border-border/50 p-1">
      {items.slice(1).map((it) => {
        const Icon = it.icon;
        return (
          <NavLink
            key={it.to}
            to={it.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )
            }
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{it.label}</span>
          </NavLink>
        );
      })}
    </div>
  );
}
