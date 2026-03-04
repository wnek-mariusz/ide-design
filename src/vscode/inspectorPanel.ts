import * as vscode from 'vscode';
import { ElementSelectedMessage, isElementSelectedMessage } from '../messaging/messageProtocol';

let currentPanel: vscode.WebviewPanel | null = null;

export function openInspectorPanel(
  url: string,
  onElementSelected: (msg: ElementSelectedMessage) => void
): vscode.WebviewPanel {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.One);
    currentPanel.webview.html = getWebviewHtml(url);
    return currentPanel;
  }

  const panel = vscode.window.createWebviewPanel(
    'elementInspector',
    'Element Inspector',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  panel.webview.html = getWebviewHtml(url);

  panel.webview.onDidReceiveMessage((message) => {
    if (isElementSelectedMessage(message)) {
      onElementSelected(message);
    }
  });

  panel.onDidDispose(() => {
    currentPanel = null;
  });

  currentPanel = panel;
  return panel;
}

function getWebviewHtml(url: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <iframe id="inspector-frame" src="${url}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
  <script>
    const vscode = acquireVsCodeApi();
    window.addEventListener('message', (e) => {
      if (e.data && e.data.source === 'element-inspector' && e.data.type === 'element-selected') {
        vscode.postMessage(e.data);
      }
    });
  </script>
</body>
</html>`;
}
