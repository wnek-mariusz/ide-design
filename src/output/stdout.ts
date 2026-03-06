import { ElementSelectedMessage, BatchInstructionsMessage } from '../messaging/messageProtocol';

export function formatElementInfo(msg: ElementSelectedMessage): string {
  const lines: string[] = [];
  lines.push(`Element: ${msg.payload.selector}`);
  if (msg.payload.filePath) {
    lines.push(`File: ${msg.payload.filePath}`);
  }
  lines.push(`HTML: ${msg.payload.htmlSnippet}`);
  return lines.join('\n');
}

export function printToStdout(msg: ElementSelectedMessage): void {
  const text = formatElementInfo(msg);
  process.stdout.write(text + '\n');
}

export function formatBatchInstructions(msg: BatchInstructionsMessage): string {
  const sections = msg.payload.instructions.map((item, i) => {
    const lines: string[] = [];
    lines.push(`--- Instruction ${i + 1} ---`);
    lines.push(`Instruction: ${item.instruction}`);
    lines.push(`Element: ${item.selector}`);
    if (item.filePath) {
      lines.push(`File: ${item.filePath}`);
    }
    lines.push(`HTML: ${item.htmlSnippet}`);
    return lines.join('\n');
  });
  return sections.join('\n\n');
}

export function printBatchToStdout(msg: BatchInstructionsMessage): void {
  const text = formatBatchInstructions(msg);
  process.stdout.write(text + '\n');
}
