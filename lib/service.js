import { randomInt } from 'node:crypto';
export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
export async function allocateCode(links,destination,label){
  for(let attempt=0;attempt<36;attempt++){
    let code;
    if(attempt<32)code=String(randomInt(100000)).padStart(5,'0');
    else{
      let cursor=0;
      for await(const row of links.find({},{projection:{_id:1}}).sort({_id:1})){
        const used=Number(row._id);if(used>cursor)break;if(used===cursor)cursor++;
      }
      if(cursor>99999)throw new HttpError(409,'All 100,000 five-digit codes are reserved.');
      code=String(cursor).padStart(5,'0');
    }
    try{await links.insertOne({_id:code,destination,label,active:true,clicks:0,createdAt:new Date()});return code;}
    catch(error){if(error.code!==11000)throw error;}
  }
  throw new HttpError(409,'A code was just reserved. Please retry.');
}
