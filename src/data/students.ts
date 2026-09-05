import type { Student } from "@/types"

// TEMPORARY MOCK DATA — global search consumer only.
// Lightweight directory used by the command palette (GlobalSearch). This is a
// standalone mock for search; real student autocomplete will come with the
// Students search API. Dashboard widgets no longer consume this file.

export const searchableStudents: Pick<Student, "id" | "name" | "studentClass" | "section">[] = [
  { id: "s1", name: "Aditya Singh", studentClass: "10", section: "A" },
  { id: "s2", name: "Priya Verma", studentClass: "9", section: "B" },
  { id: "s3", name: "Arjun Mehta", studentClass: "8", section: "A" },
  { id: "s4", name: "Sneha Kapoor", studentClass: "7", section: "B" },
  { id: "s5", name: "Kabir Yadav", studentClass: "9", section: "A" },
  { id: "s6", name: "Myra Patel", studentClass: "10", section: "B" },
  { id: "s7", name: "Aarav Nair", studentClass: "6", section: "A" },
  { id: "s8", name: "Riya Nair", studentClass: "9", section: "A" },
  { id: "s9", name: "Ananya Sharma", studentClass: "8", section: "A" },
  { id: "s10", name: "Rohan Verma", studentClass: "6", section: "B" },
]