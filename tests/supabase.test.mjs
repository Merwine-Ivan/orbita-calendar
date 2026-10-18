import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/handler.mjs';
import {createSupabaseApi} from '../src/supabase-api.mjs';
const admin='10000000-0000-4000-8000-000000000001',teacher='10000000-0000-4000-8000-000000000002',other='10000000-0000-4000-8000-000000000003';
const gid='20000000-0000-4000-8000-000000000001',lid='30000000-0000-4000-8000-000000000001';
const token=id=>`${btoa('{}')}.${btoa(JSON.stringify({sub:id,iat:2000}))}.signature`;
function fixture({passwordError,defaultTemporaryPassword,profileUpdateError=false}={}){
 const profiles=[admin,teacher,other].map((id,i)=>({id,login:`user${i}`,name:`Person ${i}`,role:i?'teacher':'admin',disabled:false,must_change:false,invalid_before:0,subjects:['Английский']}));
 const tables={profiles,groups:[{id:gid,teacher_id:teacher,version:1,payload:{id:gid,name:'Тест',subject:'Английский',teacherId:teacher,students:[],schedule:[]}}],lessons:[],audit:[]};
 const calls=[];
 const fetchImpl=async(url,init={})=>{
  const u=new URL(url);calls.push({path:u.pathname,init});const respond=(data,status=200)=>new Response(JSON.stringify(data),{status});
  if(u.pathname==='/auth/v1/user'){const t=init.headers.Authorization.slice(7);if(![admin,teacher,other].some(id=>token(id)===t))return respond({},401);if(init.method==='PUT'&&passwordError)return respond({error_code:passwordError},422);return respond({id:JSON.parse(atob(t.split('.')[1])).sub});}
  if(u.pathname.startsWith('/auth/v1/admin/'))return respond({id:other});
  const table=u.pathname.split('orbita_')[1];if(!tables[table])throw Error('Unexpected request '+url);
  const rows=tables[table];const filter=row=>[...u.searchParams].every(([key,v])=>!v.startsWith('eq.')||String(row[key])===v.slice(3));
  const data=init.body?JSON.parse(init.body):undefined;
  if(profileUpdateError&&table==='profiles'&&init.method==='PATCH'&&data.login)return respond({},500);
  if(init.method==='PATCH'){const found=rows.filter(filter);found.forEach(r=>Object.assign(r,data));return respond(found);}
  if(init.method==='POST'){if(data.id&&rows.some(r=>r.id===data.id))return respond({code:'23505'},409);rows.push(data);return respond(null,201);}
  return respond(rows.filter(filter).slice(Number(u.searchParams.get('offset')||0),Number(u.searchParams.get('offset')||0)+Number(u.searchParams.get('limit')||1000)));
 };
 const handler=createHandler({url:'https://test.supabase.co',serviceKey:'server-secret',allowedOrigins:['http://localhost:4174'],defaultTemporaryPassword,fetchImpl,now:()=>3000000});
 const req=(path,user=teacher,method='GET',body)=>handler(new Request(`https://test.supabase.co/functions/v1/calendar-api/${path}`,{method,headers:{Origin:'http://localhost:4174',...(user?{Authorization:`Bearer ${token(user)}`}:{})},body:body===undefined?undefined:JSON.stringify(body)}));
 return {req,tables,calls};
}
test('anonymous, disabled, expired and pre-reset sessions cannot read calendar',async()=>{
 const {req,tables}=fixture();assert.equal((await req('bootstrap',null)).status,401);
 tables.profiles[1].disabled=true;assert.equal((await req('bootstrap')).status,403);
 tables.profiles[1].disabled=false;tables.profiles[1].invalid_before=2000;assert.equal((await req('bootstrap')).status,401);
});

