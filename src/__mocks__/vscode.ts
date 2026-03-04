const activeTerminal = {
  sendText: jest.fn(),
  name: 'Test Terminal',
};

export const window: any = {
  activeTerminal,
  createTerminal: jest.fn(() => activeTerminal),
  showInformationMessage: jest.fn(),
  showInputBox: jest.fn(),
  showWarningMessage: jest.fn(),
  showQuickPick: jest.fn(),
  showErrorMessage: jest.fn(),
  createStatusBarItem: jest.fn(() => ({
    text: '',
    tooltip: '',
    command: '',
    show: jest.fn(),
    hide: jest.fn(),
    dispose: jest.fn(),
  })),
  terminals: [],
};

export const commands = {
  executeCommand: jest.fn(),
  registerCommand: jest.fn(),
};

export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

export const Uri = {
  parse: jest.fn((s: string) => ({ toString: () => s })),
};

export const workspace = {
  workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
};

export const Disposable = {
  from: jest.fn(),
};
