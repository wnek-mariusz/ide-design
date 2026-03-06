import * as vscode from 'vscode';
import * as path from 'path';
import { startInspectorServer, InspectorServer } from '../server';
import { pasteToTerminal, pasteBatchToTerminal } from './terminalPaster';
import { StatusBarManager } from './statusBar';
import { openInspectorPanel } from './inspectorPanel';

let inspectorServer: InspectorServer | null = null;
let statusBar: StatusBarManager | null = null;

export function activate(context: vscode.ExtensionContext): void {
  statusBar = new StatusBarManager();
  statusBar.show();
  context.subscriptions.push({ dispose: () => statusBar?.dispose() });

  // Command: Open Inspector (starts static file server for workspace)
  context.subscriptions.push(
    vscode.commands.registerCommand('element-inspector.openInspector', async () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('Element Inspector: No workspace folder open.');
        return;
      }
      await startInspectorWithStaticServer(workspaceRoot);
    })
  );

  // Command: Open URL manually (proxy to a specific URL)
  context.subscriptions.push(
    vscode.commands.registerCommand('element-inspector.openUrl', async () => {
      const url = await vscode.window.showInputBox({
        prompt: 'Enter the URL to inspect',
        placeHolder: 'http://localhost:4200',
      });
      if (url) await startInspector(url);
    })
  );

  // Command: Open File (from explorer context menu)
  context.subscriptions.push(
    vscode.commands.registerCommand('element-inspector.openFile', async (uri?: vscode.Uri) => {
      if (!uri) return;
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('Element Inspector: No workspace folder open.');
        return;
      }
      const relativePath = path.relative(workspaceRoot, uri.fsPath);
      await startInspectorWithStaticServer(workspaceRoot, '/' + relativePath.split(path.sep).join('/'), true);
    })
  );

  // Command: Toggle inspection
  context.subscriptions.push(
    vscode.commands.registerCommand('element-inspector.toggleInspection', () => {
      if (!statusBar) return;
      const newState = !statusBar.inspectionEnabled;
      statusBar.setInspectionEnabled(newState);

      if (inspectorServer) {
        inspectorServer.toggleInspection(newState);
      }

      vscode.window.showInformationMessage(
        `Element Inspector: Inspection ${newState ? 'ON' : 'OFF'}`
      );
    })
  );
}

async function startInspectorWithStaticServer(staticRoot: string, openPath?: string, enableInspection = false): Promise<void> {
  if (inspectorServer) {
    await inspectorServer.stop();
  }

  try {
    inspectorServer = await startInspectorServer({
      staticRoot,
      watchPath: staticRoot,
      onElementSelected: (msg) => {
        pasteToTerminal(msg);
      },
      onBatchInstructions: (msg) => {
        pasteBatchToTerminal(msg);
      },
    });

    statusBar?.setInspectionEnabled(enableInspection);
    statusBar?.setConnectedUrl(`Live Server (${path.basename(staticRoot)})`);

    inspectorServer.setOnInspectionToggled((enabled) => {
      statusBar?.setInspectionEnabled(enabled);
    });

    if (enableInspection) {
      inspectorServer.toggleInspection(true);
    }

    const browserUrl = openPath
      ? `${inspectorServer.proxyUrl}${openPath}`
      : inspectorServer.proxyUrl;
    openInspectorPanel(browserUrl, (msg) => {
      pasteToTerminal(msg);
    }, (msg) => {
      pasteBatchToTerminal(msg);
    });

    vscode.window.showInformationMessage(
      `Element Inspector: Live server started at ${browserUrl}`
    );
  } catch (err: any) {
    vscode.window.showErrorMessage(`Element Inspector: Failed to start live server — ${err.message}`);
  }
}

async function startInspector(targetUrl: string): Promise<void> {
  if (inspectorServer) {
    await inspectorServer.stop();
  }

  const watchPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  try {
    inspectorServer = await startInspectorServer({
      targetUrl,
      watchPath,
      onElementSelected: (msg) => {
        pasteToTerminal(msg);
      },
      onBatchInstructions: (msg) => {
        pasteBatchToTerminal(msg);
      },
    });

    statusBar?.setInspectionEnabled(false);
    statusBar?.setConnectedUrl(targetUrl);

    inspectorServer.setOnInspectionToggled((enabled) => {
      statusBar?.setInspectionEnabled(enabled);
    });

    openInspectorPanel(inspectorServer.proxyUrl, (msg) => {
      pasteToTerminal(msg);
    }, (msg) => {
      pasteBatchToTerminal(msg);
    });

    vscode.window.showInformationMessage(
      `Element Inspector: Inspecting ${targetUrl} via ${inspectorServer.proxyUrl}`
    );
  } catch (err: any) {
    vscode.window.showErrorMessage(`Element Inspector: Failed to start proxy — ${err.message}`);
  }
}

export function deactivate(): void {
  if (inspectorServer) {
    inspectorServer.stop();
    inspectorServer = null;
  }
  if (statusBar) {
    statusBar.dispose();
    statusBar = null;
  }
}