test('assigned teacher can delete and restore own lessons without losing attendance and reports',async()=>{
 const {req,tables}=fixture();
 const lesson={id:lid,groupId:gid,date:'2026-10-19',start:'09:00',end:'10:00',status:'done',attendance:{},report:'Preserve this report',version:0};
 assert.equal((await req(`lessons/${lid}`,teacher,'PUT',lesson)).status,200);
 assert.equal((await req(`lessons/${lid}`,other,'PUT',{...lesson,version:1,deleted:true})).status,403);
 assert.equal((await req(`lessons/${lid}`,teacher,'PUT',{...lesson,version:1,deleted:true})).status,200);
 assert.equal(tables.lessons[0].payload.deleted,true);
 assert.equal((await(await req('bootstrap',teacher)).json()).lessons[0].deleted,true);
 assert.equal((await(await req('bootstrap',other)).json()).lessons.length,0);
 assert.equal((await req(`lessons/${lid}`,other,'PUT',{...lesson,version:2,deleted:false})).status,403);
 assert.equal((await req(`lessons/${lid}`,teacher,'PUT',{...lesson,version:2,deleted:false})).status,200);
 assert.equal((await(await req('bootstrap',teacher)).json()).lessons[0].report,'Preserve this report');
 assert.ok(tables.audit.some(a=>a.action==='delete:lessons'&&a.actor===teacher));
 assert.ok(tables.audit.some(a=>a.action==='restore:lessons'&&a.actor===teacher));
});

test('soft deletion cannot be used to change lesson fields or hijack another group',async()=>{
 const {req,tables}=fixture();
 const lesson={id:lid,groupId:gid,date:'2026-10-19',start:'09:00',end:'10:00',status:'done',attendance:{},report:'Protected report',version:0};
 assert.equal((await req(`lessons/${lid}`,teacher,'PUT',lesson)).status,200);
 assert.equal((await req(`lessons/${lid}`,teacher,'PUT',{...lesson,version:1,deleted:true,report:'Tampered'})).status,403);
 assert.equal(tables.lessons[0].payload.deleted,false);
 assert.equal((await req(`lessons/${lid}`,teacher,'PUT',{...lesson,version:1,deleted:true})).status,200);
 assert.equal((await req(`lessons/${lid}`,teacher,'PUT',{...lesson,version:2,deleted:false,attendance:{fake:'present'}})).status,403);
 assert.equal((await req(`lessons/${lid}`,teacher,'PUT',{...lesson,version:2,deleted:true,report:'Tampered'})).status,403);
 assert.equal(tables.lessons[0].payload.report,'Protected report');
});

test('group archive and restore are manager-only and preserve students and source metadata',async()=>{
 const {req,tables}=fixture();tables.groups[0].payload.sourceGroupId='original-source';
 const group={...tables.groups[0].payload,version:1,archived:true,students:[],schedule:[]};
 assert.equal((await req(`groups/${gid}`,teacher,'PUT',group)).status,403);
 assert.equal((await req(`groups/${gid}`,admin,'PUT',group)).status,200);
 assert.equal(tables.groups[0].payload.sourceGroupId,'original-source');
 assert.equal((await req(`groups/${gid}`,admin,'PUT',{...group,version:2,archived:false})).status,200);
 assert.ok(tables.audit.some(a=>a.action==='archive:groups'));assert.ok(tables.audit.some(a=>a.action==='restore:groups'));
});

test('tab session survives a reload, expires after eight hours and is cleared by logout or server rejection',async()=>{
 const saved=new Map();const storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 let time=1000,reject=false;
 const fetchImpl=async url=>{if(url.includes('/token?'))return Response.json({access_token:'fictional-token',refresh_token:'fictional-refresh',expires_in:3600});if(reject)return Response.json({error:'revoked'}, {status:401});return Response.json(url.endsWith('/session')?{user:{id:teacher,role:'teacher'}}:{ok:true});};
 const make=()=>createSupabaseApi({url:'https://test.supabase.co',key:'public',fetchImpl,storage,now:()=>time});
 const first=make();await first('login','POST',{login:'teacher',password:'fictional password'});assert.equal(saved.size,1);
 assert.equal((await make()('session')).user.id,teacher);
 await make()('logout','POST',{});assert.equal(saved.size,0);
 await first('login','POST',{login:'teacher',password:'fictional password'});reject=true;
 await assert.rejects(()=>make()('session'));assert.equal(saved.size,0);
 reject=false;await first('login','POST',{login:'teacher',password:'fictional password'});time+=8*3600000+1;
 assert.equal((await make()('session')).user,null);assert.equal(saved.size,0);
});

