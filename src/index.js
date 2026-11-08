import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { FileOAuthProvider } from './oauth.js';

// Intentionally read-only. Write actions require a separately reviewed implementation.
export const READ_TOOLS = Object.freeze([
  'get_my_context', 'get_character', 'team_audit', 'list_audit_fields',
  'find_recipe_crafters', 'list_my_events', 'list_events', 'get_event',
  'event_insights', 'get_event_changelog', 'list_event_schedules',
  'list_applications', 'get_applications', 'list_roster',
  'list_notification_templates', 'list_seasons', 'list_instances',
  'list_encounter_items', 'trinket_status', 'wishlist_upgrades', 'loot_history'
]);

export function validateEndpoint(endpoint) {
  if (!endpoint) throw new Error('WOWAUDIT_MCP_URL missing: copy the actual MCP endpoint from WoWAudit setup');
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') throw new Error('WoWAudit MCP endpoint must use HTTPS');
  if (url.username || url.password) throw new Error('Credentials must not be embedded in URL');
  return url;
}

export class WhitebirdMcpClient {
  constructor({ endpoint = process.env.WOWAUDIT_MCP_URL,
                authProvider,
                team = process.env.WOWAUDIT_TEAM_ID || '66082',
                factory } = {}) {
    this.url = validateEndpoint(endpoint);
    this.authProvider = authProvider;
    this.team = String(team);
    this.factory = factory;
    this.client = null;
    this.available = new Map();
  }

  async connect() {
    if (this.client) return this;
    const client = this.factory ? await this.factory() : new Client(
      { name: 'whitebird-wowaudit-mcp', version: '0.1.0' },
      { versionNegotiation: { mode: 'auto' } }
    );
    try {
      if (!this.factory) {
        const provider = this.authProvider ?? new FileOAuthProvider({ endpoint: this.url });
        if (!this.authProvider && !provider.tokens()) {
          throw new Error('OAuth login required. Run src/login.js with the shared environment loaded before deploying.');
        }
        const transport = new StreamableHTTPClientTransport(this.url, { authProvider: provider });
        await client.connect(transport);
      }
      const result = await client.listTools();
      this.available = new Map((result.tools || [])
        .filter(t => READ_TOOLS.includes(t.name))
        .map(t => [t.name, t]));
      this.client = client;
      return this;
    } catch(e) { await client.close?.().catch(()=>{}); throw e; }
  }

  listAllowedTools() {
    if (!this.client) throw new Error('Not connected');
    return [...this.available.values()].map(({ name, description, inputSchema }) => ({
      name, description, inputSchema
    }));
  }

  async callReadTool(name, args = {}) {
    if (!this.client) throw new Error('Not connected');
    if (!this.available.has(name)) throw new Error(`Tool not permitted or unavailable: ${name}`);
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be an object');
    if (args.team !== undefined && String(args.team) !== this.team) {
      throw new Error('Cross-team queries are blocked');
    }
    const definitions = this.available.get(name).inputSchema;
    const allowed = definitions?.properties || {};
    for (const key of Object.keys(args)) {
      if (Object.keys(allowed).length && !(key in allowed)) throw new Error(`Unknown tool argument: ${key}`);
    }
    // All tools with a `team` input are scoped to Whitebird regardless of the model output.
    const effectiveArgs = ('team' in allowed) ? { ...args, team: this.team } : { ...args };
    const result = await this.client.callTool({ name, arguments: effectiveArgs });
    if (result.isError) throw new Error(`WoWAudit tool ${name} reported an error`);
    return result.structuredContent ?? result.content;
  }

  async close() {
    const client = this.client;
    this.client = null;
    this.available.clear();
    await client?.close?.();
  }
}
