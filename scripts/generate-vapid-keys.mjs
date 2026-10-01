const pair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);

const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
const base64url = (bytes) => Buffer.from(bytes).toString('base64url');

console.log('VAPID_PUBLIC_KEY=' + base64url(publicKey));
console.log('VAPID_PRIVATE_KEY=' + privateJwk.d);
console.log('\nKeep the private key secret. Add the public key to both the Pages project and notification Worker.');
