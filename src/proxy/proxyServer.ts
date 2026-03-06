import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as url from 'url';
import { injectInspectorScript, isHtmlResponse, INSPECTOR_SCRIPT_PATH } from './injector';
import { isElementSelectedMessage, ElementSelectedMessage, isBatchInstructionsMessage, BatchInstructionsMessage } from '../messaging/messageProtocol';
import { LiveReloadManager, LIVERELOAD_SSE_PATH } from './liveReload';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.map': 'application/json',
};

export interface ProxyServerOptions {
  targetUrl?: string;
  staticRoot?: string;
  port?: number;
  watchPath?: string;
  onElementSelected?: (msg: ElementSelectedMessage) => void;
  onBatchInstructions?: (msg: BatchInstructionsMessage) => void;
}

export interface ProxyServerToggleCallback {
  (enabled: boolean): void;
}

export class ProxyServer {
  private server: http.Server | null = null;
  private _port: number = 0;
  private targetUrl: string | null;
  private staticRoot: string | null;
  private onElementSelected?: (msg: ElementSelectedMessage) => void;
  private onBatchInstructions?: (msg: BatchInstructionsMessage) => void;
  private onInspectionToggled?: ProxyServerToggleCallback;
  private liveReload: LiveReloadManager | null = null;
  private eventClients: Set<http.ServerResponse> = new Set();
  private _inspectionEnabled: boolean = false;

  constructor(options: ProxyServerOptions) {
    this.targetUrl = options.targetUrl ? options.targetUrl.replace(/\/$/, '') : null;
    this.staticRoot = options.staticRoot || null;
    this._port = options.port || 0;
    this.onElementSelected = options.onElementSelected;
    this.onBatchInstructions = options.onBatchInstructions;
    if (options.watchPath) {
      this.liveReload = new LiveReloadManager(options.watchPath);
    }
  }

  setOnInspectionToggled(callback: ProxyServerToggleCallback): void {
    this.onInspectionToggled = callback;
  }

  get port(): number {
    return this._port;
  }

