import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { printFunctionCall } from "./debug.js";

// todo: Review this function
export function renderTemplate(template: string, slots: Record<string, string>): string {
  printFunctionCall("core.render.renderTemplate");
  return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_m, slotName: string) => {
    return slots[slotName] ?? `<${slotName}>`;
  });
}

// todo: Review this function
export function listMissingSlots(template: string, slots: Record<string, string>): string[] {
  printFunctionCall("core.render.listMissingSlots");
  const found = new Set<string>();
  for (const match of template.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)) {
    const key = match[1];
    if (!slots[key]) {
      found.add(key);
    }
  }
  return [...found];
}

// todo: Review this function
export async function fillMissingSlots(slotsToFill: string[], slots: Record<string, string>): Promise<Record<string, string>> {
  printFunctionCall("core.render.fillMissingSlots", { count: slotsToFill.length });
  if (slotsToFill.length === 0) {
    return slots;
  }

  const rl = readline.createInterface({ input, output });
  const out = { ...slots };
  try {
    for (const slot of slotsToFill) {
      const value = (await rl.question(`${slot}: `)).trim();
      if (value) {
        out[slot] = value;
      }
    }
  } finally {
    rl.close();
  }

  return out;
}
