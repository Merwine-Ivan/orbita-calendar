// Owner-only operations are routed through calendar-api after Auth getUser + owner profile.
// No credentials, plaintext backup or service-role key is ever sent to the browser.
const BACKUP_BUCKET='orbita-private-backups';
const FORMAT='orbita-backup-v1';
const encoder=new TextEncoder(), decoder=new TextDecoder();
const encode64=bytes=>{let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);};
const decode64=txt=>Uint8Array.from(atob(txt),x=>x.charCodeAt(0));
function bad(message,status=400){throw Object.assign(Error(message),{status});}
function backupId(value){if(typeof value!=='string'||!/^[a-f0-9-]{36}\.orbita$/i.test(value))bad('Некорректное имя резервной копии');return value;}
function passwordCheck(v){if(typeof v!=='string'||v.length<12||v.length>128)bad('Пароль шифрования: от 12 до 128 символов');}
function responseProblem(response){if(response.status===404)bad('Не найдено резервное хранилище или файл. Примените миграцию 007.',503);bad('Резервное хранилище недоступно',502);}
export async function encryptBackup(snapshot,password){
 passwordCheck(password);
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
 const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt']);
 const plain=encoder.encode(JSON.stringify(snapshot));
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',plain)),b=>b.toString(16).padStart(2,'0')).join('');
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain));
 return JSON.stringify({type:'orbita-encrypted-backup',version:1,kdf:'PBKDF2-SHA256',iterations:210000,cipher:'AES-256-GCM',salt:encode64(salt),iv:encode64(iv),payload:encode64(ciphertext),digest});
}
export async function decryptBackup(content,password,projectId){
 passwordCheck(password);
 if(typeof content!=='string'||content.length>10_000_000)bad('Резервная копия слишком большая',413);
 let wrapper;try{wrapper=JSON.parse(content);}catch{bad('Неверный формат зашифрованной копии');}
 if(wrapper?.type!=='orbita-encrypted-backup'||wrapper?.version!==1||wrapper.iterations!==210000||wrapper.cipher!=='AES-256-GCM'||wrapper.kdf!=='PBKDF2-SHA256')bad('Неизвестный формат резервной копии');
 let snapshot;
 try{
  const salt=decode64(wrapper.salt),iv=decode64(wrapper.iv),payload=decode64(wrapper.payload);
  if(salt.length!==16||iv.length!==12||payload.length<16)bad('Повреждённая копия');
  const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:210000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
  snapshot=JSON.parse(decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,payload)));
 }catch{bad('Неверный пароль или повреждённая копия',422);}
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(snapshot)))),b=>b.toString(16).padStart(2,'0')).join('');
 if(wrapper.digest!==hash)bad('Контрольная сумма копии не совпадает');
 if(snapshot?.format!==FORMAT||snapshot?.project!==projectId||!snapshot.rows||!['groups','lessons','profiles','audit','imports'].every(k=>Array.isArray(snapshot.rows[k])))bad('Копия несовместима с этим проектом');
 return snapshot;
}
export function createMaintenance({url,serviceKey,fetchImpl=fetch,all,backend,now=Date.now}){
 const projectId=new URL(url).hostname.split('.')[0];
 const storage=async(path,{method='GET',data,contentType='application/json'}={})=>{
  const r=await fetchImpl(`${url}/storage/v1/${path}`,{method,headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':contentType,'Cache-Control':'no-store'},body:data});
  if(!r.ok)responseProblem(r);
  return r;
 };
 async function loadSnapshot(){
  const [groups,lessons,profiles,audit,imports]=await Promise.all([all('groups','id'),all('lessons','date,start,id'),all('profiles','id'),all('audit','id'),all('imports','id')]);
  // Profiles contain no password hashes (Auth is separate); redact credential/session metadata anyway.
  const safeProfiles=profiles.map(({id,login,name,role,subjects,disabled,must_change})=>({id,login,name,role,subjects,disabled,must_change}));
  return {format:FORMAT,project:projectId,createdAt:new Date(now()).toISOString(),note:'Auth accounts and password hashes are not included; audit and profiles are export-only and are never overwritten during restore.',rows:{groups,lessons,profiles:safeProfiles,audit,imports}};
 }
 async function putEncrypted(passphrase){
  const snapshot=await loadSnapshot();const content=await encryptBackup(snapshot,passphrase);
  const id=`${crypto.randomUUID()}.orbita`;
  await storage(`object/${BACKUP_BUCKET}/${id}`,{method:'POST',contentType:'application/json',data:content});
  const verify=await (await storage(`object/${BACKUP_BUCKET}/${id}`)).text();
  if(verify!==content)bad('Проверка резервной копии не прошла: очистка запрещена',503);
  return {id,createdAt:snapshot.createdAt,groups:snapshot.rows.groups.length,lessons:snapshot.rows.lessons.length,profiles:snapshot.rows.profiles.length,imports:snapshot.rows.imports.length};
 }
 async function getEncrypted(id){return (await storage(`object/${BACKUP_BUCKET}/${backupId(id)}`)).text();}
 async function list(){
  const r=await storage(`object/list/${BACKUP_BUCKET}`,{method:'POST',data:JSON.stringify({prefix:'',limit:100,sortBy:{column:'created_at',order:'desc'}})});
  return (await r.json()).filter(x=>/^[a-f0-9-]{36}\.orbita$/i.test(x.name)).map(x=>({id:x.name,createdAt:x.created_at,size:x.metadata?.size||0}));
 }
 const rpc=async(action,scope,filter,expected,actor,snapshot)=>{
  const result=await backend('/rest/v1/rpc/orbita_maintenance',{method:'POST',body:{p_action:action,p_scope:scope,p_filter:filter||{},p_expected:expected||'',p_actor:actor,...(snapshot?{p_snapshot:snapshot}:{})}});
  return result;
 };
 function scopeCheck(scope,filter){
  if(!['trash','archive','group','period','schedule','reset','imports'].includes(scope))bad('Неизвестный режим очистки');
  if(!filter||typeof filter!=='object'||Array.isArray(filter))bad('Некорректные фильтры');
  if(scope==='group'&&!/^[0-9a-f-]{36}$/i.test(filter.groupId||''))bad('Выберите архивную группу');
  return {scope,filter};
 }
 async function reauthenticate(owner,ownerPassword){
  if(typeof ownerPassword!=='string'||!ownerPassword)bad('Повторно введите пароль владельца',403);
  try{const result=await backend('/auth/v1/token?grant_type=password',{method:'POST',body:{email:`${owner.login}@users.orbita.invalid`,password:ownerPassword}});
   if(result?.user?.id!==owner.id)bad('Повторная авторизация не удалась',403);
  }catch{bad('Пароль главного администратора не подтверждён',403);}
 }
 async function handle(route,method,body,actor){
  if(actor.role!=='owner')bad('Только главный администратор управляет резервными копиями и очисткой',403);
  if(route==='maintenance/list'&&method==='GET')return {backups:await list()};
  if(route==='maintenance/backup'&&method==='POST')return {backup:await putEncrypted(body.passphrase)};
  if(route.startsWith('maintenance/download/')&&method==='GET'){
   const id=route.slice('maintenance/download/'.length);const content=await getEncrypted(id);
   return {id,content}; // encrypted ciphertext only
  }
  if(route==='maintenance/preview'&&method==='POST'){
   const {scope,filter}=scopeCheck(body.scope,body.filter||{});
   return {preview:await rpc('preview',scope,filter,'',actor.id)};
  }
  if(route==='maintenance/purge'&&method==='POST'){
   const {scope,filter}=scopeCheck(body.scope,body.filter||{});
   if(body.confirmation!=='УДАЛИТЬ НАВСЕГДА')bad('Введите фразу подтверждения');
   if(typeof body.signature!=='string'||body.signature.length!==32)bad('Сначала просмотрите последствия');
   await reauthenticate(actor,body.ownerPassword);
   const fresh=await rpc('preview',scope,filter,'',actor.id);
   if(fresh.signature!==body.signature)bad('Данные изменились после предпросмотра — повторите проверку',409);
   const backup=await putEncrypted(body.passphrase); // verified private encrypted snapshot before any DELETE
   const result=await rpc('purge',scope,filter,body.signature,actor.id);
   return {result,backup};
  }
  if(route==='maintenance/restore'&&method==='POST'){
   if(!['merge','replace'].includes(body.mode))bad('Выберите режим восстановления');
   if(body.confirmation!=='ВОССТАНОВИТЬ ДАННЫЕ')bad('Подтвердите восстановление');
   await reauthenticate(actor,body.ownerPassword);
   const content=body.uploadedContent?body.uploadedContent:await getEncrypted(body.backupId);
   const snapshot=await decryptBackup(content,body.passphrase,projectId);
   const current=await rpc('preview','reset',{},'',actor.id);
   if(body.signature!==current.signature)bad('Рабочая база изменилась — повторите предпросмотр',409);
   const emergencyBackup=await putEncrypted(body.passphrase);
   const result=await rpc(body.mode==='replace'?'restore-replace':'restore-merge','reset',{},current.signature,actor.id,snapshot);
   return {result,emergencyBackup};
  }
  bad('Неизвестное действие с базой',404);
 }
 return {handle,loadSnapshot};
}