  get proxyUrl(): string {
    return `http://localhost:${this._port}`;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res));

      this.server.listen(this._port, '127.0.0.1', () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this._port = addr.port;
        }
        resolve();
      });

      this.server.on('error', reject);

      this.liveReload?.start();
    });
  }

  async stop(): Promise<void> {
    this.liveReload?.stop();
    for (const client of this.eventClients) {
      client.end();
    }
    this.eventClients.clear();
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  toggleInspection(enabled: boolean): void {
    this._inspectionEnabled = enabled;
    const data = JSON.stringify({ enabled });
    for (const client of this.eventClients) {
      client.write(`event: toggle\ndata: ${data}\n\n`);
    }
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const rawUrl = req.url || '/';
    const reqUrl = rawUrl.split('?')[0];

    // Log all inspector requests for debugging
    if (reqUrl.startsWith('/__inspector__/select')) {
      console.log(`[Element Inspector Proxy] ${req.method} ${reqUrl}`);
    }

    // Handle CORS preflight for inspector endpoints
    if (req.method === 'OPTIONS' && reqUrl.startsWith('/__inspector__/')) {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      });
      res.end();
      return;
    }

    // Serve the inspector overlay script
    if (reqUrl === INSPECTOR_SCRIPT_PATH) {
      this.serveInspectorScript(res);
      return;
    }

    // Handle live reload SSE connections
    if (reqUrl === LIVERELOAD_SSE_PATH && this.liveReload) {
      this.liveReload.handleSSE(req, res);
      return;
    }

    // Handle inspector event SSE connections
    if (reqUrl === '/__inspector__/events') {
      this.handleInspectorEvents(req, res);
      return;
    }

    // Handle toggle inspection via POST (from overlay keyboard shortcut)
    if (reqUrl === '/__inspector__/toggle' && req.method === 'POST') {
      this.handleToggleInspection(req, res);
      return;
    }

    // Handle element selection messages via POST
    if (reqUrl === '/__inspector__/select' && req.method === 'POST') {
      this.handleElementSelection(req, res);
      return;
    }

    // Handle element selection via GET (for webview contexts where POST is blocked)
    if (reqUrl.startsWith('/__inspector__/select?') && req.method === 'GET') {
      this.handleElementSelectionGet(req, res, rawUrl);
      return;
    }

    // Handle element selection via SSE (for webview contexts where all other methods are blocked)
    if (reqUrl.startsWith('/__inspector__/select-sse') && req.method === 'GET') {
      this.handleElementSelectionSse(req, res, rawUrl);
      return;
    }

    // Serve static files or proxy to target
    if (this.staticRoot) {
      this.serveStaticFile(req, res, reqUrl);
    } else if (this.targetUrl) {
      this.proxyRequest(req, res, rawUrl);
    } else {
      res.writeHead(500);
      res.end('No target URL or static root configured');
    }
  }

  private serveInspectorScript(res: http.ServerResponse): void {
    // Look for inspector.js in dist/overlay or src/overlay
    const distPath = path.join(__dirname, 'overlay', 'inspector.js');
    const srcPath = path.join(__dirname, '..', 'src', 'overlay', 'inspector.js');
    const scriptPath = fs.existsSync(distPath) ? distPath : srcPath;

    if (fs.existsSync(scriptPath)) {
      const script = fs.readFileSync(scriptPath, 'utf-8');
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(script);
    } else {
      res.writeHead(404);
      res.end('Inspector script not found');
    }
  }

  private handleInspectorEvents(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('data: connected\n\n');

    // Send current inspection state so newly loaded pages sync immediately
    res.write(`event: toggle\ndata: ${JSON.stringify({ enabled: this._inspectionEnabled })}\n\n`);

    this.eventClients.add(res);
    req.on('close', () => this.eventClients.delete(res));
  }

  private handleToggleInspection(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const enabled = !!data.enabled;
        this._inspectionEnabled = enabled;

        // Notify the extension so the status bar stays in sync
        if (this.onInspectionToggled) {
          this.onInspectionToggled(enabled);
        }

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ ok: true, enabled }));
      } catch {
        res.writeHead(400);
        res.end('Invalid JSON');
      }
    });
  }

  private routeInspectorMessage(data: unknown): void {
    if (isElementSelectedMessage(data) && this.onElementSelected) {
      this.onElementSelected(data);
    } else if (isBatchInstructionsMessage(data) && this.onBatchInstructions) {
      this.onBatchInstructions(data);
    }
  }

  private handleElementSelection(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        this.routeInspectorMessage(data);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400);
        res.end('Invalid JSON');
      }
    });
  }

  private handleElementSelectionSse(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    rawUrl: string
  ): void {
    // Extract data from query parameter and process it
    try {
      const parsed = new URL(rawUrl, `http://${req.headers.host}`);
      const encoded = parsed.searchParams.get('d');
      if (encoded) {
        const data = JSON.parse(encoded);
        this.routeInspectorMessage(data);
      }
    } catch {
      // ignore parse errors
    }
    // Respond as SSE so EventSource considers it connected
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('data: ok\n\n');
    res.end();
  }

  private handleElementSelectionGet(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    rawUrl: string
  ): void {
    try {
      const parsed = new URL(rawUrl, `http://${req.headers.host}`);
      const encoded = parsed.searchParams.get('d');
      if (encoded) {
        const data = JSON.parse(encoded);
        this.routeInspectorMessage(data);
      }
    } catch {
      // ignore parse errors
    }
    // Return a 1x1 transparent GIF
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    });
    res.end(pixel);
  }

  private serveStaticFile(
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    reqPath: string
  ): void {
    const urlPath = decodeURIComponent(reqPath.split('?')[0]);
    let filePath = path.join(this.staticRoot!, urlPath);

    // Prevent directory traversal
    if (!filePath.startsWith(this.staticRoot!)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    // If path is a directory, try index.html
    try {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
    } catch {
      // File doesn't exist, will be handled below
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 - Not Found</h1>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    if (contentType === 'text/html') {
      // Read HTML and inject inspector scripts
      const html = fs.readFileSync(filePath, 'utf-8');
      const modified = injectInspectorScript(html, this.proxyUrl, this._inspectionEnabled);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(modified);
    } else {
      // Stream non-HTML files directly
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': stat.size,
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  }

  private proxyRequest(
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    reqPath: string
  ): void {
    const targetParsed = url.parse(this.targetUrl!);
    const forwardHeaders = { ...clientReq.headers, host: targetParsed.host || '' };
    // Prevent compressed responses so we can safely read and inject into HTML
    delete forwardHeaders['accept-encoding'];
    const options: http.RequestOptions = {
      hostname: targetParsed.hostname,
      port: targetParsed.port,
      path: reqPath,
      method: clientReq.method,
      headers: forwardHeaders,
    };

    const proxyReq = http.request(options, (proxyRes) => {
      const contentType = proxyRes.headers['content-type'];

      if (isHtmlResponse(contentType)) {
        // Buffer the HTML response, inject script, then send
        let body = '';
        proxyRes.setEncoding('utf-8');
        proxyRes.on('data', (chunk) => (body += chunk));
        proxyRes.on('end', () => {
          const modified = injectInspectorScript(body, this.proxyUrl, this._inspectionEnabled);
          // Update content-length for the modified response
          const headers = { ...proxyRes.headers };
          delete headers['content-length'];
          delete headers['content-encoding'];
          clientRes.writeHead(proxyRes.statusCode || 200, headers);
          clientRes.end(modified);
        });
      } else {
        // Pass through non-HTML responses
        clientRes.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(clientRes);
      }
    });

    proxyReq.on('error', (err) => {
      clientRes.writeHead(502);
      clientRes.end(`Proxy error: ${err.message}`);
    });

    clientReq.pipe(proxyReq);
  }
}
