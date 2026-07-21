import type { ActionLog } from "../agent/types.ts";
import type { ActionTracker } from "../agent/action-tracker.ts";
import { composeBeforeAfter, formatPatch } from "../agent/diff-view.ts";
import {
  appendTranscript,
  deleteSession,
  saveSession,
  type SessionMode,
  type TranscriptChange,
} from "./store.ts";

function clip(s: string, n = 4000): string {
  return s.length > n ? s.slice(0, n) + "\n…[truncated]" : s;
}

// Persists staged-but-unreviewed changes to disk right before the approval
// prompt is shown, so a crash or a closed terminal mid-review is resumable
// on the next launch instead of silently losing the staged work.
export function stageSessionForReview(
  mode: SessionMode,
  goal: string,
  codebasePath: string,
  tracker: ActionTracker,
): string | undefined {
  if (tracker.getPendingMutations().length === 0) return undefined;

  const id = crypto.randomUUID();
  saveSession({
    id,
    mode,
    createdAt: new Date().toISOString(),
    goal,
    codebasePath,
    actions: [...tracker.getActions()],
  });
  return id;
}

// Once approval + apply has run to completion (approved, rejected, or
// cancelled), nothing is left pending — the saved session is resolved.
export function finalizeSession(codebasePath: string, sessionId: string | undefined): void {
  if (sessionId) deleteSession(codebasePath, sessionId);
}

function buildTranscriptEntry(
  mode: SessionMode,
  goal: string,
  actions: ReadonlyArray<ActionLog>,
  errors: string[],
): { timestamp: string; mode: SessionMode; goal: string; applied: TranscriptChange[]; errors: string[] } {
  const approved = actions.filter((a) => a.status === "approved");
  const byPath = new Map<string, ActionLog[]>();
  const shells: ActionLog[] = [];

  for (const a of approved) {
    if (a.type === "tool_execute") {
      shells.push(a);
      continue;
    }
    if (!byPath.has(a.path)) byPath.set(a.path, []);
    byPath.get(a.path)!.push(a);
  }

  const applied: TranscriptChange[] = [];
  for (const [p, acts] of byPath) {
    const sorted = acts.sort((x, y) => x.timestamp.getTime() - y.timestamp.getTime());
    if (sorted.every((x) => x.type === "folder_create")) {
      applied.push({ type: "folder_create", path: p, patch: null });
      continue;
    }
    const { before, after } = composeBeforeAfter(sorted);
    const kinds = [...new Set(sorted.map((x) => x.type))].join(",");
    applied.push({ type: kinds, path: p, patch: clip(formatPatch(p, before, after)) });
  }
  for (const s of shells) {
    applied.push({ type: "tool_execute", path: "shell", patch: s.details.command ?? null });
  }

  return { timestamp: new Date().toISOString(), mode, goal, applied, errors };
}

// Appends an audit-trail entry for what was actually written to disk. Only
// call this after a successful (or attempted) apply.
export function recordAppliedTranscript(
  mode: SessionMode,
  goal: string,
  codebasePath: string,
  tracker: ActionTracker,
  errors: string[],
): void {
  const entry = buildTranscriptEntry(mode, goal, tracker.getActions(), errors);
  if (entry.applied.length === 0) return;
  appendTranscript(codebasePath, entry);
}
