import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

export class LiveReloadManager {
  private watcher: fs.FSWatcher | null = null;
  private clients: Set<http.ServerResponse> = new Set();
  private watchPath: string;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceMs: number;

  constructor(watchPath: string, debounceMs = 300) {
    this.watchPath = watchPath;
    this.debounceMs = debounceMs;
  }

  start(): void {
    if (this.watcher) return;

    try {
      this.watcher = fs.watch(this.watchPath, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        if (this.shouldIgnore(filename)) return;
        this.scheduleReload();
      });
    } catch {
      // Silently fail if watch path doesn't exist or can't be watched
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();
  }

  handleSSE(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('data: connected\n\n');

    this.clients.add(res);
    req.on('close', () => this.clients.delete(res));
  }

  private scheduleReload(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.notifyClients();
    }, this.debounceMs);
  }

  private notifyClients(): void {
    for (const client of this.clients) {
      client.write('data: reload\n\n');
    }
  }

  private shouldIgnore(filename: string): boolean {
    const ignored = ['node_modules', '.git', 'dist', '.DS_Store', '.swp', '.swo', '~'];
    const ext = path.extname(filename);
    const base = path.basename(filename);
    return ignored.some(i => filename.includes(i)) || base.startsWith('.') && ext === '' || ext === '.map';
  }
}

export const LIVERELOAD_SSE_PATH = '/__inspector__/livereload';
