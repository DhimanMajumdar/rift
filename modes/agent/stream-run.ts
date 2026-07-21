import chalk from "chalk";

export interface StreamedToolCall {
  toolName: string;
  input: unknown;
}

export interface StreamedRun {
  text: string;
  toolCalls: StreamedToolCall[];
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// Consumes an agent's live token stream, printing text deltas as they
// arrive and tool calls/results/errors inline, while accumulating the
// final text and tool-call log for callers that need them afterward.
export async function consumeAgentStream(
  stream: AsyncIterable<any>,
): Promise<StreamedRun> {
  const toolCalls: StreamedToolCall[] = [];
  let text = "";
  let atLineStart = true;

  const ensureNewline = () => {
    if (!atLineStart) {
      process.stdout.write("\n");
      atLineStart = true;
    }
  };

  for await (const part of stream) {
    switch (part.type) {
      case "text-delta": {
        if (part.text) {
          process.stdout.write(part.text);
          text += part.text;
          atLineStart = part.text.endsWith("\n");
        }
        break;
      }
      case "tool-call": {
        ensureNewline();
        const toolName = String(part.toolName);
        toolCalls.push({ toolName, input: part.input });
        const preview = JSON.stringify(part.input ?? {}).slice(0, 120);
        console.log(chalk.dim(`  → ${chalk.bold(toolName)} ${preview}`));
        break;
      }
      case "tool-result": {
        ensureNewline();
        console.log(chalk.green(`  ✓ ${chalk.bold(String(part.toolName))}`));
        break;
      }
      case "tool-error": {
        ensureNewline();
        console.log(
          chalk.red(
            `  ✗ ${chalk.bold(String(part.toolName))}: ${errMessage(part.error)}`,
          ),
        );
        break;
      }
      case "error": {
        ensureNewline();
        console.log(chalk.red(`  error: ${errMessage(part.error)}`));
        break;
      }
      default:
        break;
    }
  }

  ensureNewline();
  return { text: text.trim(), toolCalls };
}
