import chalk from "chalk";
import {select , isCancel} from "@clack/prompts";
import { runAgentMode } from "./agent/orchestrator";

export async function runCliMode() {
    while(true){
        const mode=await select({
            message:"Choose CLI sub-mode",
            options:[
                {value:"agent",label:"Agent Mode"},
                {value:"plan",label:"Plan Mode"},
                {value:"ask",label:"Ask Mode"},
                {value:"back",label:"← Back to main menu"}
            ]
        })
        if(isCancel(mode) || mode==="back"){
            return;
        }
        if(mode==="agent"){
            await runAgentMode();
        }
        if(mode==="ask"){
            console.log(chalk.green("You have selected Ask mode."))
        }
        if(mode==="plan"){
            console.log(chalk.green("You have selected Plan mode."))
        }

        if(mode!=="agent" && mode!=="ask" && mode!=="plan"){
            console.log(chalk.yellow("The mode is not implemented yet. Please choose another mode."));
        }
    }
}