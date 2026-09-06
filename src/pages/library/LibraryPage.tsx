import { useState } from "react"
import { useAuth } from "@/auth/useAuth"
import { BooksTab } from "@/components/library/BooksTab"
import { LoansTab } from "@/components/library/LoansTab"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function LibraryPage() {
  const { can } = useAuth()
  const [tab, setTab] = useState("catalogue")

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Library"
          description="Manage the school library catalogue, physical copies, and book circulation."
        />
        {!can("library:view") ? (
          <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            You do not have permission to view the library.
          </p>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="gap-4">
            <TabsList>
              <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
              <TabsTrigger value="circulation">Circulation</TabsTrigger>
            </TabsList>
            <TabsContent value="catalogue">
              <BooksTab />
            </TabsContent>
            <TabsContent value="circulation">
              <LoansTab />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </PageContainer>
  )
}