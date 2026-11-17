# Etapa 4B.19 — auditoria de segurança e endurecimento criptográfico

## Correção aplicada
- Novas identidades raiz ECDSA P-256 passam a manter a chave privada como `CryptoKey` não exportável.
- A chave pública continua exportável para certificados e verificação.
- O material PKCS#8 temporário é sobrescrito após a importação não exportável.
- O teste de pareamento agora exige `privateKey.extractable === false`.

## Revisão dos controles existentes
- Backend verifica token Firebase Auth e limita UIDs por allowlist exata configurada no Cloud Run.
- Rotação exige assinaturas da raiz antiga e da nova, época estritamente seguinte, inventário ativo exato e certificados reemitidos.
- Commit depende de transação Firestore e registra a transição no mesmo commit.
- Histórico de rotação não tem permissão de cliente nas regras; somente Admin SDK deve acessá-lo.
- Cadeia offline é validada salto a salto antes da gravação local.
- Aparelhos public-only não substituem chave privada; aparelho com chave privada raiz exige recuperação assistida.
- Firestore e Storage mantêm allowlist das duas contas e bloqueio por padrão para caminhos não declarados.
- Endpoint exige HTTPS configurado e origem web exata no servidor.

## Achados e pendências antes da produção

### Alto — chaves raiz já existentes
As CryptoKeys privadas persistidas por versões anteriores podem continuar exportáveis. A etapa 4B.20 implementa a migração local ao carregar a identidade: exporta temporariamente PKCS#8, importa a mesma chave como não exportável, prova a correspondência com a âncora pública por assinatura/verificação e atualiza somente o registro local correspondente. Se a prova falhar, a migração é interrompida e a chave original permanece intacta.

### Alto — homologação real ainda pendente
O Firebase Emulator não foi executado nesta sessão. A configuração e o harness foram adicionados na etapa 4B.18, mas as regras precisam passar no Emulator antes de qualquer deploy.

### Alto — backend não implantado
A transação Firestore foi validada por contrato e adaptador em memória, não por um projeto Firebase Emulator real. Cloud Run ainda exige conta de serviço de privilégio mínimo, `ALLOWED_UIDS` com exatamente os dois UIDs, `APP_ORIGIN` HTTPS exata, secrets/credenciais por Application Default Credentials e observabilidade.

### Médio — abuso e disponibilidade
O serviço limita payload a 300 KiB e exige Firebase Auth, allowlist e assinaturas criptográficas. Não há rate limiting distribuído nem enforcement de Firebase App Check. Recomenda-se proteção de borda (Cloud Armor ou mecanismo equivalente), alertas e limites operacionais antes de abrir o endpoint.

### Médio — tamanho da cadeia
A leitura atual limita a cadeia a 100 transições e falha de forma fechada se o cabeçalho remoto não corresponder. Não há paginação histórica da cadeia; isso deve ser ampliado antes de uso de longo prazo com muitas rotações.

### Médio — raiz de confiança inicial
O primeiro pin da raiz continua sendo TOFU: a regra Firestore impede substituição posterior, mas não prova a legitimidade da primeira chave. A primeira inicialização precisa ocorrer em aparelho confiável e ser conferida entre os dois participantes por canal independente.

## Resultado
A suíte automatizada completa passou após o endurecimento de novas chaves raiz. Esta auditoria não equivale a pentest, revisão independente ou homologação real do Firebase. Nenhuma alteração remota foi realizada.
