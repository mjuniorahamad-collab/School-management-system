import { useAuth } from "@/auth/useAuth"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { SectionForm, type SectionField } from "@/components/settings/SettingsSectionForm"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { ExamTypesPanel } from "@/components/settings/masterData/ExamTypesPanel"
import { FeeHeadsPanel } from "@/components/settings/masterData/FeeHeadsPanel"
import { GradingBandsPanel } from "@/components/settings/masterData/GradingBandsPanel"
import { PeriodSlotsPanel } from "@/components/settings/masterData/PeriodSlotsPanel"
import { useSettings, useUpdateSettings } from "@/hooks/useSettings"

const schoolFields: SectionField[] = [
  { key: "schoolName", label: "School name", type: "text", placeholder: "Bright Future International School" },
  { key: "schoolShortName", label: "Short name", type: "text", placeholder: "BFIS" },
  { key: "tagline", label: "Tagline", type: "text", placeholder: "Excellence in education" },
  { key: "primaryColor", label: "Primary color (hex)", type: "text", placeholder: "#4f46e5" },
  { key: "contactPhone", label: "Contact phone", type: "text", placeholder: "+1 555 000 0000" },
  { key: "contactEmail", label: "Contact email", type: "text", placeholder: "office@school.edu" },
  { key: "addressLine1", label: "Address line 1", type: "text", span: "sm:col-span-2" },
  { key: "addressLine2", label: "Address line 2", type: "text", span: "sm:col-span-2" },
  { key: "city", label: "City", type: "text" },
  { key: "state", label: "State", type: "text" },
  { key: "postalCode", label: "Postal code", type: "text" },
  { key: "country", label: "Country", type: "text" },
  { key: "logoUrl", label: "Logo URL", type: "text", placeholder: "https://…" },
]

const academicFields: SectionField[] = [
  { key: "academicTermLabel", label: "Term label", type: "text", placeholder: "Term 1" },
  { key: "academicCurrentSession", label: "Current session", type: "text", placeholder: "2026–2027" },
]

const attendanceFields: SectionField[] = [
  { key: "attendanceWorkdays", label: "Workdays (comma separated)", type: "text", placeholder: "Mon,Tue,Wed,Thu,Fri" },
  {
    key: "attendanceDefaultMarking",
    label: "Default marking",
    type: "select",
    options: [
      { value: "daily", label: "Daily" },
      { value: "period", label: "Per period" },
    ],
  },
  { key: "attendanceLateGraceMinutes", label: "Late grace (minutes)", type: "number", min: 0, max: 120 },
]

const timetableFields: SectionField[] = [
  { key: "timetablePeriodsPerDay", label: "Periods per day", type: "number", min: 1, max: 12 },
  { key: "timetableStartTime", label: "Start time (HH:MM)", type: "text", placeholder: "08:00" },
  { key: "timetableEndTime", label: "End time (HH:MM)", type: "text", placeholder: "14:00" },
]

const gradingFields: SectionField[] = [
  { key: "gradingPassPercent", label: "Pass percentage", type: "number", min: 0, max: 100 },
  {
    key: "gradingScale",
    label: "Grading scale",
    type: "select",
    options: [
      { value: "100", label: "100-point" },
      { value: "4.0", label: "4.0 GPA" },
    ],
  },
]

const feeFields: SectionField[] = [
  { key: "feeCurrency", label: "Currency code", type: "text", placeholder: "USD" },
  { key: "feeDefaultDueDay", label: "Default due day", type: "number", min: 1, max: 31 },
  { key: "feeEnableOnlinePayments", label: "Enable online payments", type: "switch" },
]

