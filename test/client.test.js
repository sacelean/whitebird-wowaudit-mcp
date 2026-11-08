import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEndpoint, WhitebirdMcpClient } from '../src/index.js';

test('rejects unencrypted MCP endpoints', () => {
  assert.throws(() => validateEndpoint('http://wowaudit.com/mcp'), /HTTPS/);
});
test('rejects credentials embedded in URL', () => {
  assert.throws(() => validateEndpoint('https://user:password@wowaudit.com/mcp'), /Credentials/);
});
test('allows read tools, scopes team, blocks writes', async () => {
  const calls = [];
  const fake = {
    async listTools(){return {tools:[
      {name:'team_audit',description:'Team audit',inputSchema:{type:'object',properties:{team:{type:'string'}}}},
      {name:'update_roster_members',description:'Write',inputSchema:{properties:{}}}
    ]}},
    async callTool(request){calls.push(request);return {structuredContent:{ok:true}}},
    async close(){}
  };
  const client = new WhitebirdMcpClient({endpoint:'https://example.com/mcp',factory:async()=>fake});
  await client.connect();
  assert.deepEqual(client.listAllowedTools().map(t=>t.name), ['team_audit']);
  assert.deepEqual(await client.callReadTool('team_audit'), {ok:true});
  assert.equal(calls[0].arguments.team, '66082');
  await assert.rejects(()=>client.callReadTool('update_roster_members',{}), /not permitted/);
  await assert.rejects(()=>client.callReadTool('team_audit',{team:'123'}), /Cross-team/);
  await client.close();
});
