/** Sincronização explícita de um aparelho public-only após retorno do offline. */
import { loadAccountRoot, loadLocalDevice, applyVerifiedPublicRootAndDeviceCertificate } from './device-pairing-vault.js';
import { fetchRootRotationChain } from './device-root-rotation-client.js';
import { verifyRootRotationChainResponse } from './device-root-rotation-chain.js';

export async function synchronizeOfflineDeviceRoot({ uid, deviceId, auth, endpoint, fetchImpl = fetch, vault = {} }) {
  if (!uid || !deviceId) throw new Error('Conta ou dispositivo não identificado.');
  const loadRoot = vault.loadAccountRoot || loadAccountRoot;
  const loadDevice = vault.loadLocalDevice || loadLocalDevice;
  const applyUpdate = vault.applyVerifiedPublicRootAndDeviceCertificate || applyVerifiedPublicRootAndDeviceCertificate;
  const root = await loadRoot(uid);
  const device = await loadDevice(uid, deviceId);
  if (!root?.publicKeyJwk || !device?.certificate) throw new Error('Âncora raiz ou certificado local ausente.');
  const trustedRootEpoch = Number.isSafeInteger(root.rootEpoch) ? root.rootEpoch : 1;
  const response = await fetchRootRotationChain({ auth, endpoint, fromEpoch: trustedRootEpoch, fetchImpl });
  const verified = await verifyRootRotationChainResponse({
    uid,
    trustedRootPublicKeyJwk: root.publicKeyJwk,
    trustedRootEpoch,
    response
  });
  if (!verified.valid) return { status: 'rejected', reason: verified.reason };
  if (verified.rootEpoch === trustedRootEpoch) return { status: 'up-to-date', rootEpoch: trustedRootEpoch };
  if (root.privateKey) return { status: 'authority-recovery-required', rootEpoch: verified.rootEpoch };
  const latestBundle = verified.transitions.at(-1)?.bundle;
  const certificate = latestBundle?.certificates.find(item => item.deviceId === deviceId);
  if (!certificate) return { status: 'device-not-in-rotated-inventory', rootEpoch: verified.rootEpoch };
  await applyUpdate(uid, deviceId, {
    trustedRootEpoch,
    trustedRootPublicKeyJwk: root.publicKeyJwk,
    nextRootEpoch: verified.rootEpoch,
    nextRootPublicKeyJwk: verified.rootPublicKeyJwk,
    certificate
  });
  return { status: 'synchronized', rootEpoch: verified.rootEpoch, rootFingerprint: verified.rootFingerprint };
}
