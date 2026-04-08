import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { homedir, platform } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { printFunctionCall } from "../core/debug.js";
import type { EnvironmentIndex } from "../models/types.js";

const execFileAsync = promisify(execFile);
const INDEX_PATH = join(homedir(), ".cache", "lmautocomplete", "environment-index.json");

function detectPlatform(): EnvironmentIndex["os"] {
  printFunctionCall("index.environmentIndex.detectPlatform");
  const p = platform();
  if (p === "linux") {
    return "linux";
  }
  if (p === "darwin") {
    return "macos";
  }
  return "unknown";
}

async function detectShell(): Promise<string> {
  printFunctionCall("index.environmentIndex.detectShell");
  if (process.env.SHELL) {
    return process.env.SHELL.split("/").pop() ?? "unknown";
  }
  return "unknown";
}

async function listExecutablesFromPath(): Promise<Set<string>> {
  printFunctionCall("index.environmentIndex.listExecutablesFromPath");
  const result = new Set<string>();
  const pathEnv = process.env.PATH ?? "";
  const dirs = [...new Set(pathEnv.split(":").filter(Boolean))];

  for (const dir of dirs) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() && !entry.isSymbolicLink()) {
          continue;
        }
        const fullPath = join(dir, entry.name);
        try {
          await access(fullPath, constants.X_OK);
          result.add(entry.name);
        } catch {
          // Non-executable entry.
        }
      }
    } catch {
      // Unreadable PATH segment.
    }
  }

  return result;
}

async function listShellBuiltins(shell: string): Promise<Set<string>> {
  printFunctionCall("index.environmentIndex.listShellBuiltins", { shell });
  const out = new Set<string>();
  if (shell !== "bash" && shell !== "zsh") {
    return out;
  }

  try {
    const { stdout } = await execFileAsync(shell, ["-lc", "compgen -b"]);
    for (const line of stdout.split("\n")) {
      const val = line.trim();
      if (val) {
        out.add(val);
      }
    }
  } catch {
    // Builtin detection best effort.
  }

  return out;
}

export async function buildEnvironmentIndex(): Promise<EnvironmentIndex> {
  printFunctionCall("index.environmentIndex.buildEnvironmentIndex");
  const shell = await detectShell();
  const executables = await listExecutablesFromPath();
  const builtins = await listShellBuiltins(shell);
  const installed = [...executables].filter((x) => !builtins.has(x)).sort();

  return {
    generated_at: Math.floor(Date.now() / 1000),
    shell,
    os: detectPlatform(),
    commands: {
      builtin: [...builtins].sort(),
      installed,
    },
  };
}

export async function writeEnvironmentIndex(index: EnvironmentIndex): Promise<void> {
  printFunctionCall("index.environmentIndex.writeEnvironmentIndex");
  await mkdir(dirname(INDEX_PATH), { recursive: true });
  await writeFile(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`, "utf-8");
}

export async function readEnvironmentIndex(): Promise<EnvironmentIndex | null> {
  printFunctionCall("index.environmentIndex.readEnvironmentIndex");
  try {
    const raw = await readFile(INDEX_PATH, "utf-8");
    return JSON.parse(raw) as EnvironmentIndex;
  } catch {
    return null;
  }
}

export async function getEnvironmentIndex(ttlDays: number): Promise<EnvironmentIndex> {
  printFunctionCall("index.environmentIndex.getEnvironmentIndex", { ttlDays });
  const existing = await readEnvironmentIndex();
  const nowSec = Math.floor(Date.now() / 1000);
  const ttlSec = ttlDays * 24 * 60 * 60;

  if (existing && nowSec - existing.generated_at < ttlSec) {
    return existing;
  }

  const rebuilt = await buildEnvironmentIndex();
  await writeEnvironmentIndex(rebuilt);
  return rebuilt;
}

export function getEnvironmentIndexPath(): string {
  printFunctionCall("index.environmentIndex.getEnvironmentIndexPath");
  return INDEX_PATH;
}
