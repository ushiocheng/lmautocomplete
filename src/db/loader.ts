import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import yaml from "js-yaml";
import { templateEntrySchema } from "../models/schemas.js";
import { printFunctionCall } from "../core/debug.js";
import type {
  DependencyStatus,
  EnvironmentIndex,
  GeneratedTemplateDraft,
  Platform,
  TemplateEntry,
} from "../models/types.js";
import { ReviewState, RiskClass } from "../models/types.js";

const TEMPLATE_DIR = join(homedir(), ".config", "lmautocomplete", "templates");
const BUNDLED_TEMPLATE_DIR = join(process.cwd(), "src", "db", "templates");

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

export async function seedTemplateDbIfEmpty(): Promise<void> {
  printFunctionCall("db.loader.seedTemplateDbIfEmpty");
  await mkdir(TEMPLATE_DIR, { recursive: true });
  const existing = await listTemplateFiles(TEMPLATE_DIR);
  if (existing.length > 0) {
    return;
  }

  const bundled = await listTemplateFiles(BUNDLED_TEMPLATE_DIR);
  for (const file of bundled) {
    const srcPath = join(BUNDLED_TEMPLATE_DIR, file);
    const dstPath = join(TEMPLATE_DIR, file);
    const raw = await readFile(srcPath, "utf-8");
    await writeFile(dstPath, raw, "utf-8");
  }
}

export async function updateTemplatesFromGitHub(
  repo: string,
  ref: string,
): Promise<{ updated: number; templateDir: string }> {
  printFunctionCall("db.loader.updateTemplatesFromGitHub", { repo, ref });
  const apiUrl = `https://api.github.com/repos/${repo}/contents/src/db/templates?ref=${encodeURIComponent(ref)}`;

  const response = await fetch(apiUrl, {
    headers: {
      "User-Agent": "lmautocomplete",
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch templates from GitHub: ${response.status} ${response.statusText}`);
  }

  type ContentFile = { name: string; type: string; download_url: string | null };
  const payload = (await response.json()) as ContentFile[];
  const files = payload.filter(
    (item) => item.type === "file" && (item.name.endsWith(".yaml") || item.name.endsWith(".yml")) && item.download_url,
  );

  await mkdir(TEMPLATE_DIR, { recursive: true });
  let updated = 0;
  for (const file of files) {
    const fileResp = await fetch(file.download_url as string, {
      headers: { "User-Agent": "lmautocomplete" },
    });
    if (!fileResp.ok) {
      continue;
    }
    const raw = await fileResp.text();
    // Validate before writing to local DB.
    templateEntrySchema.parse(yaml.load(raw));
    await writeFile(join(TEMPLATE_DIR, file.name), raw, "utf-8");
    updated += 1;
  }

  return { updated, templateDir: TEMPLATE_DIR };
}

export async function loadTemplates(): Promise<TemplateEntry[]> {
  printFunctionCall("db.loader.loadTemplates");
  await seedTemplateDbIfEmpty();
  return readTemplatesFromDirectory(TEMPLATE_DIR);
}

export function getTemplateForPlatform(
  template: TemplateEntry,
  platform: Platform,
): string | null {
  printFunctionCall("db.loader.getTemplateForPlatform", { intent: template.intent, platform });
  return template.template_by_platform[platform] ?? null;
}

export function getTemplateDependencies(
  template: TemplateEntry,
  platform: Platform,
): string[] {
  printFunctionCall("db.loader.getTemplateDependencies", { intent: template.intent, platform });
  return template.depends_on[platform] ?? [];
}

export function checkDependencyStatus(
  required: string[],
  environment: EnvironmentIndex,
): DependencyStatus {
  printFunctionCall("db.loader.checkDependencyStatus", { requiredCount: required.length });
  const available = new Set([
    ...environment.commands.builtin,
    ...environment.commands.installed,
  ]);
  const missing = required.filter((bin) => !available.has(bin));

  return {
    executable: missing.length === 0,
    required,
    missing,
  };
}

export function findTemplatesByIntent(templates: TemplateEntry[], intent: string): TemplateEntry[] {
  printFunctionCall("db.loader.findTemplatesByIntent", { intent, templateCount: templates.length });
  const lower = intent.toLowerCase();
  return templates.filter((t) => {
    if (t.intent.toLowerCase() === lower) {
      return true;
    }
    return (t.aliases ?? []).some((a) => a.toLowerCase() === lower);
  });
}

export function scoreTemplateTextMatch(template: TemplateEntry, normalizedInput: string): number {
  printFunctionCall("db.loader.scoreTemplateTextMatch", { intent: template.intent });
  const haystack = normalizedInput.toLowerCase();
  let score = 0;

  if (haystack.includes(template.intent.toLowerCase().replace(/_/g, " "))) {
    score += 0.25;
  }

  for (const alias of template.aliases ?? []) {
    if (haystack.includes(alias.toLowerCase())) {
      score += 0.2;
    }
  }

  for (const example of template.examples ?? []) {
    if (haystack.includes(example.toLowerCase())) {
      score += 0.15;
    }
  }

  return Math.min(score, 0.9);
}

export function getTemplateDir(): string {
  printFunctionCall("db.loader.getTemplateDir");
  return TEMPLATE_DIR;
}

function sanitizeIntent(intent: string): string {
  return intent
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_\-\s]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_") || "generated_intent";
}

function normalizeTemplateFilename(intent: string): string {
  const base = sanitizeIntent(intent);
  const suffix = Date.now();
  return `${base}.generated.${suffix}.yaml`;
}

async function findCollisionsByIntent(intent: string): Promise<Array<{ path: string; entry: TemplateEntry }>> {
  const files = await readdir(TEMPLATE_DIR);
  const collisions: Array<{ path: string; entry: TemplateEntry }> = [];

  for (const file of files) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) {
      continue;
    }

    const path = join(TEMPLATE_DIR, file);
    try {
      const raw = await readFile(path, "utf-8");
      const parsed = yaml.load(raw);
      const validated = templateEntrySchema.parse(parsed);
      if (validated.intent === intent) {
        collisions.push({ path, entry: validated });
      }
    } catch {
      // Ignore unreadable/invalid template files during collision scan.
    }
  }

  return collisions;
}

export async function saveGeneratedTemplate(
  platform: Platform,
  draft: GeneratedTemplateDraft,
): Promise<string | null> {
  printFunctionCall("db.loader.saveGeneratedTemplate", { platform, intent: draft.intent });

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
    aliases: [],
    examples: [],
  };

  const validated = templateEntrySchema.parse(entry);
  await mkdir(TEMPLATE_DIR, { recursive: true });

  const collisions = await findCollisionsByIntent(validated.intent);
  const hasNonGeneratedCollision = collisions.some(
    (item) => item.entry.review_state !== ReviewState.Generated,
  );

  if (hasNonGeneratedCollision) {
    return null;
  }

  if (collisions.length > 0) {
    const [target, ...rest] = collisions;
    await writeFile(target.path, yaml.dump(validated, { lineWidth: 120 }), "utf-8");
    for (const extra of rest) {
      await unlink(extra.path);
    }
    return target.path;
  }

  const fileName = normalizeTemplateFilename(validated.intent);
  const path = join(TEMPLATE_DIR, fileName);
  await writeFile(path, yaml.dump(validated, { lineWidth: 120 }), "utf-8");
  return path;
}
