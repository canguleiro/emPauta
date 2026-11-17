# Etapa 4B.16 — Integração da sincronização de identidade na interface

## Implementado
- Painel de segurança na área Privacidade.
- Ação explícita para consultar a cadeia de rotação ao retornar do offline.
- Integração com `synchronizeOfflineDeviceRoot`, já responsável por validar a cadeia e atualizar somente aparelhos public-only autorizados.
- Estados visíveis para identidade atualizada, sincronizada, autoridade que exige recuperação assistida, aparelho ausente do inventário e cadeia rejeitada.
- O endpoint é obtido exclusivamente de `window.CRIART_ROOT_ROTATION_ENDPOINT` na configuração da implantação. Sem endpoint, o botão permanece desabilitado.

## Limites e segurança
- Nenhuma URL de produção foi presumida ou embutida.
- Nenhuma operação remota foi executada nesta etapa.
- Aparelhos com chave privada raiz local não têm sua autoridade alterada automaticamente.
- A interface não promove nem substitui chaves privadas; isso continua condicionado ao fluxo confiável do backend e ao diário de recuperação.

## Configuração necessária na implantação
Definir `window.CRIART_ROOT_ROTATION_ENDPOINT` para a URL HTTPS do serviço de rotação previamente implantado e homologado. Não apontar para produção antes da validação no Firebase Emulator e da revisão operacional.