test('unassigned group and lesson teacher override survive a save without assigning a random teacher',async()=>{
 const {req,tables}=fixture();
 const group={id:gid,name:'Unassigned',subject:'Английский',teacherId:null,students:[],schedule:[{day:5,start:'09:00',end:'10:00',effectiveFrom:'2026-10-15',effectiveTo:'2026-10-31'}],archived:false,version:1};
 assert.equal((await req(`groups/${gid}`,admin,'PUT',group)).status,200);
 assert.equal(tables.groups[0].teacher_id,null);assert.equal(tables.groups[0].payload.schedule[0].effectiveFrom,'2026-10-15');
 const lesson={id:lid,groupId:gid,teacherId:teacher,date:'2026-10-16',start:'09:00',end:'10:00',status:'done',attendance:{},report:'',version:0};
 assert.equal((await req(`lessons/${lid}`,admin,'PUT',lesson)).status,200);
 assert.equal(tables.lessons[0].payload.teacherId,teacher);
 assert.equal((await req(`lessons/${lid}`,other,'PUT',{...lesson,version:1,teacherId:other})).status,403);
});

test('identity edits are allowed for self or owner, never permit role elevation, and update Auth login',async()=>{
 const {req,tables,calls}=fixture();
 assert.equal((await req(`users/${teacher}/profile`,teacher,'PATCH',{name:'New teacher name',login:'teacher.new'})).status,200);
 assert.equal(tables.profiles[1].login,'teacher.new');assert.equal(tables.profiles[1].name,'New teacher name');
 const auth=calls.find(c=>c.path===`/auth/v1/admin/users/${teacher}`&&c.init.method==='PUT');
 assert.deepEqual(JSON.parse(auth.init.body),{email:'teacher.new@users.orbita.invalid',email_confirm:true});
 assert.equal((await req(`users/${other}/profile`,teacher,'PATCH',{name:'Forbidden',login:'other.new'})).status,403);
 assert.equal((await req(`users/${teacher}/profile`,admin,'PATCH',{name:'Forbidden',login:'another'})).status,403);
 assert.equal((await req(`users/${teacher}/profile`,teacher,'PATCH',{name:'X',login:'x.new',role:'owner'})).status,403);
 tables.profiles[0].role='owner';
 assert.equal((await req(`users/${teacher}/profile`,admin,'PATCH',{name:'Owner edit',login:'teacher.owneredit'})).status,200);
 assert.equal((await req(`users/${admin}/profile`,admin,'PATCH',{name:'Owner name',login:'owner.new'})).status,200);
 assert.equal(tables.profiles[0].role,'owner');
});

test('duplicate or invalid identity is rejected before Auth updates, failed profile update rolls login back',async()=>{
 const {req,calls}=fixture();
 assert.equal((await req(`users/${teacher}/profile`,teacher,'PATCH',{name:'X',login:'user2'})).status,409);
 assert.equal((await req(`users/${teacher}/profile`,teacher,'PATCH',{name:'X',login:'bad login'})).status,400);
 assert.equal(calls.filter(c=>c.path.startsWith('/auth/v1/admin/')).length,0);
 const failed=fixture({profileUpdateError:true});
 assert.equal((await failed.req(`users/${teacher}/profile`,teacher,'PATCH',{name:'X',login:'teacher.new'})).status,502);
 const updates=failed.calls.filter(c=>c.path===`/auth/v1/admin/users/${teacher}`);
 assert.equal(JSON.parse(updates[0].init.body).email,'teacher.new@users.orbita.invalid');
 assert.equal(JSON.parse(updates[1].init.body).email,'user1@users.orbita.invalid');
 assert.equal(failed.tables.profiles[1].login,'user1');
});

