import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';

const projectId = 'criart-rules-emulator';
const rules = await readFile(new URL('../../firebase/firestore.rules', import.meta.url), 'utf8');
const testEnv = await initializeTestEnvironment({ projectId, firestore: { rules } });
const uidA = 'SntSaG8ImRg3pbjAmC6pGqESCLH3';
const uidB = 'tWliIiH06KhVgEg4zqIZo5IeLyZ2';
const outsider = 'unauthorized-user';
const rootPath = uid => `private/private-room/deviceRoots/${uid}`;
const devicePath = (uid, id) => `private/private-room/devices/${uid}/items/${id}`;
const messagesPath = 'private/private-room/messages';

try {
  await testEnv.clearFirestore();
  const a = testEnv.authenticatedContext(uidA).firestore();
  const b = testEnv.authenticatedContext(uidB).firestore();
  const x = testEnv.authenticatedContext(outsider).firestore();
  const root = { ownerUid: uidA, algorithm: 'ECDSA-P256-SHA256', publicKeyJwk: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' }, rootEpoch: 1 };

  await assertSucceeds(setDoc(doc(a, rootPath(uidA)), root));
  await assertSucceeds(getDoc(doc(b, rootPath(uidA))));
  await assertFails(setDoc(doc(x, rootPath(outsider)), { ...root, ownerUid: outsider }));
  await assertFails(updateDoc(doc(a, rootPath(uidA)), { rootEpoch: 2 }));
  await assertFails(deleteDoc(doc(a, rootPath(uidA))));

  const device = { ownerUid: uidA, deviceId: 'device-a', state: 'active', certificate: { uid: uidA, deviceId: 'device-a' } };
  await assertSucceeds(setDoc(doc(a, devicePath(uidA, 'device-a')), device));
  await assertSucceeds(updateDoc(doc(a, devicePath(uidA, 'device-a')), { state: 'revoked', revokedAtMs: Date.now() }));
  await assertFails(updateDoc(doc(a, devicePath(uidA, 'device-a')), { state: 'active' }));
  await assertFails(deleteDoc(doc(a, devicePath(uidA, 'device-a'))));

  // A cadeia de rotação é escrita/lida pelo backend Admin SDK, não pelo cliente.
  await assertFails(getDoc(doc(a, `private/private-room/rootRotationTransitions/${uidA}/items/2`)));
  await assertFails(setDoc(doc(a, `private/private-room/rootRotationTransitions/${uidA}/items/2`), { rootEpoch: 2 }));

  // Preferências e documentos administrativos permanecem inacessíveis ao cliente.
  await assertFails(setDoc(doc(a, 'private/private-room/settings/global'), { rotationEnabled: true }));
  await assertFails(getDoc(doc(x, rootPath(uidA))));

  // Mensagens V2 legadas continuam aceitas para preservar compatibilidade.
  const v2 = {
    senderUid: uidA, senderNick: 'A', ciphertext: 'cipher-v2', salt: 'salt', iv: 'iv', v: 2,
    createdAtMs: Date.now(), seenBy: [], edited: false, reactions: {}
  };
  const v2Ref = await assertSucceeds(addDoc(collection(a, messagesPath), v2));
  await assertSucceeds(getDoc(v2Ref));
  await assertSucceeds(getDoc(doc(b, `${messagesPath}/${v2Ref.id}`)));
  await assertFails(addDoc(collection(x, messagesPath), v2));

  // Mensagens V3 aceitam apenas envelope estruturado e vinculado ao remetente.
  const v3 = {
    senderUid: uidA, senderNick: 'A',
    envelope: { v: 3, messageId: 'message-v3-1', senderUid: uidA, purpose: 'message' },
    v: 3, createdAtMs: Date.now(), seenBy: [], edited: false, reactions: {}
  };
  const v3Ref = await assertSucceeds(addDoc(collection(a, messagesPath), v3));
  await assertSucceeds(getDoc(v3Ref));
  await assertFails(addDoc(collection(a, messagesPath), { ...v3, envelope: { ...v3.envelope, senderUid: uidB } }));
  await assertFails(addDoc(collection(a, messagesPath), { ...v3, v: 2 }));

  // Participante pode marcar leitura e acrescentar reação, mas não alterar
  // o conteúdo cifrado de mensagem enviada pelo outro participante.
  const v2FromB = doc(b, `${messagesPath}/${v2Ref.id}`);
  await assertSucceeds(updateDoc(v2FromB, { seenBy: [uidB] }));
  await assertSucceeds(updateDoc(v2FromB, { reactions: { '👍': [uidB] } }));
  await assertFails(updateDoc(v2FromB, { ciphertext: 'tampered-by-recipient' }));

  console.log('PASS: Firestore Emulator rules — allowlist, immutable roots, revocation, server-only rotation history, settings denial, V2/V3 message compatibility and participant permissions');
} finally {
  await testEnv.cleanup();
}
