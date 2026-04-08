import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { printFunctionCall, printIfDebug } from "../core/debug.js";
import type { AppConfig } from "../Interfaces/types.js";
import chalk from "chalk";

const CONFIG_PATH = join(homedir(), ".config", "lmautocomplete", "config.json");

const defaultConfig: AppConfig = {
  enableTier0Immediate: true,
  uploadGeneratedTemplates: false,
  classifierEndpoint: {
    enabled: false,
    baseUrl: "",
    model: "",
    apiKey: "",
    timeoutMs: 3000,
  },
  generatorEndpoint: {
    enabled: false,
    baseUrl: "",
    model: "",
    apiKey: "",
    timeoutMs: 5000,
  },
  environmentIndexTtlDays: 7,
  templateRepo: "ushiocheng/lmautocomplete",
  templateRepoRef: "main",
};

export async function configExists(): Promise<boolean> {
  return existsSync(CONFIG_PATH);
}

export async function loadConfig(): Promise<AppConfig> {
  printFunctionCall("config.store.loadConfig");
  try {
    const raw = await readFile(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    return {
      ...defaultConfig,
      ...parsed,
      classifierEndpoint: {
        ...defaultConfig.classifierEndpoint,
        ...parsed.classifierEndpoint,
      },
      generatorEndpoint: {
        ...defaultConfig.generatorEndpoint,
        ...parsed.generatorEndpoint,
      },
    };
  } catch {
    console.log(chalk.yellow(`[Warn] Failed to load config from ${CONFIG_PATH}, using default config.`));
    return defaultConfig;
  } 
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
