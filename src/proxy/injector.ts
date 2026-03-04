const INSPECTOR_SCRIPT_PATH = '/__inspector__/inspector.js';
const LIVERELOAD_SSE_PATH = '/__inspector__/livereload';

export function injectInspectorScript(html: string, proxyOrigin: string, inspectionEnabled = false): string {
  const liveReloadScript = `<script>(function(){var es=new EventSource("${proxyOrigin}${LIVERELOAD_SSE_PATH}");es.onmessage=function(e){if(e.data==="reload")location.reload()};es.onerror=function(){setTimeout(function(){location.reload()},1000)}})();</script>`;
  const initStateScript = `<script>window.__INSPECTOR_INITIAL_STATE__=${JSON.stringify({ enabled: inspectionEnabled, proxyOrigin })}</script>`;
  const scriptTag = `${liveReloadScript}\n${initStateScript}\n<script src="${proxyOrigin}${INSPECTOR_SCRIPT_PATH}?v=${Date.now()}"></script>`;

  // Try to inject before </body>
  const bodyCloseIndex = html.lastIndexOf('</body>');
  if (bodyCloseIndex !== -1) {
    return html.slice(0, bodyCloseIndex) + scriptTag + '\n' + html.slice(bodyCloseIndex);
  }

  // Try to inject before </html>
  const htmlCloseIndex = html.lastIndexOf('</html>');
  if (htmlCloseIndex !== -1) {
    return html.slice(0, htmlCloseIndex) + scriptTag + '\n' + html.slice(htmlCloseIndex);
  }

  // Fallback: append to end
  return html + '\n' + scriptTag;
}

export function isHtmlResponse(contentType: string | undefined): boolean {
  if (!contentType) return false;
  return contentType.includes('text/html');
}

export { INSPECTOR_SCRIPT_PATH };
