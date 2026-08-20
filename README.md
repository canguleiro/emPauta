# Em Pauta Privado — V2

Esta versão mantém a ideia do seu protótipo, mas muda o foco para **duas pessoas, privacidade e smartphone**.

## O que foi implementado

- Firebase Authentication com e-mail/senha.
- Conversa limitada por regras do Firestore aos dois UIDs definidos em `private/access`.
- ECDH P-256 para acordo de segredo entre os dois dispositivos.
- HKDF-SHA-256 para derivação de chaves.
- AES-256-GCM para cifrar o conteúdo das mensagens.
- Anexos cifrados no navegador antes do upload para Firebase Storage.
- Chave privada de cada dispositivo armazenada no IndexedDB como `CryptoKey` não exportável.
- PIN local de 6 dígitos para bloquear a interface.
- Bloqueio automático opcional após 5 minutos.
- Modo disfarce tipo bloco de notas.
- Notificações sem conteúdo (quando adicionadas).
- Mensagens temporárias por janela de tempo.
- Respostas, reações, edição, exclusão, busca e confirmação de leitura.
- PWA para instalação no smartphone.
- CSP básica e remoção de dependências de UI externas.

## Antes de usar

### 1. Firebase Authentication

No Firebase Console, habilite **Authentication > Sign-in method > Email/Password** e crie as duas contas. A documentação oficial do Firebase recomenda Authentication + Security Rules para proteger dados de clientes web. 

### 2. Criar o documento de acesso

Depois de criar as duas contas, copie seus UIDs e crie manualmente no Firestore:

`private/access`

com:

```json
{
  "uidA": "UID_DA_PESSOA_1",
  "uidB": "UID_DA_PESSOA_2"
}
```

Não deixe esse documento gravável pelo cliente.

### 3. Publicar as regras

Use:

- `firebase/firestore.rules`
- `firebase/storage.rules`

As regras são uma parte essencial da segurança. Não use regras abertas como `allow read, write: if true`.

### 4. Hospedar em HTTPS

Web Crypto exige contexto seguro (HTTPS, com exceção de ambientes locais de desenvolvimento).

## Limitação de segurança importante

Esta implementação é uma evolução prática e simples, não um protocolo de mensageria auditado no nível do Signal.

Ela protege muito bem contra:
- banco Firebase acessado por terceiros;
- armazenamento de mensagens em texto aberto;
- leitura casual por outra pessoa no aparelho;
- tráfego sem acesso ao conteúdo;
- anexos armazenados sem cifragem.

Ela **não garante segurança contra um dispositivo totalmente comprometido por spyware/malware**. Se o atacante controla o aparelho enquanto a conversa está sendo exibida, nenhum PWA consegue impedir captura de tela, teclado ou conteúdo em memória.

Também não há aqui um Double Ratchet/forward secrecy completo. Para um projeto pessoal de duas pessoas, isso mantém a implementação muito mais simples; se o objetivo mudar para ameaça de alto nível, a recomendação é migrar para um protocolo e implementação criptográfica auditados em vez de ampliar esta criptografia manualmente.

## Observação sobre o Firebase config

O `apiKey` presente no código do Firebase para aplicações web não deve ser tratado como a senha do sistema. A proteção real vem de Authentication, Security Rules, App Check e do desenho de autorização. Nunca coloque senhas administrativas, chaves privadas ou credenciais de servidor no JavaScript do cliente.

## Próxima etapa recomendada

Antes de colocar mensagens reais, teste:

1. login da pessoa A;
2. login da pessoa B;
3. criação das duas chaves;
4. envio A -> B;
5. envio B -> A;
6. abrir o Firestore e confirmar que `ciphertext` não é texto legível;
7. abrir o Storage e confirmar que o arquivo armazenado é um blob cifrado;
8. testar logout/login;
9. testar perda do cache do navegador e decidir como será o processo de recuperação de identidade.

A Web Crypto API fornece ECDH, HKDF e AES-GCM para esse tipo de construção, mas a segurança final depende do sistema inteiro, não apenas da criptografia.
