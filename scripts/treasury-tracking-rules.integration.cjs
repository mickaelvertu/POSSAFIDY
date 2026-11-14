const { test } = require('node:test');
const assert = require('node:assert/strict');
const { commit, write, token } = require('./sale-rules-fixture.cjs');
test('treasury count and attachment access and immutability', async () => {
  await commit([write('users/super',{role:'ADMIN',status:'ACTIVE'}),write('treasuryMovements/tracking-test',{id:'tracking-test'})]);
  const check = {id:'tracking-test',owner_id:'super',owner_name:'Admin',expected:100,counted:90,difference:-10,reason:'À rechercher',created_at:Date.now(),fund_ids:[]};
  assert.equal((await commit([write('treasuryChecks/tracking-test',check)],token)).status,200);
  assert.equal((await commit([write('treasuryChecks/tracking-test',{...check,counted:100,difference:0})],token)).status,403);
  assert.equal((await commit([write('treasuryChecks/bad',{...check,id:'bad',reason:''})],token)).status,403);
  assert.equal((await commit([write('treasuryChecks/other',{...check,id:'other',owner_id:'other'})],token)).status,403);
  const attachment={id:'tracking-test',movement_id:'tracking-test',name:'recu.pdf',data:'data:application/pdf;base64,JVBERg==',created_by:'super',created_at:Date.now()};
  assert.equal((await commit([write('treasuryAttachments/tracking-test',attachment)],token)).status,200);
  assert.equal((await commit([write('treasuryAttachments/tracking-test',attachment)],token)).status,403);
  assert.equal((await commit([write('treasuryAttachments/missing',{...attachment,id:'missing',movement_id:'absent'})],token)).status,403);
  assert.equal((await commit([write('treasuryAttachments/html',{...attachment,id:'html',data:'data:text/html;base64,SGVsbG8='})],token)).status,403);
  await commit([write('users/super',{role:'COMPTABLE',status:'ACTIVE'})]);
  assert.equal((await commit([write('treasuryChecks/denied',{...check,id:'denied'})],token)).status,403);
  assert.equal((await commit([write('treasuryAttachments/denied',{...attachment,id:'denied'})],token)).status,403);
});
