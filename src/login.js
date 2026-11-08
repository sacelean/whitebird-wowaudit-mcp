import { createServer } from 'node:http';
import { once } from 'node:events';
import { auth } from '@modelcontextprotocol/client';
import { FileOAuthProvider } from './oauth.js';
import { validateEndpoint } from './index.js';

async function login() {
  const endpoint = validateEndpoint(process.env.WOWAUDIT_MCP_URL);
  const provider = new FileOAuthProvider({ endpoint, onRedirect(url) {
    console.log('Open this URL in your browser to authorize Whitebird (do not share it):');
    console.log(url.href);
  } });
  const redirect = new URL(provider.redirectUrl);
  let resolveCallback;
  const callback = new Promise(resolve => { resolveCallback = resolve; });
  const server = createServer((req, res) => {
    try {
      const params = provider.validateCallback(new URL(req.url, redirect.origin));
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      res.end('Authorization received. You can close this window and return to the terminal.');
      resolveCallback(params);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      res.end('Invalid authorization callback. Restart login if authorization was denied.');
    }
  });
  const timer = setTimeout(() => resolveCallback(undefined), 5 * 60 * 1000);
  try {
    server.listen(Number(redirect.port), '127.0.0.1');
    await once(server, 'listening');
    const result = await auth(provider, { serverUrl: endpoint });
    if (result === 'REDIRECT') {
      const params = await callback;
      if (!params) throw new Error('OAuth login timed out');
      const completed = await auth(provider, { serverUrl: endpoint, authorizationCode: params.get('code'), iss: params.get('iss') ?? undefined });
      if (completed !== 'AUTHORIZED') throw new Error('OAuth authorization incomplete');
    }
    console.log('OAuth credentials saved. The SDK will refresh them when required.');
  } finally {
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
  }
}
login().catch(() => {
  console.error('OAuth login failed. Check endpoint, client registration, callback forwarding and authorization. No credentials have been printed.');
  process.exitCode = 1;
});
