/** Converte uma chave ECDSA P-256 exportável em CryptoKey não exportável,
 * comprovando que ela corresponde à chave pública confiável antes do uso. */
const encoder = new TextEncoder();

export async function hardenEcdsaPrivateKey({ privateKey, publicKeyJwk, binding = 'criart-root' }) {
  if (!privateKey || !publicKeyJwk || typeof binding !== 'string' || !binding) {
    throw new Error('Dados insuficientes para endurecer a chave privada.');
  }
  if (!privateKey.extractable) return { privateKey, changed: false };
  if (privateKey.algorithm?.name !== 'ECDSA' || privateKey.algorithm?.namedCurve !== 'P-256' || !privateKey.usages.includes('sign')) {
    throw new Error('A chave privada não é ECDSA P-256 com permissão de assinatura.');
  }
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('WebCrypto indisponível.');
  const pkcs8 = new Uint8Array(await subtle.exportKey('pkcs8', privateKey));
  try {
    const hardened = await subtle.importKey('pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const publicKey = await subtle.importKey('jwk', publicKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const challenge = encoder.encode(`CrIArt key-hardening proof v1|${binding}`);
    const signature = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, hardened, challenge);
    const valid = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, challenge);
    if (!valid) throw new Error('A chave privada não corresponde à âncora pública armazenada.');
    return { privateKey: hardened, changed: true };
  } finally {
    pkcs8.fill(0);
  }
}
