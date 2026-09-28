import { useState } from "react"
import { useAuth } from "@/auth/useAuth"
import { AssignmentsTab } from "@/components/transport/AssignmentsTab"
import { DriversTab } from "@/components/transport/DriversTab"
import { RoutesTab } from "@/components/transport/RoutesTab"
import { VehiclesTab } from "@/components/transport/VehiclesTab"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function TransportPage() {
  const { can } = useAuth()
  const [tab, setTab] = useState("vehicles")

  return (
    <PageContainer>
        <div className="flex flex-col gap-4">
        {/* PageHeader renders a <div>, not a <header>, so the print stylesheet's
            bare-`header` rule cannot reach it. Without this the page title and
            description would print above the route passenger list. */}
        <div className="print:hidden">
          <PageHeader
            title="Transport"
            description="Manage vehicles, routes and stops, drivers, and per-trip student assignments."
          />
        </div>
        {!can("transport:view") ? (
          <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            You do not have permission to view transport.
          </p>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="gap-4">
            {/* The tab strip is navigation: the printed page is always the
                passenger list for the filters the user is looking at. */}
            <TabsList className="print:hidden">
              <TabsTrigger value="vehicles">Vehicles</TabsTrigger>
              <TabsTrigger value="routes">Routes & Stops</TabsTrigger>
              <TabsTrigger value="drivers">Drivers</TabsTrigger>
              <TabsTrigger value="assignments">Assignments</TabsTrigger>
            </TabsList>
            <TabsContent value="vehicles">
              <VehiclesTab />
            </TabsContent>
            <TabsContent value="routes">
              <RoutesTab />
            </TabsContent>
            <TabsContent value="drivers">
              <DriversTab />
            </TabsContent>
            <TabsContent value="assignments">
              <AssignmentsTab />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </PageContainer>
  )
}