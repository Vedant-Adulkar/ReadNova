import { useState } from "react";
import { Navbar } from "./Navbar";
import { AppSidebar } from "./AppSidebar";

export function AppLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <div className="flex w-full min-h-screen">
        <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 px-4 py-8 md:px-8 transition-all duration-300 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
