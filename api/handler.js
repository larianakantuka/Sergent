import { randomBytes } from 'node:crypto';
import { database } from '../lib/db.js';
import { digest,safeEqual,verifyPassword,validDestination,validCode } from '../lib/security.js';
import { allocateCode,HttpError } from '../lib/service.js';
function json(res,status,value){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(value));}
async function body(req){
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new HttpError(415,'Send JSON.');
  let value=req.body;
  if(value===undefined){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>12000)throw new HttpError(413,'Request too large.');}value=raw;}
  if(Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value))>12000)throw new HttpError(413,'Request too large.');
  try{if(typeof value==='string')value=JSON.parse(value);}catch{throw new HttpError(400,'Invalid JSON.');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'Invalid request.');return value;
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Origin');
  const origin=req.headers.origin,allowed=process.env.FRONTEND_ORIGIN||'https://gshergd.github.io';
  if(origin&&origin!==allowed)return json(res,403,{error:'Origin not allowed.'});
  if(origin)res.setHeader('Access-Control-Allow-Origin',allowed);
  res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
  if(!['GET','POST'].includes(req.method))return json(res,405,{error:'Method not allowed.'});
  try{
    const url=new URL(req.url,'https://api.local'),action=url.searchParams.get('action');
    if(action==='health'){
      const missing=[];
      if(!process.env.MONGODB_URI || !/^mongodb(?:\+srv)?:\/\//.test(process.env.MONGODB_URI))missing.push('MONGODB_URI');
      if(!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(process.env.OWNER_PASSWORD_HASH||''))missing.push('OWNER_PASSWORD_HASH');
      if((process.env.RESOLVER_SECRET||'').length<32)missing.push('RESOLVER_SECRET');
      if(missing.length)return json(res,200,{ok:false,service:'serg-api',status:'setup_required',missing});
      if(url.searchParams.get('check')==='db'){
        try{await(await database()).command({ping:1});}
        catch{return json(res,503,{ok:false,service:'serg-api',status:'database_unreachable',next:'Check the Atlas database user, connection string and network access list.'});}
      }
      return json(res,200,{ok:true,service:'serg-api',database:url.searchParams.get('check')==='db'?'connected':'not_checked'});
    }
    const expectedMethod=['login','logout','create','toggle','delete'].includes(action)?'POST':'GET';
    if(req.method!==expectedMethod)throw new HttpError(405,'Method not allowed.');
    if(!['login','logout','create','toggle','delete','links','session','resolve'].includes(action))throw new HttpError(404,'Unknown endpoint.');
    const secret=process.env.RESOLVER_SECRET||'';
    if(secret.length<32)throw new Error('Missing resolver configuration');
    if(action==='resolve'&&!safeEqual(String(req.headers['x-resolver-key']||''),secret))throw new HttpError(401,'Unauthorized.');
    if(!['login','resolve'].includes(action)&&!/^Bearer [a-f0-9]{64}$/.test(String(req.headers.authorization||'')))throw new HttpError(401,'Sign in to continue.');
    const db=await database(),links=db.collection('links');
    if(action==='resolve'){
      if(!safeEqual(String(req.headers['x-resolver-key']||''),secret))throw new HttpError(401,'Unauthorized.');
      const code=url.searchParams.get('code');if(!validCode(code))throw new HttpError(404,'Unknown link.');
      const link=await links.findOne({_id:code,deleted:{$ne:true}});if(!link)throw new HttpError(404,'Unknown link.');if(!link.active)throw new HttpError(410,'Link paused.');
      if(!validDestination(link.destination))throw new HttpError(502,'Destination unavailable.');
      if(url.searchParams.get('count')!=='0')await links.updateOne({_id:code,deleted:{$ne:true}},{$inc:{clicks:1}});
      return json(res,200,{destination:link.destination});
    }
    if(action==='login'){
      const input=await body(req);
      // Vercel supplies the client IP; local development uses the socket address.
      const ip=String(process.env.VERCEL==='1' ? (req.headers['x-forwarded-for']||'unknown') : (req.socket?.remoteAddress||'unknown')).split(',')[0].trim();
      const window=Math.floor(Date.now()/900000), bucket=digest(secret+'|'+ip+'|'+window);
      const attempts=await db.collection('attempts').findOneAndUpdate({_id:bucket},{$inc:{hits:1},$setOnInsert:{expiresAt:new Date((window+2)*900000)}},{upsert:true,returnDocument:'after'});
      if(attempts.hits>10)throw new HttpError(429,'Too many attempts. Try again in 15 minutes.');
      if(!await verifyPassword(input.password,process.env.OWNER_PASSWORD_HASH))throw new HttpError(401,'Incorrect password.');
      const token=randomBytes(32).toString('hex'),expiresAt=new Date(Date.now()+3600000);
      await db.collection('sessions').insertOne({_id:digest(token),expiresAt});
      return json(res,200,{token,expiresAt});
    }
    const authorization=String(req.headers.authorization||'');
    if(!/^Bearer [a-f0-9]{64}$/.test(authorization))throw new HttpError(401,'Sign in to continue.');
    const sessionId=digest(authorization.slice(7));
    if(!await db.collection('sessions').findOne({_id:sessionId,expiresAt:{$gt:new Date()}}))throw new HttpError(401,'Your session expired. Sign in again.');
    if(action==='session')return json(res,200,{owner:true});
    if(action==='logout'){await db.collection('sessions').deleteOne({_id:sessionId});return json(res,200,{ok:true});}
    if(action==='create'){
      const input=await body(req),label=typeof input.label==='string'?input.label.trim():'';
      if(!validDestination(input.destination))throw new HttpError(400,'Use a full HTTP(S) destination outside ser.gt.tc, without credentials or spaces.');
      if(Buffer.byteLength(label)>120)throw new HttpError(400,'Keep the label within 120 bytes.');
      const code=await allocateCode(links,new URL(input.destination).href,label);return json(res,201,{code});
    }
    if(action==='delete'){
      const input=await body(req);if(!validCode(input.code))throw new HttpError(400,'Invalid short code.');
      // Erase redirect data permanently; retain only the code reservation to prevent reuse.
      const result=await links.updateOne({_id:input.code,deleted:{$ne:true}},{$set:{deleted:true,deletedAt:new Date()},$unset:{destination:'',label:'',active:'',clicks:'',createdAt:''}});
      if(!result.matchedCount)throw new HttpError(404,'Unknown link.');return json(res,200,{ok:true});
    }
    if(action==='toggle'){
      const input=await body(req);if(!validCode(input.code)||typeof input.active!=='boolean')throw new HttpError(400,'Invalid link status.');
      const result=await links.updateOne({_id:input.code,deleted:{$ne:true}},{$set:{active:input.active}});if(!result.matchedCount)throw new HttpError(404,'Unknown link.');return json(res,200,{ok:true});
    }
    if(action==='links'){
      const q=(url.searchParams.get('q')||'').slice(0,120),escaped=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const filter=q?{deleted:{$ne:true},$or:['_id','label','destination'].map(field=>({[field]:{$regex:escaped,$options:'i'}}))}:{deleted:{$ne:true}};
      const count=await links.countDocuments(filter),pages=Math.max(1,Math.ceil(count/20)),page=Math.min(pages,Math.max(1,Number.parseInt(url.searchParams.get('page'),10)||1));
      const [rows,stats]=await Promise.all([links.find(filter).sort({createdAt:-1,_id:-1}).skip((page-1)*20).limit(20).toArray(),links.aggregate([{$match:{deleted:{$ne:true}}},{$group:{_id:null,total:{$sum:1},clicks:{$sum:'$clicks'}}}]).toArray()]);
      return json(res,200,{links:rows.map(({_id,...row})=>({code:_id,...row})),page,pages,total:stats[0]?.total||0,clicks:stats[0]?.clicks||0});
    }
  }catch(error){if(!error.status)console.error('serg backend request failed:',error.name);return json(res,error.status||503,{error:error.status?error.message:'Backend unavailable. Check its MongoDB connection and environment settings.'});}
}
