import { isCancel, text, spinner } from "@clack/prompts";
import chalk from "chalk";
import { defaultAgentConfig } from "./types";
import { ActionTracker } from "./action-tracker";
import { ToolExecutor } from "./tool-executor";
import { createAgentTools } from "./agent-tools";
import { stepCountIs, ToolLoopAgent } from "ai";
import { getAgentModel } from "../../ai";
import { runApprovalFlow } from "./approval";
import { consumeAgentStream } from "./stream-run";
import { formatUsageLine, formatSessionUsageLine } from "../../ai/usage.ts";
import { stageSessionForReview, finalizeSession, recordAppliedTranscript } from "../session/session-flow.ts";

export async function runAgentMode() {
  console.log(chalk.bold("\n Agent Mode\n"));

  const goal = await text({
    message: "What would you like the agent to do?",
    placeholder: "Concrete task for this codebase…",
  });

  if (isCancel(goal) || !goal.trim()) return;

  const config = defaultAgentConfig();
  const tracker = new ActionTracker();
  const executor = new ToolExecutor(tracker, config);
  const tools = createAgentTools(executor);

  const agent = new ToolLoopAgent({
    model: getAgentModel(),
    stopWhen: stepCountIs(40),
    instructions: [
      `Workspace root: ${config.codebasePath}`,
      "All mutations are staged until approval.",
      "Prefer patch_file for small, targeted edits to existing files; use modify_file only for full-file rewrites.",
    ].join("\n"),
    tools,
  });

  console.log(chalk.dim("Agent is thinking…\n"));

  try {
    const streamResult = await agent.stream({ prompt: goal.trim() });
    const run = await consumeAgentStream(streamResult);
    console.log(chalk.dim(`\nAgent finished. ${formatUsageLine(run.usage)}`));
    console.log(formatSessionUsageLine() + "\n");
  } catch (e) {
    console.log(
      chalk.red(`\nAgent failed: ${e instanceof Error ? e.message : String(e)}\n`),
    );
    return executor.clearStaging();
  }

  const sessionId = stageSessionForReview("agent", goal.trim(), config.codebasePath, tracker);

  const ok = await runApprovalFlow(tracker);
  if (!ok) {
    finalizeSession(config.codebasePath, sessionId);
    return executor.clearStaging();
  }

  const applySpinner = spinner();
  applySpinner.start("Applying approved changes…");
  const { errors } = executor.applyApprovedFromTracker();
  applySpinner.stop(errors.length ? "Applied with errors." : "Applied.");
  recordAppliedTranscript("agent", goal.trim(), config.codebasePath, tracker, errors);
  finalizeSession(config.codebasePath, sessionId);

  if (errors.length) {
    console.log(chalk.red("\nSome operations reported errors:\n"));
    for (const e of errors) console.log(chalk.red(`  • ${e}`));
  }

  executor.clearStaging()
}