test('presence is server-timed, updates only the caller and is visible only to managers',async()=>{
 const {req,tables}=fixture();
 assert.equal((await req('presence',teacher,'POST',{id:other,last_seen_at:'2099-01-01'})).status,200);
 assert.equal(tables.profiles[1].last_seen_at,new Date(3000000).toISOString());
 assert.equal(tables.profiles[2].last_seen_at,undefined);
 const manager=await(await req('bootstrap',admin)).json();
 assert.equal(manager.users.find(u=>u.id===teacher).online,true);
 assert.equal(manager.users.find(u=>u.id===other).online,false);
 const viewer=await(await req('bootstrap',other)).json();
 assert.ok(!('lastSeenAt' in viewer.users[1]));assert.ok(!('online' in viewer.users[1]));
 tables.profiles[1].last_seen_at=new Date(3000000-90001).toISOString();
 assert.equal((await(await req('bootstrap',admin)).json()).users.find(u=>u.id===teacher).online,false);
});

test('password status uses server dates and is shared only with self and managers',async()=>{
 const {req,tables}=fixture();
 tables.profiles[1].must_change=true;
 tables.profiles[1].temporary_password_at='2026-10-18T10:00:00Z';
 const initial=await(await req('session',teacher)).json();
 assert.equal(initial.user.mustChange,true);assert.equal(initial.user.temporaryPasswordAt,'2026-10-18T10:00:00Z');
 assert.equal((await req('password',teacher,'POST',{password:'another fictional password'})).status,200);
 assert.equal(tables.profiles[1].password_changed_at,new Date(3000000).toISOString());
 assert.equal(tables.profiles[1].temporary_password_at,null);
 const manager=await(await req('bootstrap',admin)).json();assert.equal(manager.users.find(u=>u.id===teacher).passwordChangedAt,new Date(3000000).toISOString());
 const peer=await(await req('bootstrap',other)).json();assert.ok(!('passwordChangedAt' in peer.users.find(u=>u.id===teacher)));
 assert.ok('passwordChangedAt' in peer.users.find(u=>u.id===other));
});

test('audit is owner-only and returns only allowed metadata with validated pagination',async()=>{
 const {req,tables}=fixture();
 assert.equal((await req('audit',teacher)).status,403);
 assert.equal((await req('audit',admin)).status,403);
 tables.profiles[0].role='owner';
 tables.audit.push({id:1,actor:teacher,action:'save:lessons',target:lid,at:'2026-10-18T10:00:00Z',password:'never return this'});
 const response=await(await req('audit',admin)).json();assert.equal(response.entries.length,1);
 assert.equal(response.entries[0].actorLogin,'user1');assert.equal(response.entries[0].action,'save:lessons');
 assert.ok(!JSON.stringify(response).includes('never return this'));
 assert.equal((await req('audit?before=bad',admin)).status,400);
});

test('login and logout events are attributed to the authenticated account even before password change',async()=>{
 const {req,tables}=fixture();tables.profiles[1].must_change=true;
 assert.equal((await req('activity',teacher,'POST',{event:'login',actor:admin})).status,200);
 assert.equal(tables.audit[0].actor,teacher);assert.equal(tables.audit[0].action,'login');
 assert.equal((await req('activity',teacher,'POST',{event:'logout'})).status,200);
 assert.equal((await req('activity',teacher,'POST',{event:'anything'})).status,400);
 assert.equal((await req('audit',teacher)).status,403);
});

test('default password reset is scoped, revokes sessions and never returns the secret',async()=>{
 const {req,tables,calls}=fixture({defaultTemporaryPassword:'fictional temporary secret'});
 assert.equal((await req(`users/${other}/password`,teacher,'POST',{useDefault:true})).status,403);
 const response=await req(`users/${teacher}/password`,admin,'POST',{useDefault:true});
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
 assert.equal(tables.profiles[1].must_change,true);
 assert.equal((await req('bootstrap',teacher)).status,401);
 const update=calls.find(c=>c.path===`/auth/v1/admin/users/${teacher}`&&c.init.method==='PUT');
 assert.equal(JSON.parse(update.init.body).password,'fictional temporary secret');
 assert.ok(!JSON.stringify(tables.audit).includes('fictional temporary secret'));
});

test('unconfigured default reset fails before modifying accounts',async()=>{
 const {req,tables,calls}=fixture();
 assert.equal((await req(`users/${teacher}/password`,admin,'POST',{useDefault:true})).status,503);
 assert.equal(tables.profiles[1].must_change,false);
 assert.equal(tables.profiles[1].invalid_before,0);
 assert.equal(calls.filter(c=>c.path.startsWith('/auth/v1/admin/')).length,0);
});

