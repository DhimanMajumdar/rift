# Rift

Rift is a CLI coding agent that stages changes before writing them, shows you exactly what it wants to do, and waits for your approval. Your code, your control. It started as a v1 foundation and has grown from there — this README keeps both chapters visible so you can see how it evolved.

## Why "Rift"

A rift is the gap between your codebase as it is and what you want it to be. Every developer knows that gap — the function that needs refactoring, the error handling that never got added, the tests that don't exist yet. You know what needs to change, but getting there is the hard part.

Rift lives in your terminal, reads your codebase, and closes that gap. No remote control, no phone — just you, your terminal, and an agent that reasons before it touches your files.

<p align="center">
  <img src="images/first.png" alt="Rift main menu" width="49%" />
  <img src="images/two.png" alt="Rift CLI sub-mode menu" width="49%" />
</p>

---

## v1 — the foundation

Rift is a CLI coding agent that stages changes before writing them, shows you exactly what it wants to do, and waits for your approval. Your code, your control.

### Modes

- **Agent Mode** — give it a goal; it plans and executes using file/shell tools, then asks for approval before applying any changes.
- **Plan Mode** — drafts a multi-step plan first (with an optional research pass), lets you pick which steps to run, then executes them one by one.
- **Ask Mode** — read-only Q&A over your codebase (and the web, if configured); can save the answer to a `.md` file.

### How it actually works

Rift never writes to disk or runs a shell command as a side effect of the model "deciding" to. Every mode goes through the same pipeline:

```
LLM tool call → ToolExecutor (staged in memory) → ActionTracker (logs it) → your approval → written to disk
```

1. **Staging.** When the agent calls a tool like `create_file` or `modify_file`, `ToolExecutor` (`modes/agent/tool-executor.ts`) doesn't touch the real filesystem. It writes into an in-memory overlay (a `Map` of path → pending content) and records the action in an `ActionTracker` with status `"pending"`. Read tools (`read_file`, `list_files`, `search_files`, ...) *do* run immediately, since they're side-effect-free — but even reads check every path against a workspace sandbox first.

2. **Sandboxing.** Every path goes through `resolveSafe()`, which resolves it against the workspace root and rejects anything that escapes it — including via a symlink that *looks* like it's inside the workspace but actually points elsewhere (`fs.realpathSync` catches that). File and folder names are also checked against Windows-illegal characters/reserved device names on every OS, so nothing the agent creates breaks if the repo is ever opened on Windows. `excludePatterns` are matched case-insensitively with real glob support and cover dependency/build folders across ecosystems (`node_modules`, `venv`/`.venv`, `__pycache__`, `target`, `vendor`, `.git`, `dist`, `*.log`, `.env*`, ...), so the agent can't wander into files it shouldn't touch.

3. **Context protection.** Every tool result returned to the model is hard-capped in size — a runaway recursive listing or a giant file can't flood the model's context window and kill the run. When output is clipped, the model is told to narrow its query instead. And if an API call does fail mid-run, the error is caught, staged changes are discarded, and you're returned to the menu — no crashes.

