import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Stethoscope,
  Sparkles,
  PenLine,
  Zap,
  CalendarClock,
  Presentation,
  Layers,
  Compass,
  History,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/autopsy", label: "Autopsy", icon: Stethoscope },
  { href: "/patterns", label: "Pattern Reader", icon: Sparkles },
  { href: "/scripts", label: "Script Writer", icon: PenLine },
  { href: "/hooks", label: "Hook Lab", icon: Zap },
  { href: "/session-prep", label: "Session Prep", icon: CalendarClock },
  { href: "/session-mode", label: "Session Mode", icon: Presentation },
  { href: "/boards", label: "Discover Boards", icon: Layers },
  { href: "/inspiration", label: "Inspiration", icon: Compass },
  { href: "/history", label: "History", icon: History },
];
