export function conflictMessage(type: "class" | "teacher"): string {
  if (type === "class") {
    return "This class already has a lesson scheduled at this period"
  }
  return "This teacher already has a class scheduled at this period"
}
