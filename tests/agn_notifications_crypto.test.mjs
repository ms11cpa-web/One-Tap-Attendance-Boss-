import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
import {generateKeyPairSync,webcrypto} from 'node:crypto';
import {test} from 'node:test';
const {crypto: oldCrypto}=globalThis; if(!globalThis.crypto)globalThis.crypto=webcrypto;
const source=readFileSync(new URL('../src/server/notifications/web-push.ts',import.meta.url),'utf8');
const js=stripTypeScriptTypes(source);
const mod=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const b64=(x)=>Buffer.from(x,'base64url');
const b64url=(x)=>Buffer.from(x).toString('base64url');
const cat=(...parts)=>Buffer.concat(parts.map(p=>Buffer.from(p)));
async function hmac(key,data){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return Buffer.from(await crypto.subtle.sign('HMAC',k,data));}
async function hkdf(salt,ikm,info,len){const prk=await hmac(salt,ikm);return (await hmac(prk,cat(info,Buffer.from([1])))).subarray(0,len);}
test('Rejects unsafe endpoints and malformed subscription keys',()=>{
 assert.equal(mod.validPushEndpoint('http://127.0.0.1/bad'),false);
 assert.equal(mod.validPushEndpoint('https://some-site.example.com/'),false);
 assert.equal(mod.validateSubscription({endpoint:'https://fcm.googleapis.com/test',p256dh:'bad',auth:'bad'}),false);
});
test('VAPID signature verifies and encrypted payload decrypts with browser ECDH key',async()=>{
 const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({format:'jwk'});
 const publicKey=b64url(cat(Buffer.from([4]),b64(keys.x),b64(keys.y)));
 const vapid={VAPID_PUBLIC_KEY:publicKey,VAPID_PRIVATE_KEY:keys.d,VAPID_SUBJECT:'mailto:test@example.com'};
 const receiver=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const receiverPublic=Buffer.from(await crypto.subtle.exportKey('raw',receiver.publicKey));
 const auth=crypto.getRandomValues(new Uint8Array(16));
 let captured;
 const response=await mod.sendWebPush({endpoint:'https://fcm.googleapis.com/fcm/send/test',p256dh:b64url(receiverPublic),auth:b64url(auth)},
  {title:'AGN task',body:'Review your assignment',url:'/ambassadors',tag:'xyz'},vapid,async(_url,options)=>{captured=options;return {status:201};});
 assert.equal(response,201);
 const jwt=captured.headers.Authorization.split('t=')[1].split(',')[0];
 const [header,payload,signature]=jwt.split('.');
 assert.equal(JSON.parse(b64(payload)).aud,'https://fcm.googleapis.com');
 const pub=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:keys.x,y:keys.y},{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},pub,b64(signature),Buffer.from(`${header}.${payload}`)),true);
 const binary=Buffer.from(captured.body);const salt=binary.subarray(0,16);const rs=binary.readUInt32BE(16);assert.equal(rs,4096);
 const senderRaw=binary.subarray(21,86),encrypted=binary.subarray(86);
 const senderPublic=await crypto.subtle.importKey('raw',senderRaw,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const shared=Buffer.from(await crypto.subtle.deriveBits({name:'ECDH',public:senderPublic},receiver.privateKey,256));
 const ikm=await hkdf(auth,shared,cat(Buffer.from('WebPush: info\0'),receiverPublic,senderRaw),32);
 const key=await hkdf(salt,ikm,Buffer.from('Content-Encoding: aes128gcm\0'),16);
 const nonce=await hkdf(salt,ikm,Buffer.from('Content-Encoding: nonce\0'),12);
 const aes=await crypto.subtle.importKey('raw',key,'AES-GCM',false,['decrypt']);
 const plain=Buffer.from(await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},aes,encrypted));
 assert.equal(plain.at(-1),2);
 assert.equal(JSON.parse(plain.subarray(0,-1)).title,'AGN task');
});
