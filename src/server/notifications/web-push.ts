/** RFC 8291 / RFC 8188 encrypted Web Push + RFC 8292 VAPID, using Worker WebCrypto only.
 * No npm or Node crypto dependencies. Server-only; never bundle VAPID private key into the browser.
 */
export type PushSecrets = { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; VAPID_SUBJECT?: string };
export type Subscription = { endpoint:string; p256dh:string; auth:string };
const enc = new TextEncoder();
const b64decode = (s:string):Uint8Array => Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
const b64url = (bytes:Uint8Array):string => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const concat = (...parts:Uint8Array[]):Uint8Array => {const out=new Uint8Array(parts.reduce((x,p)=>x+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;};
const raw = (a:Uint8Array):BufferSource => a as unknown as BufferSource;
const hmac = async (key:Uint8Array,msg:Uint8Array):Promise<Uint8Array> => new Uint8Array(await crypto.subtle.sign('HMAC',await crypto.subtle.importKey('raw',raw(key),{name:'HMAC',hash:'SHA-256'},false,['sign']),raw(msg)));
const hkdf = async (salt:Uint8Array,ikm:Uint8Array,info:Uint8Array,length:number):Promise<Uint8Array> => {
  const prk=await hmac(salt,ikm);const result:Uint8Array[]=[];let previous=new Uint8Array();let n=0;
  while (concat(...result).length<length) {previous=await hmac(prk,concat(previous,info,new Uint8Array([++n])));result.push(previous);}
  return concat(...result).slice(0,length);
};
export function validPushEndpoint(value:string):boolean {
  try {const url=new URL(value);const h=url.hostname.toLowerCase();return url.protocol==='https:'&&!url.username&&!url.password&&value.length<2100&&url.port===''&&(
    h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h.endsWith('.push.apple.com')||h==='web.push.apple.com'||h.endsWith('.notify.windows.com')
  );} catch{return false;}
}
export function validateSubscription(s:unknown):s is Subscription {
  if(!s||typeof s!=='object')return false;
  const x=s as Record<string,unknown>;
  if(typeof x.endpoint!=='string'||typeof x.p256dh!=='string'||typeof x.auth!=='string'||!validPushEndpoint(x.endpoint))return false;
  try{return b64decode(x.p256dh).length===65&&b64decode(x.p256dh)[0]===4&&b64decode(x.auth).length>=16;}catch{return false;}
}
export function validVapid(secrets:PushSecrets):boolean {
  try {return !!(secrets.VAPID_SUBJECT&&/^(mailto:|https:\/\/)/.test(secrets.VAPID_SUBJECT)&&b64decode(secrets.VAPID_PUBLIC_KEY||'').length===65&&b64decode(secrets.VAPID_PRIVATE_KEY||'').length===32);}catch{return false;}
}
export async function sendWebPush(subscription:Subscription, data:{title:string;body:string;url:string;tag:string}, secrets:PushSecrets, fetcher:typeof fetch=fetch):Promise<number> {
  if(!validateSubscription(subscription)||!validVapid(secrets)) throw new Error('Invalid Web Push subscription or VAPID settings');
  const publicKey=b64decode(secrets.VAPID_PUBLIC_KEY!);const privateKey=b64decode(secrets.VAPID_PRIVATE_KEY!);
  const jwtHeader=b64url(enc.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
  const jwtBody=b64url(enc.encode(JSON.stringify({aud:new URL(subscription.endpoint).origin,exp:Math.floor(Date.now()/1000)+3600,sub:secrets.VAPID_SUBJECT})));
  const jwk={kty:'EC',crv:'P-256',x:b64url(publicKey.slice(1,33)),y:b64url(publicKey.slice(33)),d:b64url(privateKey)};
  const signingKey=await crypto.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signingKey,raw(enc.encode(`${jwtHeader}.${jwtBody}`))));
  const token=`${jwtHeader}.${jwtBody}.${b64url(signature)}`;
  const ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const receiverPublic=await crypto.subtle.importKey('raw',raw(b64decode(subscription.p256dh)),{name:'ECDH',namedCurve:'P-256'},false,[]);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:receiverPublic},ephemeral.privateKey,256));
  const serverPublic=new Uint8Array(await crypto.subtle.exportKey('raw',ephemeral.publicKey));
  const auth=b64decode(subscription.auth);
  const ikm=await hkdf(auth,shared,concat(enc.encode('WebPush: info\0'),b64decode(subscription.p256dh),serverPublic),32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await hkdf(salt,ikm,enc.encode('Content-Encoding: aes128gcm\0'),16);
  const nonce=await hkdf(salt,ikm,enc.encode('Content-Encoding: nonce\0'),12);
  // RFC 8188 final record delimiter 0x02; no additional padding is required.
  const plaintext=concat(enc.encode(JSON.stringify(data)),new Uint8Array([2]));
  if(plaintext.length>3600)throw new Error('Push payload too long');
  const aes=await crypto.subtle.importKey('raw',raw(key),'AES-GCM',false,['encrypt']);
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:raw(nonce)},aes,raw(plaintext)));
  const recordSize=new Uint8Array(4);new DataView(recordSize.buffer).setUint32(0,4096);
  const body=concat(salt,recordSize,new Uint8Array([serverPublic.length]),serverPublic,ciphertext);
  const response=await fetcher(subscription.endpoint,{method:'POST',headers:{'TTL':'3600','Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream','Authorization':`vapid t=${token}, k=${secrets.VAPID_PUBLIC_KEY}`},body:raw(body)});
  return response.status;
}
