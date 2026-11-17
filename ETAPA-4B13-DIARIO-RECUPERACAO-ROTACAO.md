# CrIArt — Etapa 4B.13: diário local e recuperação de rotação

## Objetivo

Eliminar a janela de falha entre o commit remoto da nova raiz e a gravação local da nova chave privada. A rotação passa a ter uma pendência durável no IndexedDB antes de chamar o backend.

## Implementação

- `js/device-pairing-vault.js`
  - `savePendingRootRotation`: grava chave privada `CryptoKey`, chaves públicas, épocas e pacote JSON público como pendência; valida a raiz local e impede duas pendências concorrentes em transação IndexedDB.
  - `loadPendingRootRotation`: recupera a pendência após recarga ou reinício.
  - `promotePendingRootRotation`: em transação IndexedDB, substitui a raiz ativa e remove a pendência somente quando a raiz antiga local ainda corresponde ao snapshot e o estado remoto confirma exatamente época e chave pública novas.
- `js/device-root-rotation-journal.js`
  - `prepareRootRotationJournal`: prepara o diário antes do commit remoto.
  - `recoverRootRotationJournal`: classifica o estado como `none`, `awaiting-server-commit`, `promoted` ou `conflict`.
  - `executeRootRotationCommit`: coordena preparação local, commit autenticado e promoção local.
  - `resumePendingRootRotationCommit`: após recarga, consulta primeiro o estado remoto; promove se o servidor já concluiu ou reenvia o mesmo pacote se a raiz antiga ainda estiver ativa.
- O backend passou a devolver a chave pública raiz confirmada junto à época, para permitir correspondência exata na promoção local.

## Recuperação após falhas

- Falha antes do commit remoto: a raiz ativa não muda; a pendência permanece e pode ser reenviada com o mesmo pacote após consulta confirmando que o servidor ainda mantém a raiz antiga. Não há descarte local automático.
- Commit remoto concluído, navegador fechado antes da promoção: ao reabrir, o app consulta a raiz remota e chama `recoverRootRotationJournal`; se época e chave pública coincidirem, a chave privada pendente é promovida localmente.
- Estado remoto divergente: o diário retorna `conflict`; não substitui nem apaga a raiz local.
- Falha de rede: a pendência permanece. Não se deve gerar outra rotação enquanto ela existir.

## Limites

- A interface ainda não executa este fluxo automaticamente. A integração deve apresentar prévia, exigir confirmação humana e buscar a raiz remota atual antes da recuperação.
- A rotina de recuperação precisa ser chamada após autenticação e antes de liberar ações de autoridade (como iniciar pareamento) quando existir uma pendência.
- A implementação IndexedDB ainda precisa de teste de integração em navegador real e em navegadores móveis. Os testes automatizados desta etapa validam a máquina de estados e o contrato do diário com adaptador simulado.
- Nenhuma operação remota foi executada nesta etapa.
