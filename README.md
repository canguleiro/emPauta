# Em Pauta Privado — V4

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
