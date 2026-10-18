import {test} from 'node:test';
import assert from 'node:assert/strict';
import {encryptBackup,decryptBackup,createMaintenance} from '../supabase/maintenance.mjs';
const id='10000000-0000-4000-8000-000000000001';
const project='testproj';
const owner={id,login:'owner',role:'owner'};
const snap={format:'orbita-backup-v1',project,rows:{groups:[{id:'g',payload:{schedule:[{day:1}],students:[{name:'Test'}]}}],lessons:[],profiles:[],audit:[],imports:[]}};
function fixture({failUpload=false,wrongOwner=false,stale=false}={}){
 const uploaded=new Map(),actions=[];
 const backend=async(path,{body}={})=>{
  actions.push({path,body});
  if(path.includes('/auth/v1/token'))return {user:{id:wrongOwner?'bad':id}};
  if(path.includes('/rpc/'))return body.p_action==='preview'?{signature:stale?'c'.repeat(32):'a'.repeat(32),groups:2,lessons:3,reports:0,attendanceMarks:0,scheduleRules:1}:{ok:true,groups:2,lessons:3};
  throw Error('Unexpected backend path: '+path);
 };
 const fetchImpl=async(url,init)=>{
  const path=new URL(url).pathname;
  if(path.includes('/object/list/'))return Response.json([...uploaded].map(([name,content])=>({name,created_at:'2026-10-19',metadata:{size:content.length}})));
  const filename=path.split('/').at(-1);
  if(init.method==='POST'){
   if(failUpload)return Response.json({error:'Storage not available'},{status:503});
   uploaded.set(filename,init.body);return Response.json({Key:filename});
  }
  return uploaded.has(filename)?new Response(uploaded.get(filename),{status:200}):Response.json({error:'missing'},{status:404});
 };
 const m=createMaintenance({url:`https://${project}.supabase.co`,serviceKey:'secret',backend,fetchImpl,all:async table=>({groups:[{id:'g',payload:{subject:'Математика'}}],lessons:[{id:'l',payload:{report:'test'}}],profiles:[{id,login:'owner',role:'owner',some_secret:'must not export'}],audit:[],imports:[]})[table]});
 return {m,uploaded,actions};
}
test('encrypted backup round trip uses authentication and rejects incorrect passphrases',async()=>{
 const enc=await encryptBackup(snap,'this is a test passphrase');
 assert.equal(enc.includes('Test'),false);
 assert.deepEqual(await decryptBackup(enc,'this is a test passphrase',project),snap);
 await assert.rejects(decryptBackup(enc,'wrong passphrase',project),/пароль/i);
 await assert.rejects(decryptBackup(enc,'this is a test passphrase','other'),/несовместима/);
});
test('only owner is allowed to access maintenance; backup redacts credentials',async()=>{
 const {m,uploaded}=fixture();
 await assert.rejects(m.handle('maintenance/list','GET',{}, {...owner,role:'admin'}),/Только главный/);
 await assert.rejects(m.handle('maintenance/preview','POST',{scope:'trash'}, {...owner,role:'teacher'}),/Только главный/);
 const r=await m.handle('maintenance/backup','POST',{passphrase:'long test passphrase'},owner);
 const content=uploaded.get(r.backup.id),decoded=await decryptBackup(content,'long test passphrase',project);
 assert.equal(decoded.rows.profiles[0].some_secret,undefined);
 assert.equal(decoded.rows.groups.length,1);
 const file=await m.handle(`maintenance/download/${r.backup.id}`,'GET',{},owner);
 assert.equal(file.content,content);
});
test('purge requires a fresh preview, password reauthentication and verified backup',async()=>{
 const {m,actions,uploaded}=fixture();
 const info=await m.handle('maintenance/preview','POST',{scope:'trash',filter:{}},owner);
 assert.equal(info.preview.lessons,3);
 const body={scope:'trash',filter:{},signature:info.preview.signature,confirmation:'УДАЛИТЬ НАВСЕГДА',ownerPassword:'real password',passphrase:'long test passphrase'};
 await assert.rejects(m.handle('maintenance/purge','POST',{...body,confirmation:'wrong'},owner));
 assert.equal(actions.filter(a=>a.body?.p_action==='purge').length,0);
 const done=await m.handle('maintenance/purge','POST',body,owner);
 assert.equal(done.result.ok,true);
 assert.equal(uploaded.size,1);
 assert.equal(actions.filter(a=>a.body?.p_action==='purge').length,1);
});
test('no purge on backup storage failure or incorrect owner password',async()=>{
 const {m,actions}=fixture({failUpload:true});
 const body={scope:'reset',filter:{},signature:'a'.repeat(32),confirmation:'УДАЛИТЬ НАВСЕГДА',ownerPassword:'real password',passphrase:'long test passphrase'};
 await assert.rejects(m.handle('maintenance/purge','POST',body,owner));
 assert.equal(actions.filter(a=>a.body?.p_action==='purge').length,0);
 const f=fixture({wrongOwner:true});
 await assert.rejects(f.m.handle('maintenance/purge','POST',body,owner),/Пароль главного/);
 assert.equal(f.actions.filter(a=>a.body?.p_action==='purge').length,0);
});
test('restore requires current preview, decrypted backup and emergency backup',async()=>{
 const {m,actions,uploaded}=fixture();
 const original=await m.handle('maintenance/backup','POST',{passphrase:'long test passphrase'},owner);
 const r=await m.handle('maintenance/restore','POST',{backupId:original.backup.id,mode:'merge',signature:'a'.repeat(32),passphrase:'long test passphrase',ownerPassword:'real password',confirmation:'ВОССТАНОВИТЬ ДАННЫЕ'},owner);
 assert.equal(r.result.ok,true);
 assert.equal(uploaded.size,2);
 assert.equal(actions.filter(a=>a.body?.p_action==='restore-merge').length,1);
});
