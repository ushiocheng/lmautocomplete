export interface ShellIntegration {
    printIntegrationHint(): void;
    editableBuffer(command: string): string;
    executeCommand(command: string): void;
    insertCommand(command: string): void;
}
