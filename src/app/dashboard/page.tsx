import type { Metadata } from "next"
import { DashboardOverview } from "@/components/dashboard/dashboard-overview"
import { PortfolioHero } from "@/components/dashboard/portfolio-hero"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = {
  title: "Dashboard",
}

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title="Dashboard"
        description="Live multi-chain balances for the watched address. Unpriced tokens stay Unlisted / N/A."
      />
      <PortfolioHero />
      <DashboardOverview />
    </>
  )
}
