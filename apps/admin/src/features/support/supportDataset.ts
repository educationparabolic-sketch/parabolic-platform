export type SupportCategory =
  | "Account & access"
  | "Students & batches"
  | "Question bank or upload"
  | "Tests & assignments"
  | "Analytics or reports"
  | "Licensing or billing"
  | "Technical issue"
  | "Other";

export type SupportPriority = "Normal" | "High" | "Urgent";
export type SupportStatus = "Open" | "In progress" | "Awaiting institute" | "Resolved" | "Closed";

export interface SupportAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface SupportMessage {
  id: string;
  author: string;
  authorType: "institute" | "support" | "system";
  body: string;
  createdAt: string;
  attachments: SupportAttachment[];
}

export interface SupportDiagnosticContext {
  instituteId: string;
  submittedBy: string;
  sourceRoute: string;
  browser: string;
  capturedAt: string;
  affectedEntityId?: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  status: SupportStatus;
  assignedTeam: string;
  createdAt: string;
  updatedAt: string;
  context: SupportDiagnosticContext;
  messages: SupportMessage[];
}

export interface CreateSupportTicketInput {
  subject: string;
  description: string;
  category: SupportCategory;
  priority: SupportPriority;
  affectedEntityId?: string;
  attachments: SupportAttachment[];
  context: Omit<SupportDiagnosticContext, "affectedEntityId">;
}

export const SUPPORT_CATEGORIES: SupportCategory[] = [
  "Account & access",
  "Students & batches",
  "Question bank or upload",
  "Tests & assignments",
  "Analytics or reports",
  "Licensing or billing",
  "Technical issue",
  "Other",
];

export const SUPPORT_PRIORITIES: SupportPriority[] = ["Normal", "High", "Urgent"];
export const SUPPORT_STATUSES: SupportStatus[] = [
  "Open",
  "In progress",
  "Awaiting institute",
  "Resolved",
  "Closed",
];

const STORAGE_KEY = "parabolic.admin.support-tickets.v1";

const FALLBACK_TICKETS: SupportTicket[] = [
  {
    id: "SUP-1042",
    subject: "Student bulk upload validation mismatch",
    category: "Students & batches",
    priority: "High",
    status: "In progress",
    assignedTeam: "Institute operations support",
    createdAt: "2026-07-15T06:20:00.000Z",
    updatedAt: "2026-07-16T09:10:00.000Z",
    context: {
      instituteId: "inst-build-125",
      submittedBy: "admin.test@parabolic.local",
      sourceRoute: "/admin/students/bulk-upload",
      browser: "Chrome on Linux",
      capturedAt: "2026-07-15T06:20:00.000Z",
      affectedEntityId: "upload-2026-0715-04",
    },
    messages: [
      {
        id: "msg-1042-1",
        author: "Institute administrator",
        authorType: "institute",
        body: "The workbook passes the required-column check, but 18 valid batch names are reported as unknown.",
        createdAt: "2026-07-15T06:20:00.000Z",
        attachments: [
          { id: "att-1042-1", name: "validation-summary.png", size: 184320, type: "image/png" },
        ],
      },
      {
        id: "msg-1042-2",
        author: "Operations support",
        authorType: "support",
        body: "We are comparing the uploaded batch labels with the current academic-year registry.",
        createdAt: "2026-07-16T09:10:00.000Z",
        attachments: [],
      },
    ],
  },
  {
    id: "SUP-1038",
    subject: "June invoice student count clarification",
    category: "Licensing or billing",
    priority: "Normal",
    status: "Awaiting institute",
    assignedTeam: "Vendor billing support",
    createdAt: "2026-07-12T10:30:00.000Z",
    updatedAt: "2026-07-14T08:45:00.000Z",
    context: {
      instituteId: "inst-build-125",
      submittedBy: "admin.test@parabolic.local",
      sourceRoute: "/admin/licensing/usage",
      browser: "Chrome on Linux",
      capturedAt: "2026-07-12T10:30:00.000Z",
    },
    messages: [
      {
        id: "msg-1038-1",
        author: "Institute administrator",
        authorType: "institute",
        body: "Please clarify which student population was used for the June usage calculation.",
        createdAt: "2026-07-12T10:30:00.000Z",
        attachments: [],
      },
      {
        id: "msg-1038-2",
        author: "Vendor billing support",
        authorType: "support",
        body: "Please confirm whether the archived 2025-26 cohort should be excluded from your query.",
        createdAt: "2026-07-14T08:45:00.000Z",
        attachments: [],
      },
    ],
  },
  {
    id: "SUP-1029",
    subject: "Analytics report export completed",
    category: "Analytics or reports",
    priority: "Normal",
    status: "Resolved",
    assignedTeam: "Platform support",
    createdAt: "2026-07-05T05:40:00.000Z",
    updatedAt: "2026-07-06T07:15:00.000Z",
    context: {
      instituteId: "inst-build-125",
      submittedBy: "director.test@parabolic.local",
      sourceRoute: "/admin/analytics",
      browser: "Chrome on Linux",
      capturedAt: "2026-07-05T05:40:00.000Z",
    },
    messages: [
      {
        id: "msg-1029-1",
        author: "Institute director",
        authorType: "institute",
        body: "The batch comparison PDF remained in preparing state after the report completed.",
        createdAt: "2026-07-05T05:40:00.000Z",
        attachments: [],
      },
      {
        id: "msg-1029-2",
        author: "Platform support",
        authorType: "support",
        body: "The export status has been reconciled and the report is available in the original analytics view.",
        createdAt: "2026-07-06T07:15:00.000Z",
        attachments: [],
      },
    ],
  },
];

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function resolveAssignedTeam(category: SupportCategory): string {
  if (category === "Licensing or billing") return "Vendor billing support";
  if (category === "Students & batches" || category === "Tests & assignments") {
    return "Institute operations support";
  }
  return "Platform support";
}

export function loadSupportTickets(): SupportTicket[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return FALLBACK_TICKETS;
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? (parsed as SupportTicket[]) : FALLBACK_TICKETS;
  } catch {
    return FALLBACK_TICKETS;
  }
}

export function persistSupportTickets(tickets: SupportTicket[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
}

export function createSupportTicket(input: CreateSupportTicketInput): SupportTicket {
  const createdAt = new Date().toISOString();
  const sequence = String(Date.now()).slice(-6);
  return {
    id: `SUP-${sequence}`,
    subject: input.subject.trim(),
    category: input.category,
    priority: input.priority,
    status: "Open",
    assignedTeam: resolveAssignedTeam(input.category),
    createdAt,
    updatedAt: createdAt,
    context: {
      ...input.context,
      affectedEntityId: input.affectedEntityId?.trim() || undefined,
    },
    messages: [
      {
        id: makeId("message"),
        author: input.context.submittedBy,
        authorType: "institute",
        body: input.description.trim(),
        createdAt,
        attachments: input.attachments,
      },
      {
        id: makeId("message"),
        author: "Support routing",
        authorType: "system",
        body: `Request routed to ${resolveAssignedTeam(input.category)}.`,
        createdAt,
        attachments: [],
      },
    ],
  };
}

export function toSupportAttachments(files: File[]): SupportAttachment[] {
  return files.map((file) => ({
    id: makeId("attachment"),
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
  }));
}
