import {select , isCancel} from "@clack/prompts";
import chalk from "chalk"
import figlet from "figlet";
import { runCliMode } from "../modes/cli";
import { printSessionUsage } from "../ai/usage.ts";


const BANNER_FONT = 'ANSI Shadow';
const SHADOW = chalk.hex('#5b4d9e');
const FACE = chalk.hex('#e8dcf8').bold;

function printBannerWithShadow(ascii: string) {

  const bannerLines = ascii.replace(/\s+$/, '').split('\n');
  const maxLen = Math.max(...bannerLines.map((l) => l.length), 0);
  const rowWidth = maxLen + 2;

  for (const line of bannerLines) {
    console.log(SHADOW(('  ' + line).padEnd(rowWidth)));
  }
  process.stdout.write(`\x1b[${bannerLines.length}A`);
  for (const line of bannerLines) {
    console.log(FACE(line.padEnd(rowWidth)));
  }
  console.log();
}


export async function runWakeup() {
    let ascii:string;
    try {
        ascii = figlet.textSync("rift" , {font:BANNER_FONT})
    } catch (error) {
        ascii = figlet.textSync("rift" , {font:"Standard"})
    }

    printBannerWithShadow(ascii)

    while (true) {
        const mode=await select({
            message:"Which mode you want to proceed with?",
            options:[
                {value:"cli" , label:"CLI"},
                {value:"exit" , label:"Exit"}
            ]
        })

        if(isCancel(mode) || mode==="exit"){
            printSessionUsage();
            console.log(chalk.red("Goodbye!"))
            return;
        }

        if(mode==="cli"){
            await runCliMode();
        }
    }
}