describe('CLI argument parsing', () => {
  it('parses a URL positional argument', () => {
    const args = ['node', 'cli.js', 'http://localhost:3000'];
    const result = parseTestArgs(args);
    expect(result.url).toBe('http://localhost:3000');
    expect(result.open).toBe(true);
  });

  it('parses --no-open flag', () => {
    const args = ['node', 'cli.js', 'http://localhost:3000', '--no-open'];
    const result = parseTestArgs(args);
    expect(result.url).toBe('http://localhost:3000');
    expect(result.open).toBe(false);
  });

  it('parses --port flag', () => {
    const args = ['node', 'cli.js', '--port', '8080', 'http://localhost:3000'];
    const result = parseTestArgs(args);
    expect(result.port).toBe(8080);
    expect(result.url).toBe('http://localhost:3000');
  });

  it('parses --watch flag', () => {
    const args = ['node', 'cli.js', '-w', '/tmp/project', 'http://localhost:3000'];
    const result = parseTestArgs(args);
    expect(result.watchPath).toBe('/tmp/project');
  });

  it('parses --static flag', () => {
    const args = ['node', 'cli.js', '-s', '/tmp/site'];
    const result = parseTestArgs(args);
    expect(result.staticRoot).toBe('/tmp/site');
    expect(result.url).toBeUndefined();
  });

  it('defaults open to true and watchPath to cwd', () => {
    const args = ['node', 'cli.js', 'http://localhost:5500'];
    const result = parseTestArgs(args);
    expect(result.open).toBe(true);
    expect(result.watchPath).toBe(process.cwd());
  });
});

function parseTestArgs(argv: string[]) {
  const path = require('path');
  const args = argv.slice(2);
  const options: { url?: string; staticRoot?: string; port?: number; open: boolean; watchPath: string } = {
    open: true,
    watchPath: process.cwd(),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--no-open') {
      options.open = false;
    } else if (arg === '--port' || arg === '-p') {
      options.port = Number(args[++i]);
    } else if (arg === '--watch' || arg === '-w') {
      options.watchPath = path.resolve(args[++i]);
    } else if (arg === '--static' || arg === '-s') {
      options.staticRoot = path.resolve(args[++i]);
    } else if (!arg.startsWith('-')) {
      options.url = arg;
    }
  }

  return options;
}
