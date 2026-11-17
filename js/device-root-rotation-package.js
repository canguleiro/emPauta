/**
 * CrIArt — pacote portátil público de rotação (4B.11).
 * Nunca serializa CryptoKey privada, material secreto ou dados de sessão.
 */
import { verifyRootRotationBundle, rootPublicFingerprint } from './device-root-rotation.js';

const FORMAT = 'criart-root-rotation-package-v1';
const MAX_BYTES = 256 * 1024;

function assertPublicBundle(bundle) {
  if (!bundle?.transition || !Array.isArray(bundle.certificates)) {
    throw new Error('Pacote de rotação incompleto.');
  }
  // A entrada pode ser o resultado bruto da criação (que mantém a CryptoKey
  // privada em memória); a lista explícita abaixo garante que nada disso saia.
}

export function serializeRootRotationPackage(bundle) {
  assertPublicBundle(bundle);
  const payload = {
    format: FORMAT,
    transition: bundle.transition,
    certificates: bundle.certificates
  };
  const json = JSON.stringify(payload);
  if (new TextEncoder().encode(json).byteLength > MAX_BYTES) {
    throw new Error('Pacote excede o limite de tamanho permitido.');
  }
  return json;
}

export function parseRootRotationPackage(serialized) {
  if (typeof serialized !== 'string' || !serialized.trim()) {
    throw new Error('Conteúdo do pacote vazio ou inválido.');
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_BYTES) {
    throw new Error('Pacote excede o limite de tamanho permitido.');
  }
  let parsed;
  try { parsed = JSON.parse(serialized); }
  catch { throw new Error('O pacote não contém JSON válido.'); }
  if (parsed?.format !== FORMAT || !parsed.transition || !Array.isArray(parsed.certificates)) {
    throw new Error('Formato de pacote de rotação não reconhecido.');
  }
  if (Object.hasOwn(parsed, 'newRootIdentity') || Object.hasOwn(parsed, 'privateKey')) {
    throw new Error('Pacote contém campo privado não permitido.');
  }
  return { transition: parsed.transition, certificates: parsed.certificates };
}

/** Valida assinatura, UID, inventário e epoch esperado antes de qualquer ação local. */
export async function validateRootRotationPackage({ serialized, expectedUid, trustedOldRootPublicKeyJwk, trustedRootEpoch }) {
  try {
    const bundle = parseRootRotationPackage(serialized);
    const transition = bundle.transition;
    if (transition.uid !== expectedUid) return { valid: false, reason: 'uid-mismatch' };
    if (!Number.isSafeInteger(trustedRootEpoch) || trustedRootEpoch < 1) {
      return { valid: false, reason: 'trusted-epoch-required' };
    }
    if (transition.rootEpoch !== trustedRootEpoch + 1) {
      return { valid: false, reason: transition.rootEpoch <= trustedRootEpoch ? 'rollback-or-replay' : 'epoch-gap' };
    }
    if (!(await verifyRootRotationBundle(bundle, expectedUid, trustedOldRootPublicKeyJwk))) {
      return { valid: false, reason: 'signature-or-inventory-invalid' };
    }
    return {
      valid: true,
      bundle,
      rootEpoch: transition.rootEpoch,
      previousRootFingerprint: transition.previousRootFingerprint,
      newRootFingerprint: await rootPublicFingerprint(transition.newRootPublicKeyJwk),
      deviceIds: [...transition.deviceIds]
    };
  } catch (error) {
    return { valid: false, reason: 'malformed-package', error: error.message };
  }
}
