import { serializeRootRotationPackage, parseRootRotationPackage } from './device-root-rotation-package.js';

/** Cliente explícito do endpoint confiável de rotação. Não é chamado automaticamente. */
export async function commitRootRotationOnServer({ auth, endpoint, bundle, fetchImpl = fetch }) {
  if (!auth?.currentUser) throw new Error('É necessário estar autenticado.');
  if (!endpoint || !/^https:\/\//.test(endpoint)) throw new Error('Endpoint HTTPS de rotação não configurado.');
  if (!bundle?.transition || !Array.isArray(bundle.certificates)) throw new Error('Pacote de rotação inválido.');
  const token = await auth.currentUser.getIdToken(true);
  const response = await fetchImpl(endpoint.replace(/\/$/, '') + '/v1/root-rotations/commit', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bundle: parseRootRotationPackage(serializeRootRotationPackage(bundle)) })
  });
  let result;
  try { result = await response.json(); } catch { throw new Error('Resposta inválida do serviço de rotação.'); }
  if (!response.ok || result?.ok !== true) {
    const reason = result?.reason || result?.error || `HTTP ${response.status}`;
    throw new Error(`A rotação não foi efetivada: ${reason}`);
  }
  return { committed: true, rootEpoch: result.rootEpoch, rootPublicKeyJwk: result.rootPublicKeyJwk };
}


/** Busca a cadeia pública desde a época confiável local do aparelho. */
export async function fetchRootRotationChain({ auth, endpoint, fromEpoch, fetchImpl = fetch }) {
  if (!auth?.currentUser) throw new Error('É necessário estar autenticado.');
  if (!endpoint || !/^https:\/\//.test(endpoint)) throw new Error('Endpoint HTTPS de rotação não configurado.');
  if (!Number.isSafeInteger(fromEpoch) || fromEpoch < 1) throw new Error('Época local inválida.');
  const token = await auth.currentUser.getIdToken(true);
  const url = endpoint.replace(/\/$/, '') + '/v1/root-rotations/chain?fromEpoch=' + encodeURIComponent(fromEpoch);
  const response = await fetchImpl(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
  let result;
  try { result = await response.json(); } catch { throw new Error('Resposta inválida da cadeia de rotação.'); }
  if (!response.ok) throw new Error(`Não foi possível obter a cadeia de rotação: ${result?.error || response.status}`);
  return result;
}
