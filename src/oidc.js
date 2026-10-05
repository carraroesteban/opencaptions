// Company sign-in (OpenID Connect): Google Workspace, Microsoft Entra ID, Okta, Auth0, Keycloak… any provider with
// discovery. Authorization code flow with PKCE; the ID token's signature, issuer, audience, expiry and nonce are
// checked with Node's own crypto (no dependencies). Who may sign in, and as what, is a list of emails or domains:
//
//   OIDC_ISSUER=https://accounts.google.com      OIDC_CLIENT_ID=…   OIDC_CLIENT_SECRET=…
//   OIDC_ADMINS=ana@example.org,@example.org     OIDC_CREW=volunteers@example.org   (optional)
//   OIDC_LABEL=Google                            OIDC_REDIRECT_URI=https://captions.example.org/auth/oidc/callback
//
// Your provider's MFA applies; OpenCaptions' own two-factor code is for the admin password only.
import crypto from 'node:crypto';
import { config } from './config.js';

const env = process.env;
export const oidc = {
  issuer: (env.OIDC_ISSUER || '').replace(/\/$/, ''),
  clientId: env.OIDC_CLIENT_ID || '',
  clientSecret: env.OIDC_CLIENT_SECRET || '',
  label: env.OIDC_LABEL || '',
  redirectUri: env.OIDC_REDIRECT_URI || '',
  only: /^(1|true|yes|on)$/i.test(env.OIDC_ONLY || ''),
  admins: list(env.OIDC_ADMINS),
  crew: list(env.OIDC_CREW),
  tenants: list(env.OIDC_TENANTS), // Microsoft multi-tenant ("common") issuers: the tenant ids allowed in
};
export const oidcEnabled = !!(oidc.issuer && oidc.clientId);
if (oidcEnabled && !oidc.label) oidc.label = /google/.test(oidc.issuer) ? 'Google' : /microsoftonline|login\.live/.test(oidc.issuer) ? 'Microsoft' : 'your company account';

function list(s) { return String(s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean); }
const matches = (email, rules) => rules.some((r) => r === '*' || r === email || (r.startsWith('@') && email.endsWith(r)));
/** admin / crew / null (not allowed) for a signed-in email. */
export const roleForEmail = (email) => (matches(email, oidc.admins) ? 'admin' : matches(email, oidc.crew) ? 'crew' : null);

