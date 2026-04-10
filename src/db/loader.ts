import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import yaml from "js-yaml";
import { templateEntrySchema } from "../Interfaces/schemas.js";
import { printFunctionCall } from "../core/debug.js";
import type { GeneratedTemplateDraft, Platform, TemplateEntry } from "../Interfaces/types.js";
import { ReviewState, RiskClass } from "../Interfaces/types.js";
import { copyFile } from "node:fs/promises";
import { loadConfig } from "../config/store.js";
import chalk from "chalk";

const TEMPLATE_DIR = join(homedir(), ".config", "lmautocomplete", "templates");
const DEV_TEMPLATE_DIR = join(process.cwd(), "src", "db", "templates");
// const TEMPLATE_INDEX = join(homedir(), ".config", "lmautocomplete", "cache", "templates-index.json");
// todo: implement template index and lazy loading
let templates: TemplateEntry[] | null = null;

async function readTemplatesFromDirectory(dir: string): Promise<TemplateEntry[]> {
    const files = await readdir(dir);
    const templates: TemplateEntry[] = [];

    for (const file of files) {
        if (!file.endsWith(".yaml") && !file.endsWith(".yml")) {
            continue;
        }
        const raw = await readFile(join(dir, file), "utf-8");
        const parsed = yaml.load(raw);
        const validated = templateEntrySchema.parse(parsed);
        templates.push(validated);
    }

    return templates;
}

async function listTemplateFiles(dir: string): Promise<string[]> {
    try {
        const files = await readdir(dir);
        return files.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
    } catch {
        return [];
    }
}

async function seedTemplateDbIfEmpty(): Promise<void> {
    printFunctionCall("db.loader.seedTemplateDbIfEmpty");
    await mkdir(TEMPLATE_DIR, { recursive: true });
    const existing = await listTemplateFiles(TEMPLATE_DIR);
    if (existing.length > 0) {
        return;
    }

    const bundled = await listTemplateFiles(DEV_TEMPLATE_DIR);
    for (const file of bundled) {
        const srcPath = join(DEV_TEMPLATE_DIR, file); // todo: find a way to distribute template files
        const dstPath = join(TEMPLATE_DIR, file);
        await copyFile(srcPath, dstPath);
    }
}

function uploadTemplates(template: TemplateEntry) {
    // todo: implements some way to upload user-generated templates back
}

function sanitizeIntent(intent: string): string {
    return (
        intent
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9_\-\s]/g, "")
            .replace(/\s+/g, "_")
            .replace(/_+/g, "_") || "generated_intent"
    );
}

function normalizeTemplateFilename(intent: string): string {
    const base = sanitizeIntent(intent);
    const suffix = Date.now();
    return `${base}.generated_${suffix}.yaml`;
}

// ========================================
// ============= Exported Func ============
// ========================================

export async function saveGeneratedTemplate(platform: Platform, draft: GeneratedTemplateDraft): Promise<string | null> {
    printFunctionCall("db.loader.saveGeneratedTemplate", {
        platform,
        intent: draft.intent,
    });

    const entry: TemplateEntry = {
        intent: sanitizeIntent(draft.intent),
        summary: draft.summary,
        slots: draft.slots,
        template_by_platform: {
            [platform]: draft.template,
        },
        depends_on: {
            [platform]: draft.depends_on,
        },
        risk: RiskClass.Unknown,
        review_state: ReviewState.Generated,
    };

    const validated = templateEntrySchema.parse(entry);
    await mkdir(TEMPLATE_DIR, { recursive: true });

    const fileName = normalizeTemplateFilename(validated.intent);
    const path = join(TEMPLATE_DIR, fileName);
    await writeFile(path, yaml.dump(validated, { lineWidth: 120 }), "utf-8");
    if ((await loadConfig()).uploadGeneratedTemplates) {
        uploadTemplates(validated);
    }
    return path;
}

export async function loadTemplates(): Promise<TemplateEntry[]> {
    if (templates) return templates;
    await seedTemplateDbIfEmpty();
    templates = await readTemplatesFromDirectory(TEMPLATE_DIR);
    return templates;
}

export async function findTemplatesByIntent(intent: string): Promise<TemplateEntry | null> {
    let tp;
    if (!templates) {
        tp = await loadTemplates();
    } else {
        tp = templates;
    }
    const lower = intent.toLowerCase();
    for (const t of tp) {
        if (t.intent.toLowerCase() === lower) {
            return t;
        }
    }
    return null;
}

export async function updateTemplates(): Promise<void> {
    // todo: implement this
}
