import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export class FileOAuthProvider {
  constructor({ endpoint, file = process.env.WOWAUDIT_OAUTH_STORE || join(homedir(), 'whitebird/shared/wowaudit-oauth.json'),
    redirectUrl = process.env.WOWAUDIT_OAUTH_REDIRECT_URL || 'http://127.0.0.1:8787/callback',
    onRedirect, clientId = process.env.WOWAUDIT_OAUTH_CLIENT_ID,
    clientSecret = process.env.WOWAUDIT_OAUTH_CLIENT_SECRET,
    issuer = process.env.WOWAUDIT_OAUTH_ISSUER } = {}) {
    const redirect = new URL(redirectUrl);
    if (redirect.protocol !== 'http:' || redirect.hostname !== '127.0.0.1' || !redirect.port || redirect.username || redirect.password || redirect.search || redirect.hash) {
      throw new Error('OAuth redirect must be an HTTP loopback URL with an explicit port and no query');
    }
    if (clientId && !issuer) throw new Error('WOWAUDIT_OAUTH_ISSUER is required with a pre-registered client');
    this.redirectUrl = redirect.href;
    this.endpoint = new URL(endpoint).href;
    this.file = file;
    this.onRedirect = onRedirect;
    this.clientMetadata = {
      client_name: 'Whitebird WoWAudit MCP',
      redirect_uris: [this.redirectUrl],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: clientSecret ? 'client_secret_basic' : 'none',
      application_type: 'native'
    };
    this.registered = clientId ? { client_id: clientId, ...(clientSecret && { client_secret: clientSecret }), issuer } : undefined;
    this.data = { endpoint: this.endpoint, redirectUrl: this.redirectUrl, clients: {} };
    try {
      const info = statSync(file);
      if ((info.mode & 0o077) || (process.getuid && info.uid !== process.getuid())) {
        throw new Error('OAuth store must be owned by the current user with permissions 0600');
      }
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      if (saved.endpoint !== this.endpoint || saved.redirectUrl !== this.redirectUrl) throw new Error('OAuth store belongs to another endpoint or redirect URL');
      this.data = saved;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  persist() {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${randomBytes(12).toString('hex')}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(this.data), { mode: 0o600, flag: 'wx' });
      renameSync(temporary, this.file);
    } finally { rmSync(temporary, { force: true }); }
  }
  clientInformation(ctx) {
    if (!ctx) return undefined;
    return this.data.clients[ctx.issuer] ?? (this.registered?.issuer === ctx.issuer ? this.registered : undefined);
  }
  saveClientInformation(info, ctx) {
    if (!ctx) throw new Error('OAuth issuer missing');
    this.data.clients[ctx.issuer] = info;
    this.persist();
  }
  tokens(ctx) {
    const tokens = this.data.tokens;
    return ctx && tokens?.issuer !== ctx.issuer ? undefined : tokens;
  }
  saveTokens(tokens) { this.data.tokens = tokens; this.persist(); }
  state() { this.pendingState = randomBytes(32).toString('hex'); return this.pendingState; }
  saveCodeVerifier(verifier) { this.verifier = verifier; }
  codeVerifier() {
    if (!this.verifier) throw new Error('OAuth PKCE verifier missing; restart login');
    return this.verifier;
  }
  saveDiscoveryState(discovery) { this.discovery = discovery; }
  discoveryState() { return this.discovery; }
  redirectToAuthorization(url) {
    if (!this.onRedirect) throw new Error('OAuth login required. Run npm run login on the VM with the shared environment loaded.');
    return this.onRedirect(url);
  }
  validateCallback(url) {
    const callback = new URL(url);
    const expected = new URL(this.redirectUrl);
    if (callback.origin !== expected.origin || callback.pathname !== expected.pathname || !this.pendingState || callback.searchParams.get('state') !== this.pendingState) {
      throw new Error('Invalid OAuth callback state or URL');
    }
    if (callback.searchParams.has('error') || !callback.searchParams.get('code')) throw new Error('OAuth authorization was denied or returned no code');
    this.pendingState = undefined;
    return callback.searchParams;
  }
  invalidateCredentials(scope) {
    if (scope === 'all' || scope === 'tokens') delete this.data.tokens;
    if (scope === 'all' || scope === 'client') this.data.clients = {};
    if (scope === 'all' || scope === 'verifier') this.verifier = undefined;
    if (scope === 'all' || scope === 'discovery') this.discovery = undefined;
    this.persist();
  }
}
