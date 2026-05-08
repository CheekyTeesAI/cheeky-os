/**
 * Operator-approved outbound send queue — file-backed only (no Prisma, no auto-send).
 * Queue file: outputs/send-queue/queue.json under email-intake root.
 */

import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import type { OutreachDraft } from "./outreachDraftEngine";

export type SendQueueState =
  | "DRAFT_REVIEW"
  | "APPROVED"
  | "QUEUED"
  | "BLOCKED"
  | "SENT"
  | "FAILED";

export type SendQueueEntry = {
  id: string;
  type: string;
  priorityScore: number | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  subject: string;
  body: string;
  tone: string | null;
  state: SendQueueState;
  approvedBy: string | null;
  approvedAt: string | null;
  reviewRequired: boolean;
  blockedReason: string | null;
  sourceRef: string;
  sourceType: string;
  reason: string | null;
  suggestedAction: string | null;
  createdAt: string;
  updatedAt: string;
  /** Set when a guarded send is attempted */
  sendAttemptedAt?: string | null;
  sendResult?: string | null;
  sendError?: string | null;
  rawContext: Record<string, unknown>;
};

type QueueFileV1 = {
  version: 1;
  entries: SendQueueEntry[];
};

function queueDir(baseDir: string): string {
  return path.join(baseDir, "outputs", "send-queue");
}

export function queueFilePath(baseDir: string): string {
  return path.join(queueDir(baseDir), "queue.json");
}

function isoNow(): string {
  return new Date().toISOString();
}

function atomicWriteJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  const payload = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmp, payload, "utf8");
  fs.renameSync(tmp, filePath);
}

export function loadQueue(baseDir: string): QueueFileV1 {
  const p = queueFilePath(baseDir);
  if (!fs.existsSync(p)) {
    return { version: 1, entries: [] };
  }
  try {
    const raw = fs.readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as QueueFileV1;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return { version: 1, entries: [] };
    }
    return parsed;
  } catch {
    return { version: 1, entries: [] };
  }
}

export function saveQueue(baseDir: string, q: QueueFileV1): void {
  atomicWriteJson(queueFilePath(baseDir), q);
}

function nextId(): string {
  return `sq_${randomUUID()}`;
}

export function enqueueFromOutreachDraft(
  baseDir: string,
  draft: OutreachDraft,
  opts?: { initialState?: SendQueueState }
): SendQueueEntry {
  const q = loadQueue(baseDir);
  const now = isoNow();
  /** Default: always DRAFT_REVIEW so nothing is “ready to send” without explicit approve + queue. */
  const initial: SendQueueState = opts?.initialState ?? "DRAFT_REVIEW";

  const entry: SendQueueEntry = {
    id: nextId(),
    type: draft.followUpType,
    priorityScore: draft.priorityScore,
    customerName: draft.customerName,
    customerEmail: draft.customerEmail,
    customerPhone: draft.customerPhone,
    subject: draft.subject,
    body: draft.body,
    tone: draft.tone,
    state: initial,
    approvedBy: null,
    approvedAt: null,
    reviewRequired: draft.reviewRequired,
    blockedReason: null,
    sourceRef: draft.sourceRef,
    sourceType: draft.sourceType,
    reason: draft.reason,
    suggestedAction: draft.suggestedAction,
    createdAt: now,
    updatedAt: now,
    rawContext: { ...draft.rawContext, draftWhy: draft.draftWhy },
  };
  q.entries.unshift(entry);
  saveQueue(baseDir, q);
  return entry;
}

const ALLOWED: Record<SendQueueState, SendQueueState[]> = {
  DRAFT_REVIEW: ["APPROVED", "BLOCKED"],
  APPROVED: ["QUEUED", "BLOCKED", "DRAFT_REVIEW"],
  QUEUED: ["SENT", "FAILED", "BLOCKED", "APPROVED"],
  BLOCKED: ["DRAFT_REVIEW", "APPROVED"],
  SENT: [],
  FAILED: ["QUEUED", "BLOCKED", "DRAFT_REVIEW"],
};

function assertTransition(from: SendQueueState, to: SendQueueState): void {
  const ok = ALLOWED[from]?.includes(to);
  if (!ok) {
    throw new Error(`Invalid transition ${from} -> ${to}`);
  }
}

export function approveEntry(
  baseDir: string,
  id: string,
  approvedBy: string
): SendQueueEntry {
  const q = loadQueue(baseDir);
  const i = q.entries.findIndex((e) => e.id === id);
  if (i < 0) throw new Error(`Entry not found: ${id}`);
  const e = q.entries[i];
  assertTransition(e.state, "APPROVED");
  const now = isoNow();
  e.state = "APPROVED";
  e.approvedBy = approvedBy.trim() || "operator";
  e.approvedAt = now;
  e.updatedAt = now;
  e.blockedReason = null;
  saveQueue(baseDir, q);
  return e;
}

