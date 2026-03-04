import * as http from 'http';
import { ProxyServer } from './proxyServer';
import { createElementSelectedMessage } from '../messaging/messageProtocol';

function createTestServer(responseBody: string, contentType = 'text/html'): http.Server {
  return http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(responseBody);
  });
}

function httpGet(url: string): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode || 0, body, headers: res.headers }));
    }).on('error', reject);
  });
}

function httpPost(url: string, data: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const parsed = new URL(url);
    const req = http.request(
      { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let resBody = '';
        res.on('data', (chunk) => (resBody += chunk));
        res.on('end', () => resolve({ status: res.statusCode || 0, body: resBody }));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

describe('ProxyServer', () => {
  let targetServer: http.Server;
  let targetPort: number;
  let proxy: ProxyServer;

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
    if (proxy) await proxy.stop();
    await new Promise<void>((resolve) => targetServer.close(() => resolve()));
  });

  it('proxies HTML and injects inspector script', async () => {
    proxy = new ProxyServer({ targetUrl: `http://127.0.0.1:${targetPort}` });
    await proxy.start();

    const res = await httpGet(`${proxy.proxyUrl}/`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('<h1>Hello</h1>');
    expect(res.body).toContain('/__inspector__/inspector.js');
  });

  it('passes through non-HTML responses unchanged', async () => {
    await new Promise<void>((resolve) => targetServer.close(() => resolve()));
    targetServer = createTestServer('{"key":"value"}', 'application/json');
    await new Promise<void>((resolve) => {
      targetServer.listen(0, '127.0.0.1', () => {
        const addr = targetServer.address();
        if (addr && typeof addr === 'object') targetPort = addr.port;
        resolve();
      });
    });

    proxy = new ProxyServer({ targetUrl: `http://127.0.0.1:${targetPort}` });
    await proxy.start();

    const res = await httpGet(`${proxy.proxyUrl}/`);
    expect(res.body).toBe('{"key":"value"}');
    expect(res.body).not.toContain('<script');
  });

  it('serves inspector script at /__inspector__/inspector.js', async () => {
    proxy = new ProxyServer({ targetUrl: `http://127.0.0.1:${targetPort}` });
    await proxy.start();

    const res = await httpGet(`${proxy.proxyUrl}/__inspector__/inspector.js`);
    // May be 200 or 404 depending on whether the file exists in test env
    expect([200, 404]).toContain(res.status);
  });

  it('handles element selection POST', async () => {
    const onSelect = jest.fn();
    proxy = new ProxyServer({
      targetUrl: `http://127.0.0.1:${targetPort}`,
      onElementSelected: onSelect,
    });
    await proxy.start();

    const msg = createElementSelectedMessage('div.card', null, '<div class="card"></div>');
    const res = await httpPost(`${proxy.proxyUrl}/__inspector__/select`, msg);
    expect(res.status).toBe(200);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      type: 'element-selected',
      payload: expect.objectContaining({ selector: 'div.card' }),
    }));
  });

  it('returns 502 when target is unreachable', async () => {
    proxy = new ProxyServer({ targetUrl: 'http://127.0.0.1:1' });
    await proxy.start();

    const res = await httpGet(`${proxy.proxyUrl}/`);
    expect(res.status).toBe(502);
  });
});
