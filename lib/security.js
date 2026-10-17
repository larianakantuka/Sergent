import { scrypt, timingSafeEqual, createHash, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
const derive=promisify(scrypt);
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function safeEqual(a,b){const x=Buffer.from(a||''), y=Buffer.from(b||'');return x.length===y.length && timingSafeEqual(x,y);}
export async function hashPassword(password){const salt=randomBytes(16).toString('hex'); const key=await derive(password,salt,64);return `scrypt:${salt}:${key.toString('hex')}`;}
export async function verifyPassword(password,encoded){
  if(typeof password!=='string'||Buffer.byteLength(password)>256)return false;
  const parts=(encoded||'').split(':'); if(parts.length!==3||parts[0]!=='scrypt'||!/^([a-f0-9]{32})$/.test(parts[1])||!/^([a-f0-9]{128})$/.test(parts[2]))throw new Error('Invalid owner password configuration');
  return safeEqual((await derive(password,parts[1],64)).toString('hex'),parts[2]);
}
export function validDestination(value){
  if(typeof value!=='string'||Buffer.byteLength(value)>4096||/[\x00-\x20\x7f\\]/.test(value))return false;
  try {const url=new URL(value);return /^https?:\/\//i.test(value)&&['http:','https:'].includes(url.protocol)&&!url.username&&!url.password&&!['ser.gt.tc','www.ser.gt.tc'].includes(url.hostname.toLowerCase().replace(/\.$/,''));}catch{return false;}
}
export const validCode=value=>typeof value==='string'&&/^[0-9]{5}$/.test(value);
