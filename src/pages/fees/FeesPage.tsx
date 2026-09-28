import { useState } from "react"
import { useAuth } from "@/auth/useAuth"
import { FeeInvoicesTab } from "@/components/fees/FeeInvoicesTab"
import { FeeStructuresTab } from "@/components/fees/FeeStructuresTab"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function FeesPage() {
  const { can } = useAuth()
  const [tab, setTab] = useState("structures")

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        {/* Page chrome only. The tab bodies stay printable because the invoice
            tab owns the print document: hiding this wrapper must never become an
            ancestor of it (see docs/print-architecture.md). */}
        <div className="print:hidden">
          <PageHeader
            title="Fees Management"
            description="Configure fee structures for a class and academic session, generate student invoices, and track collection."
          />
        </div>
        {!can("fees:view") ? (
          <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            You do not have permission to view fees.
          </p>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="gap-4">
            <div className="print:hidden">
              <TabsList>
                <TabsTrigger value="structures">Fee Structures</TabsTrigger>
                <TabsTrigger value="invoices">Invoices</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="structures">
              <FeeStructuresTab />
            </TabsContent>
            <TabsContent value="invoices">
              <FeeInvoicesTab />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </PageContainer>
  )
}