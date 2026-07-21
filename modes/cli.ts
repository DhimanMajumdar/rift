import chalk from "chalk";
import {select , isCancel} from "@clack/prompts";
import { runAgentMode } from "./agent/orchestrator";
import { runAskMode } from "./ask/orchestrator";
import { runPlanMode } from "./plan/orchestrator";
import { printSessionUsage } from "../ai/usage.ts";
import { runResumeSessionsFlow, runViewTranscript } from "./session/orchestrator.ts";

export async function runCliMode() {
    await runResumeSessionsFlow();

    while(true){
        const mode=await select({
            message:"Choose CLI sub-mode",
            options:[
                {value:"agent",label:"Agent Mode"},
                {value:"plan",label:"Plan Mode"},
                {value:"ask",label:"Ask Mode"},
                {value:"transcript",label:"View Transcript"},
                {value:"back",label:"← Back to main menu"},
                {value:"exit",label:"Exit Rift"}
            ]
        })
        if(isCancel(mode) || mode==="back"){
            return;
        }
        if(mode==="exit"){
            printSessionUsage();
            console.log(chalk.red("Goodbye!"));
            process.exit(0);
        }
        if(mode==="agent"){
            await runAgentMode();
        }
        if(mode==="ask"){
            await runAskMode();
        }
        if(mode==="plan"){
            await runPlanMode();
        }
        if(mode==="transcript"){
            await runViewTranscript();
        }

        if(mode!=="agent" && mode!=="ask" && mode!=="plan" && mode!=="transcript"){
            console.log(chalk.yellow("The mode is not implemented yet. Please choose another mode."));
        }
    }
}