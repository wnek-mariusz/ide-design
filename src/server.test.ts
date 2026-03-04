import * as http from 'http';
import { startInspectorServer } from './server';

function createTestServer(responseBody: string, contentType = 'text/html'): http.Server {
  return http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(responseBody);
  });
}

describe('startInspectorServer', () => {
  let targetServer: http.Server;
  let targetPort: number;

  beforeEach(async () => {
    targetServer = createTestServer('<html><body><h1>Hello</h1></body></html>');
    await new Promise<void>((resolve) => {
      targetServer.listen(0, '127.0.0.1', () => {
        const addr = targetServer.address();
        if (addr && typeof addr === 'object') targetPort = addr.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => targetServer.close(() => resolve()));
  });

  it('starts a proxy server for a given target URL', async () => {
    const server = await startInspectorServer({
      targetUrl: `http://127.0.0.1:${targetPort}`,
    });

    expect(server.proxyUrl).toMatch(/^http:\/\/localhost:\d+$/);
    expect(server.targetUrl).toBe(`http://127.0.0.1:${targetPort}`);

    await server.stop();
  });

  it('accepts a custom port', async () => {
    const server = await startInspectorServer({
      targetUrl: `http://127.0.0.1:${targetPort}`,
      port: 0,
    });

    expect(server.proxyUrl).toMatch(/^http:\/\/localhost:\d+$/);
    await server.stop();
  });

  it('invokes onElementSelected callback', async () => {
    const onSelect = jest.fn();
    const server = await startInspectorServer({
      targetUrl: `http://127.0.0.1:${targetPort}`,
      onElementSelected: onSelect,
    });

    const body = JSON.stringify({
      type: 'element-selected',
      source: 'element-inspector',
      payload: { selector: 'div.test', filePath: null, htmlSnippet: '<div class="test"></div>' },
    });

    await new Promise<void>((resolve, reject) => {
      const url = new URL(server.proxyUrl);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: '/__inspector__/select',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve());
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'element-selected',
        payload: expect.objectContaining({ selector: 'div.test' }),
      })
    );

    await server.stop();
  });

  it('throws when neither targetUrl nor staticRoot is provided', async () => {
    await expect(startInspectorServer({})).rejects.toThrow(
      'Either targetUrl or staticRoot must be provided.'
    );
  });
});
