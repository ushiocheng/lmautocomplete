let debugEnabled = false;

export function setDebugEnabled(enabled: boolean): void {
    debugEnabled = enabled;
}

export function isDebugEnabled(): boolean {
    return debugEnabled;
}

export function printIfDebug(scope: string, message: string, payload?: unknown): void {
    if (!debugEnabled) return;

    if (payload === undefined) {
        console.log(`[DEBUG] [${scope}] ${message}`);
        return;
    }

    try {
        console.log(`[DEBUG] [${scope}] ${message} ${JSON.stringify(payload)}`);
    } catch {
        console.log(`[DEBUG] [${scope}] ${message}`);
    }
}

export function printFunctionCall(functionName: string, payload?: unknown): void {
    printIfDebug(functionName, "is called", payload);
}
