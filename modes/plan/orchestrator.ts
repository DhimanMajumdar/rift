import chalk from "chalk";
import { confirm, isCancel, text } from "@clack/prompts";
import { ToolLoopAgent, stepCountIs } from "ai";
import { getAgentModel } from "../../ai/ai.config.ts";
import { ActionTracker } from "../agent/action-tracker.ts";
import { ToolExecutor } from "../agent/tool-executor.ts";
import { createAgentTools } from "../agent/agent-tools.ts";
import { defaultAgentConfig } from "../agent/types.ts";
import { runApprovalFlow } from "../agent/approval.ts";
import { consumeAgentStream } from "../agent/stream-run.ts";
import { generatePlan } from "./planner.ts";
import { printPlan, selectSteps } from "./selection.ts";
import type { PlanStep } from "./types.ts";
import { createWebTools } from "./web-tools.ts";


function stepPrompt(goal: string, step: PlanStep): string {
  return [`Goal: ${goal}`, `Step: ${step.title}`, step.description].join('\n');
}


export async function runPlanMode(): Promise<void> {
  console.log(chalk.bold("\n🧭 Plan Mode\n"));

  const goal = await text({ message: "What is your goal?" });
  if (isCancel(goal) || !goal.trim()) return;

  let plan;
  try {
    plan = await generatePlan(goal);
  } catch (e) {
    console.log(
      chalk.red(
        `\nPlanning failed: ${e instanceof Error ? e.message : String(e)}\n`,
      ),
    );
    return;
  }

  printPlan(plan);

  const selected = await selectSteps(plan);
  if (selected.length === 0) return;

  const proceed = await confirm({
    message: `Execute ${selected.length} step(s)`,
    initialValue: true,
  });
  if (isCancel(proceed) || !proceed) return;

  const config = defaultAgentConfig();
  const tracker = new ActionTracker();
  const executor = new ToolExecutor(tracker, config);


  const tools = {
    ...createAgentTools(executor),
    ...createWebTools(tracker)
  };

  for (const step of selected) {
    console.log(chalk.bold(`\n🔧 ${step.title}\n`));

    const agent = new ToolLoopAgent({
      model:getAgentModel(),
      stopWhen:stepCountIs(30),
      tools
    });

    try {
      const streamResult = await agent.stream({
        prompt: stepPrompt(plan.goal, step),
      });
      await consumeAgentStream(streamResult.stream);
      console.log(chalk.dim(`\nStep finished: ${step.title}\n`));
    } catch (e) {
      console.log(
        chalk.red(
          `\nStep failed: ${step.title}: ${e instanceof Error ? e.message : String(e)}\n`,
        ),
      );
    }

  }

  const ok = await runApprovalFlow(tracker);

  if(!ok) return executor.clearStaging();

   const { errors } = executor.applyApprovedFromTracker();
  if (errors.length) {
    console.log(chalk.red('\nSome operations reported errors:\n'));
    for (const e of errors) console.log(chalk.red(`  • ${e}`));
  } else {
    console.log(chalk.green('\n✓ Applied.\n'));
  }
  executor.clearStaging();
}