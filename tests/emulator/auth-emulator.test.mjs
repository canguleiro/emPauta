import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  deleteUser
} from "firebase/auth";

const app = initializeApp({
  apiKey: "fake-api-key-for-emulator",
  authDomain: "localhost",
  projectId: "criart-rules-emulator",
  appId: "1:123456789:web:emulator"
});

const auth = getAuth(app);

connectAuthEmulator(
  auth,
  "http://127.0.0.1:9099",
  { disableWarnings: true }
);

const email = `auth-emulator-${Date.now()}@example.test`;
const password = "TesteEmulator#2026";

let testUid = null;

try {
  // Criação de conta
  const created = await createUserWithEmailAndPassword(
    auth,
    email,
    password
  );

  testUid = created.user.uid;
  assert.ok(testUid, "A conta deve possuir UID");

  // Encerramento da sessão
  await signOut(auth);
  assert.equal(auth.currentUser, null);

  // Novo login
  const loggedIn = await signInWithEmailAndPassword(
    auth,
    email,
    password
  );

  assert.equal(loggedIn.user.uid, testUid);

  // Senha incorreta deve ser rejeitada
  await signOut(auth);

  await assert.rejects(
    () => signInWithEmailAndPassword(
      auth,
      email,
      "SenhaIncorreta#2026"
    )
  );

  // Limpeza da conta de teste
  await signInWithEmailAndPassword(auth, email, password);
  await deleteUser(auth.currentUser);

  console.log(
    "PASS: Auth Emulator — criação de conta, UID, logout, login, rejeição de senha incorreta e exclusão."
  );
} finally {
  // Tenta remover a conta caso algum teste tenha falhado
  if (auth.currentUser) {
    try {
      await deleteUser(auth.currentUser);
    } catch {}
  }

  await deleteApp(app);
}