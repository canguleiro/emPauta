/**
 * Varredura paginada do histórico. O adaptador Firebase fornece uma página
 * e o cursor do último documento; este módulo controla limites e deduplicação.
 */
export async function collectMessageHistoryPages({
  fetchPage,
  pageSize = 200,
  maxPages = 250
}) {
  if (typeof fetchPage !== 'function') throw new Error('A função fetchPage é obrigatória.');
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('pageSize deve ficar entre 1 e 500.');
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 1000) throw new Error('maxPages deve ficar entre 1 e 1000.');

  const messages = [];
  const seen = new Set();
  let cursor = null;
  let pages = 0;
  let exhausted = false;

  while (pages < maxPages) {
    const page = await fetchPage({ cursor, pageSize });
    if (!page || !Array.isArray(page.items)) throw new Error('Página de histórico inválida.');
    pages++;

    for (const item of page.items) {
      if (!item || typeof item.id !== 'string') continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      messages.push(item);
    }

    if (page.items.length < pageSize || page.nextCursor == null) {
      exhausted = true;
      break;
    }
    if (page.nextCursor === cursor) throw new Error('Cursor de paginação não avançou.');
    cursor = page.nextCursor;
  }

  return {
    messages,
    pages,
    truncated: !exhausted,
    exhausted,
    scanned: messages.length
  };
}
