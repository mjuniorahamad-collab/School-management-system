import { useState } from "react"
import { useAuth } from "@/auth/useAuth"
import { RolesTab } from "@/components/users/RolesTab"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UsersTab } from "@/pages/users/UsersTab"

export function UsersPage() {
  const { can } = useAuth()
  const [tab, setTab] = useState("users")

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Users & Roles"
          description="Manage who belongs to this school, what roles they hold, and who can sign in."
        />
        {!can("users:view") ? (
          <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            You do not have permission to view users.
          </p>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="gap-4">
            <TabsList>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="roles">Roles</TabsTrigger>
            </TabsList>
            <TabsContent value="users">
              <UsersTab />
            </TabsContent>
            <TabsContent value="roles">
              <RolesTab />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </PageContainer>
  )
}