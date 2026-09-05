import { useState } from "react"
import { Save } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { defaultMarkCell, subjectDraftToPayload, validateSubjectDraft } from "@/lib/resultFormRules"
import type { MarkCellDraft } from "@/lib/resultFormRules"
import type { ResultSheet, ResultSheetSubject } from "@/types/results"
import { isSheetEditable } from "@/types/results"
import type { MarksRowInput } from "@/types/results"

interface ResultSheetGridProps {
  sheet: ResultSheet
  isSaving: boolean
  onSaveSubject: (examSubjectId: string, rows: MarksRowInput[]) => void
}

export function ResultSheetGrid({ sheet, isSaving, onSaveSubject }: ResultSheetGridProps) {
  const [drafts, setDrafts] = useState<Record<string, MarkCellDraft>>({})
  const editable = isSheetEditable(sheet.exam.status)

  const draftKey = (subjectId: string, enrollmentId: string) => `${subjectId}:${enrollmentId}`

  const cellFor = (subjectId: string, row: (typeof sheet.rows)[number], server: MarkCellDraft) =>
    drafts[draftKey(subjectId, row.enrollmentId)] ?? server

  const setCell = (
    subjectId: string,
    row: (typeof sheet.rows)[number],
    patch: Partial<MarkCellDraft>,
  ) => {
    setDrafts((previous) => ({
      ...previous,
      [draftKey(subjectId, row.enrollmentId)]: {
        ...cellFor(subjectId, row, defaultMarkCell(row.marks.find((m) => m.examSubjectId === subjectId))),
        ...patch,
      },
    }))
  }

  const saveSubject = (subject: ResultSheetSubject) => {
    const maxMarks = Number(subject.maxMarks)
    const subjectDrafts = sheet.rows.map((row) =>
      cellFor(subject.id, row, defaultMarkCell(row.marks.find((m) => m.examSubjectId === subject.id))),
    )
    const error = validateSubjectDraft(subjectDrafts, maxMarks)
    if (error) {
      toast.error(error)
      return
    }
    const rows = subjectDraftToPayload(sheet.rows, drafts, subject.id)
    onSaveSubject(subject.id, rows)
  }

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-muted/40 px-4 py-3 font-medium">
                Student
              </th>
              {sheet.subjects.map((subject) => (
                <th scope="col" key={subject.id} className="min-w-[92px] px-3 py-3 text-center font-medium">
                  <span className="block">{subject.subjectCode}</span>
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    max {subject.maxMarks} · pass {subject.passMarks}
                  </span>
                  {editable && subject.canEdit && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-1.5 h-7 gap-1 text-[11px]"
                      onClick={() => saveSubject(subject)}
                      disabled={isSaving}
                    >
                      <Save className="size-3" aria-hidden="true" />
                      Save
                    </Button>
                  )}
                </th>
              ))}
              <th scope="col" className="px-3 py-3 text-right font-medium">Total</th>
              <th scope="col" className="px-3 py-3 text-center font-medium">Grade</th>
              <th scope="col" className="px-3 py-3 text-center font-medium">Pass</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Rank</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sheet.rows.map((row) => (
              <tr key={row.enrollmentId} className="hover:bg-muted/30">
                <td className="sticky left-0 z-10 bg-card px-4 py-2">
                  <p className="font-medium text-foreground">{row.studentName}</p>
                  <p className="text-xs text-muted-foreground">{row.admissionNumber}</p>
                </td>
                {sheet.subjects.map((subject) => {
                  const mark = row.marks.find((cell) => cell.examSubjectId === subject.id)
                  const server: MarkCellDraft = defaultMarkCell(mark)
                  const cell = cellFor(subject.id, row, server)
                  const canEditCell = editable && subject.canEdit
                  return (
                    <td key={subject.id} className="px-3 py-2 text-center">
                      {canEditCell ? (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              inputMode="decimal"
                              value={cell.value}
                              onChange={(event) => setCell(subject.id, row, { value: event.target.value })}
                              aria-label={`${subject.subjectCode} marks for ${row.studentName}`}
                              className="w-16 px-2 text-center tabular-nums"
                            />
                            <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-muted-foreground">
                              <Switch
                                size="sm"
                                checked={cell.isAbsent}
                                onCheckedChange={(checked: boolean) =>
                                  setCell(subject.id, row, { isAbsent: checked, value: "" })
                                }
                                aria-label={`${subject.subjectCode} absent for ${row.studentName}`}
                              />
                              Abs
                            </label>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {cell.isAbsent
                              ? "Absent"
                              : mark?.percentage
                                ? `${mark.percentage}% · ${mark.grade ?? "—"}`
                                : "—"}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <span className="tabular-nums text-foreground">
                            {mark?.isAbsent ? "Absent" : mark?.obtainedMarks ?? "—"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {mark?.isAbsent ? "excluded" : mark?.percentage ? `${mark.percentage}% · ${mark.grade ?? "—"}` : "—"}
                          </span>
                        </div>
                      )}
                    </td>
                  )
                })}
                <td className="px-3 py-2 text-right">
                  <p className="tabular-nums font-medium text-foreground">
                    {row.totalObtained !== null ? row.totalObtained : "—"}
                    {row.totalMaxMarks !== null ? ` / ${row.totalMaxMarks}` : ""}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {row.totalPercentage !== null ? `${row.totalPercentage}%` : "not complete"}
                  </p>
                </td>
                <td className="px-3 py-2 text-center">
                  {row.grade ? (
                    <Badge variant="secondary" className="border-transparent bg-slate-100 font-medium text-slate-700 dark:bg-slate-500/15 dark:text-slate-300">
                      {row.grade}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {row.isPass === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : row.isPass ? (
                    <Badge variant="secondary" className="border-transparent bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      Pass
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="border-transparent bg-red-50 font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300">
                      Fail
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {row.rank ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}