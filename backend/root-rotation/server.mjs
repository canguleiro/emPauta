import http from 'node:http';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { createHttpHandler } from './rotation-service.mjs';

initializeApp({ credential: applicationDefault() });
const db = getFirestore();
const auth = getAuth();
const ROOM = 'private-room';

const store = {
  async commit(uid, validateAndBuild) {
    return db.runTransaction(async tx => {
      const rootRef = db.doc(`private/${ROOM}/deviceRoots/${uid}`);
      const devicesCol = db.collection(`private/${ROOM}/devices/${uid}/items`);
      const [rootSnap, devicesSnap] = await Promise.all([tx.get(rootRef), tx.get(devicesCol)]);
      if (!rootSnap.exists) throw new Error('Raiz não cadastrada.');
      const devices = Object.fromEntries(devicesSnap.docs.map(d => [d.id, d.data()]));
      const writes = await validateAndBuild({ root: rootSnap.data(), devices });
      tx.set(rootRef, { ...writes.root, rotatedAt: FieldValue.serverTimestamp() }, { merge: true });
      for (const [deviceId, update] of Object.entries(writes.devices)) {
        tx.update(devicesCol.doc(deviceId), update);
      }
      const historyRef = db.doc(`private/${ROOM}/rootRotationHistory/${uid}/items/${String(writes.root.rootEpoch).padStart(10, '0')}`);
      tx.create(historyRef, { ...writes.transitionRecord, createdAt: FieldValue.serverTimestamp() });
      return { rootEpoch: writes.root.rootEpoch, newRootPublicKeyJwk: writes.root.publicKeyJwk };
    });
  },
  async readChain(uid, fromEpoch) {
    const rootRef = db.doc(`private/${ROOM}/deviceRoots/${uid}`);
    const history = db.collection(`private/${ROOM}/rootRotationHistory/${uid}/items`);
    const [rootSnap, historySnap] = await Promise.all([
      rootRef.get(),
      history.where('rootEpoch', '>', fromEpoch).orderBy('rootEpoch', 'asc').limit(100).get()
    ]);
    if (!rootSnap.exists) throw new Error('Raiz não cadastrada.');
    return {
      uid,
      fromEpoch,
      currentEpoch: Number.isSafeInteger(rootSnap.data().rootEpoch) ? rootSnap.data().rootEpoch : 1,
      transitions: historySnap.docs.map(doc => doc.data())
    };
  }
};

const allowedUids = (process.env.ALLOWED_UIDS || '').split(',').map(v => v.trim()).filter(Boolean);
if (allowedUids.length !== 2) throw new Error('Configure ALLOWED_UIDS com exatamente os dois UIDs autorizados.');
const allowedOrigin = process.env.APP_ORIGIN || '';
if (!allowedOrigin.startsWith('https://')) throw new Error('Configure APP_ORIGIN com a origem HTTPS exata do aplicativo.');
const handler = createHttpHandler({ auth, store, allowedUids, allowedOrigin });
const port = Number(process.env.PORT || 8080);
http.createServer((req, res) => handler(req, res)).listen(port, '0.0.0.0', () => {
  process.stdout.write(`CrIArt root-rotation service listening on ${port}\n`);
});
