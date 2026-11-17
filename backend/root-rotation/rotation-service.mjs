import { webcrypto } from 'node:crypto';

const cryptoApi = webcrypto;
const enc = new TextEncoder();
const ROOT_ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const MAX_CERTS = 20;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function fromB64u(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Assinatura inválida.');
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4), 'base64');
}
async function verifySignature(jwk, signature, body) {
  try {
    const key = await cryptoApi.subtle.importKey('jwk', jwk, ROOT_ALG, false, ['verify']);
    return cryptoApi.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64u(signature), enc.encode(canonical(body)));
  } catch { return false; }
}
async function fingerprint(jwk) {
  const digest = await cryptoApi.subtle.digest('SHA-256', enc.encode(canonical(jwk)));
  return Buffer.from(digest).toString('base64url');
}
async function verifyCertificate(cert, uid, rootJwk) {
  if (!cert || cert.version !== 1 || cert.uid !== uid || !cert.deviceId || !cert.ecdhPublicKey || !cert.rootSignature) return false;
  const { rootSignature, ...body } = cert;
  return verifySignature(rootJwk, rootSignature, body);
}

/** Validates the signed transition against the authoritative Firestore snapshot. */
export async function validateRotationCommit({ uid, bundle, rootRecord, deviceRecords }) {
  const t = bundle?.transition;
  const certs = bundle?.certificates;
  if (!uid || !t || !Array.isArray(certs) || certs.length < 1 || certs.length > MAX_CERTS ||
      !Array.isArray(t.deviceIds) || !Number.isSafeInteger(t.rootEpoch) || !Number.isFinite(t.issuedAt)) return { valid: false, reason: 'malformed' };
  if (t.protocol !== 'criart-root-rotation-v1' || t.uid !== uid) return { valid: false, reason: 'uid-or-protocol' };
  if (!rootRecord?.publicKeyJwk || rootRecord.ownerUid !== uid) return { valid: false, reason: 'root-not-pinned' };
  const currentEpoch = Number.isSafeInteger(rootRecord.rootEpoch) ? rootRecord.rootEpoch : 1;
  if (t.rootEpoch !== currentEpoch + 1) return { valid: false, reason: t.rootEpoch <= currentEpoch ? 'rollback-or-replay' : 'epoch-gap' };
  if (t.previousRootFingerprint !== await fingerprint(rootRecord.publicKeyJwk)) return { valid: false, reason: 'old-root-fingerprint' };
  const { oldRootSignature, newRootSignature, ...body } = t;
  if (!(await verifySignature(rootRecord.publicKeyJwk, oldRootSignature, body))) return { valid: false, reason: 'old-signature' };
  if (!(await verifySignature(t.newRootPublicKeyJwk, newRootSignature, body))) return { valid: false, reason: 'new-signature' };

  const sortedCerts = [...certs].sort((a, b) => a.deviceId.localeCompare(b.deviceId));
  const ids = sortedCerts.map(c => c.deviceId);
  if (new Set(ids).size !== ids.length || canonical(ids) !== canonical([...t.deviceIds].sort((a, b) => a.localeCompare(b)))) return { valid: false, reason: 'certificate-inventory' };
  const digest = Buffer.from(await cryptoApi.subtle.digest('SHA-256', enc.encode(canonical(certs)))).toString('base64url');
  if (digest !== t.certificatesDigest) return { valid: false, reason: 'certificate-digest' };
  const active = Object.entries(deviceRecords).filter(([, d]) => d?.state === 'active').map(([id]) => id).sort((a, b) => a.localeCompare(b));
  if (canonical(active) !== canonical([...ids].sort((a, b) => a.localeCompare(b)))) return { valid: false, reason: 'active-inventory-changed' };

  for (const cert of certs) {
    const record = deviceRecords[cert.deviceId];
    if (!record || record.state !== 'active' || record.ownerUid !== uid || record.deviceId !== cert.deviceId) return { valid: false, reason: 'device-not-active' };
    if (!(await verifyCertificate(record.certificate, uid, rootRecord.publicKeyJwk))) return { valid: false, reason: 'stored-certificate-invalid' };
    if (canonical(record.certificate.ecdhPublicKey) !== canonical(cert.ecdhPublicKey)) return { valid: false, reason: 'device-key-changed' };
    if (cert.rootEpoch !== t.rootEpoch || !(await verifyCertificate(cert, uid, t.newRootPublicKeyJwk))) return { valid: false, reason: 'new-certificate-invalid' };
  }
  return { valid: true, rootEpoch: t.rootEpoch, newRootPublicKeyJwk: t.newRootPublicKeyJwk, certificates: certs };
}

