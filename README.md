# Em Pauta Privado — V6

Versão preparada para o seu Firebase atual e para publicação pelo GitHub Pages.

## Arquitetura

- **2 contas Firebase Authentication** com e-mail/senha.
- A autorização real é feita pelas **Firestore/Storage Security Rules**, usando os dois UIDs autorizados.
- Não existe mais `private/access` nem autenticação anônima.
- Mensagens: **ECDH P-256 + HKDF-SHA-256 + AES-256-GCM** no navegador.
- O Firestore recebe apenas o envelope cifrado da mensagem; texto, resposta e metadados de mídia ficam dentro do ciphertext.
- Fotos/áudios são cifrados antes do upload e armazenados como `application/octet-stream`.
- O app lê a mídia com o SDK autenticado do Firebase Storage; não usa URLs públicas de download.
- Chave privada ECDH é mantida no IndexedDB como `CryptoKey` não exportável.
- PIN local de 6 dígitos é armazenado apenas como hash PBKDF2 + salt.
- Bloqueio automático opcional após 5 minutos de inatividade.
- Biometria do dispositivo via WebAuthn/platform authenticator quando o navegador e o aparelho suportarem.
- Modo disfarce tipo bloco de notas.
- Mensagens temporárias.
- Respostas, reações, edição, exclusão, busca e confirmação de leitura.
- PWA para instalação no smartphone.
- Service worker com cache do shell e atualização versionada.

## Firebase já configurado

Projeto:

`em-pauta-d6e92`

Authentication:

- E-mail/senha: ativado.
- Anônimo: desativado.

Os dois UIDs autorizados estão nas Rules:

- `SntSaG8ImRg3pbjAmC6pGqESCLH3`
- `tWliIiH06KhVgEg4zqIZo5IeLyZ2`

Storage:

- bucket regional US-EAST1.
- acesso somente aos dois UIDs.
- mídia limitada a menos de 8 MB por arquivo.
- somente `application/octet-stream`.

## Regras

Os arquivos em `firebase/` são cópias das regras que devem ser publicadas no Firebase Console:

- Firestore → Rules → `firebase/firestore.rules`
- Storage → Rules → `firebase/storage.rules`

**Importante:** o arquivo do GitHub não publica as Rules automaticamente porque este projeto usa GitHub Pages. Elas são configuradas separadamente no Firebase Console.

## Publicação no GitHub Pages

Na raiz do repositório devem ficar:

```text
index.html
manifest.json
sw.js
icon.svg
js/app.js
```

A pasta `firebase/` pode permanecer no repositório como documentação, mas não é necessária para o navegador executar o app.

## Teste recomendado antes de usar a conversa real

1. Publicar as Rules desta versão no Firebase.
2. Publicar os arquivos do app no GitHub Pages.
3. Entrar como Pessoa 1.
4. Configurar PIN.
5. Ativar biometria, se suportada.
6. Entrar como Pessoa 2 em outro dispositivo.
7. Confirmar no cabeçalho que aparece `Conexão cifrada`.
8. Enviar uma mensagem A → B.
9. Responder B → A.
10. Enviar uma imagem pequena.
11. Enviar um áudio curto.
12. Abrir o Firestore e verificar que não existe o texto da mensagem em campos legíveis.
13. Abrir o Storage e confirmar que os arquivos aparecem como `.bin` e não como imagem/áudio reconhecível.
14. Testar o modo disfarce.
15. Testar bloqueio por PIN.
16. Testar biometria.
17. Testar mensagens temporárias.

## Limitações de segurança

Esta é uma implementação prática para uso pessoal, não um protocolo de mensageria auditado como o Signal.

Ela não implementa Double Ratchet/forward secrecy completo. Uma chave ECDH estática por dispositivo significa que o comprometimento futuro da chave privada pode permitir a descriptografia de mensagens históricas armazenadas. Para manter o projeto simples, isso foi deixado de fora deliberadamente.

Também não há proteção contra um dispositivo totalmente comprometido por spyware/malware. Se o atacante controla o aparelho enquanto uma mensagem está sendo exibida, ele pode capturar tela, teclado ou memória.

A biometria usa o autenticador de plataforma/WebAuthn do navegador quando disponível. O PIN continua sendo o mecanismo de recuperação local.

## Observação sobre múltiplos dispositivos

O modelo atual foi pensado para **um dispositivo por pessoa**. Se a mesma conta for usada em outro aparelho, a chave pública daquela conta será substituída e mensagens novas poderão deixar o aparelho anterior sem conseguir derivar o mesmo segredo. Para o cenário de duas pessoas com um smartphone principal cada, isso é intencionalmente simples.