test('account creation uses only the server default and requires password change',async()=>{
 const {req,tables,calls}=fixture({defaultTemporaryPassword:'fictional server password'});
 tables.profiles.pop();
 const body={name:'Fictional teacher',login:'teacher.new',role:'teacher',subjects:[],useDefault:true};
 assert.equal((await req('users',teacher,'POST',body)).status,403);
 const response=await req('users',admin,'POST',body);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
 const created=tables.profiles.find(p=>p.login==='teacher.new');assert.equal(created.must_change,true);assert.deepEqual(created.subjects,[]);
 const auth=calls.find(c=>c.path==='/auth/v1/admin/users'&&c.init.method==='POST');
 assert.equal(JSON.parse(auth.init.body).password,'fictional server password');
 assert.ok(!JSON.stringify(tables).includes('fictional server password'));
});

test('account creation fails without configured default before creating credentials',async()=>{
 const {req,calls}=fixture();
 const response=await req('users',admin,'POST',{name:'Fictional teacher',login:'teacher.new',role:'teacher',useDefault:true});
 assert.equal(response.status,503);
 assert.equal(calls.filter(c=>c.path.startsWith('/auth/v1/admin/')).length,0);
});
test('all teachers see common calendar but cannot issue accounts or edit another teacher group',async()=>{
 const {req,calls}=fixture();assert.equal((await (await req('bootstrap',other)).json()).groups.length,1);
 const r=await req('users',teacher,'POST',{login:'intruder',password:'long enough password',name:'X',role:'admin'});assert.equal(r.status,403);
 const l={id:lid,groupId:gid,date:'2026-10-19',start:'09:00',end:'10:00',status:'planned',attendance:{},report:'',version:0};
 assert.equal((await req(`lessons/${lid}`,other,'PUT',l)).status,403);
 assert.equal(calls.filter(c=>c.path.startsWith('/auth/v1/admin')).length,0);
});
test('version conflict prevents silently overwriting another teacher changes',async()=>{
 const {req}=fixture();const l={id:lid,groupId:gid,date:'2026-10-19',start:'09:00',end:'10:00',status:'planned',attendance:{},report:'First',version:0};
 assert.equal((await req(`lessons/${lid}`,teacher,'PUT',l)).status,200);
 assert.equal((await req(`lessons/${lid}`,teacher,'PUT',{...l,version:1,report:'Second'})).status,200);
 assert.equal((await req(`lessons/${lid}`,teacher,'PUT',{...l,version:1,report:'Stale'})).status,409);
 const current=await (await req('bootstrap')).json();assert.equal(current.lessons[0].report,'Second');assert.equal(current.lessons[0].version,2);
});
test('must-change account only has session and password access',async()=>{
 const {req,tables}=fixture();tables.profiles[1].must_change=true;
 assert.equal((await req('session')).status,200);assert.equal((await req('bootstrap')).status,403);
 assert.equal((await req('password',teacher,'POST',{password:'a new long password'})).status,200);
 assert.equal((await req('bootstrap')).status,200);
});
test('same password rejection is explained without unlocking the account',async()=>{
 const {req,tables}=fixture({passwordError:'same_password'});tables.profiles[1].must_change=true;
 const response=await req('password',teacher,'POST',{password:'previous test password'});
 assert.equal(response.status,422);assert.match((await response.json()).error,/должен отличаться/);
 assert.equal(tables.profiles[1].must_change,true);assert.equal(tables.audit.length,0);
 assert.equal((await req('bootstrap')).status,403);
});
test('administrator can disable an account, teacher cannot reenable it, own account protected',async()=>{
 const {req,tables}=fixture();assert.equal((await req(`users/${teacher}`,admin,'PATCH',{disabled:true})).status,200);
 assert.equal(tables.profiles[1].disabled,true);assert.equal((await req('bootstrap')).status,403);
 assert.equal((await req(`users/${teacher}`,other,'PATCH',{disabled:false})).status,403);
 assert.equal((await req(`users/${admin}`,admin,'PATCH',{disabled:true})).status,400);
});
test('administrator cannot elevate accounts or reset owner/peer credentials even by calling API directly',async()=>{
 const {req,tables,calls}=fixture();tables.profiles[2].role='owner';
 assert.equal((await req('users',admin,'POST',{login:'new.admin',name:'Тест',role:'admin',password:'long test password'})).status,403);
 assert.equal((await req(`users/${other}/password`,admin,'POST',{password:'another test password'})).status,403);
 assert.equal((await req(`users/${other}`,admin,'PATCH',{disabled:true})).status,403);
 tables.profiles[2].role='admin';
 assert.equal((await req(`users/${other}`,admin,'PATCH',{disabled:true})).status,403);
 assert.equal(calls.filter(c=>c.path.startsWith('/auth/v1/admin/')).length,0);
});
test('owner can manage administrator access while remaining protected from self-disable',async()=>{
 const {req,tables}=fixture();tables.profiles[0].role='owner';tables.profiles[2].role='admin';
 assert.equal((await req(`users/${other}`,admin,'PATCH',{disabled:true})).status,200);
 assert.equal(tables.profiles[2].disabled,true);
 assert.equal((await req(`users/${admin}`,admin,'PATCH',{disabled:true})).status,400);
});
test('teacher cannot assign own subjects; admins can assign and revoke teacher subjects',async()=>{
 const {req,tables}=fixture();
 assert.equal((await req(`users/${teacher}/profile`,teacher,'PATCH',{subjects:['Китайский']})).status,403);
 assert.equal((await req(`users/${teacher}/profile`,admin,'PATCH',{subjects:['Китайский']})).status,200);
 assert.deepEqual(tables.profiles[1].subjects,['Китайский']);
 const lesson={id:lid,groupId:gid,date:'2026-10-19',start:'09:00',end:'10:00',status:'planned',attendance:{},report:'',version:0};
 assert.equal((await req(`lessons/${lid}`,teacher,'PUT',lesson)).status,403);
 assert.equal((await req(`users/${teacher}/profile`,admin,'PATCH',{subjects:['Английский']})).status,200);
 assert.equal((await req(`lessons/${lid}`,teacher,'PUT',lesson)).status,200);
 assert.equal((await req(`users/${teacher}/profile`,admin,'PATCH',{subjects:['Другое']})).status,400);
 assert.deepEqual(tables.profiles[1].subjects,['Английский']);
});
test('browser adapter uses internal login address, session stays in memory, logout clears access',async()=>{
 const calls=[];let expired=0;
 const api=createSupabaseApi({url:'https://test.supabase.co',key:'public-key',onExpired:()=>expired++,fetchImpl:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify(url.includes('/token?')?{access_token:'access',refresh_token:'refresh',expires_in:3600}:url.endsWith('/session')?{user:{id:admin}}:{ok:true}));}});
 assert.equal((await api('session')).user,null);assert.equal(calls.length,0);
 await api('login','POST',{login:'Teacher.01',password:'test password'});
 assert.equal(JSON.parse(calls[0].init.body).email,'teacher.01@users.orbita.invalid');
 await api('logout','POST');assert.equal(expired,1);assert.equal((await api('session')).user,null);
});

