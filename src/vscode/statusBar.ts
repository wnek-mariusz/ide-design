import * as vscode from 'vscode';

export class StatusBarManager {
  private item: vscode.StatusBarItem;
  private _inspectionEnabled: boolean = false;
  private _connectedUrl: string | null = null;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'element-inspector.toggleInspection';
    this.update();
  }

  get inspectionEnabled(): boolean {
    return this._inspectionEnabled;
  }

  setInspectionEnabled(enabled: boolean): void {
    this._inspectionEnabled = enabled;
    this.update();
  }

  setConnectedUrl(url: string | null): void {
    this._connectedUrl = url;
    this.update();
  }

  show(): void {
    this.item.show();
  }

  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }

  private update(): void {
    if (this._inspectionEnabled) {
      this.item.text = '$(inspect) Inspector ON';
      this.item.tooltip = this._connectedUrl
        ? `Element Inspector: ON\nConnected to: ${this._connectedUrl}`
        : 'Element Inspector: ON';
    } else {
      this.item.text = '$(inspect) Inspector OFF';
      this.item.tooltip = 'Element Inspector: OFF — Click to toggle';
    }
  }
}