export function SettingsPage() {
  const { can } = useAuth()
  const { data, isPending, isError } = useSettings()
  const updateMutation = useUpdateSettings()

  const values = (data?.settings ?? {}) as Record<string, string | number | boolean>
  const canUpdateSettings = can("settings:update")

  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Settings"
          description="School profile, academic configuration, and master data for your institution."
        />

        {isPending && (
          <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="mt-4 h-10 w-full" />
          </div>
        )}
        {isError && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
            <p className="text-sm text-muted-foreground">Could not load settings.</p>
          </div>
        )}

        {!isPending && !isError && data && (
          <Tabs defaultValue="school">
            <TabsList className="w-full justify-start overflow-x-auto sm:w-auto sm:justify-center">
              <TabsTrigger value="school">School</TabsTrigger>
              <TabsTrigger value="academic">Academic</TabsTrigger>
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="timetable">Timetable</TabsTrigger>
              <TabsTrigger value="grading">Grading</TabsTrigger>
              <TabsTrigger value="fees">Fees</TabsTrigger>
              <TabsTrigger value="master">Master Data</TabsTrigger>
            </TabsList>

            <div className="mt-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6">
              <TabsContent value="school" className="focus:outline-none">
                {canUpdateSettings ? (
                  <SectionForm
                    title="School & profile"
                    description="Details that identify your school and how it is presented."
                    fields={schoolFields}
                    values={values}
                    isSaving={updateMutation.isPending}
                    onSave={(payload) => updateMutation.mutate(payload)}
                  />
                ) : (
                  <ReadOnlyMessage />
                )}
              </TabsContent>

              <TabsContent value="academic" className="focus:outline-none">
                {canUpdateSettings ? (
                  <SectionForm
                    title="Academic"
                    description="Term and session labels used across the academic cycle."
                    fields={academicFields}
                    values={values}
                    isSaving={updateMutation.isPending}
                    onSave={(payload) => updateMutation.mutate(payload)}
                  />
                ) : (
                  <ReadOnlyMessage />
                )}
              </TabsContent>

              <TabsContent value="attendance" className="focus:outline-none">
                {canUpdateSettings ? (
                  <SectionForm
                    title="Attendance"
                    description="Defaults for daily and periodic attendance marking."
                    fields={attendanceFields}
                    values={values}
                    isSaving={updateMutation.isPending}
                    onSave={(payload) => updateMutation.mutate(payload)}
                  />
                ) : (
                  <ReadOnlyMessage />
                )}
              </TabsContent>

              <TabsContent value="timetable" className="focus:outline-none">
                {canUpdateSettings ? (
                  <SectionForm
                    title="Timetable"
                    description="Defaults for the school's period timetable."
                    fields={timetableFields}
                    values={values}
                    isSaving={updateMutation.isPending}
                    onSave={(payload) => updateMutation.mutate(payload)}
                  />
                ) : (
                  <ReadOnlyMessage />
                )}
              </TabsContent>

              <TabsContent value="grading" className="focus:outline-none">
                {canUpdateSettings ? (
                  <SectionForm
                    title="Grading"
                    description="Defaults used to interpret and display results."
                    fields={gradingFields}
                    values={values}
                    isSaving={updateMutation.isPending}
                    onSave={(payload) => updateMutation.mutate(payload)}
                  />
                ) : (
                  <ReadOnlyMessage />
                )}
              </TabsContent>

              <TabsContent value="fees" className="focus:outline-none">
                {canUpdateSettings ? (
                  <SectionForm
                    title="Fees"
                    description="Defaults applied to fee structures and invoices."
                    fields={feeFields}
                    values={values}
                    isSaving={updateMutation.isPending}
                    onSave={(payload) => updateMutation.mutate(payload)}
                  />
                ) : (
                  <ReadOnlyMessage />
                )}
              </TabsContent>

              <TabsContent value="master" className="focus:outline-none">
                <MasterDataTabs />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </div>
    </PageContainer>
  )
}

function MasterDataTabs() {
  const { can } = useAuth()
  const canView = (perm: string) => can(perm)
  return (
    <Tabs defaultValue="feeHeads">
      <TabsList className="flex w-full justify-start overflow-x-auto sm:w-auto">
        <TabsTrigger value="feeHeads">Fee Heads</TabsTrigger>
        <TabsTrigger value="examTypes">Exam Types</TabsTrigger>
        <TabsTrigger value="gradingBands">Grading Bands</TabsTrigger>
        <TabsTrigger value="periodSlots">Period Slots</TabsTrigger>
      </TabsList>
      <div className="mt-4">
        <TabsContent value="feeHeads" className="focus:outline-none">
          {canView("fees:view") ? <FeeHeadsPanel /> : <ReadOnlyMessage />}
        </TabsContent>
        <TabsContent value="examTypes" className="focus:outline-none">
          {canView("exams:view") ? <ExamTypesPanel /> : <ReadOnlyMessage />}
        </TabsContent>
        <TabsContent value="gradingBands" className="focus:outline-none">
          {canView("results:view") ? <GradingBandsPanel /> : <ReadOnlyMessage />}
        </TabsContent>
        <TabsContent value="periodSlots" className="focus:outline-none">
          {canView("timetable:view") ? <PeriodSlotsPanel /> : <ReadOnlyMessage />}
        </TabsContent>
      </div>
    </Tabs>
  )
}

function ReadOnlyMessage() {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed py-10 text-center">
      <p className="text-sm text-muted-foreground">
        You have view access to this area but no permission to make changes.
      </p>
    </div>
  )
}
