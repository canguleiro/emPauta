# CrIArt — Etapa 4B.5: integração controlada da migração histórica

## Entregue
- Painel de migração adicionado às configurações de privacidade.
- Prévia explícita, sem descriptografar ou gravar conteúdo.
- Execução mediante confirmação do usuário, em lotes de até 25 mensagens.
- Migração disponível somente em aparelhos originais que ainda possuem a chave V2 local.
- Consulta limitada aos 500 registros mais antigos retornados pela consulta ordenada, em linha com o limite atual do histórico exibido.
- Apenas mensagens V2 de texto enviadas pela própria conta são migradas.
- Mensagens recebidas, anexos, registros inválidos e mensagens já convertidas são ignorados.
- O conteúdo claro permanece em memória; a gravação atualiza somente `envelope` e `v`.
- Falhas por mensagem são registradas sem interromper o restante do lote.

## Como usar
1. Abrir Configurações → Privacidade em um aparelho original.
2. Selecionar **Verificar mensagens** para obter uma prévia.
3. Fazer backup dos dados antes de prosseguir.
4. Selecionar **Migrar próximo lote (25)** e confirmar.
5. Repetir a prévia e a migração até não haver mensagens próprias elegíveis.
6. Executar o procedimento também no aparelho original da outra conta para migrar as mensagens enviadas por ela.

## Salvaguardas
- Não executa automaticamente na inicialização.
- Não migra em aparelhos pareados sem chave V2 original.
- Não apaga mensagens nem anexos.
- Não altera documentos de mensagens recebidas.
- Não publica regras nem executa migração em produção durante os testes.

## Limitações conhecidas
- A consulta da interface considera até 500 mensagens mais antigas por rodada de consulta. Históricos maiores exigirão paginação dedicada antes de uma migração integral.
- A etapa não migra arquivos binários históricos.
- A migração substitui o conteúdo cifrado do documento; recomenda-se backup cifrado anterior.
- Não recupera chave V2 perdida.

## Testes
`npm test` valida protocolo, pareamento, mensagens, anexos, serviço de migração e integração da interface.
