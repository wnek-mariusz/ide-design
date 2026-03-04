import { ElementSelectedMessage } from '../messaging/messageProtocol';

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