let meta = null, metaAt = 0;
async function discovery() {
  if (meta && Date.now() - metaAt < 3600_000) return meta;
  const r = await fetch(`${oidc.issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`the sign-in provider's settings couldn't be read (${r.status})`);
  meta = await r.json();
  metaAt = Date.now();
  return meta;
}
let jwks = { keys: [] }, jwksAt = 0;
async function key(kid) {
  const find = () => jwks.keys.find((k) => k.kid === kid) || (!kid && jwks.keys.length === 1 ? jwks.keys[0] : null);
  if (!find() || Date.now() - jwksAt > 3600_000) {
    const r = await fetch((await discovery()).jwks_uri, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`the provider's signing keys couldn't be read (${r.status})`);
    jwks = /** @type {any} */ (await r.json());
    jwksAt = Date.now();
  }
  const k = find();
  if (!k) throw new Error('the sign-in was signed with an unknown key');
  return crypto.createPublicKey({ key: k, format: 'jwk' });
}

const b64 = (b) => Buffer.from(b).toString('base64url');
const json = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

/** Sign-ins in progress, by state (10 minutes to come back from the provider). */
const flows = new Map();
setInterval(() => { for (const [k, f] of flows) if (f.until < Date.now()) flows.delete(k); }, 60_000).unref();

/**
 * Where to send the browser to sign in. `binding` goes in a short-lived cookie: the callback must come back to the
 * same browser that started (stops someone from handing their own sign-in link to a victim).
 * @param {string} redirectUri @param {string} device
 */
export async function startFlow(redirectUri, device) {
  const m = await discovery();
  const state = b64(crypto.randomBytes(24));
  const nonce = b64(crypto.randomBytes(24));
  const verifier = b64(crypto.randomBytes(48));
  const binding = b64(crypto.randomBytes(24));
  flows.set(state, { nonce, verifier, binding, redirectUri, device, until: Date.now() + 10 * 60_000 });
  const u = new URL(m.authorization_endpoint);
  for (const [k, v] of Object.entries({
    response_type: 'code', client_id: oidc.clientId, redirect_uri: redirectUri, scope: 'openid email profile',
    state, nonce, code_challenge: b64(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256', prompt: 'select_account',
  })) u.searchParams.set(k, v);
  return { url: u.toString(), binding };
}

/**
 * Back from the provider: exchange the code, check the ID token, and say who signed in.
 * @returns {Promise<{ email: string, name: string, device: string }>}
 */
export async function finishFlow({ state, code, binding }) {
  const f = flows.get(String(state || ''));
  flows.delete(String(state || ''));
  if (!f || f.until < Date.now()) throw new Error('this sign-in link expired: start again');
  if (!binding || binding !== f.binding) throw new Error('this sign-in was started in another browser: start again here');
  const m = await discovery();
  const r = await fetch(m.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: String(code || ''), redirect_uri: f.redirectUri, client_id: oidc.clientId, client_secret: oidc.clientSecret, code_verifier: f.verifier }),
    signal: AbortSignal.timeout(10000),
  });
  const tok = /** @type {any} */ (await r.json().catch(() => ({})));
  if (!r.ok || !tok.id_token) throw new Error(`the provider refused the sign-in (${tok.error_description || tok.error || r.status})`);
  const claims = await verify(tok.id_token, f.nonce, m);
  const email = String(claims.email || claims.preferred_username || claims.upn || '').toLowerCase();
  if (!email) throw new Error('the provider didn\'t say which account signed in (allow the "email" scope)');
  if (claims.email_verified === false) throw new Error('that account\'s email address isn\'t verified');
  return { email, name: String(claims.name || email), device: f.device };
}

/** Check an ID token: signature (RS256 / ES256 / PS256), issuer, audience, expiry and nonce. */
export async function verify(idToken, nonce, m = null) {
  const [h, p, sig] = String(idToken).split('.');
  if (!h || !p || !sig) throw new Error('malformed sign-in token');
  const header = json(h), claims = json(p);
  const alg = { RS256: ['sha256', {}], ES256: ['sha256', { dsaEncoding: 'ieee-p1363' }], PS256: ['sha256', { padding: crypto.constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }] }[header.alg];
  if (!alg) throw new Error(`unsupported signature (${header.alg})`);
  const pub = await key(header.kid);
  if (!crypto.verify(alg[0], Buffer.from(`${h}.${p}`), { key: pub, ...alg[1] }, Buffer.from(sig, 'base64url'))) throw new Error('the sign-in token\'s signature is invalid');
  const meta = m || (await discovery());
  // Microsoft's "common" endpoints publish a template issuer with {tenantid}.
  const template = String(meta.issuer || oidc.issuer);
  const iss = template.replace('{tenantid}', String(claims.tid || ''));
  if (claims.iss !== iss) throw new Error('the sign-in token comes from another issuer');
  // Any organization's accounts pass a multi-tenant issuer, and their admins choose the email claim (the "nOAuth"
  // problem), so roles by email would be open to them. Only the listed tenants get in.
  if (template.includes('{tenantid}') && !oidc.tenants.includes(String(claims.tid || '').toLowerCase())) {
    throw new Error(oidc.tenants.length ? 'this account belongs to another organization' : 'multi-tenant sign-in needs OIDC_TENANTS (your tenant id) in .env');
  }
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(oidc.clientId) || (aud.length > 1 && claims.azp && claims.azp !== oidc.clientId)) throw new Error('the sign-in token is for another app');
  const now = Date.now() / 1000;
  if (!(claims.exp > now - 60)) throw new Error('the sign-in token expired');
  if (claims.nbf && claims.nbf > now + 60) throw new Error('the sign-in token isn\'t valid yet');
  if (nonce && claims.nonce !== nonce) throw new Error('the sign-in token doesn\'t match this sign-in');
  return claims;
}

/** The callback address registered with the provider. */
export const redirectFor = (req) => oidc.redirectUri || `${config.publicUrl || `${req.protocol}://${req.get('host')}`}/auth/oidc/callback`;
