import { StatusBarManager } from './statusBar';
import * as vscode from 'vscode';

describe('StatusBarManager', () => {
  let manager: StatusBarManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new StatusBarManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  it('creates a status bar item', () => {
    expect(vscode.window.createStatusBarItem).toHaveBeenCalled();
  });

  it('starts with inspection disabled', () => {
    expect(manager.inspectionEnabled).toBe(false);
  });

  it('toggles inspection state', () => {
    manager.setInspectionEnabled(true);
    expect(manager.inspectionEnabled).toBe(true);
    manager.setInspectionEnabled(false);
    expect(manager.inspectionEnabled).toBe(false);
  });

  it('shows and hides', () => {
    manager.show();
    manager.hide();
    // Verify no errors thrown
  });
});
