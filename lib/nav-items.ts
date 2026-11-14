import type { LucideIcon } from "lucide-react";
import {
  UserPlus,
  Scissors,
  BookOpen,
  AudioLines,
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
  BookMarked,
  Fingerprint,
  Lightbulb,
  Target,
  Mail,
  Images,
  CalendarDays,
  ShieldCheck,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/voice", label: "Your Voice", icon: Fingerprint },
  { href: "/talk", label: "Talk it out", icon: AudioLines },
  { href: "/books", label: "Books", icon: BookOpen },
  { href: "/clips", label: "Clip finder", icon: Scissors },
  { href: "/ideas", label: "Ideas", icon: Lightbulb },
  { href: "/this-week", label: "This Week", icon: CalendarDays },
  { href: "/autopsy", label: "Autopsy", icon: Stethoscope },
  { href: "/patterns", label: "Pattern Reader", icon: Sparkles },
  { href: "/scripts", label: "Script Writer", icon: PenLine },
  { href: "/hooks", label: "Hook Lab", icon: Zap },
  { href: "/game-plan", label: "Game Plan", icon: Target },
  { href: "/newsletter", label: "Newsletter", icon: Mail },
  { href: "/photos", label: "Photos", icon: Images },
  { href: "/session-prep", label: "Session Prep", icon: CalendarClock },
  { href: "/session-mode", label: "Session Mode", icon: Presentation },
  { href: "/boards", label: "Discover Boards", icon: Layers },
  { href: "/inspiration", label: "Inspiration", icon: Compass },
  { href: "/leads", label: "Leads", icon: UserPlus },
  { href: "/history", label: "History", icon: History },
  { href: "/health", label: "Database check", icon: ShieldCheck },
  { href: "/settings", label: "Sources & Facts", icon: BookMarked },
];
