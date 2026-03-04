import { ProxyServer } from './proxy/proxyServer';
import { ElementSelectedMessage } from './messaging/messageProtocol';

export interface InspectorServerOptions {
  targetUrl?: string;
  staticRoot?: string;
  port?: number;
  watchPath?: string;
  onElementSelected?: (msg: ElementSelectedMessage) => void;
}

export interface InspectorServer {
  proxyUrl: string;
  targetUrl: string;
  stop: () => Promise<void>;
  toggleInspection: (enabled: boolean) => void;
  setOnInspectionToggled: (callback: (enabled: boolean) => void) => void;
}

export async function startInspectorServer(
  options: InspectorServerOptions
): Promise<InspectorServer> {
  if (!options.targetUrl && !options.staticRoot) {
    throw new Error('Either targetUrl or staticRoot must be provided.');
  }

  const proxy = new ProxyServer({
    targetUrl: options.targetUrl,
    staticRoot: options.staticRoot,
    port: options.port,
    watchPath: options.watchPath,
    onElementSelected: options.onElementSelected,
  });

  await proxy.start();

  return {
    proxyUrl: proxy.proxyUrl,
    targetUrl: options.targetUrl || proxy.proxyUrl,
    stop: () => proxy.stop(),
    toggleInspection: (enabled: boolean) => proxy.toggleInspection(enabled),
    setOnInspectionToggled: (callback: (enabled: boolean) => void) => proxy.setOnInspectionToggled(callback),
  };
}
