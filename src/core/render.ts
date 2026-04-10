import { printFunctionCall } from "./debug.js";
import { askString } from "../cli/utilities.js";

export function renderTemplate(template: string, slots: Record<string, string>): string {
    printFunctionCall("core.render.renderTemplate");
    return template.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_m, slotName: string) => {
        return slots[slotName] ?? `<${slotName}>`;
    });
}

function listMissingSlots(template: string, slots: Record<string, string>): string[] {
    const found = new Set<string>();
    for (const match of template.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)) {
        const key = match[1];
        if (!slots[key]) {
            found.add(key);
        }
    }
    return [...found];
}

export async function editSlots(template: string, slots: Record<string, string>): Promise<Record<string, string>> {
    const out = { ...slots };
    listMissingSlots(template, slots).forEach((slot) => {
        out[slot] = "";
    });
    for (const slot of Object.keys(out)) {
        out[slot] = await askString(`${slot}: `, out[slot] ?? "");
    }
    return out;
}

export async function fillMissingSlotsIfAny(
    template: string,
    slots: Record<string, string>
): Promise<Record<string, string>> {
    const slotsToFill = listMissingSlots(template, slots);
    printFunctionCall("core.render.fillMissingSlots", {
        count: slotsToFill.length,
    });
    if (slotsToFill.length === 0) {
        return slots;
    }

    const out = { ...slots };
    for (const slot of slotsToFill) {
        const value = await askString(`${slot}: `, out[slot] ?? "");
        if (value) {
            out[slot] = value;
        }
    }

    return out;
}
