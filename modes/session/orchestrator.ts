import chalk from "chalk";
import { select, isCancel } from "@clack/prompts";
import { ActionTracker } from "../agent/action-tracker.ts";
import { ToolExecutor } from "../agent/tool-executor.ts";
import { defaultAgentConfig } from "../agent/types.ts";
import { runApprovalFlow } from "../agent/approval.ts";
import { renderTerminalMarkdown } from "../../tui/terminal-md.ts";
import { listPendingSessions, deleteSession, readTranscript, type SessionRecord } from "./store.ts";
import { recordAppliedTranscript } from "./session-flow.ts";

function clipLabel(s: string, n = 70): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > n ? t.slice(0, n) + "…" : t;
}

async function resumeOne(config: ReturnType<typeof defaultAgentConfig>, session: SessionRecord): Promise<void> {
  const tracker = new ActionTracker(session.actions);
  const executor = new ToolExecutor(tracker, config);

  const ok = await runApprovalFlow(tracker);

  if (ok) {
    const { errors } = executor.applyApprovedFromTracker();
    recordAppliedTranscript(session.mode, session.goal, config.codebasePath, tracker, errors);
    if (errors.length) {
      console.log(chalk.red("\nSome operations reported errors:\n"));
      for (const e of errors) console.log(chalk.red(`  • ${e}`));
    } else {
      console.log(chalk.green("\n✓ Applied.\n"));
    }
  }

  executor.clearStaging();
  deleteSession(config.codebasePath, session.id);
}

// Checks for sessions left mid-review by a crash or closed terminal, and
// offers to pick each one back up (or discard it) before the normal menu.
export async function runResumeSessionsFlow(): Promise<void> {
  const config = defaultAgentConfig();
  const pending = listPendingSessions(config.codebasePath);
  if (pending.length === 0) return;

  console.log(
    chalk.yellow(
      `\nFound ${pending.length} unfinished session${pending.length === 1 ? "" : "s"} from a previous run.\n`,
    ),
  );

  for (const session of pending) {
    const pendingCount = session.actions.filter((a) => a.status === "pending").length;
    const when = new Date(session.createdAt).toLocaleString();

    const choice = await select({
      message: `[${session.mode}] "${clipLabel(session.goal)}" — ${pendingCount} staged change(s), saved ${when}`,
      options: [
        { value: "resume", label: "Resume — review & apply" },
        { value: "discard", label: "Discard — throw away these staged changes" },
        { value: "skip", label: "Skip for now (ask again next launch)" },
      ],
    });

    if (isCancel(choice) || choice === "skip") continue;

    if (choice === "discard") {
      deleteSession(config.codebasePath, session.id);
      console.log(chalk.dim("Discarded.\n"));
      continue;
    }

    await resumeOne(config, session);
  }
}

const TYPE_ICON: Record<string, string> = {
  file_create: "+",
  file_modify: "~",
  file_delete: "-",
  folder_create: "📁",
  tool_execute: "$",
};

function iconFor(type: string): string {
  return TYPE_ICON[type] ?? "•";
}

export async function runViewTranscript(): Promise<void> {
  const config = defaultAgentConfig();
  const entries = readTranscript(config.codebasePath, 15);

  if (entries.length === 0) {
    console.log(chalk.dim("\nNo applied changes recorded yet.\n"));
    return;
  }

  console.log(chalk.bold(`\n📜 Transcript — last ${entries.length} applied run(s)\n`));

  for (const entry of entries) {
    const when = new Date(entry.timestamp).toLocaleString();
    console.log(chalk.bold(`[${entry.mode}] ${when}`));
    console.log(chalk.dim(`  ${clipLabel(entry.goal, 100)}`));
    for (const c of entry.applied) {
      console.log(`  ${iconFor(c.type)} ${c.type}: ${c.path}`);
    }
    for (const e of entry.errors) {
      console.log(chalk.red(`  ✗ error: ${e}`));
    }
    console.log();
  }

  const diffOptions = entries.flatMap((entry, entryIdx) =>
    entry.applied
      .filter((c) => c.patch && c.type !== "tool_execute")
      .map((c, changeIdx) => ({
        value: `${entryIdx}:${changeIdx}`,
        label: `[${entry.mode}] ${c.path} (${new Date(entry.timestamp).toLocaleTimeString()})`,
      })),
  );

  if (diffOptions.length === 0) return;

  const choice = await select({
    message: "View a full diff from this list?",
    options: [{ value: "none", label: "No, back to menu" }, ...diffOptions],
  });

  if (isCancel(choice) || choice === "none") return;

  const [entryIdxStr, changeIdxStr] = String(choice).split(":");
  const entry = entries[Number(entryIdxStr)];
  const patches = entry?.applied.filter((c) => c.patch && c.type !== "tool_execute") ?? [];
  const change = patches[Number(changeIdxStr)];
  if (change?.patch) {
    console.log(renderTerminalMarkdown("```diff\n" + change.patch + "\n```\n"));
  }
}
