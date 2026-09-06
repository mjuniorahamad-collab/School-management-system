import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  addParticipantsHandler,
  archiveConversationHandler,
  createConversationHandler,
  getConversationHandler,
  listConversationsHandler,
  listMessagesHandler,
  listRecipientsHandler,
  markConversationReadHandler,
  sendMessageHandler,
  unreadCountHandler,
} from "./message.controller.js"

// Messages module — persistent, private, tenant-scoped conversations.
//
// Participants are tenant user accounts whose role carries `messages:view`.
// `messages:view` governs read surfaces (list/detail/messages/recipients/
// unread and the per-conversation read cursor); `messages:create` governs
// conversation creation and messaging actions (send, archive, add participants).
// Every read is scoped by both `schoolId` and caller participation, so
// cross-tenant and direct-ID access resolves to 404.
export const messagesRouter: Router = Router()

messagesRouter.use(requireAuth)

messagesRouter.get("/conversations", requirePermission("messages:view"), listConversationsHandler)
messagesRouter.post("/conversations", requirePermission("messages:create"), createConversationHandler)
messagesRouter.get("/conversations/:id", requirePermission("messages:view"), getConversationHandler)
messagesRouter.get("/conversations/:id/messages", requirePermission("messages:view"), listMessagesHandler)
messagesRouter.post("/conversations/:id/messages", requirePermission("messages:create"), sendMessageHandler)
messagesRouter.post("/conversations/:id/read", requirePermission("messages:view"), markConversationReadHandler)
messagesRouter.post("/conversations/:id/archive", requirePermission("messages:create"), archiveConversationHandler)
messagesRouter.post("/conversations/:id/participants", requirePermission("messages:create"), addParticipantsHandler)
messagesRouter.get("/recipients", requirePermission("messages:view"), listRecipientsHandler)
messagesRouter.get("/unread-count", requirePermission("messages:view"), unreadCountHandler)