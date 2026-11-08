# Whitebird WoWAudit MCP Client

Node.js library connecting to the official WoWAudit MCP server over **HTTPS** using MCP SDK v2.

## Usage

`npm install` then set the variables from `.env.example` in the environment (do not commit `.env`).

```js
import { WhitebirdMcpClient } from '@whitebird/wowaudit-mcp';
const client = new WhitebirdMcpClient();
await client.connect();
console.log(client.listAllowedTools().map(t => t.name));
console.log(await client.callReadTool('team_audit'));
await client.close();
```

`npm test` validates the client safety layer without contacting WoWAudit.

## Important authentication limitation

The official WoWAudit MCP setup page could not be programmatically fetched in this environment. This prototype supports **bearer token only**; **OAuth login / refresh is NOT yet implemented**. A ChatGPT connection does not transfer its OAuth tokens to this service. Do not attempt to use ChatGPT credentials or scrape browser cookies. Verify authentication and use the official endpoint before production.

## Safety

The library enforces HTTPS and a *read-only* allowlist, scopes tools with a `team` parameter to Whitebird ID 66082, and refuses cross-team queries. It does not expose a server port. Give this process least-privilege credentials. Keep logs free of secrets and sensitive roster data.
