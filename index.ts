#!/usr/bin/env bun
import "./load-env.ts";
import {runWakeup} from "./tui/wakeup.ts";
import {Command} from "commander";

const program=new Command();

program
  .name("rift")
  .description("AI-powered agentic CLI coding assistant")
  .version("0.1.0");

  
program
  .command("wakeup")
  .description("Show the banner and launch CLI mode")
  .action(async () => {
    await runWakeup();
  });
await program.parseAsync(process.argv);  