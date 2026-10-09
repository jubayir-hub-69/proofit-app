import {
  LayoutDashboard,
  Library,
  ListChecks,
  NotebookPen,
  Rss,
  Scale,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  description: string
}

/**
 * Today Feed is /feed. /campaigns remains the indexed campaign book.
 * Checklist and Trader Journal sit beside the core route set.
 */
export const primaryNav: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "Net ROI and campaign snapshot",
  },
  {
    href: "/ledger",
    label: "Net Ledger",
    icon: Scale,
    description: "Gas-adjusted profit and loss",
  },
  {
    href: "/feed",
    label: "Today Feed",
    icon: Rss,
    description: "Stored opportunities and deadline alerts",
  },
  {
    href: "/campaigns",
    label: "Campaigns",
    icon: Library,
    description: "Indexed campaign totals",
  },
  {
    href: "/checklist",
    label: "Checklist",
    icon: ListChecks,
    description: "Tasks still open",
  },
  {
    href: "/safety",
    label: "Safety Gate",
    icon: ShieldCheck,
    description: "Token and address risk",
  },
  {
    href: "/journal",
    label: "Trader Journal",
    icon: NotebookPen,
    description: "Notes tied to positions",
  },
]

export const settingsNav: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: Settings,
  description: "Keys, networks, and alerts",
}

export function isNavActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/" || pathname === "/dashboard"
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}
