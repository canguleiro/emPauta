
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";

import {
  connectStorageEmulator,
  ref,
  uploadBytes,
  getBytes,
  deleteObject,
} from "firebase/storage";

import { readFile } from "node:fs/promises";

const PROJECT_ID = "criart-rules-emulator";
const STORAGE_HOST = "127.0.0.1";
const STORAGE_PORT = 9199;

const UID_A = "SntSaG8ImRg3pbjAmC6pGqESCLH3";
const UID_B = "tWliIiH06KhVgEg4zqIZo5IeLyZ2";
const UID_OUTSIDER = "usuario-nao-autorizado";

const FILE_PATH = "private/private-room/media/teste-emulator.bin";

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  storage: {
    rules: await readFile("firebase/storage.rules", "utf8"),
  },
});

function storageFor(uid) {
  const storage = env.authenticatedContext(uid).storage();
  connectStorageEmulator(storage, STORAGE_HOST, STORAGE_PORT);
  return storage;
}

async function run() {
  const storageA = storageFor(UID_A);
  const storageB = storageFor(UID_B);
  const storageOutsider = storageFor(UID_OUTSIDER);

  const fileA = ref(storageA, FILE_PATH);
  const fileB = ref(storageB, FILE_PATH);
  const fileOutsider = ref(storageOutsider, FILE_PATH);

  const payload = new Uint8Array([1, 2, 3, 4, 5]);
  const metadata = {
    contentType: "application/octet-stream",
  };

  // Participante A pode enviar arquivo.
  await assertSucceeds(uploadBytes(fileA, payload, metadata));

  // Participante B pode ler arquivo de A.
  await assertSucceeds(getBytes(fileB));

  // Participante B também pode enviar arquivo.
  const fileBPath = "private/private-room/media/teste-b.bin";
  const fileBRef = ref(storageB, fileBPath);
  await assertSucceeds(uploadBytes(fileBRef, payload, metadata));

  // Terceiro não pode ler nem gravar.
  await assertFails(getBytes(fileOutsider));
  await assertFails(uploadBytes(fileOutsider, payload, metadata));

  // Caminho fora da área autorizada deve ser bloqueado.
  const invalidPath = ref(storageA, "private/outra-sala/teste.bin");
  await assertFails(uploadBytes(invalidPath, payload, metadata));

  // Tipo de conteúdo diferente deve ser bloqueado.
  const wrongType = ref(
    storageA,
    "private/private-room/media/tipo-invalido.bin"
  );
  await assertFails(
    uploadBytes(wrongType, payload, {
      contentType: "text/plain",
    })
  );

  // Arquivo de exatamente 9 MiB deve ser bloqueado.
  const oversized = ref(
    storageA,
    "private/private-room/media/arquivo-grande.bin"
  );
  const largePayload = new Uint8Array(9 * 1024 * 1024);

  await assertFails(
    uploadBytes(oversized, largePayload, metadata)
  );

  // Terceiro não pode excluir arquivo.
  await assertFails(deleteObject(fileOutsider));

  // Participante pode excluir arquivo.
  await assertSucceeds(deleteObject(fileA));
  await assertSucceeds(deleteObject(fileBRef));

  console.log(
    "PASS: Storage Emulator rules — participantes autorizados, leitura, escrita, bloqueio de terceiros, caminhos, tamanho, contentType e exclusão."
  );
}

try {
  await run();
} finally {
  await env.cleanup();
}
