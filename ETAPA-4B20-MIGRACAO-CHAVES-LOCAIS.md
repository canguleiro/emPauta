# Etapa 4B.20 — migração segura de chaves locais exportáveis

## Implementação
- Novo módulo `js/crypto-key-hardening.js`.
- Ao carregar uma raiz antiga exportável, a aplicação importa a mesma chave privada ECDSA P-256 como não exportável.
- Antes de persistir, assina um desafio contextualizado por UID e verifica com a chave pública já fixada.
- O PKCS#8 temporário é sobrescrito em memória após a importação.
- A atualização IndexedDB só ocorre se a âncora pública continuar idêntica e a chave persistida ainda for exportável.
- O mesmo mecanismo protege chaves de rotações pendentes antigas.
- Novas raízes já nascem não exportáveis desde a etapa 4B.19.

## Segurança e preservação
- A chave matemática não muda; apenas sua representação WebCrypto passa a impedir exportação.
- Não há geração de uma nova raiz, exclusão de certificados, remoção de dispositivos ou alteração remota.
- Se a chave não corresponder à âncora pública, a operação falha sem substituir o registro existente.
- O endurecimento reduz a extração direta da chave, mas não impede scripts maliciosos executados na origem de solicitar assinaturas enquanto o aparelho estiver comprometido.

## Testes
O teste unitário valida preservação da identidade criptográfica, não exportabilidade, idempotência e rejeição de chave pública divergente. A suíte completa passou. A validação específica do IndexedDB no navegador real ainda integra a homologação manual antes da implantação.