## Pareamento multi-dispositivo — trabalho em andamento

O módulo experimental `js/device-pairing.js` e sua documentação estão em `DEVICE-PAIRING-PROTOCOL.md`. Ele ainda não está integrado ao aplicativo, ao Firestore ou às mensagens. **Não publicar esta entrega como atualização funcional.**


## Revisão de segurança do protocolo de pareamento

A revisão atual endurece o módulo experimental `js/device-pairing.js`: a aceitação da oferta exige o UID autenticado, o host confere a identidade raiz anunciada e o novo dispositivo verifica que a chave privada raiz transferida corresponde à chave pública fixada. Os testes automatizados também cobrem UID divergente, raiz divergente, adulteração, código incorreto e expiração.

**Continua não integrado:** esta revisão não adiciona a interface de QR Code, transporte Firestore, armazenamento IndexedDB da identidade raiz, revogação/rotação, nem criptografia multi-dispositivo das mensagens. Não publicar como atualização funcional.


## Consolidação das etapas 3B e 3C

Este pacote reúne os dois módulos que precisam existir juntos:

- `js/device-pairing.js`: protocolo criptográfico ECDH/ECDSA e certificados.
- `js/device-pairing-store.js`: transporte das sessões e registros públicos pelo Firestore.

**Estado: módulos experimentais, ainda não integrados ao `app.js`.** A interface QR, a persistência das chaves privadas no IndexedDB, o fluxo de login, a validação de certificados recebidos e a gestão/revogação de dispositivos ainda precisam ser implementados. As mensagens continuam na versão V2 e não são multi-dispositivo.

Não publique este pacote e não aplique as regras incluídas em produção. As regras do Firestore ainda precisam ser validadas no Firebase Emulator Suite e revisadas para o modelo de segurança final.


## Desenvolvimento multi-dispositivo — Etapa 3E

A interface e o fluxo criptográfico de pareamento estão em desenvolvimento. Consulte `ETAPA-3E-STATUS.md`. O novo aparelho permanece bloqueado depois de ser vinculado até a conclusão dos envelopes criptográficos por dispositivo (Etapa 4). Não publicar esta etapa em produção.

## Etapa 4A — envelopes V3 por dispositivo

O módulo experimental `js/multidevice-envelope.js` implementa criptografia de conteúdo com chave aleatória AES-256-GCM e encapsulamento individual da chave para cada dispositivo ativo via ECDH efêmero P-256 + HKDF-SHA-256. Os certificados do remetente e do dispositivo local são validados contra as raízes públicas fixadas. A mesma camada atende mensagens JSON e bytes de anexos.

A Etapa 4A é um protocolo isolado e testado; ainda não foi conectado ao envio, à leitura ou ao histórico do `app.js`. V2 permanece intocado. Não publicar nem habilitar dispositivos pareados até concluir inventário confiável, compatibilidade de leitura V2/V3, anexos, revogação e testes no Firebase Emulator Suite. Consulte `ETAPA-4A-PROTOCOLO-V3.md`.


## Etapa 4B.1 — inventário confiável de dispositivos

O módulo de gerenciamento agora valida os certificados remotos contra a raiz fixada e oferece `loadDeviceCryptoContext` para recuperar a identidade local e a lista de dispositivos ativos verificados. Esta etapa prepara a integração V3, mas não altera o envio/recebimento V2 nem as regras do Firebase. Consulte `ETAPA-4B1-INVENTARIO-DISPOSITIVOS.md`.

## Etapa 4B.2 — mensagens V3 integradas

O envio de novas mensagens de texto passou a usar envelopes V3 por dispositivo. O cliente valida os inventários certificados das duas contas, inclui todos os dispositivos ativos (inclusive o remetente) como destinatários e grava o envelope no documento da mensagem. A leitura seleciona V3 por `v == 3` e mantém o caminho V2 para mensagens antigas nos aparelhos que ainda possuem a identidade legada correspondente.

As regras locais do Firestore agora contemplam criação V2 e V3 e atualização do envelope, sem remover a compatibilidade V2. **As regras não foram publicadas.** O envio de anexos permanece temporariamente bloqueado nesta etapa: a criptografia V3 de anexos e o transporte separado pelo Storage serão implementados na etapa seguinte. Pareamento de novos aparelhos continua sem liberação de acesso até a conclusão dos testes e migração coordenada.

## Etapa 4B.3 — anexos V3 por dispositivo

