# CrIArt — Etapa 3E: interface e fluxo de pareamento

## Implementado nesta entrega

- Tela de vinculação para um aparelho sem identidade legada.
- Leitura de QR Code pela câmera usando `BarcodeDetector`, quando disponível.
- Alternativa de colar o convite manualmente.
- Geração local do QR Code, sem serviço externo.
- Sessão temporária no Firestore com validade de três minutos.
- Comparação humana do código de segurança de seis dígitos nos dois aparelhos.
- Confirmação explícita no aparelho autorizador antes de enviar a resposta cifrada.
- Validação do certificado e da identidade raiz recebida.
- Persistência da identidade raiz e da chave privada do novo dispositivo no IndexedDB.
- Lista de certificados públicos dos dispositivos vinculados no painel de Privacidade.
- Cancelamento de sessões ainda abertas.
- Acesso do aparelho original preservado: a chave legada V2 não é substituída.

## Proteções importantes

- O QR Code contém somente dados públicos e efêmeros. Nenhuma chave privada é colocada nele.
- O novo aparelho precisa estar autenticado na mesma conta Firebase.
- A chave raiz pública recebida pelo QR precisa coincidir com a chave já fixada no Firestore.
- O novo aparelho não pode inicializar ou substituir a identidade raiz.
- O aparelho autorizador só envia a chave raiz privada dentro do canal ECDH/AES-GCM depois da confirmação visual do código.
- O certificado do novo dispositivo é assinado pela identidade raiz e verificado antes de ser aceito.
- A chave privada ECDH do dispositivo permanece local e não exportável.
- A chave privada raiz da conta é exportável em memória somente para ser transferida dentro do envelope AES-GCM autenticado; ela é compartilhada entre aparelhos vinculados. O comprometimento de um aparelho vinculado pode permitir a emissão de certificados falsos.
- Não há Cloud Functions nem serviço externo para gerar QR Code.

## Limitação deliberada desta etapa

**O pareamento criptográfico está integrado, mas o mensageiro ainda não opera em múltiplos dispositivos.** O novo aparelho permanece bloqueado após o pareamento para evitar que a rotina legada V2 publique outra chave pública e prejudique a conversa existente.

Ainda falta a Etapa 4: envelopes de chave por dispositivo para mensagens e anexos, leitura compatível V2/V3, histórico sincronizado e revogação/rotação da identidade raiz. Não habilitar mensagens no novo aparelho antes disso.

## Testes executados

- `node --check` nos módulos novos e alterados.
- Testes automatizados existentes do protocolo criptográfico.
- Teste automatizado da geração local de QR Code.
- Decodificação independente de um QR Code gerado com oferta real de teste; conteúdo recuperado idêntico ao JSON original.

## Testes pendentes

- IndexedDB/CryptoKey em Chrome Android e Chrome desktop.
- Câmera e `BarcodeDetector` em aparelhos reais.
- Firestore Emulator ou projeto Firebase de teste.
- Fluxo completo com duas contas e pelo menos quatro instalações.
- Teste de expiração, cancelamento, repetição e concorrência de sessões.

**Não publicar esta versão nem aplicar as regras em produção.** Não limpar IndexedDB, dados do navegador ou PWA dos aparelhos originais. Não apagar nem substituir documentos atuais de chaves.
