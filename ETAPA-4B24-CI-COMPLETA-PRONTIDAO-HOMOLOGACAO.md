# Etapa 4B.24 — integração contínua completa e prontidão para homologação

## Objetivo

Consolidar em um único fluxo de CI as três verificações obrigatórias do CrIArt: suíte de lógica/criptografia, regras Firestore no Firebase Emulator e persistência real IndexedDB/WebCrypto em navegador.

Esta etapa não publica o aplicativo, não implanta o backend e não altera Firebase remoto.

## Alterações

- Adicionado o job `node-tests`, que instala as dependências e executa a suíte completa `npm test` em Node.js 22.
- Mantidos os jobs independentes `firestore-rules` e `browser-indexeddb`.
- Os três jobs são executados em pull requests, pushes em `main`/`master` e acionamento manual.
- Mantidas permissões somente de leitura do conteúdo do repositório (`contents: read`).
- Nenhum segredo de produção, credencial Firebase ou comando de deploy é necessário no workflow.

## Critério de aprovação

A homologação automatizada só estará aprovada quando os três jobs estiverem verdes na mesma execução do GitHub Actions:

1. `Node.js cryptography and integration tests`
2. `Firebase Emulator Security Tests / firestore-rules`
3. `Firebase Emulator Security Tests / browser-indexeddb`

A execução local nesta sessão confirmou os 19 grupos de testes Node.js e a sintaxe de 52 arquivos JavaScript/MJS. O Firebase CLI não está instalado e o Chromium deste ambiente aborta durante o teste headless; portanto, Emulator e navegador permanecem pendentes de execução em runner GitHub Actions.

## Limites

- CI verde não equivale a teste funcional entre os dois usuários e seus aparelhos reais.
- CI verde não equivale a auditoria independente/pentest.
- Backend Cloud Run continua sem implantação nesta etapa.
- Não publicar as regras Firestore/Storage nem fazer deploy do backend sem autorização explícita e revisão das configurações de produção.
- Não executar migração de histórico nem rotação de raiz em dados reais durante a homologação.

## Próxima ação operacional

Depois que o pacote completo for disponibilizado, o responsável pelo repositório deverá enviar o conteúdo para uma branch de homologação ou abrir um pull request. O workflow será executado automaticamente. Somente após os três jobs verdes e os testes manuais controlados nas duas contas será possível avaliar a liberação.
