import {
  saveAccountRoot, loadAccountRoot, savePendingRootRotation,
  loadPendingRootRotation, promotePendingRootRotation,
  pairingVaultDatabase
} from '../../js/device-pairing-vault.js';

const out = document.querySelector('#result');
const log = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const generateIdentity = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { privateKey: pair.privateKey, publicKeyJwk: await crypto.subtle.exportKey('jwk', pair.publicKey), algorithm: 'ECDSA-P256-SHA256', version: 1 };
};

try {
  assert(location.protocol === 'http:' || location.protocol === 'https:', 'Execute em origem HTTP(S), não file://.');
  assert(indexedDB && crypto?.subtle, 'IndexedDB/WebCrypto indisponível.');
  const uid = `browser-homolog-${crypto.randomUUID()}`;
  const original = await generateIdentity();
  await saveAccountRoot(uid, original);
  log.push('PASS: identidade raiz gravada no IndexedDB real.');

  const hardened = await loadAccountRoot(uid);
  assert(hardened?.privateKey && hardened.privateKey.extractable === false, 'A raiz legada não foi endurecida no IndexedDB.');
  const challenge = new TextEncoder().encode('criart-browser-persistence-proof');
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, hardened.privateKey, challenge);
  const publicKey = await crypto.subtle.importKey('jwk', hardened.publicKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, challenge), 'A chave endurecida não corresponde à identidade original.');
  const reloaded = await loadAccountRoot(uid);
  assert(reloaded.privateKey.extractable === false, 'A chave não permaneceu não exportável após nova leitura do IndexedDB.');
  log.push('PASS: endurecimento persistido; assinatura válida após releitura; chave não exportável.');

  const next = await generateIdentity();
  const pending = {
    privateKey: next.privateKey,
    newRootPublicKeyJwk: next.publicKeyJwk,
    oldRootPublicKeyJwk: hardened.publicKeyJwk,
    previousRootEpoch: 1,
    rootEpoch: 2,
    serializedPackage: JSON.stringify({ protocol: 'criart-root-rotation-test', uid, rootEpoch: 2 })
  };
  await savePendingRootRotation(uid, pending);
  const staged = await loadPendingRootRotation(uid);
  assert(staged?.privateKey?.extractable === false, 'A chave pendente não foi endurecida.');
  assert((await loadAccountRoot(uid)).rootEpoch === undefined, 'A preparação substituiu indevidamente a raiz ativa.');
  log.push('PASS: rotação pendente persistida sem substituir a raiz ativa.');

  let mismatchRejected = false;
  try {
    await promotePendingRootRotation(uid, { remoteRootEpoch: 2, remoteRootPublicKeyJwk: hardened.publicKeyJwk });
  } catch { mismatchRejected = true; }
  assert(mismatchRejected, 'Promoção aceitou confirmação remota divergente.');
  assert(await loadPendingRootRotation(uid), 'Pendência foi perdida após tentativa divergente.');
  log.push('PASS: confirmação remota divergente rejeitada; pendência preservada.');

  await promotePendingRootRotation(uid, { remoteRootEpoch: 2, remoteRootPublicKeyJwk: next.publicKeyJwk });
  const promoted = await loadAccountRoot(uid);
  assert(promoted.rootEpoch === 2 && promoted.privateKey.extractable === false, 'Nova raiz não foi promovida corretamente.');
  assert(!(await loadPendingRootRotation(uid)), 'Pendência não foi removida após promoção válida.');
  const nextPublic = await crypto.subtle.importKey('jwk', promoted.publicKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const nextSig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, promoted.privateKey, challenge);
  assert(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, nextPublic, nextSig, challenge), 'Nova identidade não conseguiu provar posse da chave.');
  log.push('PASS: promoção atômica validada; nova raiz persiste e pendência é encerrada.');

  out.textContent = `${log.join('\n')}\nPASS: HOMOLOGAÇÃO REAL DO INDEXEDDB CONCLUÍDA (${pairingVaultDatabase.name}/${pairingVaultDatabase.store}).`;
  document.documentElement.dataset.testStatus = 'passed';
} catch (error) {
  out.textContent = `${log.join('\n')}\nFAIL: ${error?.stack || error}`;
  document.documentElement.dataset.testStatus = 'failed';
}