test('a teacher creates a custom subject and weekly schedule, and only that teacher can edit its group and lessons',async()=>{
 const {req,tables}=fixture();
 const ownId='20000000-0000-4000-8000-000000000002';
 const lessonId='30000000-0000-4000-8000-000000000002';
 const own={id:ownId,name:'Математика · индивидуально',subject:'Математика',teacherId:teacher,students:[],schedule:[{day:2,start:'16:00',end:'17:00'}],archived:false,version:0};
 assert.equal((await req(`groups/${ownId}`,teacher,'PUT',own)).status,200);
 const saved=tables.groups.find(g=>g.id===ownId);
 assert.equal(saved.payload.createdBy,teacher);
 assert.equal(saved.payload.subject,'Математика');
 assert.deepEqual(saved.payload.schedule.map(s=>s.day),[2]);
 assert.ok(tables.audit.some(x=>x.action==='save:groups'&&x.actor===teacher));
 assert.equal((await req(`groups/${ownId}`,other,'PUT',{...own,version:1})).status,403);
 assert.equal((await req(`groups/${ownId}`,teacher,'PUT',{...own,version:1,name:'Обновлённая математика',subject:'Алгебра'})).status,200);
 assert.equal(saved.payload.subject,'Алгебра');
 assert.equal((await req(`groups/${ownId}`,teacher,'PUT',{...saved.payload,version:2,archived:true})).status,403);
 assert.equal((await req(`groups/${ownId}`,teacher,'PUT',{...saved.payload,version:2,teacherId:other})).status,403);
 const lesson={id:lessonId,groupId:ownId,date:'2026-11-03',start:'16:00',end:'17:00',status:'planned',report:'',attendance:{},version:0};
 assert.equal((await req(`lessons/${lessonId}`,teacher,'PUT',lesson)).status,200);
 assert.equal((await req(`lessons/${lessonId}`,other,'PUT',{...lesson,version:1,report:'wrong'})).status,403);
 assert.equal((await req(`lessons/${lessonId}`,teacher,'PUT',{...lesson,version:1,report:'Готовимся к олимпиаде'})).status,200);
 assert.equal(tables.lessons[0].payload.report,'Готовимся к олимпиаде');
 assert.equal((await req(`lessons/${lessonId}`,teacher,'PUT',{...lesson,version:2,report:'Готовимся к олимпиаде',deleted:true})).status,200);
 assert.equal((await req(`lessons/${lessonId}`,teacher,'PUT',{...lesson,version:3,report:'Готовимся к олимпиаде',deleted:false})).status,200);
});