4. **Review.** Once the agent finishes (or a plan step finishes), `runApprovalFlow()` (`modes/agent/approval.ts`) shows you every *pending* mutation, grouped by file. You can approve everything at once, or go one-by-one and inspect an actual unified diff for each file (built with the `diff` package's `createTwoFilesPatch`, rendered as syntax-highlighted markdown in the terminal) before accepting or rejecting it.

5. **Apply.** Only actions marked `"approved"` are ever written for real — `applyApprovedFromTracker()` writes files, creates folders, and runs any approved shell commands (via `spawnSync`, using `cmd.exe` explicitly on Windows). Anything rejected or left pending is discarded when the staging overlay is cleared.

Plan Mode adds one extra step in front of this: `planner.ts` runs a *read-only* pass over the codebase (and the web, via Firecrawl, if configured) to draft a structured, numbered plan before any mutation tools are even offered to the model.

### Tech stack — what's used and why

| Tool | Role |
|---|---|
| [Bun](https://bun.com) | Runtime + package manager. Runs TypeScript directly, no build step. |
| TypeScript (strict mode) | The whole codebase — catches the exact class of `undefined`/type bugs that matter most in file/path handling. |
| [`commander`](https://www.npmjs.com/package/commander) | CLI entrypoint/argument parsing (`index.ts`) — defines the `rift wakeup` command. |
| [`@clack/prompts`](https://www.npmjs.com/package/@clack/prompts) | All interactive terminal UI: menus (`select`), text input, confirmations, and the loading spinners shown while the agent is working. |
| [`ai`](https://www.npmjs.com/package/ai) (Vercel AI SDK) | The agent runtime — `ToolLoopAgent` drives the read-tool-call-repeat loop, `generateText` + `Output.object` drives Plan Mode's structured JSON plan output. |
| [`@openrouter/ai-sdk-provider`](https://www.npmjs.com/package/@openrouter/ai-sdk-provider) | Connects the AI SDK to [OpenRouter](https://openrouter.ai), so Rift isn't locked to one model provider — swap `OPENROUTER_DEFAULT_MODEL` to change models. |
| [`zod`](https://www.npmjs.com/package/zod) | Schema validation for every tool's input, and for the structured plan output the model has to conform to. |
| [`@mendable/firecrawl-js`](https://www.npmjs.com/package/@mendable/firecrawl-js) | Powers the optional `web_search` / `web_crawl` tools in Plan/Ask mode. |
| [`diff`](https://www.npmjs.com/package/diff) | Generates the unified diffs shown during the approval review step. |
| [`marked`](https://www.npmjs.com/package/marked) + [`marked-terminal`](https://www.npmjs.com/package/marked-terminal) | Renders the model's markdown responses (and diffs) with proper formatting/colors in the terminal instead of raw text. |
| [`chalk`](https://www.npmjs.com/package/chalk) | Terminal text coloring throughout the CLI. |
| [`figlet`](https://www.npmjs.com/package/figlet) | Renders the ASCII-art "rift" banner on startup. |

### Project structure

```
index.ts                     — CLI entrypoint (commander), defines the `wakeup` command
tui/
  wakeup.ts                  — banner + top-level menu loop (CLI / Exit)
  terminal-md.ts             — markdown → styled terminal output
ai/
  ai.config.ts               — builds the model instance from OpenRouter + env vars
modes/
  cli.ts                     — CLI submenu (Agent / Plan / Ask / Back / Exit)
  agent/
    orchestrator.ts          — Agent Mode: goal → tool loop → approval → apply
    agent-tools.ts            — full read/write tool set exposed to Agent Mode
    tool-executor.ts          — the sandboxed staging engine everything else is built on
    action-tracker.ts         — in-memory log of every action and its approval status
    approval.ts               — interactive review flow (diff view, accept/reject)
    diff-view.ts               — unified diff generation for the approval UI
    types.ts                  — shared config/action types + default sandbox config
  ask/
    orchestrator.ts           — Ask Mode: read-only Q&A, optional save-to-file
  plan/
    orchestrator.ts           — Plan Mode: runs approved steps through the tool loop
    planner.ts                — drafts the structured plan (read-only + optional web research)
    selection.ts               — lets you pick which drafted steps to run
    web-tools.ts                — Firecrawl-backed web_search / web_crawl / fetch_url tools
```

This is v1 — the foundation: staged execution, sandboxing, and the three core modes.

---

## v2 — streaming, patches, cost tracking, sessions, model selection

Built directly on top of v1's staged-execution pipeline, v2 adds:

- **Live streaming.** Agent, Plan, and Ask mode now stream the model's response token-by-token, with tool calls, results, and errors printed inline as they happen — instead of a spinner that sits still and dumps everything at the end.
- **Surgical edits (`patch_file`).** A `str_replace`-style tool alongside `modify_file`: give it an exact snippet and its replacement instead of the whole file. Requires the snippet to be unique in the file (or pass `replace_all`), so it fails loudly instead of editing the wrong spot. The agent is instructed to prefer this for small changes.
- **Token & cost tracking.** Every run shows real token counts and USD cost (via OpenRouter's usage accounting), plus a running session total shown after each run and again on exit.
- **Session persistence & crash recovery.** Staged-but-unreviewed changes are saved to disk before you ever see the approval screen, so an interrupted review is resumable on your next launch instead of silently lost.
- **Transcript log.** Every applied change is recorded with its diff in `.rift/transcript.jsonl`, browsable from a new **View Transcript** menu item.
- **Model selection.** Pick any tool-calling-capable model from OpenRouter's live catalog (or type one manually) right from a new **Select Model** menu item — no more editing `.env` to try a different model. Your choice is saved per-workspace in `.rift/config.json` and takes priority over the `.env` default.

### The pipeline, updated

v1's pipeline gained two steps — a save right before review, and a durable record right after apply:

```
LLM tool call → ToolExecutor (staged) → ActionTracker (logs it) → session saved →
your approval → written to disk → transcript recorded
```

- **Session save** (`stageSessionForReview()` in `modes/session/session-flow.ts`) writes every staged, unreviewed change to `.rift/sessions/` right before the approval screen. If the process is killed mid-review, the next launch detects it and offers **Resume / Discard / Skip** — resuming replays the exact same diffs without re-running the LLM.
- **Transcript recording** (`recordAppliedTranscript()`, same file) appends what was actually written to `.rift/transcript.jsonl` once apply finishes, whether it succeeded or hit errors.
- Sandboxing's `excludePatterns` now also covers `.rift` itself, so the agent can't read or edit its own bookkeeping.

### New files in v2

```
ai/
  model-config.ts            — resolves/persists the active model (.rift/config.json) + fetches OpenRouter's live catalog
  usage.ts                   — per-run and session-wide token/cost tracking and formatting
modes/
  agent/
    stream-run.ts             — consumes an agent's live token stream, printing deltas/tool calls and extracting usage
  session/
    store.ts                  — reads/writes .rift/sessions/*.json and .rift/transcript.jsonl
    session-flow.ts            — stage-before-review, finalize-after-review, and transcript-recording helpers used by all three modes
    orchestrator.ts            — resume-pending-sessions flow (on CLI startup) and the View Transcript viewer
  model/
    orchestrator.ts            — the Select Model picker (browse free / browse all / enter manually)
```

`agent-tools.ts` gained the `patch_file` tool definition, `action-tracker.ts` gained the ability to hydrate from a saved session, and `cli.ts`'s submenu grew two entries (`View Transcript`, `Select Model`) — everything else from v1's project structure is unchanged.

This is v2 — everything from v1, plus a faster feel, safer small edits, real cost visibility, and nothing gets lost if the process dies mid-review. Still on the roadmap: multi-turn conversation (so you can refine a run instead of starting over), git integration with an undo command, a verify-and-repair loop that runs your tests before asking for approval, and a live per-tool permission prompt (Allow Once / Allow for Session / Deny) as an alternative to the batch diff review. Rift is very much alive and actively growing.

---

## Setup

Requires [Bun](https://bun.com).

```bash
bun install
```

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | Auth for [OpenRouter](https://openrouter.ai/keys), used to reach the model |
| `OPENROUTER_DEFAULT_MODEL` | No | Fallback model id if you haven't picked one via the CLI's **Select Model** menu (v2), e.g. `openai/gpt-4o-mini` |
| `FIRECRAWL_API_KEY` | No | Enables web search/crawl tools in Plan/Ask mode |

Rift keeps its own bookkeeping — pending sessions, the applied-changes transcript, and your selected model — in a `.rift/` folder inside whatever workspace you run it in. It's created automatically, excluded from the agent's own file access, and gitignored; nothing in it is meant to be committed.

## Run

```bash
bun run index.ts wakeup
```

This shows the banner and the main menu (`CLI` / `Exit`). Choose `CLI` to pick a mode (`Agent` / `Plan` / `Ask`), view the applied-changes transcript, or switch models. If Rift finds an unfinished session from a previous run (e.g. the process was killed mid-review), it'll offer to resume it before showing the menu.

To install it as a global `rift` command instead:

```bash
bun link
rift wakeup
```
