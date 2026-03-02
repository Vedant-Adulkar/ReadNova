import { BookOpen, Library, Target, User, LayoutDashboard, Search, Brain, X } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Bookshelf", url: "/bookshelf", icon: Library },
  { title: "Goals", url: "/goals", icon: Target },
  { title: "Search", url: "/search", icon: Search },
  { title: "Semantic Search", url: "/semantic-search", icon: Brain },
  { title: "Profile", url: "/profile", icon: User },
];

export function AppSidebar({ open, onClose }) {
  const sidebarClasses = cn(
    "w-64 transition-transform duration-300 h-full",
    "lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 lg:block lg:bg-card/5 lg:border-r lg:border-border/50 lg:flex-shrink-0 lg:z-30",
    open
      ? "fixed inset-y-0 left-0 z-50 translate-x-0 bg-card/95 border-r border-border"
      : "fixed inset-y-0 left-0 z-50 -translate-x-full lg:static"
  );

  return (
    <aside className={sidebarClasses}>
      <div className="flex items-center justify-between p-4 lg:hidden">
        <span className="font-serif font-bold flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" /> Navigate
        </span>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <nav className="space-y-1 p-3">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-300 hover:bg-primary/5 hover:text-primary active:scale-95"
            activeClassName="bg-primary/10 text-primary shadow-sm"
            onClick={onClose}
          >
            <item.icon className="h-4 w-4" />
            <span>{item.title}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
