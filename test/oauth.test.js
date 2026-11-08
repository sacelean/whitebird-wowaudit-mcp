import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auth } from '@modelcontextprotocol/client';
import { FileOAuthProvider } from '../src/oauth.js';

function fixture(t, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'whitebird-oauth-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { endpoint: 'https://resource.example/mcp', file: join(dir, 'session.json'), ...overrides };
}

test('stores full credentials with private permissions and binds endpoint and issuer', t => {
  const options = fixture(t);
  const provider = new FileOAuthProvider(options);
  const tokens = { access_token: 'access', refresh_token: 'refresh', token_type: 'Bearer', issuer: 'https://issuer.example' };
  provider.saveTokens(tokens);
  provider.saveClientInformation({ client_id: 'client', issuer: tokens.issuer }, { issuer: tokens.issuer });
  const restored = new FileOAuthProvider(options);
  assert.deepEqual(restored.tokens(), tokens);
  assert.equal(restored.tokens({ issuer: 'https://other.example' }), undefined);
  assert.equal(restored.clientInformation({ issuer: tokens.issuer }).client_id, 'client');
  assert.equal(restored.clientInformation({ issuer: 'https://other.example' }), undefined);
  assert.equal(statSync(options.file).mode & 0o777, 0o600);
  assert.throws(() => new FileOAuthProvider({ ...options, endpoint: 'https://other.example/mcp' }), /another endpoint/);
  chmodSync(options.file, 0o644);
  assert.throws(() => new FileOAuthProvider(options), /0600/);
});

test('checks callback state, errors, replay and loopback redirect', t => {
  const provider = new FileOAuthProvider(fixture(t));
  assert.throws(() => provider.validateCallback('http://127.0.0.1:8787/callback?code=c'), /Invalid/);
  const state = provider.state();
  assert.throws(() => provider.validateCallback(`http://127.0.0.1:8787/callback?code=c&state=wrong`), /Invalid/);
  assert.throws(() => provider.validateCallback(`http://127.0.0.1:8787/callback?error=access_denied&state=${state}`), /denied/);
  const url = `http://127.0.0.1:8787/callback?code=c&state=${state}&iss=https%3A%2F%2Fissuer.example`;
  assert.equal(provider.validateCallback(url).get('iss'), 'https://issuer.example');
  assert.throws(() => provider.validateCallback(url), /Invalid/);
  assert.throws(() => new FileOAuthProvider(fixture(t, { redirectUrl: 'http://0.0.0.0:8787/callback' })), /loopback/);
});

test('noninteractive provider requires login and invalidates credentials', t => {
  const provider = new FileOAuthProvider(fixture(t));
  assert.throws(() => provider.redirectToAuthorization(new URL('https://issuer.example')), /login required/);
  provider.saveTokens({ access_token: 'a', token_type: 'Bearer' });
  provider.invalidateCredentials('tokens');
  assert.equal(provider.tokens(), undefined);
});

test('SDK authorization uses PKCE, validates issuer, persists and rotates refresh tokens', async t => {
  let authorizationUrl;
  const options = fixture(t, { onRedirect: url => { authorizationUrl = url; } });
  const provider = new FileOAuthProvider(options);
  const tokenRequests = [];
  const issuer = 'https://issuer.example';
  const fetchFn = async (input, init = {}) => {
    const url = String(input);
    const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
    if (url.includes('oauth-protected-resource')) return json({ resource: options.endpoint, authorization_servers: [issuer] });
    if (url.includes('.well-known/')) return json({
      issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`,
      registration_endpoint: `${issuer}/register`, response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'], authorization_response_iss_parameter_supported: true
    });
    if (url === `${issuer}/register`) return json({ ...JSON.parse(init.body), client_id: 'registered-client' });
    if (url === `${issuer}/token`) {
      const params = new URLSearchParams(init.body);
      tokenRequests.push(params);
      return json({ access_token: `access-${tokenRequests.length}`, refresh_token: `refresh-${tokenRequests.length}`, token_type: 'Bearer', expires_in: 3600 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  assert.equal(await auth(provider, { serverUrl: options.endpoint, fetchFn }), 'REDIRECT');
  assert.equal(authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(authorizationUrl.searchParams.get('code_challenge'));
  assert.equal(authorizationUrl.searchParams.get('state'), provider.pendingState);
  await assert.rejects(auth(provider, { serverUrl: options.endpoint, authorizationCode: 'code', iss: 'https://evil.example', fetchFn }));
  assert.equal(tokenRequests.length, 0);
  assert.equal(await auth(provider, { serverUrl: options.endpoint, authorizationCode: 'code', iss: issuer, fetchFn }), 'AUTHORIZED');
  assert.equal(tokenRequests[0].get('code_verifier'), provider.codeVerifier());
  const restored = new FileOAuthProvider(options);
  assert.equal(restored.tokens().issuer, issuer);
  assert.equal(await auth(restored, { serverUrl: options.endpoint, fetchFn }), 'AUTHORIZED');
  assert.equal(tokenRequests[1].get('grant_type'), 'refresh_token');
  assert.equal(tokenRequests[1].get('refresh_token'), 'refresh-1');
  assert.equal(new FileOAuthProvider(options).tokens().refresh_token, 'refresh-2');
});
