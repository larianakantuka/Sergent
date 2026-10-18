import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/handler.js';

test('setup diagnostics identify missing settings without revealing values',async()=>{
  const names=['MONGODB_URI','OWNER_PASSWORD_HASH','RESOLVER_SECRET'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  async function health(){
    const res={headers:{},setHeader(name,value){this.headers[name]=value;},end(value){this.value=JSON.parse(value);}};
    await handler({url:'/api/handler?action=health',method:'GET',headers:{}},res);
    assert.equal(res.statusCode,200);return res.value;
  }
  try{
    names.forEach(name=>delete process.env[name]);
    assert.deepEqual((await health()).missing,names);
    process.env.MONGODB_URI='mongodb+srv://private-user:private-password@fixture.mongodb.net/';
    process.env.OWNER_PASSWORD_HASH='scrypt:'+'a'.repeat(32)+':'+'b'.repeat(128);
    process.env.RESOLVER_SECRET='c'.repeat(64);
    const result=await health();assert.equal(result.ok,true);assert.equal(result.database,'not_checked');
    assert.equal(JSON.stringify(result).includes('private-password'),false);
    assert.equal(JSON.stringify(result).includes(process.env.RESOLVER_SECRET),false);
  }finally{for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}}
});
