// Local-only helper: do not commit the private key or paste it into a chat.
import {generateKeyPairSync} from 'node:crypto';
const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const key=privateKey.export({format:'jwk'});
const decode=(s)=>Buffer.from(s,'base64url');
const publicKey=Buffer.concat([Buffer.from([4]),decode(key.x),decode(key.y)]).toString('base64url');
console.log('VAPID_PUBLIC_KEY='+publicKey);
console.log('VAPID_PRIVATE_KEY='+key.d);
console.log('Store these in Cloudflare secrets. Never commit the private key.');
