import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { printFunctionCall } from "../core/debug.js";
import type { AppConfig } from "../models/types.js";

const CONFIG_PATH = join(homedir(), ".config", "lmautocomplete", "config.json");

const defaultConfig: AppConfig = {
  consentGiven: false,
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
  environmentIndexTtlDays: 30,
  templateRepo: "ushiocheng/lmautocomplete",
  templateRepoRef: "main",
};

export async function configExists(): Promise<boolean> {
  printFunctionCall("config.store.configExists");
  try {
    await access(CONFIG_PATH, constants.F_OK);
    return true;
  } catch {
    return false;
  }
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
    return defaultConfig;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  printFunctionCall("config.store.saveConfig");
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

export function getConfigPath(): string {
  printFunctionCall("config.store.getConfigPath");
  return CONFIG_PATH;
}
