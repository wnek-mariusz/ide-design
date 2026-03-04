# Element Inspector

Inspect and select HTML elements from a live web page, then paste element info directly into your terminal for AI coding assistants.

Works as both a **standalone CLI tool** and a **VS Code extension**.

## How It Works

Element Inspector runs a local proxy server that injects an inspection overlay into any web page. Click an element to capture its CSS selector, HTML snippet, and source file path. The selected element info is either printed to stdout (CLI) or pasted into your active terminal (VS Code).

## Installation

```bash
npm install
npm run build
```

### VS Code Extension

```bash
npm run install-ext
```

### CLI

```bash
npx element-inspector [url] [options]
```

## Usage

### CLI

```bash
# Proxy an existing dev server
element-inspector http://localhost:3000

# Serve static files from current directory
element-inspector

# Serve static files from a specific path
element-inspector --static ./public

# Custom port, no auto-open
element-inspector http://localhost:3000 --port 8080 --no-open
```

#### CLI Options

| Option | Description |
|---|---|
| `--port, -p` | Proxy server port (default: auto) |
| `--static, -s` | Serve static files from this path (default: cwd) |
| `--watch, -w` | Watch path for live reload (default: cwd) |
| `--no-open` | Don't open the browser automatically |
| `--help, -h` | Show help message |

### VS Code Extension

#### Getting Started

1. Install the extension: `npm run install-ext`
2. Open a workspace containing HTML files
3. Open the command palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and run **Element Inspector: Open Inspector**
4. The page opens in VS Code's Simple Browser with the inspection overlay injected
5. Toggle inspection on with `Cmd+Shift+Alt+I` (or click the status bar item)
6. Click any element on the page — its info is pasted into your active VS Code terminal

#### Commands

| Command | Description |
|---|---|
| **Element Inspector: Open Inspector** | Starts a live server for your workspace and opens it in Simple Browser with the overlay |
| **Element Inspector: Open URL** | Prompts for a URL (e.g. `http://localhost:4200`), proxies it, and opens the proxy in Simple Browser |
| **Element Inspector: Open File** | Opens a specific HTML file from your workspace. Also available by right-clicking `.html`/`.htm` files in the explorer |
| **Element Inspector: Toggle Inspection** | Turns the inspection overlay on or off |

#### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+Shift+Alt+I` (Mac) | Toggle inspection |
| `Ctrl+Shift+Alt+I` (Windows/Linux) | Toggle inspection |

#### Typical Workflows

**Inspect static HTML files:**

1. Open a workspace with your HTML files
2. Run **Open Inspector** — this serves your workspace as a local static site with live reload
3. Toggle inspection on and click elements to capture their selectors

**Inspect a running dev server:**

1. Start your dev server (e.g. `npm run dev` on port 3000)
2. Run **Open URL** and enter `http://localhost:3000`
3. The extension creates a proxy that injects the overlay into your app
4. Toggle inspection on and click elements

**Inspect a single file from the explorer:**

1. Right-click any `.html` or `.htm` file in the VS Code explorer
2. Select **Element Inspector: Open File**
3. The file opens in Simple Browser with inspection already enabled

#### Status Bar

The status bar shows the current inspection state:

- **Inspector OFF** — overlay is inactive, click to toggle on
- **Inspector ON** — overlay is active, hovering highlights elements

Click the status bar item to toggle inspection on/off.

#### Terminal Output

When you click an element with inspection enabled, the element info is automatically pasted into your active VS Code terminal (a new terminal is created if none exists). This makes it easy to feed element context directly to AI coding assistants like Claude Code running in the terminal.

## Output Format

```
Element: .container > h1.title
File: /src/index.html
HTML: <h1 class="title">Hello World</h1>
```

## Project Structure

```
src/
├── cli.ts              # CLI entry point and argument parsing
├── server.ts           # Inspector server setup
├── proxy/
│   ├── proxyServer.ts  # HTTP proxy / static file server
│   ├── injector.ts     # Injects overlay script into HTML responses
│   └── liveReload.ts   # File watcher for live reload
├── overlay/
│   ├── inspector.js    # Browser-side inspection overlay
│   └── selectorGenerator.ts  # CSS selector generation
├── messaging/
│   └── messageProtocol.ts    # Message types between overlay and server
├── output/
│   └── stdout.ts       # Formats and prints element info (CLI)
└── vscode/
    ├── extension.ts    # VS Code extension entry point
    ├── statusBar.ts    # Status bar indicator
    └── terminalPaster.ts  # Pastes element info into terminal
```

## Development

```bash
npm run watch    # Rebuild on changes
npm test         # Run tests
npm run package  # Package .vsix
```
