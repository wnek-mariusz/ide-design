import { injectInspectorScript, isHtmlResponse, INSPECTOR_SCRIPT_PATH } from './injector';

const PROXY_ORIGIN = 'http://localhost:9000';

describe('injector', () => {
  describe('injectInspectorScript', () => {
    it('injects script before </body>', () => {
      const html = '<html><body><h1>Hello</h1></body></html>';
      const result = injectInspectorScript(html, PROXY_ORIGIN);
      expect(result).toContain(`<script src="${PROXY_ORIGIN}${INSPECTOR_SCRIPT_PATH}"></script>`);
      expect(result.indexOf('<script')).toBeLessThan(result.indexOf('</body>'));
    });

    it('injects script before </html> when no </body>', () => {
      const html = '<html><h1>Hello</h1></html>';
      const result = injectInspectorScript(html, PROXY_ORIGIN);
      expect(result).toContain(`<script src="${PROXY_ORIGIN}${INSPECTOR_SCRIPT_PATH}"></script>`);
      expect(result.indexOf('<script')).toBeLessThan(result.indexOf('</html>'));
    });

    it('appends script when no </body> or </html>', () => {
      const html = '<h1>Hello</h1>';
      const result = injectInspectorScript(html, PROXY_ORIGIN);
      expect(result).toContain(`<script src="${PROXY_ORIGIN}${INSPECTOR_SCRIPT_PATH}"></script>`);
      expect(result.startsWith('<h1>Hello</h1>')).toBe(true);
    });

    it('handles empty string', () => {
      const result = injectInspectorScript('', PROXY_ORIGIN);
      expect(result).toContain('<script');
    });

    it('handles full HTML document', () => {
      const html = `<!DOCTYPE html>
<html lang="en">
<head><title>Test</title></head>
<body>
  <div class="app">
    <h1>My App</h1>
  </div>
</body>
</html>`;
      const result = injectInspectorScript(html, PROXY_ORIGIN);
      const scriptIndex = result.indexOf('<script');
      const bodyCloseIndex = result.indexOf('</body>');
      expect(scriptIndex).toBeGreaterThan(-1);
      expect(scriptIndex).toBeLessThan(bodyCloseIndex);
    });
  });

  describe('isHtmlResponse', () => {
    it('returns true for text/html', () => {
      expect(isHtmlResponse('text/html')).toBe(true);
    });

    it('returns true for text/html with charset', () => {
      expect(isHtmlResponse('text/html; charset=utf-8')).toBe(true);
    });

    it('returns false for application/json', () => {
      expect(isHtmlResponse('application/json')).toBe(false);
    });

    it('returns false for text/css', () => {
      expect(isHtmlResponse('text/css')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isHtmlResponse(undefined)).toBe(false);
    });
  });
});