- Novos anexos são cifrados no cliente com AES-256-GCM e chave aleatória por arquivo.
- A chave de conteúdo é encapsulada individualmente para cada dispositivo autorizado das duas contas, usando ECDH P-256 + HKDF-SHA-256.
- O conteúdo cifrado binário é armazenado no Firebase Storage; o documento Firestore guarda apenas caminho, metadados básicos e envelope sem o campo `ciphertext`, evitando o limite de tamanho de documentos.
- A descriptografia verifica os certificados e exige wrapper destinado ao dispositivo local.
- Anexos V2 antigos continuam no caminho legado de leitura; mensagens e anexos antigos não são regravados automaticamente.
- Limite por arquivo: 8 MiB. As regras locais de Storage aceitam o pequeno acréscimo da tag AES-GCM (até 9 MiB).
- O teste `tests/attachment-v3.test.mjs` valida quatro instalações, envelope compacto, adulteração do arquivo e bloqueio de dispositivo externo.

As regras alteradas permanecem locais. Não houve publicação nem migração de dados em produção.

## Etapa 4B.4 — mecanismo de migração progressiva do histórico

Foi adicionado `js/history-migration.js`, um serviço isolado para migrar mensagens V2 enviadas pela própria conta para envelopes V3. Ele oferece prévia sem efeitos colaterais, processamento serial em lotes, tratamento de falhas parciais e exclusão de mensagens com anexos (que exigem conversão binária separada). Mensagens recebidas devem ser migradas pelo respectivo remetente, respeitando as regras Firestore atuais.

**Ainda não integrado à interface nem conectado ao Firestore:** esta etapa entrega o mecanismo testado, não executa migração automática. A integração deve incluir tela de prévia/confirmação e backup antes de qualquer gravação em produção. Os campos V2 originais não são removidos por este módulo. Consulte `ETAPA-4B4-MIGRACAO-HISTORICO.md`.


## Etapa 4B.5 — integração controlada da migração histórica

A interface de privacidade agora oferece prévia e execução confirmada da migração V2→V3 em lotes de até 25 mensagens. A função fica disponível apenas nos aparelhos originais que mantêm a chave V2 local. A consulta atual considera até 500 mensagens mais antigas; históricos maiores exigirão paginação específica. Nenhuma migração é automática e nenhuma alteração foi publicada no Firebase. Consulte `ETAPA-4B5-INTEGRACAO-MIGRACAO-HISTORICO.md`.

## Etapa 4B.6 — migração de anexos históricos

A conversão progressiva de anexos V2 para V3 está disponível nas configurações de privacidade, em aparelho original com a chave V2. O processo cria um novo arquivo cifrado por dispositivo, atualiza o corpo da mensagem e preserva o arquivo antigo. Consulte `ETAPA-4B6-MIGRACAO-ANEXOS-HISTORICOS.md` antes de executar a operação em ambiente real. Nenhuma migração é executada automaticamente.

## Etapa 4B.7 — paginação e validação local
A migração do histórico agora percorre o Firestore em páginas de 200 documentos, com cursor `startAfter` ordenado pelo ID do documento (incluindo registros sem `createdAtMs`) e limite de segurança de 50.000 registros por varredura. A interface informa quando esse limite é atingido. Os testes incluem históricos com mais de 500 mensagens e verificações estáticas das regras locais. Ainda não houve validação com Firebase Emulator ou backend remoto.


## Etapa 4B.8 — revogação cooperativa

A interface de dispositivos agora permite marcar um aparelho remoto como revogado, impede auto-revogação e preserva pelo menos um aparelho ativo. O app revalida a autorização local antes de operações V3. Esta revogação é cooperativa, não forte contra um dispositivo comprometido, pois a chave raiz ainda é compartilhada no pareamento atual. Consulte `ETAPA-4B8-REVOGACAO-COOPERATIVA.md` para limitações e validação. Nenhuma regra foi publicada.

## Etapa 4B.10 — protocolo verificável de rotação da raiz

Foi adicionado um protocolo offline com dupla assinatura (raiz antiga e nova), reemissão dos certificados dos dispositivos ativos e validação do inventário completo. O protocolo não altera Firestore nem IndexedDB automaticamente: a rotação efetiva exige mecanismo confiável de commit, prevenção de rollback e validação coordenada de todos os aparelhos. As regras atuais continuam proibindo atualização cliente da raiz.

## Rotação da autoridade raiz — etapas 4B.10 e 4B.11

O protocolo de rotação e seu pacote portátil estão implementados em `js/device-root-rotation.js` e `js/device-root-rotation-package.js`. A etapa 4B.11 permite exportar apenas a transição pública e validá-la contra a raiz antiga já confiável e uma época local previamente conhecida. Consulte `ETAPA-4B10-ROTACAO-RAIZ.md` e `ETAPA-4B11-PACOTE-PORTATIL-ROTACAO.md`.

