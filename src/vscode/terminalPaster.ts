import * as vscode from 'vscode';
import { ElementSelectedMessage } from '../messaging/messageProtocol';
import { formatElementInfo } from '../output/stdout';

export { formatElementInfo };

export function pasteToTerminal(msg: ElementSelectedMessage): void {
  const text = formatElementInfo(msg);
  let terminal = vscode.window.activeTerminal;

  if (!terminal) {
    terminal = vscode.window.createTerminal('Element Inspector');
  }

  terminal.sendText(text, false);
}