export function blockEntry(
  baseDir: string,
  id: string,
  reason: string
): SendQueueEntry {
  const q = loadQueue(baseDir);
  const i = q.entries.findIndex((e) => e.id === id);
  if (i < 0) throw new Error(`Entry not found: ${id}`);
  const e = q.entries[i];
  if (e.state === "SENT") throw new Error("Cannot block SENT entry");
  assertTransition(e.state, "BLOCKED");
  const now = isoNow();
  e.state = "BLOCKED";
  e.blockedReason = reason.trim() || "(blocked)";
  e.updatedAt = now;
  saveQueue(baseDir, q);
  return e;
}

export function queueForSend(
  baseDir: string,
  id: string,
  opts?: { force?: boolean }
): SendQueueEntry {
  const q = loadQueue(baseDir);
  const i = q.entries.findIndex((e) => e.id === id);
  if (i < 0) throw new Error(`Entry not found: ${id}`);
  const e = q.entries[i];
  if (e.reviewRequired && !opts?.force) {
    throw new Error(
      "Entry requires human review — use queue --force after verifying copy and facts"
    );
  }
  assertTransition(e.state, "QUEUED");
  const now = isoNow();
  e.state = "QUEUED";
  e.updatedAt = now;
  saveQueue(baseDir, q);
  return e;
}

/** Label-only: marks as sent in queue file; does not call email APIs. */
export function markSent(
  baseDir: string,
  id: string
): SendQueueEntry {
  const q = loadQueue(baseDir);
  const i = q.entries.findIndex((e) => e.id === id);
  if (i < 0) throw new Error(`Entry not found: ${id}`);
  const e = q.entries[i];
  assertTransition(e.state, "SENT");
  const now = isoNow();
  e.state = "SENT";
  e.updatedAt = now;
  e.sendAttemptedAt = e.sendAttemptedAt ?? now;
  e.sendResult = e.sendResult ?? "marked_sent_manual";
  saveQueue(baseDir, q);
  return e;
}

/**
 * After a real send attempt: QUEUED → SENT or FAILED (never silent).
 */
export function recordSendOutcome(
  baseDir: string,
  id: string,
  outcome: "SENT" | "FAILED",
  opts?: { errorMessage?: string }
): SendQueueEntry {
  const q = loadQueue(baseDir);
  const i = q.entries.findIndex((e) => e.id === id);
  if (i < 0) throw new Error(`Entry not found: ${id}`);
  const e = q.entries[i];
  if (e.state !== "QUEUED") {
    throw new Error(
      `recordSendOutcome requires QUEUED (currently ${e.state})`
    );
  }
  const now = isoNow();
  e.sendAttemptedAt = now;
  e.updatedAt = now;
  if (outcome === "SENT") {
    assertTransition(e.state, "SENT");
    e.state = "SENT";
    e.sendResult = "sent";
    e.sendError = null;
  } else {
    assertTransition(e.state, "FAILED");
    e.state = "FAILED";
    e.sendResult = "failed";
    e.sendError = (opts?.errorMessage ?? "send failed").slice(0, 2000);
  }
  saveQueue(baseDir, q);
  return e;
}

export function getEntryById(
  baseDir: string,
  id: string
): SendQueueEntry | null {
  const q = loadQueue(baseDir);
  return q.entries.find((e) => e.id === id) ?? null;
}

/** FAILED → QUEUED for operator retry (clears last error). */
export function retryFailedToQueued(baseDir: string, id: string): SendQueueEntry {
  const q = loadQueue(baseDir);
  const i = q.entries.findIndex((e) => e.id === id);
  if (i < 0) throw new Error(`Entry not found: ${id}`);
  const e = q.entries[i];
  if (e.state !== "FAILED") {
    throw new Error(`retry expects FAILED (currently ${e.state})`);
  }
  assertTransition(e.state, "QUEUED");
  const now = isoNow();
  e.state = "QUEUED";
  e.sendError = null;
  e.sendResult = null;
  e.sendAttemptedAt = null;
  e.updatedAt = now;
  saveQueue(baseDir, q);
  return e;
}

export function listEntries(
  baseDir: string,
  filter?: { state?: SendQueueState }
): SendQueueEntry[] {
  const q = loadQueue(baseDir);
  if (!filter?.state) return [...q.entries];
  return q.entries.filter((e) => e.state === filter.state);
}

/** QUEUED rows only, oldest first (bounded send order). */
export function listSendableEntries(baseDir: string): SendQueueEntry[] {
  const rows = listEntries(baseDir, { state: "QUEUED" });
  return [...rows].sort(
    (a, b) =>
      new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
  );
}

export function reopenDraftReview(
  baseDir: string,
  id: string
): SendQueueEntry {
  const q = loadQueue(baseDir);
  const i = q.entries.findIndex((e) => e.id === id);
  if (i < 0) throw new Error(`Entry not found: ${id}`);
  const e = q.entries[i];
  if (e.state === "FAILED") {
    throw new Error("FAILED entries: use retry-failed or block");
  }
  if (e.state !== "BLOCKED") {
    throw new Error("reopen only applies to BLOCKED entries");
  }
  assertTransition(e.state, "DRAFT_REVIEW");
  const now = isoNow();
  e.state = "DRAFT_REVIEW";
  e.blockedReason = null;
  e.updatedAt = now;
  saveQueue(baseDir, q);
  return e;
}
