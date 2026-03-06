import * as vscode from 'vscode';
import { ElementSelectedMessage, BatchInstructionsMessage } from '../messaging/messageProtocol';
import { formatElementInfo, formatBatchInstructions } from '../output/stdout';

export { formatElementInfo };

export function pasteToTerminal(msg: ElementSelectedMessage): void {
  const text = formatElementInfo(msg);
  let terminal = vscode.window.activeTerminal;

  if (!terminal) {
    terminal = vscode.window.createTerminal('Element Inspector');
  }

  terminal.sendText(text, false);
}

export function pasteBatchToTerminal(msg: BatchInstructionsMessage): void {
  const text = formatBatchInstructions(msg);
  let terminal = vscode.window.activeTerminal;

  if (!terminal) {
    terminal = vscode.window.createTerminal('Element Inspector');
  }

  terminal.sendText(text, false);
}
