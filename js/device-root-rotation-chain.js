/**
 * CrIArt 4B.14 — sincronização de cadeia de rotação para aparelhos offline.
 * A cadeia é pública, assinada e validada salto a salto; nunca substitui a
 * raiz confiável local sem validação integral e confirmação da aplicação.
 */
import { verifyRootRotationBundle, rootPublicFingerprint } from './device-root-rotation.js';

export async function verifyRootRotationChain({ uid, trustedRootPublicKeyJwk, trustedRootEpoch, transitions }) {
  if (!uid || !trustedRootPublicKeyJwk || !Number.isSafeInteger(trustedRootEpoch) || trustedRootEpoch < 1 || !Array.isArray(transitions)) {
    return { valid: false, reason: 'invalid-trust-anchor' };
  }
  if (transitions.length > 100) return { valid: false, reason: 'chain-too-long' };
  let currentKey = trustedRootPublicKeyJwk;
  let currentEpoch = trustedRootEpoch;
  const accepted = [];
  for (const item of transitions) {
    const bundle = item?.bundle ?? item;
    const epoch = bundle?.transition?.rootEpoch;
    if (!Number.isSafeInteger(epoch) || epoch !== currentEpoch + 1) {
      return { valid: false, reason: epoch <= currentEpoch ? 'rollback-or-replay' : 'epoch-gap', atEpoch: epoch };
    }
    if (!(await verifyRootRotationBundle(bundle, uid, currentKey))) {
      return { valid: false, reason: 'invalid-transition-signature-or-inventory', atEpoch: epoch };
    }
    currentKey = bundle.transition.newRootPublicKeyJwk;
    currentEpoch = epoch;
    accepted.push({ rootEpoch: epoch, bundle });
  }
  return {
    valid: true,
    uid,
    fromEpoch: trustedRootEpoch,
    rootEpoch: currentEpoch,
    rootPublicKeyJwk: currentKey,
    rootFingerprint: await rootPublicFingerprint(currentKey),
    transitions: accepted
  };
}

/** Exige que a resposta cubra exatamente o intervalo solicitado, sem saltos. */
export async function verifyRootRotationChainResponse({ uid, trustedRootPublicKeyJwk, trustedRootEpoch, response }) {
  if (!response || response.uid !== uid || !Array.isArray(response.transitions)) {
    return { valid: false, reason: 'malformed-chain-response' };
  }
  if (response.fromEpoch !== trustedRootEpoch) return { valid: false, reason: 'wrong-chain-origin' };
  const result = await verifyRootRotationChain({ uid, trustedRootPublicKeyJwk, trustedRootEpoch, transitions: response.transitions });
  if (!result.valid) return result;
  if (response.currentEpoch !== result.rootEpoch) return { valid: false, reason: 'server-head-mismatch' };
  return result;
}