**Atenção:** preparação e validação não equivalem a efetivação. A raiz remota permanece imutável pelas regras atuais. Não iniciar rotação real até existir mecanismo confiável de commit, estado anti-rollback persistente e procedimento de confirmação/recuperação para todos os aparelhos ativos.

## Rotação da identidade raiz — etapa 4B.12

O backend confiável de rotação está em `backend/root-rotation/`. Ele valida as assinaturas e o inventário e realiza o commit atômico via Firebase Admin SDK. A implantação é deliberadamente manual; consulte `ETAPA-4B12-BACKEND-CONFIAVEL-ROTACAO.md`. O frontend ainda não aciona o endpoint automaticamente.

## Diário local de rotação — etapa 4B.13

A preparação de rotação agora persiste a nova `CryptoKey` privada e o pacote público como pendência no IndexedDB, sem substituir a raiz ativa. A promoção só ocorre quando o estado remoto coincide exatamente com a nova época e chave; interrupções podem ser recuperadas sem gerar outra identidade. Consulte `ETAPA-4B13-DIARIO-RECUPERACAO-ROTACAO.md`.

- Etapa 4B.14: cadeia pública de rotação para aparelhos offline, histórico transacional no Firestore e validação sequencial anti-rollback. Consulte `ETAPA-4B14-CADEIA-ROTACAO-OFFLINE.md`.
- Etapa 4B.15: sincronização segura de aparelhos offline, com validação integral da cadeia e atualização atômica da raiz pública/certificado no IndexedDB. Consulte `ETAPA-4B15-SINCRONIZACAO-APARELHO-OFFLINE.md`.


## Etapa 4B.16 — Integração da sincronização na interface

Consulte `ETAPA-4B16-INTEGRACAO-INTERFACE-ROTACAO.md`. O painel de Privacidade oferece verificação explícita da cadeia de identidade; o botão permanece desabilitado enquanto `window.CRIART_ROOT_ROTATION_ENDPOINT` não estiver configurado. Nenhuma chamada remota ocorre por padrão.

## Etapa 4B.17 — testes integrados ponta a ponta

Consulte `ETAPA-4B17-TESTES-INTEGRACAO-E2E.md`. O teste simula duas contas, seis dispositivos, commit da rotação, recuperação de aparelho offline e isolamento entre contas usando um adaptador transacional em memória. Não substitui a homologação no Firebase Emulator.

## Etapa 4B.18 — homologação Firebase Emulator

Consulte `ETAPA-4B18-HOMOLOGACAO-FIREBASE-EMULATOR.md` e `tests/emulator/README.md`. A configuração e os testes de regras foram preparados para um projeto fictício isolado. A execução real no Emulator permanece pendente porque o Firebase CLI e as dependências não estão instalados neste ambiente.

## Etapa 4B.19 — auditoria de segurança

Consulte `ETAPA-4B19-AUDITORIA-SEGURANCA.md`. Novas chaves privadas raiz são não exportáveis. A auditoria registra explicitamente as pendências de migração das chaves antigas, homologação no Emulator, implantação do backend, proteção contra abuso, paginação da cadeia e confiança inicial TOFU.


## Etapa 4B.20 — endurecimento de chaves locais existentes

A carga de uma identidade raiz ou rotação pendente antiga converte a mesma chave ECDSA P-256 em uma CryptoKey não exportável, após prova criptográfica de correspondência com a chave pública. O material PKCS#8 temporário é sobrescrito; se a prova falhar, não há substituição do registro local.

## Homologação Firestore Emulator (Etapa 4B.22)

Consulte `ETAPA-4B22-HOMOLOGACAO-FIREBASE-EMULATOR.md`. Para executar localmente: `npm install`, instalar `firebase-tools` globalmente, executar `npm run test:emulator:preflight` e depois `npm run test:emulator`. O workflow `.github/workflows/firebase-emulator.yml` executa a mesma suíte em CI. Esses testes não fazem deploy.


## Etapa 4B.24 — integração contínua completa

O workflow GitHub Actions agora executa três gates independentes: suíte Node.js de criptografia/integração, regras Firestore no Emulator e teste real de IndexedDB/WebCrypto no Chrome. A homologação automatizada exige os três jobs verdes. Nenhum job publica o app ou altera serviços Firebase remotos. Consulte `ETAPA-4B24-CI-COMPLETA-PRONTIDAO-HOMOLOGACAO.md`.
