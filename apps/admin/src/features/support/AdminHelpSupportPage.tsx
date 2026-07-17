import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { UiFormField, UiStatCard } from "../../../../../shared/ui/components";
import { resolveAdminInstituteId } from "../settings/settingsDataset";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  createSupportTicket,
  loadSupportTickets,
  persistSupportTickets,
  toSupportAttachments,
  type SupportAttachment,
  type SupportCategory,
  type SupportPriority,
  type SupportStatus,
  type SupportTicket,
} from "./supportDataset";

type SupportView = "requests" | "create";

interface TicketDraft {
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  affectedEntityId: string;
  description: string;
}

const EMPTY_DRAFT: TicketDraft = {
  subject: "",
  category: "Technical issue",
  priority: "Normal",
  affectedEntityId: "",
  description: "",
};

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(parsed));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusClass(status: SupportStatus): string {
  return `admin-support-status admin-support-status-${status.toLowerCase().replaceAll(" ", "-")}`;
}

function priorityClass(priority: SupportPriority): string {
  return `admin-support-priority admin-support-priority-${priority.toLowerCase()}`;
}

function AdminHelpSupportPage() {
  const { session } = useAuthProvider();
  const location = useLocation();
  const instituteId = useMemo(() => resolveAdminInstituteId(session.idToken), [session.idToken]);
  const submittedBy = session.user?.email ?? "Institute administrator";
  const [view, setView] = useState<SupportView>("requests");
  const [tickets, setTickets] = useState<SupportTicket[]>(() => loadSupportTickets());
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SupportStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<SupportCategory | "all">("all");
  const [draft, setDraft] = useState<TicketDraft>(EMPTY_DRAFT);
  const [draftAttachments, setDraftAttachments] = useState<SupportAttachment[]>([]);
  const [draftAttachmentKey, setDraftAttachmentKey] = useState(0);
  const [reply, setReply] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<SupportAttachment[]>([]);
  const [replyAttachmentKey, setReplyAttachmentKey] = useState(0);
  const [message, setMessage] = useState("");

  useEffect(() => {
    persistSupportTickets(tickets);
  }, [tickets]);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
  const filteredTickets = tickets.filter((ticket) => {
    if (statusFilter !== "all" && ticket.status !== statusFilter) return false;
    if (categoryFilter !== "all" && ticket.category !== categoryFilter) return false;
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return [ticket.id, ticket.subject, ticket.category, ticket.assignedTeam]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
  const openCount = tickets.filter(
    (ticket) => ticket.status === "Open" || ticket.status === "In progress",
  ).length;
  const awaitingCount = tickets.filter((ticket) => ticket.status === "Awaiting institute").length;
  const urgentCount = tickets.filter(
    (ticket) => ticket.priority === "Urgent" && ticket.status !== "Closed",
  ).length;
  const resolvedCount = tickets.filter(
    (ticket) => ticket.status === "Resolved" || ticket.status === "Closed",
  ).length;

  function addDraftAttachments(files: FileList | null) {
    if (!files) return;
    setDraftAttachments((current) =>
      [...current, ...toSupportAttachments(Array.from(files))].slice(0, 5),
    );
  }

  function submitTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.subject.trim() || !draft.description.trim()) {
      setMessage("Subject and description are required.");
      return;
    }
    const ticket = createSupportTicket({
      subject: draft.subject,
      description: draft.description,
      category: draft.category,
      priority: draft.priority,
      affectedEntityId: draft.affectedEntityId,
      attachments: draftAttachments,
      context: {
        instituteId,
        submittedBy,
        sourceRoute: location.pathname,
        browser: navigator.userAgent,
        capturedAt: new Date().toISOString(),
      },
    });
    setTickets((current) => [ticket, ...current]);
    setSelectedTicketId(ticket.id);
    setDraft(EMPTY_DRAFT);
    setDraftAttachments([]);
    setDraftAttachmentKey((current) => current + 1);
    setView("requests");
    setMessage(`${ticket.id} created and routed to ${ticket.assignedTeam}.`);
  }

  function updateTicketStatus(status: SupportStatus) {
    if (!selectedTicket) return;
    const updatedAt = new Date().toISOString();
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === selectedTicket.id
          ? {
              ...ticket,
              status,
              updatedAt,
              messages: [
                ...ticket.messages,
                {
                  id: `status-${Date.now()}`,
                  author: submittedBy,
                  authorType: "system" as const,
                  body: `Status changed to ${status}.`,
                  createdAt: updatedAt,
                  attachments: [],
                },
              ],
            }
          : ticket,
      ),
    );
    setMessage(`${selectedTicket.id} marked ${status.toLowerCase()}.`);
  }

  function addReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicket || !reply.trim()) return;
    const updatedAt = new Date().toISOString();
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === selectedTicket.id
          ? {
              ...ticket,
              status:
                ticket.status === "Awaiting institute" ? ("In progress" as const) : ticket.status,
              updatedAt,
              messages: [
                ...ticket.messages,
                {
                  id: `reply-${Date.now()}`,
                  author: submittedBy,
                  authorType: "institute" as const,
                  body: reply.trim(),
                  createdAt: updatedAt,
                  attachments: replyAttachments,
                },
              ],
            }
          : ticket,
      ),
    );
    setReply("");
    setReplyAttachments([]);
    setReplyAttachmentKey((current) => current + 1);
    setMessage(`Reply added to ${selectedTicket.id}.`);
  }

  return (
    <section
      className="admin-content-card admin-support-page"
      aria-labelledby="admin-help-support-title"
    >
      <header className="admin-support-heading">
        <div>
          <p className="admin-content-eyebrow">Institute support</p>
          <h2 id="admin-help-support-title">Help &amp; Support</h2>
          <p>Track institute requests and continue conversations with the assigned support team.</p>
        </div>
        <button type="button" className="admin-primary-link" onClick={() => setView("create")}>
          Create Support Request
        </button>
      </header>

      <nav className="admin-support-tabs" aria-label="Support views">
        <button
          type="button"
          className={view === "requests" ? "admin-support-tab-active" : ""}
          onClick={() => setView("requests")}
        >
          Requests
        </button>
        <button
          type="button"
          className={view === "create" ? "admin-support-tab-active" : ""}
          onClick={() => setView("create")}
        >
          New Request
        </button>
      </nav>

      {message ? (
        <p className="admin-support-message" role="status">
          {message}
        </p>
      ) : null}

      {view === "create" ? (
        <div className="admin-support-create-layout">
          <form className="admin-support-create-form" onSubmit={submitTicket}>
            <header>
              <h3>Create support request</h3>
              <span>Fields marked required must be completed.</span>
            </header>
            <div className="admin-support-form-grid">
              <UiFormField label="Category" htmlFor="support-category">
                <select
                  id="support-category"
                  value={draft.category}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      category: event.target.value as SupportCategory,
                    }))
                  }
                >
                  {SUPPORT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </UiFormField>
              <UiFormField label="Priority" htmlFor="support-priority">
                <select
                  id="support-priority"
                  value={draft.priority}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      priority: event.target.value as SupportPriority,
                    }))
                  }
                >
                  {SUPPORT_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </UiFormField>
              <UiFormField label="Subject" htmlFor="support-subject">
                <input
                  id="support-subject"
                  value={draft.subject}
                  maxLength={120}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, subject: event.target.value }))
                  }
                  required
                />
              </UiFormField>
              <UiFormField
                label="Affected ID"
                htmlFor="support-entity"
                helper="Student, test, assignment, run, upload, or invoice ID when applicable."
              >
                <input
                  id="support-entity"
                  value={draft.affectedEntityId}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, affectedEntityId: event.target.value }))
                  }
                />
              </UiFormField>
              <UiFormField label="Description" htmlFor="support-description">
                <textarea
                  id="support-description"
                  value={draft.description}
                  rows={7}
                  maxLength={2500}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, description: event.target.value }))
                  }
                  required
                />
              </UiFormField>
              <UiFormField
                label="Attachments"
                htmlFor="support-attachments"
                helper="Up to five screenshots or supporting files."
              >
                <input
                  key={draftAttachmentKey}
                  id="support-attachments"
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,.pdf,.csv,.xlsx"
                  onChange={(event) => addDraftAttachments(event.target.files)}
                />
              </UiFormField>
            </div>
            {draftAttachments.length ? (
              <div className="admin-support-attachment-list">
                {draftAttachments.map((attachment) => (
                  <span key={attachment.id}>
                    {attachment.name}
                    <small>{formatFileSize(attachment.size)}</small>
                    <button
                      type="button"
                      aria-label={`Remove ${attachment.name}`}
                      onClick={() =>
                        setDraftAttachments((current) =>
                          current.filter((item) => item.id !== attachment.id),
                        )
                      }
                    >
                      X
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <footer>
              <button type="button" onClick={() => setView("requests")}>
                Cancel
              </button>
              <button type="submit" className="admin-primary-link">
                Submit Request
              </button>
            </footer>
          </form>
          <aside className="admin-support-context-panel">
            <h3>Request context</h3>
            <dl>
              <div>
                <dt>Institute</dt>
                <dd>{instituteId}</dd>
              </div>
              <div>
                <dt>Submitted by</dt>
                <dd>{submittedBy}</dd>
              </div>
              <div>
                <dt>Source route</dt>
                <dd>{location.pathname}</dd>
              </div>
              <div>
                <dt>Routing</dt>
                <dd>
                  {draft.category === "Licensing or billing"
                    ? "Vendor billing support"
                    : "Support queue"}
                </dd>
              </div>
            </dl>
            <div
              className={`admin-support-priority-note admin-support-priority-note-${draft.priority.toLowerCase()}`}
            >
              <strong>{draft.priority} priority</strong>
              <span>
                Response target is assigned by the vendor support policy after submission.
              </span>
            </div>
          </aside>
        </div>
      ) : (
        <div className="admin-support-requests-view">
          <div className="admin-support-summary">
            <UiStatCard title="Open" value={openCount} helper="Open and in progress" />
            <UiStatCard
              title="Awaiting You"
              value={awaitingCount}
              helper="Institute response required"
            />
            <UiStatCard title="Urgent" value={urgentCount} helper="Urgent and not closed" />
            <UiStatCard title="Resolved" value={resolvedCount} helper="Resolved or closed" />
          </div>
          <section className="admin-support-registry">
            <header>
              <div>
                <h3>Support requests</h3>
                <span>
                  {filteredTickets.length} of {tickets.length}
                </span>
              </div>
              <button type="button" onClick={() => setView("create")}>
                New Request
              </button>
            </header>
            <div className="admin-support-filters">
              <UiFormField label="Search" htmlFor="support-search">
                <input
                  id="support-search"
                  value={query}
                  placeholder="Ticket, subject, category or team"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </UiFormField>
              <UiFormField label="Status" htmlFor="support-status-filter">
                <select
                  id="support-status-filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as SupportStatus | "all")}
                >
                  <option value="all">All statuses</option>
                  {SUPPORT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </UiFormField>
              <UiFormField label="Category" htmlFor="support-category-filter">
                <select
                  id="support-category-filter"
                  value={categoryFilter}
                  onChange={(event) =>
                    setCategoryFilter(event.target.value as SupportCategory | "all")
                  }
                >
                  <option value="all">All categories</option>
                  {SUPPORT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </UiFormField>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("all");
                  setCategoryFilter("all");
                }}
              >
                Reset
              </button>
            </div>
            <div className="admin-support-table-scroll">
              <table className="admin-support-table">
                <thead>
                  <tr>
                    <th>Request</th>
                    <th>Category</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Assigned team</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className={selectedTicketId === ticket.id ? "admin-support-row-selected" : ""}
                    >
                      <td>
                        <button type="button" onClick={() => setSelectedTicketId(ticket.id)}>
                          <strong>{ticket.subject}</strong>
                          <small>{ticket.id}</small>
                        </button>
                      </td>
                      <td>{ticket.category}</td>
                      <td>
                        <span className={priorityClass(ticket.priority)}>{ticket.priority}</span>
                      </td>
                      <td>
                        <span className={statusClass(ticket.status)}>{ticket.status}</span>
                      </td>
                      <td>{formatTimestamp(ticket.updatedAt)}</td>
                      <td>{ticket.assignedTeam}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredTickets.length === 0 ? (
                <p className="admin-support-empty">No requests match the current filters.</p>
              ) : null}
            </div>
          </section>

          {selectedTicket ? (
            <section className="admin-support-ticket-detail">
              <header>
                <div>
                  <p className="admin-content-eyebrow">{selectedTicket.id}</p>
                  <h3>{selectedTicket.subject}</h3>
                  <span>
                    {selectedTicket.category} - {selectedTicket.assignedTeam}
                  </span>
                </div>
                <div>
                  <span className={priorityClass(selectedTicket.priority)}>
                    {selectedTicket.priority}
                  </span>
                  <span className={statusClass(selectedTicket.status)}>
                    {selectedTicket.status}
                  </span>
                  <button
                    type="button"
                    aria-label="Close ticket details"
                    onClick={() => setSelectedTicketId("")}
                  >
                    X
                  </button>
                </div>
              </header>
              <div className="admin-support-ticket-body">
                <div className="admin-support-conversation">
                  <h4>Conversation</h4>
                  {selectedTicket.messages.map((entry) => (
                    <article
                      key={entry.id}
                      className={`admin-support-message-entry admin-support-message-${entry.authorType}`}
                    >
                      <header>
                        <strong>{entry.author}</strong>
                        <time>{formatTimestamp(entry.createdAt)}</time>
                      </header>
                      <p>{entry.body}</p>
                      {entry.attachments.length ? (
                        <div className="admin-support-message-attachments">
                          {entry.attachments.map((attachment) => (
                            <span key={attachment.id}>
                              {attachment.name}
                              <small>{formatFileSize(attachment.size)}</small>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                  {selectedTicket.status !== "Closed" ? (
                    <form className="admin-support-reply" onSubmit={addReply}>
                      <UiFormField label="Reply" htmlFor="support-reply">
                        <textarea
                          id="support-reply"
                          rows={4}
                          value={reply}
                          onChange={(event) => setReply(event.target.value)}
                          required
                        />
                      </UiFormField>
                      <div>
                        <label htmlFor="support-reply-files">Attach files</label>
                        <input
                          key={replyAttachmentKey}
                          id="support-reply-files"
                          type="file"
                          multiple
                          onChange={(event) =>
                            setReplyAttachments(
                              toSupportAttachments(Array.from(event.target.files ?? [])).slice(
                                0,
                                5,
                              ),
                            )
                          }
                        />
                        <button type="submit" className="admin-primary-link">
                          Add Reply
                        </button>
                      </div>
                      {replyAttachments.length ? (
                        <small>
                          {replyAttachments.map((attachment) => attachment.name).join(", ")}
                        </small>
                      ) : null}
                    </form>
                  ) : null}
                </div>
                <aside className="admin-support-ticket-sidebar">
                  <section>
                    <h4>Request details</h4>
                    <dl>
                      <div>
                        <dt>Created</dt>
                        <dd>{formatTimestamp(selectedTicket.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>Last update</dt>
                        <dd>{formatTimestamp(selectedTicket.updatedAt)}</dd>
                      </div>
                      <div>
                        <dt>Affected ID</dt>
                        <dd>{selectedTicket.context.affectedEntityId ?? "Not provided"}</dd>
                      </div>
                      <div>
                        <dt>Source</dt>
                        <dd>{selectedTicket.context.sourceRoute}</dd>
                      </div>
                      <div>
                        <dt>Submitted by</dt>
                        <dd>{selectedTicket.context.submittedBy}</dd>
                      </div>
                    </dl>
                  </section>
                  <section>
                    <h4>Request actions</h4>
                    {selectedTicket.status === "Closed" ? (
                      <button type="button" onClick={() => updateTicketStatus("Open")}>
                        Reopen Request
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => updateTicketStatus("Resolved")}>
                          Mark Resolved
                        </button>
                        <button
                          type="button"
                          className="admin-support-close-action"
                          onClick={() => updateTicketStatus("Closed")}
                        >
                          Close Request
                        </button>
                      </>
                    )}
                  </section>
                </aside>
              </div>
            </section>
          ) : null}

          <footer className="admin-support-availability">
            <div>
              <strong>Support availability</strong>
              <span>
                Response targets and escalation contacts are assigned from the vendor support
                policy.
              </span>
            </div>
            <dl>
              <div>
                <dt>Normal</dt>
                <dd>Standard queue</dd>
              </div>
              <div>
                <dt>High</dt>
                <dd>Priority queue</dd>
              </div>
              <div>
                <dt>Urgent</dt>
                <dd>Immediate triage queue</dd>
              </div>
            </dl>
          </footer>
        </div>
      )}
    </section>
  );
}

export default AdminHelpSupportPage;