/** Dependency-injected commit orchestration; store.commit must be atomic. */
export async function commitRootRotation({ uid, bundle, store }) {
  if (!store || typeof store.commit !== 'function') throw new Error('Repositório transacional indisponível.');
  return store.commit(uid, async snapshot => {
    const result = await validateRotationCommit({ uid, bundle, rootRecord: snapshot.root, deviceRecords: snapshot.devices });
    if (!result.valid) {
      const error = new Error(`Rotação rejeitada: ${result.reason}`);
      error.code = 'ROTATION_REJECTED';
      error.reason = result.reason;
      throw error;
    }
    return {
      root: {
        ownerUid: uid,
        algorithm: 'ECDSA-P256-SHA256',
        publicKeyJwk: result.newRootPublicKeyJwk,
        rootEpoch: result.rootEpoch,
        rotatedAtMs: Date.now(),
        previousRootFingerprint: bundle.transition.previousRootFingerprint
      },
      devices: Object.fromEntries(result.certificates.map(c => [c.deviceId, {
        certificate: c,
        rootEpoch: result.rootEpoch,
        certificateUpdatedAtMs: Date.now()
      }])),
      transitionRecord: { uid, rootEpoch: result.rootEpoch, bundle: { transition: bundle.transition, certificates: bundle.certificates } }
    };
  });
}

export function createHttpHandler({ auth, store, allowedUids = [], allowedOrigin = '' }) {
  const allowlist = new Set(allowedUids);
  return async function handler(req, res) {
    const send = (status, body) => {
      const headers = { 'content-type': 'application/json; charset=utf-8', 'vary': 'Origin' };
      if (allowedOrigin && req.headers.origin === allowedOrigin) headers['access-control-allow-origin'] = allowedOrigin;
      res.writeHead(status, headers); res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') {
      if (allowedOrigin && req.headers.origin !== allowedOrigin) return send(403, { error: 'origin-forbidden' });
      res.writeHead(204, { 'access-control-allow-origin': allowedOrigin || 'null', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type', 'access-control-max-age': '600', 'vary': 'Origin' });
      return res.end();
    }
    if (allowedOrigin && req.headers.origin !== allowedOrigin) return send(403, { error: 'origin-forbidden' });
    let requestUrl;
    try { requestUrl = new URL(req.url, 'https://criart.invalid'); } catch { return send(400, { error: 'invalid-url' }); }
    const isChainRead = req.method === 'GET' && requestUrl.pathname === '/v1/root-rotations/chain';
    const isCommit = req.method === 'POST' && req.url === '/v1/root-rotations/commit';
    if (!isChainRead && !isCommit) return send(404, { error: 'not-found' });
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
    if (!token) return send(401, { error: 'unauthorized' });
    let decoded;
    try { decoded = await auth.verifyIdToken(token); } catch { return send(401, { error: 'unauthorized' }); }
    if (allowlist.size && !allowlist.has(decoded.uid)) return send(403, { error: 'forbidden' });
    if (isChainRead) {
      if (typeof store.readChain !== 'function') return send(501, { error: 'chain-read-unavailable' });
      const fromEpoch = Number(requestUrl.searchParams.get('fromEpoch'));
      if (!Number.isSafeInteger(fromEpoch) || fromEpoch < 1) return send(400, { error: 'invalid-from-epoch' });
      try {
        const chain = await store.readChain(decoded.uid, fromEpoch);
        return send(200, chain);
      } catch { return send(500, { error: 'internal-error' }); }
    }
    let raw = '';
    try {
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 300 * 1024) return send(413, { error: 'payload-too-large' });
      }
      const input = JSON.parse(raw);
      if (!input?.bundle) return send(400, { error: 'missing-bundle' });
      const result = await commitRootRotation({ uid: decoded.uid, bundle: input.bundle, store });
      return send(200, { ok: true, rootEpoch: result.rootEpoch, rootPublicKeyJwk: result.newRootPublicKeyJwk });
    } catch (error) {
      if (error.code === 'ROTATION_REJECTED') return send(409, { error: 'rotation-rejected', reason: error.reason });
      if (error instanceof SyntaxError) return send(400, { error: 'invalid-json' });
      return send(500, { error: 'internal-error' });
    }
  };
}
