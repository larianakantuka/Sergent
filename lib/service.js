import { randomInt } from 'node:crypto';
export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const alphabet='0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
export async function allocateCode(links,destination,label){
  for(let attempt=0;attempt<64;attempt++){
    let number=randomInt(62**5),code='';
    for(let i=0;i<5;i++){code=alphabet[number%62]+code;number=Math.floor(number/62);}
    try{await links.insertOne({_id:code,destination,label,active:true,clicks:0,createdAt:new Date()});return code;}
    catch(error){if(error.code!==11000)throw error;}
  }
  throw new HttpError(409,'Unable to reserve a code. Please retry.');
}
