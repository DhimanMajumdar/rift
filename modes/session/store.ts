import fs from "node:fs";
import path from "node:path";
import type { ActionLog } from "../agent/types.ts";

export type SessionMode = "agent" | "ask" | "plan";

export interface SessionRecord {
  id: string;
  mode: SessionMode;
  createdAt: string;
  goal: string;
  codebasePath: string;
  actions: ActionLog[];
}

export interface TranscriptChange {
  type: string;
  path: string;
  patch: string | null;
}

export interface TranscriptEntry {
  timestamp: string;
  mode: SessionMode;
  goal: string;
  applied: TranscriptChange[];
  errors: string[];
}

function riftDir(codebasePath: string): string {
  return path.join(codebasePath, ".rift");
}

function sessionsDir(codebasePath: string): string {
  return path.join(riftDir(codebasePath), "sessions");
}

function transcriptPath(codebasePath: string): string {
  return path.join(riftDir(codebasePath), "transcript.jsonl");
}

function reviveActions(actions: ActionLog[]): ActionLog[] {
  return actions.map((a) => ({ ...a, timestamp: new Date(a.timestamp) }));
}

export function saveSession(session: SessionRecord): void {
  const dir = sessionsDir(session.codebasePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${session.id}.json`),
    JSON.stringify(session, null, 2),
    "utf8",
  );
}

export function deleteSession(codebasePath: string, id: string): void {
  fs.rmSync(path.join(sessionsDir(codebasePath), `${id}.json`), { force: true });
}

export function listPendingSessions(codebasePath: string): SessionRecord[] {
  const dir = sessionsDir(codebasePath);
  if (!fs.existsSync(dir)) return [];

  const out: SessionRecord[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = fs.readFileSync(path.join(dir, name), "utf8");
      const parsed = JSON.parse(raw) as SessionRecord;
      out.push({ ...parsed, actions: reviveActions(parsed.actions) });
    } catch {
      // Corrupt/partial session file (e.g. crash mid-write) — skip it.
    }
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function appendTranscript(codebasePath: string, entry: TranscriptEntry): void {
  fs.mkdirSync(riftDir(codebasePath), { recursive: true });
  fs.appendFileSync(transcriptPath(codebasePath), JSON.stringify(entry) + "\n", "utf8");
}

export function readTranscript(codebasePath: string, limit = 10): TranscriptEntry[] {
  const file = transcriptPath(codebasePath);
  if (!fs.existsSync(file)) return [];

  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  return lines
    .slice(-limit)
    .map((l) => JSON.parse(l) as TranscriptEntry)
    .reverse();
}
