import { formatElementInfo, printToStdout } from './stdout';
import { createElementSelectedMessage } from '../messaging/messageProtocol';

describe('stdout', () => {
  describe('formatElementInfo', () => {
    it('formats message with all fields', () => {
      const msg = createElementSelectedMessage(
        'div.card > h2.title',
        'src/app/header.component.html:15',
        '<h2 class="title">Hello</h2>'
      );
      const result = formatElementInfo(msg);
      expect(result).toBe(
        'Element: div.card > h2.title\nFile: src/app/header.component.html:15\nHTML: <h2 class="title">Hello</h2>'
      );
    });

    it('omits file line when filePath is null', () => {
      const msg = createElementSelectedMessage('div', null, '<div></div>');
      const result = formatElementInfo(msg);
      expect(result).toBe('Element: div\nHTML: <div></div>');
    });
  });

  describe('printToStdout', () => {
    it('writes formatted element info to stdout', () => {
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const msg = createElementSelectedMessage('div.card', null, '<div class="card"></div>');

      printToStdout(msg);

      expect(writeSpy).toHaveBeenCalledWith(
        'Element: div.card\nHTML: <div class="card"></div>\n'
      );

      writeSpy.mockRestore();
    });
  });
});
