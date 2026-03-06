import { startInspectorServer } from './server';
import { printToStdout, printBatchToStdout } from './output/stdout';
import { exec } from 'child_process';
import * as path from 'path';

interface CliOptions {
  url?: string;
  staticRoot?: string;
  port?: number;
  open: boolean;
  watchPath: string;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const options: CliOptions = {
    open: true,
    watchPath: process.cwd(),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--no-open') {
      options.open = false;
    } else if (arg === '--port' || arg === '-p') {
      const val = args[++i];
      if (!val || isNaN(Number(val))) {
        console.error('Error: --port requires a numeric value');
        process.exit(1);
      }
      options.port = Number(val);
    } else if (arg === '--watch' || arg === '-w') {
      const val = args[++i];
      if (!val) {
        console.error('Error: --watch requires a path');
        process.exit(1);
      }
      options.watchPath = path.resolve(val);
    } else if (arg === '--static' || arg === '-s') {
      const val = args[++i];
      if (!val) {
        console.error('Error: --static requires a path');
        process.exit(1);
      }
      options.staticRoot = path.resolve(val);
    } else if (!arg.startsWith('-')) {
      options.url = arg;
    } else {
      console.error(`Unknown option: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  return options;
}

function printUsage(): void {
  console.log(`
Usage: element-inspector [url] [options]

  url    Target URL to proxy (e.g. http://localhost:3000)
         If omitted, serves static files from current directory.

Options:
  --port, -p       Proxy port (default: auto)
  --static, -s     Serve static files from this path (default: cwd)
  --no-open        Don't open browser automatically
  --watch, -w      Watch path for live reload (default: cwd)
  --help, -h       Show this help message
`.trim());
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'start'
        : 'xdg-open';

  exec(`${cmd} ${url}`, (err) => {
    if (err) {
      console.error(`Could not open browser: ${err.message}`);
    }
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  // Default to serving static files from cwd if no URL given
  const staticRoot = options.url ? undefined : (options.staticRoot || process.cwd());

  try {
    const server = await startInspectorServer({
      targetUrl: options.url,
      staticRoot,
      port: options.port,
      watchPath: options.watchPath,
      onElementSelected: printToStdout,
      onBatchInstructions: printBatchToStdout,
    });

    console.log(`\nElement Inspector`);
    if (options.url) {
      console.log(`  Target:  ${server.targetUrl}`);
    } else {
      console.log(`  Serving: ${staticRoot}`);
    }
    console.log(`  Proxy:   ${server.proxyUrl}`);
    console.log(`  Watch:   ${options.watchPath}`);
    console.log(`\nClick any element in the browser to inspect it.`);
    console.log(`Press Ctrl+C to stop.\n`);

    if (options.open) {
      openBrowser(server.proxyUrl);
    }

    const shutdown = async () => {
      console.log('\nShutting down...');
      await server.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err: any) {
    console.error(`Failed to start: ${err.message}`);
    process.exit(1);
  }
}

main();
