import { serializeRootRotationPackage, parseRootRotationPackage } from './device-root-rotation-package.js';
import { rootPublicFingerprint } from './device-root-rotation.js';
import { commitRootRotationOnServer } from './device-root-rotation-client.js';

export async function prepareRootRotationJournal({ uid, bundle, currentRoot, adapter }) {
  if (!uid || !bundle?.newRootIdentity?.privateKey || !currentRoot?.privateKey || !adapter?.savePendingRootRotation) {
    throw new Error('Não há autoridade local ou armazenamento seguro disponível para preparar a rotação.');
  }
  const previousRootEpoch = Number.isSafeInteger(currentRoot.rootEpoch) ? currentRoot.rootEpoch : 1;
  if (bundle.transition?.uid !== uid || bundle.transition.rootEpoch !== previousRootEpoch + 1) {
    throw new Error('A época do pacote não corresponde à identidade local.');
  }
  if (JSON.stringify(bundle.transition.newRootPublicKeyJwk) !== JSON.stringify(bundle.newRootIdentity.publicKeyJwk)) {
    throw new Error('A chave privada pendente não corresponde à chave pública do pacote.');
  }
  const pending = {
    privateKey: bundle.newRootIdentity.privateKey,
    newRootPublicKeyJwk: bundle.newRootIdentity.publicKeyJwk,
    oldRootPublicKeyJwk: currentRoot.publicKeyJwk,
    previousRootEpoch,
    rootEpoch: bundle.transition.rootEpoch,
    previousRootFingerprint: await rootPublicFingerprint(currentRoot.publicKeyJwk),
    newRootFingerprint: await rootPublicFingerprint(bundle.newRootIdentity.publicKeyJwk),
    serializedPackage: serializeRootRotationPackage(bundle)
  };
  await adapter.savePendingRootRotation(uid, pending);
  return { rootEpoch: pending.rootEpoch, newRootFingerprint: pending.newRootFingerprint };
}

export async function recoverRootRotationJournal({ uid, remoteRoot, adapter }) {
  const pending = await adapter.loadPendingRootRotation(uid);
  if (!pending) return { status: 'none' };
  const remoteEpoch = Number.isSafeInteger(remoteRoot?.rootEpoch) ? remoteRoot.rootEpoch : 1;
  const remoteJwk = remoteRoot?.publicKeyJwk;
  if (remoteEpoch === pending.rootEpoch &&
      JSON.stringify(remoteJwk) === JSON.stringify(pending.newRootPublicKeyJwk)) {
    await adapter.promotePendingRootRotation(uid, {
      remoteRootEpoch: remoteEpoch,
      remoteRootPublicKeyJwk: remoteJwk
    });
    return { status: 'promoted', rootEpoch: remoteEpoch };
  }
  if (remoteEpoch === pending.previousRootEpoch &&
      JSON.stringify(remoteJwk) === JSON.stringify(pending.oldRootPublicKeyJwk)) {
    return { status: 'awaiting-server-commit', rootEpoch: pending.rootEpoch };
  }
  return { status: 'conflict', rootEpoch: pending.rootEpoch };
}

export async function executeRootRotationCommit({ uid, auth, endpoint, bundle, currentRoot, adapter, fetchImpl = fetch }) {
  const prepared = await prepareRootRotationJournal({ uid, bundle, currentRoot, adapter });
  const serverResult = await commitRootRotationOnServer({ auth, endpoint, bundle, fetchImpl });
  if (serverResult.rootEpoch !== prepared.rootEpoch ||
      JSON.stringify(serverResult.rootPublicKeyJwk) !== JSON.stringify(bundle.newRootIdentity.publicKeyJwk)) {
    throw new Error('O servidor respondeu com uma identidade divergente. A pendência foi preservada para recuperação.');
  }
  const recovery = await recoverRootRotationJournal({
    uid,
    remoteRoot: { rootEpoch: serverResult.rootEpoch, publicKeyJwk: serverResult.rootPublicKeyJwk },
    adapter
  });
  if (recovery.status !== 'promoted') throw new Error('O servidor confirmou, mas a promoção local não foi concluída. A pendência foi preservada.');
  return { committed: true, rootEpoch: recovery.rootEpoch };
}


/** Retoma uma rotação já preparada após recarga, usando a CryptoKey privada recuperada do IndexedDB. */
export async function resumePendingRootRotationCommit({ uid, auth, endpoint, remoteRoot, adapter, fetchImpl = fetch }) {
  const pending = await adapter.loadPendingRootRotation(uid);
  if (!pending) return { status: 'none' };
  const initial = await recoverRootRotationJournal({ uid, remoteRoot, adapter });
  if (initial.status !== 'awaiting-server-commit') return initial;
  const bundle = parseRootRotationPackage(pending.serializedPackage);
  const serverResult = await commitRootRotationOnServer({ auth, endpoint, bundle, fetchImpl });
  if (serverResult.rootEpoch !== pending.rootEpoch ||
      JSON.stringify(serverResult.rootPublicKeyJwk) !== JSON.stringify(pending.newRootPublicKeyJwk)) {
    return { status: 'conflict', rootEpoch: pending.rootEpoch };
  }
  const recovery = await recoverRootRotationJournal({
    uid,
    remoteRoot: { rootEpoch: serverResult.rootEpoch, publicKeyJwk: serverResult.rootPublicKeyJwk },
    adapter
  });
  return recovery.status === 'promoted'
    ? { status: 'promoted', rootEpoch: recovery.rootEpoch }
    : recovery;
}
