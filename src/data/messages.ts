// TEMPORARY MOCK DATA — dashboard milestone only.
// Message previews for the header; will be replaced by the Communications API.

export interface MessagePreview {
  id: string
  sender: string
  subject: string
  preview: string
  timestamp: string
  unread: boolean
}

export const messagePreviews: MessagePreview[] = [
  {
    id: "msg-1",
    sender: "Ms. Kavita Rao",
    subject: "Class 10 – Unit Test marks",
    preview: "I've uploaded the Unit Test 2 marks for Class 10 A.",
    timestamp: "2026-05-28T10:05:00+05:30",
    unread: true,
  },
  {
    id: "msg-2",
    sender: "Transport Office",
    subject: "Route 4 timing update",
    preview: "Afternoon drop times on Route 4 will shift by 10 minutes.",
    timestamp: "2026-05-27T15:40:00+05:30",
    unread: true,
  },
  {
    id: "msg-3",
    sender: "Accounts",
    subject: "Fee due list – May",
    preview: "Parent Pending fees report for May is ready for review.",
    timestamp: "2026-05-26T12:20:00+05:30",
    unread: false,
  },
]