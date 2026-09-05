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
        <PageHeader
          title="Fees Management"
          description="Configure fee structures for a class and academic session, generate student invoices, and track collection."
        />
        {!can("fees:view") ? (
          <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            You do not have permission to view fees.
          </p>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="gap-4">
            <TabsList>
              <TabsTrigger value="structures">Fee Structures</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
            </TabsList>
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