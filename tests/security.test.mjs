import test from 'node:test';
import assert from 'node:assert/strict';
import {validDestination,validCode,hashPassword,verifyPassword} from '../lib/security.js';
test('destination validation blocks unsafe schemes, header injection, credentials and self loops',()=>{
  for(const url of ['https://example.com/a?x=1&b=2','http://example.com/#part','https://example.com:8443/path'])assert.equal(validDestination(url),true,url);
  for(const url of ['javascript:alert(1)','data:text/html,x','//example.com','https://user:pass@example.com','https://ser.gt.tc/12345','https://SER.GT.TC./12345','https://www.ser.gt.tc/12345','https://example.com/\r\nX-Test:1','https://example.com/a b','https://example.com/\\other','https://example.com/'+ 'a'.repeat(4096),{},null])assert.equal(validDestination(url),false,String(url));
});
test('codes retain leading zeros and reject longer paths',()=>{
  for(const code of ['00000','00007','99999','a7B2x','AbCdE','abcde'])assert.equal(validCode(code),true);
  for(const code of ['1234','123456','12345/','12345?x=1','ab_cd','ab-cd','é1234','a7B2x/',12345,null])assert.equal(validCode(code),false);
});
test('salted password hashes reject incorrect passwords and malformed config',async()=>{
  const password='private-test-password-123';const a=await hashPassword(password),b=await hashPassword(password);
  assert.notEqual(a,b);assert.equal(await verifyPassword(password,a),true);assert.equal(await verifyPassword('wrong',a),false);
  await assert.rejects(()=>verifyPassword(password,'placeholder'));assert.equal(await verifyPassword('a'.repeat(257),a),false);
});

test('allocator uses five base62 characters and retries duplicate reservations',async()=>{
 const {allocateCode}=await import('../lib/service.js');let attempts=0;
 const links={async insertOne(row){assert.match(row._id,/^[A-Za-z0-9]{5}$/);if(++attempts===1)throw Object.assign(new Error('duplicate'),{code:11000});}};
 assert.match(await allocateCode(links,'https://example.com/','test'),/^[A-Za-z0-9]{5}$/);assert.equal(attempts,2);
 await assert.rejects(()=>allocateCode({async insertOne(){throw new Error('database offline');}},'https://example.com/','test'),/database offline/);
});
