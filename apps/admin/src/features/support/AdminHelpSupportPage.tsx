import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "react-router-dom";
import { UiFormField, UiStatCard } from "../../../../../shared/ui/components";
import {
  ApiClientError,
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_PRIORITIES,
  SUPPORT_PRIORITY_LABELS,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  SUPPORT_TEAM_LABELS,
  createSupportIdempotencyKey,
  createSupportTicket,
  executeSupportCommand,
  fetchSupportAttachmentDownload,
  fetchSupportTicketDetail,
  fetchSupportTickets,
  lifecycleRequest,
  prepareSupportAttachments,
  reconcileSupportMutation,
  validateSupportFiles,
  type AdminSupportLifecycleAction,
  type AdminSupportTicketDetailResult,
  type AdminSupportTicketListResult,
  type SupportAttachmentRecord,
  type SupportCategory,
  type SupportPriority,
  type SupportTicketStatus,
} from "./supportDataset";
import type { SupportAttachmentUploadIntent } from "../../../../../shared/contracts/adminSupport";

type SupportView = "requests" | "create";
type OptionalFilter<T extends string> = T | "all";

interface TicketDraft {
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  affectedEntityId: string;
  description: string;
}

interface ListFilters {
  ticketReference: string;
  category: OptionalFilter<SupportCategory>;
  priority: OptionalFilter<SupportPriority>;
  status: OptionalFilter<SupportTicketStatus>;
}

interface PreparedRetry {
  idempotencyKey: string;
  attachments: SupportAttachmentUploadIntent[];
}

const EMPTY_DRAFT: TicketDraft = {
  subject: "",
  category: "technical_issue",
  priority: "normal",
  affectedEntityId: "",
  description: "",
};
const EMPTY_FILTERS: ListFilters = {
  ticketReference: "",
  category: "all",
  priority: "all",
  status: "all",
};
const PAGE_SIZE = 25;
const MESSAGE_PAGE_SIZE = 25;

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

function statusClass(status: SupportTicketStatus): string {
  return `admin-support-status admin-support-status-${status.replaceAll("_", "-")}`;
}

