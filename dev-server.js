const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 5500;
const WATCH_DIR = path.join(__dirname, 'src');
const SSE_PATH = '/__livereload__';

// --- SSE Live Reload ---
const clients = new Set();
let debounceTimer = null;

fs.watch(WATCH_DIR, { recursive: true }, (_event, filename) => {
  if (!filename || /node_modules|\.git|dist|\.DS_Store|\.map/.test(filename)) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    console.log(`  Changed: ${filename} → reloading`);
    for (const res of clients) res.write('data: reload\n\n');
  }, 300);
});

const RELOAD_SCRIPT = `<script>(function(){var es=new EventSource("${SSE_PATH}");es.onmessage=function(e){if(e.data==="reload")location.reload()};es.onerror=function(){setTimeout(function(){location.reload()},1000)}})();</script>`;

// --- Static File Server ---
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  if (req.url === SSE_PATH) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('data: connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  const filePath = path.join(WATCH_DIR, req.url === '/' ? 'test.html' : req.url);
  if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';
  let content = fs.readFileSync(filePath);

  if (contentType === 'text/html') {
    let html = content.toString();
    const idx = html.lastIndexOf('</body>') ?? html.lastIndexOf('</html>') ?? html.length;
    html = html.slice(0, idx) + RELOAD_SCRIPT + '\n' + html.slice(idx);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(html);
  } else {
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  }
});

server.listen(PORT, () => {
  console.log(`Live server running at http://localhost:${PORT}`);
  console.log(`Watching ${WATCH_DIR} for changes...`);
});
