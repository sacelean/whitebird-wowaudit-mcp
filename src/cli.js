import { WhitebirdMcpClient } from './index.js';
const client = new WhitebirdMcpClient();
try {
  await client.connect();
  console.log(JSON.stringify(client.listAllowedTools().map(({name})=>name), null, 2));
} finally { await client.close(); }