function priorityClass(priority: SupportPriority): string {
  return `admin-support-priority admin-support-priority-${priority}`;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) return "Your session is no longer authorized. Sign in again and retry.";
    if (error.status === 403 || error.code === "FORBIDDEN") {
      return "Your current role or license does not permit this support action.";
    }
    if (error.code === "LICENSE_RESTRICTED") {
      return "Support is unavailable for the current license state or layer.";
    }
    if (error.code === "CONFLICT") {
      return "The ticket changed on the server. Reload the ticket before retrying.";
    }
    if (error.code === "VALIDATION_ERROR") return error.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function openAuthorizedDownload(url: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function AdminHelpSupportPage() {
  const location = useLocation();
  const [view, setView] = useState<SupportView>("requests");
  const [filters, setFilters] = useState<ListFilters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<ListFilters>(EMPTY_FILTERS);
  const [listCursors, setListCursors] = useState<(string | null)[]>([null]);
  const [listPage, setListPage] = useState(0);
  const [listRefresh, setListRefresh] = useState(0);
  const [listResult, setListResult] = useState<AdminSupportTicketListResult | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [messageCursors, setMessageCursors] = useState<(string | null)[]>([null]);
  const [messagePage, setMessagePage] = useState(0);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [detail, setDetail] = useState<AdminSupportTicketDetailResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TicketDraft>(EMPTY_DRAFT);
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [draftAttachmentKey, setDraftAttachmentKey] = useState(0);
  const [createRetry, setCreateRetry] = useState<PreparedRetry | null>(null);
  const [reply, setReply] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [replyAttachmentKey, setReplyAttachmentKey] = useState(0);
  const [replyRetry, setReplyRetry] = useState<PreparedRetry | null>(null);
  const [lifecycleRetry, setLifecycleRetry] = useState<{signature: string; key: string} | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentListCursor = listCursors[listPage] ?? null;
  const currentMessageCursor = messageCursors[messagePage] ?? null;

  useEffect(() => {
    let active = true;
    setListLoading(true);
    setListError(null);
    void fetchSupportTickets({
      category: appliedFilters.category === "all" ? undefined : appliedFilters.category,
      cursor: currentListCursor ?? undefined,
      limit: PAGE_SIZE,
      priority: appliedFilters.priority === "all" ? undefined : appliedFilters.priority,
      status: appliedFilters.status === "all" ? undefined : appliedFilters.status,
      ticketReference: appliedFilters.ticketReference.trim() || undefined,
    }).then((result) => {
      if (active) setListResult(result);
    }).catch((error: unknown) => {
      if (active) setListError(errorMessage(error, "Support requests are temporarily unavailable."));
    }).finally(() => {
      if (active) setListLoading(false);
    });
    return () => { active = false; };
  }, [
    appliedFilters.category,
    appliedFilters.priority,
    appliedFilters.status,
    appliedFilters.ticketReference,
    currentListCursor,
    listRefresh,
  ]);

  useEffect(() => {
    if (!selectedTicketId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    setDetailError(null);
    void fetchSupportTicketDetail(selectedTicketId, {
      messageCursor: currentMessageCursor ?? undefined,
      messageLimit: MESSAGE_PAGE_SIZE,
    }).then((result) => {
      if (active) setDetail(result);
    }).catch((error: unknown) => {
      if (active) setDetailError(errorMessage(error, "Ticket detail is temporarily unavailable."));
    }).finally(() => {
      if (active) setDetailLoading(false);
    });
    return () => { active = false; };
  }, [currentMessageCursor, detailRefresh, selectedTicketId]);

  const counts = listResult?.counts;
  const openCount = (counts?.open ?? 0) + (counts?.inProgress ?? 0);
  const resolvedCount = (counts?.resolved ?? 0) + (counts?.closed ?? 0);
  const selectedTicket = detail?.ticket ?? null;
  const actionDisabled = busyAction !== null || detailLoading;
  const canReply = selectedTicket !== null && !["resolved", "closed"].includes(selectedTicket.status);
  const appliedFilterDescription = useMemo(() => {
    const active = [
      appliedFilters.ticketReference.trim() || null,
      appliedFilters.category === "all" ? null : SUPPORT_CATEGORY_LABELS[appliedFilters.category],
      appliedFilters.priority === "all" ? null : SUPPORT_PRIORITY_LABELS[appliedFilters.priority],
      appliedFilters.status === "all" ? null : SUPPORT_STATUS_LABELS[appliedFilters.status],
    ].filter(Boolean);
    return active.length ? active.join(" · ") : "All institute tickets";
  }, [appliedFilters]);

  function resetCreateRetry(): void {
    setCreateRetry(null);
    setNotice(null);
  }

  function replaceDraftFiles(files: FileList | null): void {
    const next = Array.from(files ?? []);
    try {
      validateSupportFiles(next);
      setDraftFiles(next);
      resetCreateRetry();
    } catch (error) {
      setNotice(errorMessage(error, "Attachments are invalid."));
    }
  }

  function replaceReplyFiles(files: FileList | null): void {
    const next = Array.from(files ?? []);
    try {
      validateSupportFiles(next);
      setReplyFiles(next);
      setReplyRetry(null);
      setNotice(null);
    } catch (error) {
      setNotice(errorMessage(error, "Attachments are invalid."));
    }
  }

  async function reloadAfterMutation(
    result: Awaited<ReturnType<typeof createSupportTicket>>,
  ): Promise<void> {
    const reloaded = await reconcileSupportMutation(result);
    setSelectedTicketId(result.ticket.ticketId);
    setMessageCursors([null]);
    setMessagePage(0);
    setDetail(reloaded);
    setListCursors([null]);
    setListPage(0);
    setListRefresh((value) => value + 1);
  }

  async function submitTicket(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (draft.subject.trim().length < 5 || !draft.description.trim()) {
      setNotice("Enter a subject of at least five characters and a description.");
      return;
    }
    setBusyAction("create");
    setNotice(null);
    try {
      const prepared = createRetry ?? {
        attachments: await prepareSupportAttachments(draftFiles),
        idempotencyKey: createSupportIdempotencyKey(),
      };
      if (!createRetry) setCreateRetry(prepared);
      const result = await createSupportTicket({
        affectedEntityId: draft.affectedEntityId.trim() || undefined,
        attachments: prepared.attachments,
        category: draft.category,
        description: draft.description.trim(),
        idempotencyKey: prepared.idempotencyKey,
        priority: draft.priority,
        sourceRoute: location.pathname,
        subject: draft.subject.trim(),
      });
      await reloadAfterMutation(result);
      setDraft(EMPTY_DRAFT);
      setDraftFiles([]);
      setDraftAttachmentKey((value) => value + 1);
      setCreateRetry(null);
      setView("requests");
      setNotice(`${result.ticket.displayId} was confirmed by an authoritative reload; notification ${result.notification.status}.`);
    } catch (error) {
      setNotice(errorMessage(error, "The support request could not be created. Retry with the same request identity."));
    } finally {
      setBusyAction(null);
    }
  }

  async function submitReply(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedTicket || !reply.trim() || !canReply) return;
    setBusyAction("reply");
    setNotice(null);
    try {
      const prepared = replyRetry ?? {
        attachments: await prepareSupportAttachments(replyFiles),
        idempotencyKey: createSupportIdempotencyKey(),
      };
      if (!replyRetry) setReplyRetry(prepared);
      const result = await executeSupportCommand(selectedTicket.ticketId, {
        action: "ADD_INSTITUTE_REPLY",
        attachments: prepared.attachments,
        body: reply.trim(),
        expectedRevision: selectedTicket.revision,
        idempotencyKey: prepared.idempotencyKey,
      });
      await reloadAfterMutation(result);
      setReply("");
      setReplyFiles([]);
      setReplyAttachmentKey((value) => value + 1);
      setReplyRetry(null);
      setNotice(`Reply confirmed on ${result.ticket.displayId}; notification ${result.notification.status}.`);
    } catch (error) {
      setNotice(errorMessage(error, "The reply could not be saved. Reload or retry."));
    } finally {
      setBusyAction(null);
    }
  }

  async function changeLifecycle(action: AdminSupportLifecycleAction): Promise<void> {
    if (!selectedTicket) return;
    const signature = `${selectedTicket.ticketId}:${selectedTicket.revision}:${action}`;
    const retry = lifecycleRetry?.signature === signature ? lifecycleRetry : {
      key: createSupportIdempotencyKey(),
      signature,
    };
    setLifecycleRetry(retry);
    setBusyAction(action);
    setNotice(null);
    try {
      const result = await executeSupportCommand(
        selectedTicket.ticketId,
        lifecycleRequest(action, selectedTicket.revision, retry.key),
      );
      await reloadAfterMutation(result);
      setLifecycleRetry(null);
      setNotice(`${result.ticket.displayId} is now ${SUPPORT_STATUS_LABELS[result.ticket.status]}.`);
    } catch (error) {
      setNotice(errorMessage(error, "The lifecycle change could not be saved. Reload or retry."));
      if (error instanceof ApiClientError && error.code === "CONFLICT") setDetailRefresh((value) => value + 1);
    } finally {
      setBusyAction(null);
    }
  }

  async function downloadAttachment(attachment: SupportAttachmentRecord): Promise<void> {
    if (!selectedTicket || !attachment.downloadAvailable) return;
    setDownloadId(attachment.attachmentId);
    setNotice(null);
    try {
      const result = await fetchSupportAttachmentDownload(selectedTicket.ticketId, attachment.attachmentId);
      if (result.attachmentId !== attachment.attachmentId || result.fileName !== attachment.fileName) {
        throw new Error("Authorized attachment response does not match the selected file.");
      }
      openAuthorizedDownload(result.url, result.fileName);
      setNotice(`Authorized download for ${result.fileName} expires at ${formatTimestamp(result.expiresAt)}.`);
    } catch (error) {
      setNotice(errorMessage(error, "The attachment is currently unavailable."));
    } finally {
      setDownloadId(null);
    }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setAppliedFilters({...filters, ticketReference: filters.ticketReference.trim()});
    setListCursors([null]);
    setListPage(0);
    setSelectedTicketId("");
  }

  return (
    <section className="admin-content-card admin-support-page" aria-labelledby="admin-help-support-title">
      <header className="admin-support-heading">
        <div>
          <p className="admin-content-eyebrow">Institute support</p>
          <h2 id="admin-help-support-title">Help &amp; Support</h2>
          <p>Authoritative institute tickets, private attachments, and support conversations.</p>
        </div>
        <button type="button" className="admin-primary-link" disabled={busyAction !== null} onClick={() => setView("create")}>Create Support Request</button>
      </header>

      <nav className="admin-support-tabs" aria-label="Support views">
        <button type="button" className={view === "requests" ? "admin-support-tab-active" : ""} onClick={() => setView("requests")}>Requests</button>
        <button type="button" className={view === "create" ? "admin-support-tab-active" : ""} onClick={() => setView("create")}>New Request</button>
      </nav>

      {notice ? <p className="admin-support-message" role="status">{notice}</p> : null}

      {view === "create" ? (
        <div className="admin-support-create-layout">
          <form className="admin-support-create-form" onSubmit={(event) => void submitTicket(event)}>
            <header><h3>Create support request</h3><span>Server identity, routing, author, status, and time are authoritative.</span></header>
            <div className="admin-support-form-grid">
              <UiFormField label="Category" htmlFor="support-category">
                <select id="support-category" value={draft.category} disabled={busyAction === "create"} onChange={(event) => { setDraft((current) => ({...current, category: event.target.value as SupportCategory})); resetCreateRetry(); }}>
                  {SUPPORT_CATEGORIES.map((category) => <option key={category} value={category}>{SUPPORT_CATEGORY_LABELS[category]}</option>)}
                </select>
              </UiFormField>
              <UiFormField label="Priority" htmlFor="support-priority">
                <select id="support-priority" value={draft.priority} disabled={busyAction === "create"} onChange={(event) => { setDraft((current) => ({...current, priority: event.target.value as SupportPriority})); resetCreateRetry(); }}>
                  {SUPPORT_PRIORITIES.map((priority) => <option key={priority} value={priority}>{SUPPORT_PRIORITY_LABELS[priority]}</option>)}
                </select>
              </UiFormField>
              <UiFormField label="Subject" htmlFor="support-subject">
                <input id="support-subject" value={draft.subject} minLength={5} maxLength={120} disabled={busyAction === "create"} onChange={(event) => { setDraft((current) => ({...current, subject: event.target.value})); resetCreateRetry(); }} required />
              </UiFormField>
              <UiFormField label="Affected ID" htmlFor="support-entity" helper="Optional Student, test, assignment, run, upload, or invoice ID.">
                <input id="support-entity" value={draft.affectedEntityId} maxLength={128} disabled={busyAction === "create"} onChange={(event) => { setDraft((current) => ({...current, affectedEntityId: event.target.value})); resetCreateRetry(); }} />
              </UiFormField>
              <UiFormField label="Description" htmlFor="support-description">
                <textarea id="support-description" value={draft.description} rows={7} maxLength={2500} disabled={busyAction === "create"} onChange={(event) => { setDraft((current) => ({...current, description: event.target.value})); resetCreateRetry(); }} required />
              </UiFormField>
              <UiFormField label="Attachments" htmlFor="support-attachments" helper="Up to five JPEG, PNG, WebP, or PDF files; 1 MiB each.">
                <input key={draftAttachmentKey} id="support-attachments" type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf" disabled={busyAction === "create"} onChange={(event) => replaceDraftFiles(event.target.files)} />
              </UiFormField>
            </div>
            {draftFiles.length ? <div className="admin-support-attachment-list">{draftFiles.map((file) => <span key={`${file.name}:${file.size}:${file.lastModified}`}>{file.name}<small>{formatFileSize(file.size)}</small><button type="button" aria-label={`Remove ${file.name}`} disabled={busyAction === "create"} onClick={() => { setDraftFiles((current) => current.filter((item) => item !== file)); resetCreateRetry(); }}>X</button></span>)}</div> : null}
            <footer><button type="button" disabled={busyAction === "create"} onClick={() => setView("requests")}>Cancel</button><button type="submit" className="admin-primary-link" disabled={busyAction === "create"}>{busyAction === "create" ? "Submitting..." : "Submit Request"}</button></footer>
          </form>
          <aside className="admin-support-context-panel">
            <h3>Request authority</h3>
            <dl>
              <div><dt>Institute</dt><dd>Derived from your verified session</dd></div>
              <div><dt>Author</dt><dd>Resolved by the server</dd></div>
              <div><dt>Source route</dt><dd>{location.pathname}</dd></div>
              <div><dt>Routing</dt><dd>Assigned by category policy</dd></div>
            </dl>
            <div className={`admin-support-priority-note admin-support-priority-note-${draft.priority}`}><strong>{SUPPORT_PRIORITY_LABELS[draft.priority]} priority</strong><span>Delivery is queued only after the ticket transaction commits.</span></div>
          </aside>
        </div>
      ) : (
        <div className="admin-support-requests-view">
          <div className="admin-support-summary">
            <UiStatCard title="Open" value={openCount} helper="Open and in progress" />
            <UiStatCard title="Awaiting You" value={counts?.awaitingInstitute ?? 0} helper="Institute response required" />
            <UiStatCard title="Urgent" value={counts?.urgentNotClosed ?? 0} helper="Urgent and not closed" />
            <UiStatCard title="Resolved" value={resolvedCount} helper="Resolved or closed" />
          </div>
          <section className="admin-support-registry">
            <header><div><h3>Support requests</h3><span>{appliedFilterDescription}</span></div><button type="button" onClick={() => setView("create")}>New Request</button></header>
            <form className="admin-support-filters" onSubmit={applyFilters}>
              <UiFormField label="Ticket reference" htmlFor="support-search" helper="Exact SUP reference or ticket ID."><input id="support-search" value={filters.ticketReference} placeholder="SUP-..." onChange={(event) => setFilters((current) => ({...current, ticketReference: event.target.value}))} /></UiFormField>
              <UiFormField label="Status" htmlFor="support-status-filter"><select id="support-status-filter" value={filters.status} onChange={(event) => setFilters((current) => ({...current, status: event.target.value as OptionalFilter<SupportTicketStatus>}))}><option value="all">All statuses</option>{SUPPORT_STATUSES.map((status) => <option key={status} value={status}>{SUPPORT_STATUS_LABELS[status]}</option>)}</select></UiFormField>
              <UiFormField label="Category" htmlFor="support-category-filter"><select id="support-category-filter" value={filters.category} onChange={(event) => setFilters((current) => ({...current, category: event.target.value as OptionalFilter<SupportCategory>}))}><option value="all">All categories</option>{SUPPORT_CATEGORIES.map((category) => <option key={category} value={category}>{SUPPORT_CATEGORY_LABELS[category]}</option>)}</select></UiFormField>
              <UiFormField label="Priority" htmlFor="support-priority-filter"><select id="support-priority-filter" value={filters.priority} onChange={(event) => setFilters((current) => ({...current, priority: event.target.value as OptionalFilter<SupportPriority>}))}><option value="all">All priorities</option>{SUPPORT_PRIORITIES.map((priority) => <option key={priority} value={priority}>{SUPPORT_PRIORITY_LABELS[priority]}</option>)}</select></UiFormField>
              <div className="admin-support-filter-actions"><button type="submit" disabled={listLoading}>Apply</button><button type="button" disabled={listLoading} onClick={() => { setFilters(EMPTY_FILTERS); setAppliedFilters(EMPTY_FILTERS); setListCursors([null]); setListPage(0); }}>Reset</button></div>
            </form>
            {listError ? <div className="admin-support-state admin-support-state-error" role="alert"><p>{listError}</p><button type="button" onClick={() => setListRefresh((value) => value + 1)}>Retry loading</button></div> : null}
            {!listError ? <div className="admin-support-table-scroll"><table className="admin-support-table"><thead><tr><th>Request</th><th>Category</th><th>Priority</th><th>Status</th><th>Updated</th><th>Assigned team</th></tr></thead><tbody>{(listResult?.items ?? []).map((ticket) => <tr key={ticket.ticketId} className={selectedTicketId === ticket.ticketId ? "admin-support-row-selected" : ""}><td><button type="button" onClick={() => { setSelectedTicketId(ticket.ticketId); setMessageCursors([null]); setMessagePage(0); }}><strong>{ticket.subject}</strong><small>{ticket.displayId}</small></button></td><td>{SUPPORT_CATEGORY_LABELS[ticket.category]}</td><td><span className={priorityClass(ticket.priority)}>{SUPPORT_PRIORITY_LABELS[ticket.priority]}</span></td><td><span className={statusClass(ticket.status)}>{SUPPORT_STATUS_LABELS[ticket.status]}</span></td><td>{formatTimestamp(ticket.updatedAt)}</td><td>{SUPPORT_TEAM_LABELS[ticket.assignedTeam]}</td></tr>)}</tbody></table>{listLoading ? <p className="admin-support-empty" role="status">Loading authoritative requests...</p> : null}{!listLoading && listResult?.items.length === 0 ? <p className="admin-support-empty">No authoritative requests match these filters.</p> : null}</div> : null}
            {!listError && listResult ? <div className="admin-support-pagination"><button type="button" disabled={listLoading || listPage === 0} onClick={() => setListPage((value) => Math.max(0, value - 1))}>Previous</button><span>Page {listPage + 1}</span><button type="button" disabled={listLoading || !listResult.nextCursor} onClick={() => { if (!listResult.nextCursor) return; setListCursors((current) => current[listPage + 1] ? current : [...current.slice(0, listPage + 1), listResult.nextCursor]); setListPage((value) => value + 1); }}>Next</button></div> : null}
          </section>

          {selectedTicketId ? <section className="admin-support-ticket-detail">
            <header><div><p className="admin-content-eyebrow">{selectedTicket?.displayId ?? "Support ticket"}</p><h3>{selectedTicket?.subject ?? "Loading ticket..."}</h3>{selectedTicket ? <span>{SUPPORT_CATEGORY_LABELS[selectedTicket.category]} - {SUPPORT_TEAM_LABELS[selectedTicket.assignedTeam]}</span> : null}</div><div>{selectedTicket ? <><span className={priorityClass(selectedTicket.priority)}>{SUPPORT_PRIORITY_LABELS[selectedTicket.priority]}</span><span className={statusClass(selectedTicket.status)}>{SUPPORT_STATUS_LABELS[selectedTicket.status]}</span></> : null}<button type="button" aria-label="Close ticket details" onClick={() => setSelectedTicketId("")}>X</button></div></header>
            {detailError ? <div className="admin-support-state admin-support-state-error" role="alert"><p>{detailError}</p><button type="button" onClick={() => setDetailRefresh((value) => value + 1)}>Retry ticket</button></div> : null}
            {detailLoading && !detail ? <p className="admin-support-empty" role="status">Loading authoritative conversation...</p> : null}
            {selectedTicket && detail && !detailError ? <div className="admin-support-ticket-body"><div className="admin-support-conversation"><h4>Conversation</h4>{detail.messages.items.map((entry) => <article key={entry.messageId} className={`admin-support-message-entry admin-support-message-${entry.authorType}`}><header><strong>{entry.authorDisplayName}</strong><time>{formatTimestamp(entry.createdAt)}</time></header><p>{entry.body}</p>{entry.attachments.length ? <div className="admin-support-message-attachments">{entry.attachments.map((attachment) => <button key={attachment.attachmentId} type="button" disabled={!attachment.downloadAvailable || downloadId === attachment.attachmentId} onClick={() => void downloadAttachment(attachment)}>{attachment.fileName}<small>{formatFileSize(attachment.sizeBytes)} · {attachment.downloadAvailable ? (downloadId === attachment.attachmentId ? "Authorizing..." : "Download") : "Unavailable"}</small></button>)}</div> : null}</article>)}<div className="admin-support-pagination"><button type="button" disabled={detailLoading || messagePage === 0} onClick={() => setMessagePage((value) => Math.max(0, value - 1))}>Previous messages</button><span>Message page {messagePage + 1}</span><button type="button" disabled={detailLoading || !detail.messages.nextCursor} onClick={() => { if (!detail.messages.nextCursor) return; setMessageCursors((current) => current[messagePage + 1] ? current : [...current.slice(0, messagePage + 1), detail.messages.nextCursor]); setMessagePage((value) => value + 1); }}>Next messages</button></div>{canReply ? <form className="admin-support-reply" onSubmit={(event) => void submitReply(event)}><UiFormField label="Reply" htmlFor="support-reply"><textarea id="support-reply" rows={4} value={reply} maxLength={2500} disabled={actionDisabled} onChange={(event) => { setReply(event.target.value); setReplyRetry(null); }} required /></UiFormField><div><label htmlFor="support-reply-files">Attach files</label><input key={replyAttachmentKey} id="support-reply-files" type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf" disabled={actionDisabled} onChange={(event) => replaceReplyFiles(event.target.files)} /><button type="submit" className="admin-primary-link" disabled={actionDisabled}>{busyAction === "reply" ? "Saving..." : "Add Reply"}</button></div>{replyFiles.length ? <small>{replyFiles.map((file) => `${file.name} (${formatFileSize(file.size)})`).join(", ")}</small> : null}</form> : <p className="admin-support-state">Reopen this ticket before adding an institute reply.</p>}</div><aside className="admin-support-ticket-sidebar"><section><h4>Request details</h4><dl><div><dt>Created</dt><dd>{formatTimestamp(selectedTicket.createdAt)}</dd></div><div><dt>Last update</dt><dd>{formatTimestamp(selectedTicket.updatedAt)}</dd></div><div><dt>Messages</dt><dd>{selectedTicket.messageCount}</dd></div><div><dt>Revision</dt><dd>{selectedTicket.revision}</dd></div><div><dt>Routing</dt><dd>{SUPPORT_TEAM_LABELS[selectedTicket.assignedTeam]}</dd></div></dl></section><section><h4>Request actions</h4>{["open", "in_progress", "awaiting_institute"].includes(selectedTicket.status) ? <button type="button" disabled={actionDisabled} onClick={() => void changeLifecycle("resolve")}>{busyAction === "resolve" ? "Saving..." : "Mark Resolved"}</button> : null}{selectedTicket.status === "resolved" ? <><button type="button" disabled={actionDisabled} onClick={() => void changeLifecycle("reopen")}>Reopen Request</button><button type="button" className="admin-support-close-action" disabled={actionDisabled} onClick={() => void changeLifecycle("close")}>{busyAction === "close" ? "Saving..." : "Close Request"}</button></> : null}{selectedTicket.status === "closed" ? <button type="button" disabled={actionDisabled} onClick={() => void changeLifecycle("reopen")}>{busyAction === "reopen" ? "Saving..." : "Reopen Request"}</button> : null}<button type="button" disabled={detailLoading || busyAction !== null} onClick={() => setDetailRefresh((value) => value + 1)}>Reload ticket</button></section></aside></div> : null}
          </section> : null}

          <footer className="admin-support-availability"><div><strong>Support availability</strong><span>Responses and lifecycle changes appear only after authoritative backend confirmation.</span></div><dl><div><dt>Normal</dt><dd>Standard queue</dd></div><div><dt>High</dt><dd>Priority queue</dd></div><div><dt>Urgent</dt><dd>Immediate triage</dd></div></dl></footer>
        </div>
      )}
    </section>
  );
}

export default AdminHelpSupportPage;
