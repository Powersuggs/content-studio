"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Film } from "lucide-react";
import { NAV_ITEMS } from "@/lib/nav-items";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-panel-2 text-text"
                : "text-muted hover:bg-panel-2 hover:text-text"
            }`}
          >
            <Icon size={18} strokeWidth={1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
        <Film size={18} strokeWidth={1.75} />
      </div>
      <span className="text-sm font-semibold tracking-tight text-text">
        Content Studio
      </span>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer any time the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Prevent background scroll while the drawer is open on mobile.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:shrink-0 md:flex-col md:gap-6 md:border-r md:border-border md:bg-panel md:p-4">
        <Brand />
        <NavLinks />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-panel px-4 py-3 md:hidden">
        <Brand />
        <button
          type="button"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-panel-2 hover:text-text"
        >
          <Menu size={20} strokeWidth={1.75} />
        </button>
      </header>

      {/* Mobile drawer + backdrop */}
      <div
        className={`fixed inset-0 z-40 md:hidden ${drawerOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!drawerOpen}
      >
        <div
          onClick={() => setDrawerOpen(false)}
          className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${
            drawerOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[80vw] flex-col gap-6 border-r border-border bg-panel p-4 shadow-xl transition-transform duration-200 ${
            drawerOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between">
            <Brand />
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setDrawerOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-panel-2 hover:text-text"
            >
              <X size={20} strokeWidth={1.75} />
            </button>
          </div>
          <NavLinks onNavigate={() => setDrawerOpen(false)} />
        </div>
      </div>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