test('teacher cannot take over an existing group, reassign schedule, or change the subject of an assigned group',async()=>{
 const {req,tables}=fixture();
 const different='20000000-0000-4000-8000-000000000099';
 const takeover={id:different,name:'Чужой класс',subject:'Французский',teacherId:other,students:[],schedule:[],version:0,archived:false};
 assert.equal((await req(`groups/${different}`,teacher,'PUT',takeover)).status,403);
 assert.equal(tables.groups.find(g=>g.id===different),undefined);
 const original=tables.groups[0].payload;
 assert.equal((await req(`groups/${gid}`,other,'PUT',{...original,version:1})).status,403);
 assert.equal((await req(`groups/${gid}`,teacher,'PUT',{...original,version:1,subject:'Французский'})).status,403);
 assert.equal((await req(`groups/${gid}`,teacher,'PUT',{...original,version:1,schedule:[{day:1,start:'09:00',end:'10:00',teacherId:other}]})).status,403);
 assert.equal((await req(`groups/${gid}`,teacher,'PUT',{...original,version:1,schedule:[{day:1,start:'09:00',end:'10:00'}]})).status,200);
 assert.equal(tables.groups[0].payload.schedule[0].day,1);
 const newLesson={id:lid,groupId:gid,date:'2026-10-19',start:'09:00',end:'10:00',status:'planned',report:'',attendance:{},version:0,teacherId:other};
 assert.equal((await req(`lessons/${lid}`,teacher,'PUT',newLesson)).status,403);
});

test('new subjects must have a non-empty short name, administrators retain full control',async()=>{
 const {req,tables}=fixture();
 const ownId='20000000-0000-4000-8000-000000000005';
 const own={id:ownId,name:'Особый курс',subject:'  ',teacherId:teacher,students:[],schedule:[],version:0,archived:false};
 assert.equal((await req(`groups/${ownId}`,teacher,'PUT',own)).status,400);
 assert.equal((await req(`groups/${ownId}`,teacher,'PUT',{...own,subject:'X'.repeat(81)})).status,400);
 assert.equal((await req(`groups/${ownId}`,teacher,'PUT',{...own,subject:'Химия'})).status,200);
 const saved=tables.groups.find(g=>g.id===ownId);
 assert.equal((await req(`groups/${ownId}`,admin,'PUT',{...saved.payload,version:1,archived:true})).status,200);
 assert.equal(saved.payload.archived,true);
 assert.equal((await req(`groups/${ownId}`,teacher,'PUT',{...saved.payload,version:2,archived:false})).status,403);
});
