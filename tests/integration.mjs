// Disposable local MongoDB only. Never point this at production data.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {MongoClient} from 'mongodb';
import handler from '../api/handler.js';
import {hashPassword} from '../lib/security.js';
import {allocateCode} from '../lib/service.js';
if(process.env.SERG_DISPOSABLE_DB!=='yes'||!/^mongodb:\/\/127\.0\.0\.1:/.test(process.env.MONGODB_URI||''))throw Error('Requires SERG_DISPOSABLE_DB=yes and a disposable loopback MongoDB URI.');
process.env.MONGODB_DB='serg_test_'+Date.now();
process.env.OWNER_PASSWORD_HASH=await hashPassword('local-owner-password-123');
process.env.RESOLVER_SECRET='local-resolver-test-secret-01234567890123456789';
process.env.FRONTEND_ORIGIN='http://127.0.0.1:8080';
const client=await new MongoClient(process.env.MONGODB_URI).connect(),db=client.db(process.env.MONGODB_DB);
const server=createServer(handler);await new Promise(resolve=>server.listen(8787,'127.0.0.1',resolve));
const base='http://127.0.0.1:8787/api/handler';let token='';
async function request(action,data,query='',headers={}){
  const r=await fetch(base+'?action='+action+query,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{}),...headers},body:data===undefined?undefined:JSON.stringify(data)});
  return {status:r.status,data:await r.json(),headers:r.headers};
}
try{
  assert.equal((await request('create',{destination:'https://example.com'})).status,401);
  assert.equal((await request('delete',{code:'abc12'})).status,401);
  assert.equal((await request('login',{password:'wrong'})).status,401);
  assert.equal((await request('login',{password:'local-owner-password-123'},'',{Origin:'https://evil.example'})).status,403);
  let r=await request('login',{password:'local-owner-password-123'},'',{Origin:process.env.FRONTEND_ORIGIN});assert.equal(r.status,200);token=r.data.token;assert.match(token,/^[a-f0-9]{64}$/);
  assert.equal(r.headers.get('access-control-allow-origin'),process.env.FRONTEND_ORIGIN);
  assert.equal((await request('session')).status,200);
  assert.equal((await request('create',{destination:'javascript:alert(1)'})).status,400);
  r=await request('create',{destination:'https://example.com/path?x=1&y=2',label:'<script>alert(1)</script>'});assert.equal(r.status,201);const code=r.data.code;assert.match(code,/^[A-Za-z0-9]{5}$/);
  assert.equal((await request('resolve',undefined,'&code='+code)).status,401);
  const resolver={'X-Resolver-Key':process.env.RESOLVER_SECRET};
  r=await request('resolve',undefined,'&code='+code,resolver);assert.equal(r.status,200);assert.equal(r.data.destination,'https://example.com/path?x=1&y=2');
  await request('resolve',undefined,'&code='+code+'&count=0',resolver);
  r=await request('links');assert.equal(r.data.links.length,1);assert.equal(r.data.links[0].clicks,1);
  r=await request('links',undefined,'&q='+encodeURIComponent('<script>'));assert.equal(r.data.links.length,1);
  r=await request('links',undefined,'&q='+encodeURIComponent('.*'));assert.equal(r.data.links.length,0,'search must escape regex');
  assert.equal((await request('toggle',{code,active:false})).status,200);assert.equal((await request('resolve',undefined,'&code='+code,resolver)).status,410);
  await request('toggle',{code,active:true});assert.equal((await request('resolve',undefined,'&code='+code,resolver)).status,200);
  assert.equal((await request('resolve',undefined,'&code=123456',resolver)).status,404);
  assert.equal((await request('delete',undefined,'&code='+code)).status,405);
  assert.equal((await request('delete',{code:'too-long'})).status,400);
  assert.equal((await request('delete',{code})).status,200);
  assert.equal((await request('resolve',undefined,'&code='+code,resolver)).status,404);
  assert.equal((await request('toggle',{code,active:true})).status,404);
  assert.equal((await request('delete',{code})).status,404);
  r=await request('links');assert.equal(r.data.links.length,0);assert.equal(r.data.total,0);assert.equal(r.data.clicks,0);
  r=await request('links',undefined,'&q='+code);assert.equal(r.data.links.length,0);
  const reservation=await db.collection('links').findOne({_id:code});
  assert.equal(reservation.deleted,true);assert.deepEqual(Object.keys(reservation).sort(),['_id','deleted','deletedAt']);
  await assert.rejects(()=>db.collection('links').insertOne({_id:code,destination:'https://other.example/'}),error=>error.code===11000);
  const sessionRecord=await db.collection('sessions').findOne({});assert.notEqual(sessionRecord._id,token,'tokens must be hashed');
  await db.collection('sessions').updateOne({_id:sessionRecord._id},{$set:{expiresAt:new Date(0)}});assert.equal((await request('session')).status,401);
  token=(await request('login',{password:'local-owner-password-123'})).data.token;
  assert.equal((await request('logout',{})).status,200);assert.equal((await request('session')).status,401);token='';
  for(let i=0;i<12;i++)r=await request('login',{password:'wrong'});assert.equal(r.status,429);
  const links=db.collection('links');await links.deleteMany({});
  await links.insertOne({_id:'00007',destination:'https://example.com/',active:true,clicks:0,createdAt:new Date()});
  assert.equal((await request('resolve',undefined,'&code=00007',resolver)).status,200,'legacy numeric codes continue to resolve');
  await links.deleteMany({});const codes=await Promise.all(Array.from({length:64},()=>allocateCode(links,'https://example.com','parallel')));assert.equal(new Set(codes).size,64);
  console.log('PASS: MongoDB integration, auth, CORS, hashed sessions, expiry/logout, resolver secret, CRUD, literal search, counts, rate limit, permanent deletion with reserved codes, base62 codes, legacy numeric links and concurrent allocation.');
  // Keep a local demo backend only when explicitly requested by the QA launcher.
  if(process.env.SERG_KEEP_TEST_SERVER==='yes'){
    await db.collection('attempts').deleteMany({});await links.deleteMany({});
    await allocateCode(links,'https://github.com/','The next project starts here');
    console.log('Local demo API remains on 127.0.0.1:8787');await new Promise(()=>{});
  }
}finally{await db.dropDatabase();await client.close();server.close();}
process.exit(0);
