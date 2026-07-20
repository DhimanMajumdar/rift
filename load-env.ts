import fs from "node:fs";
import path from "node:path";

// Rift is meant to be launched from inside a target project folder, so Bun's
// default cwd-based .env loading won't find Rift's own config. Load the .env
// that sits next to Rift's source instead, without overriding anything that's
// already set in the real environment.
const envPath = path.join(import.meta.dir, ".env");
try {
  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = val;
  }
} catch {
  // No .env next to Rift — fall back to real environment variables.
}
