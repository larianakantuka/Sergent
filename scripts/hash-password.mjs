import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { hashPassword } from '../lib/security.js';
process.stdout.write('Owner password (at least 14 characters, input hidden): ');
const muted=new Writable({write(chunk,encoding,done){done();}});
const rl=createInterface({input:process.stdin,output:muted,terminal:Boolean(process.stdin.isTTY)});
const password=await new Promise(resolve=>rl.question('',resolve));rl.close();
if(password.length<14||Buffer.byteLength(password)>256){console.error('\nUse 14+ characters and at most 256 bytes.');process.exit(1);}
console.log('\nOWNER_PASSWORD_HASH='+await hashPassword(password));
