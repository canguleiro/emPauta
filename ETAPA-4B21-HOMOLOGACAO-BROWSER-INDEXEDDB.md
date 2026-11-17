# Etapa 4B.21 — Homologação de IndexedDB e WebCrypto no navegador

## Objetivo

Criar um teste de integração executável em navegador real, usando IndexedDB e WebCrypto nativos, para verificar a migração de chaves legadas e o ciclo local de preparação, recuperação e promoção de uma rotação.

## Cobertura

- Gravação de uma identidade raiz ECDSA P-256 real no IndexedDB.
- Leitura que aciona o endurecimento da chave privada exportável para não exportável.
- Prova criptográfica de correspondência entre a chave privada endurecida e a chave pública original.
- Releitura da chave persistida, verificando que `extractable` continua `false`.
- Persistência e endurecimento de uma chave de rotação pendente.
- Verificação de que a preparação não substitui a raiz ativa.
- Rejeição de confirmação remota divergente, preservando a pendência.
- Promoção após confirmação remota correspondente, com encerramento da pendência.

## Execução

Requer navegador Chromium instalado e Python 3 disponível para servir os arquivos por HTTP local:

```bash
npm run test:browser:indexeddb
```

Alternativamente, sirva a raiz do projeto por HTTP e abra:

`/tests/browser/indexeddb-vault.browser.html`

O teste cria um UID isolado e aleatório por execução. Não acessa Firebase, não usa contas reais e não apaga dados existentes.

## Resultado desta etapa

O harness e o roteiro de execução foram adicionados. A suíte Node.js completa continua sendo executada separadamente. A execução headless do Chromium neste ambiente não foi concluída de forma confiável; portanto, esta etapa não declara homologação real de navegador aprovada. A confirmação deve ser feita em um navegador Chromium funcional, preferencialmente também nos navegadores efetivamente usados nos dois aparelhos.

## Segurança e limites

- O teste local não valida regras Firestore, autenticação Firebase ou commit do backend.
- Não substitui o Firebase Emulator.
- Não altera dados remotos nem a identidade de produção.
- A limpeza do UID temporário de teste é deliberadamente omitida para evitar que o harness apague registros fora do seu escopo.
