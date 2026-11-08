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

## OAuth authentication

The client uses OAuth authorization code with PKCE through the MCP SDK, including discovery and refresh-token renewal. Run the initial browser authorization on the VM using the steps in [the deployment guide](docs/DEPLOY-ORACLE.md#login-oauth-inicial). `WOWAUDIT_MCP_TOKEN` is no longer used.

OAuth credentials are stored separately from `agent.env`, by default in `~/whitebird/shared/wowaudit-oauth.json`, owned by the deployment user with mode 0600. This file contains secrets in plaintext: protect VM access and backups. Do not commit or print it. Run only one process using this token store at a time to avoid concurrent refresh-token rotation. A ChatGPT connection does not transfer its OAuth session to this client.

The official WoWAudit setup page was not accessible during implementation. Confirm the official MCP endpoint and OAuth registration/redirect requirements before the first login. The automated OAuth tests use a simulated authorization server; live WoWAudit integration remains pending.

## Safety

The library enforces HTTPS and a *read-only* allowlist, scopes tools with a `team` parameter to Whitebird ID 66082, and rejects explicit cross-team `team` arguments. Resource IDs without a `team` input still require ownership checks; see the review checklist. It does not expose a server port. Give this process least-privilege credentials. Keep logs free of secrets and sensitive roster data.

## Revisión y despliegue

- [Puntos pendientes de revisión](docs/REVISION-MCP.md)
- [Pipeline y configuración de la VM Oracle](docs/DEPLOY-ORACLE.md)

La pipeline ejecuta pruebas en PR/push a `main` y permite desplegar manualmente desde `main` al environment `oracle-production`.
