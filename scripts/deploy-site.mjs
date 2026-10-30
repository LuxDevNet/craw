import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const siteDir = path.join(root, "site");
const bucketName = "agnamo-craw";

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(absolute)));
    } else if (entry.isFile()) {
      files.push(absolute);
    }
  }

  return files;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", [command, ...args.map(quoteCmdArg)].join(" ")] : args;
    const commandName = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : command;
    const child = spawn(commandName, commandArgs, {
      cwd: root,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function quoteCmdArg(arg) {
  if (!/[ \t"&|<>^]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

for (const file of await listFiles(siteDir)) {
  const key = path.relative(siteDir, file).split(path.sep).join("/");
  const uploadPath = path.relative(root, file);
  await run("wrangler", ["r2", "object", "put", `${bucketName}/${key}`, "--file", uploadPath, "--remote"]);
}

await run("wrangler", ["deploy"]);
