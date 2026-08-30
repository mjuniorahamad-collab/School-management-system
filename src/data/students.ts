import type { Student } from "@/types"

// TEMPORARY MOCK DATA — dashboard milestone only.
// Illustrative student records; will be replaced by the Students API.

export const recentStudents: Student[] = [
  {
    id: "s1",
    name: "Aditya Singh",
    studentClass: "10",
    section: "A",
    status: "present",
  },
  {
    id: "s2",
    name: "Priya Verma",
    studentClass: "9",
    section: "B",
    status: "present",
  },
  {
    id: "s3",
    name: "Arjun Mehta",
    studentClass: "8",
    section: "A",
    status: "late",
  },
  {
    id: "s4",
    name: "Sneha Kapoor",
    studentClass: "7",
    section: "B",
    status: "absent",
  },
  {
    id: "s5",
    name: "Kabir Yadav",
    studentClass: "9",
    section: "A",
    status: "present",
  },
  {
    id: "s6",
    name: "Myra Patel",
    studentClass: "10",
    section: "B",
    status: "late",
  },
]

// Lightweight directory used by the global search command palette.
export const searchableStudents: Pick<Student, "id" | "name" | "studentClass" | "section">[] =
  recentStudents.map(({ id, name, studentClass, section }) => ({
    id,
    name,
    studentClass,
    section,
  }))