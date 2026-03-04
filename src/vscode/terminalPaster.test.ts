import { formatElementInfo, pasteToTerminal } from './terminalPaster';
import { createElementSelectedMessage } from '../messaging/messageProtocol';
import * as vscode from 'vscode';

describe('terminalPaster', () => {
  describe('formatElementInfo', () => {
    it('formats message with all fields', () => {
      const msg = createElementSelectedMessage(
        'div.card > h2.title',
        'src/app/header.component.html:15',
        '<h2 class="title">Hello</h2>'
      );
      const result = formatElementInfo(msg);
      expect(result).toContain('Element: div.card > h2.title');
      expect(result).toContain('File: src/app/header.component.html:15');
      expect(result).toContain('HTML: <h2 class="title">Hello</h2>');
    });

    it('omits file line when filePath is null', () => {
      const msg = createElementSelectedMessage('div', null, '<div></div>');
      const result = formatElementInfo(msg);
      expect(result).toContain('Element: div');
      expect(result).not.toContain('File:');
      expect(result).toContain('HTML: <div></div>');
    });
  });

  describe('pasteToTerminal', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('sends text to active terminal', () => {
      const msg = createElementSelectedMessage('div', null, '<div></div>');
      pasteToTerminal(msg);
      expect(vscode.window.activeTerminal!.sendText).toHaveBeenCalledWith(
        expect.stringContaining('Element: div'),
        false
      );
    });

    it('creates terminal if none active', () => {
      const original = vscode.window.activeTerminal;
      (vscode.window as any).activeTerminal = null;

      const msg = createElementSelectedMessage('span', null, '<span></span>');
      pasteToTerminal(msg);

      expect(vscode.window.createTerminal).toHaveBeenCalledWith('Element Inspector');

      (vscode.window as any).activeTerminal = original;
    });
  });
});
