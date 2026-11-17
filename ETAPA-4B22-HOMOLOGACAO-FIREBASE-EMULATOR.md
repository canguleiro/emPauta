# Etapa 4B.22 — homologação automatizável no Firebase Emulator

## Implementado

- Ampliação dos testes de regras Firestore para cobrir:
  - allowlist das duas contas e bloqueio de usuário externo;
  - criação inicial e imutabilidade da raiz pública;
  - revogação cooperativa sem reativação nem exclusão;
  - histórico de rotação inacessível a clientes (somente backend Admin SDK);
  - bloqueio de escrita em configurações administrativas;
  - compatibilidade de criação/leitura de mensagens V2 e V3;
  - validação do vínculo do remetente no envelope V3;
  - permissões de leitura, reações e confirmação de leitura;
  - bloqueio de alteração do conteúdo por destinatário.
- Workflow GitHub Actions para executar os testes em pull requests, pushes nas branches `main`/`master` e execução manual.
- Script de pré-verificação local para detectar CLI, dependências e arquivos ausentes.
- Projeto de teste fixo e fictício: `criart-rules-emulator`.

## Execução local

```bash
npm install
npm install --global firebase-tools
npm run test:emulator:preflight
npm run test:emulator
```

## Resultado desta etapa

A suíte Node.js de lógica criptográfica e integração foi executada e passou. O teste Firestore Emulator **não foi executado nesta sessão**, pois o ambiente não dispõe de Firebase CLI/dependências instaladas e a instalação de pacotes não concluiu. O workflow foi preparado para executar essa homologação em CI quando o código for enviado ao repositório.

Não declarar as regras homologadas até obter uma execução verde do job `Firebase Emulator Security Tests`.

## Segurança e limites

- O workflow não executa deploy.
- O projeto usado nos testes é fictício e isolado.
- Nenhuma credencial de produção é necessária.
- As regras de cliente não tentam validar assinaturas ECDSA; a transição de raiz permanece exclusiva do backend confiável.
- A aprovação no Emulator ainda não substitui testes nos dois usuários e nos aparelhos reais.
