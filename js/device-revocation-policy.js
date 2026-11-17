/** Invariantes locais para o bloqueio cooperativo de instalações. */
export function assertDeviceRevocationAllowed({ activeDeviceIds, currentDeviceId, targetDeviceId }) {
  if (!Array.isArray(activeDeviceIds)) throw new Error('Inventário ativo inválido.');
  if (!currentDeviceId || !activeDeviceIds.includes(currentDeviceId)) throw new Error('Este aparelho não está ativo no inventário.');
  if (!targetDeviceId || !activeDeviceIds.includes(targetDeviceId)) throw new Error('O aparelho selecionado não está ativo.');
  if (targetDeviceId === currentDeviceId) throw new Error('Não é permitido revogar o aparelho em uso.');
  if (activeDeviceIds.length <= 1) throw new Error('Não é permitido revogar o último aparelho ativo.');
  return true;
}
