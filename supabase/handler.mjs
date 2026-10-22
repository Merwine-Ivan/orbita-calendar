import {groupHistory,freezeLessons,groupAt,lessonGroup,calendarMonth,centreDate} from '../src/journal.mjs';
import {subjects,validateLesson,duration,dateKey} from '../src/model.mjs';
import {isManager,canCreateAccount,canManageAccount,canTeachGroup} from '../src/roles.mjs';
import {buildTransfer,idFor,digest} from '../src/data-transfer.mjs';
import {studentRecord,contactKeys,visibleStudent} from '../src/student.mjs';
import {studentPlan,personId,sameProfile} from '../src/student-directory.mjs';
import {generatePeriod,batchConflicts,lessonConflicts} from '../src/scheduling.mjs';

const uuid = v => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const publicProfile = p => ({id:p.id,login:p.login,name:p.name,role:p.role,disabled:p.disabled,mustChange:p.must_change,subjects:p.subjects||[]});
const passwordStatus = p => ({passwordChangedAt:p.password_changed_at||null,temporaryPasswordAt:p.temporary_password_at||null});
function fail(message,status=400){throw Object.assign(Error(message),{status});}
function passwordCheck(p){if(typeof p!=='string'||p.length<12||p.length>128)fail('Пароль: от 12 до 128 символов');}
function loginCheck(v){if(typeof v!=='string'||! /^[a-zA-Z0-9_.-]{3,40}$/.test(v))fail('Логин: 3–40 латинских букв, цифр, точек, дефисов или подчёркиваний');return v.toLowerCase();}
function allowedSubjects(value){if(!Array.isArray(value)||value.length>subjects.length||new Set(value).size!==value.length||value.some(s=>!subjects.includes(s)))fail('Выберите разрешённые предметы из списка');return value;}

// Service key is read only on the server. No JWT is trusted until Auth getUser succeeds.
export function createHandler({url,serviceKey,allowedOrigins,defaultTemporaryPassword,fetchImpl=fetch,now=Date.now}){
 async function backend(path,{method='GET',body,token=serviceKey,prefer}={}){
  const r=await fetchImpl(`${url}${path}`,{method,headers:{apikey:serviceKey,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();let data;try{data=text?JSON.parse(text):null;}catch{fail('Сервис вернул некорректный ответ',502);}
  if(!r.ok){
   const code=data?.error_code||data?.code;
   if(code==='same_password')fail('Новый пароль должен отличаться от прежнего. Придумайте другой пароль.',422);
   if(code==='weak_password')fail('Этот пароль не соответствует требованиям безопасности. Выберите более сложный пароль от 12 символов.',422);
   if(code==='reauthentication_needed'||code==='reauthentication_not_valid')fail('Для смены пароля нужно заново войти в журнал.',401);
   if(code==='40001')fail('Данные изменились после предпросмотра. Повторите проверку файла.',409);
   if(code==='email_exists'||code==='user_already_exists'||r.status===409||code==='23505')fail('Такая запись уже существует',409);
   if(r.status===429)fail('Слишком много запросов. Подождите немного и повторите.',429);
   if(r.status===401||r.status===403)fail('Сессия завершена. Войдите заново.',401);
   fail('Сервис временно недоступен. Повторите запрос.',502);
  }return data;
 }
 const query=(table,q='')=>`/rest/v1/orbita_${table}?${q}`;
 async function one(table,id){return (await backend(query(table,`id=eq.${id}&limit=1`)))[0];}
 async function all(table,order){const result=[];for(let offset=0;;offset+=1000){const rows=await backend(query(table,`order=${order}&limit=1000&offset=${offset}`));result.push(...rows);if(rows.length<1000)return result;}}
 async function audit(p,action,target){await backend(query('audit'),{method:'POST',body:{actor:p.id,action,target}});}
 async function save(table,payload,metadata){
  if(!uuid(payload.id)||!Number.isInteger(payload.version)||payload.version<0)fail('Некорректный ID или версия');
  const record={...metadata,payload,version:payload.version+1};
  if(payload.version===0){await backend(query(table),{method:'POST',body:{id:payload.id,...record}});}
  else {const rows=await backend(query(table,`id=eq.${payload.id}&version=eq.${payload.version}`),{method:'PATCH',body:record,prefer:'return=representation'});if(!rows.length)fail('Запись изменена другим сотрудником. Закройте окно и откройте занятие заново.',409);}
 }
 return async request=>{
  const origin=request.headers.get('Origin')||'';
  const cors={'Access-Control-Allow-Origin':allowedOrigins.includes(origin)?origin:allowedOrigins[0],'Vary':'Origin','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET, POST, PUT, PATCH, OPTIONS','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8'}});
  if(origin&&!allowedOrigins.includes(origin))return json({error:'Недопустимый источник запроса'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
   const token=request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token)fail('Войдите в журнал',401);
   const authUser=await backend('/auth/v1/user',{token});
   const p=await one('profiles',authUser.id);if(!p||p.disabled)fail('Доступ не выдан или отключён. Обратитесь к администратору.',403);
   let claims;try{claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{fail('Сессия завершена. Войдите заново.',401);}
   if(!Number.isFinite(claims.iat)||claims.iat<=p.invalid_before)fail('Доступ обновлён администратором. Войдите заново.',401);
   const route=new URL(request.url).pathname.split('/calendar-api/')[1]||'';
   const isAdmin=()=>{if(!isManager(p.role))fail('Доступ только для администратора',403);};
   let b={};if(!['GET','HEAD'].includes(request.method)){const raw=await request.text();if(new TextEncoder().encode(raw).length>(route.startsWith('transfer/')||route==='trash/purge'?8000000:150000))fail('Запрос слишком большой',413);try{b=JSON.parse(raw||'{}');}catch{fail('Некорректный JSON');}if(!b||typeof b!=='object'||Array.isArray(b))fail('Ожидается объект JSON');}
   if(route==='session'&&request.method==='GET')return json({demo:false,vkOnly:false,user:{...publicProfile(p),...passwordStatus(p)}});
   if(route==='password'&&request.method==='POST'){
    passwordCheck(b.password);await backend('/auth/v1/user',{method:'PUT',token,body:{password:b.password}});
    await backend(query('profiles',`id=eq.${p.id}`),{method:'PATCH',body:{must_change:false,password_changed_at:new Date(now()).toISOString(),temporary_password_at:null}});await audit(p,'password',p.id);return json({ok:true});
   }
   if(route==='activity'&&request.method==='POST'){
    if(!['login','logout'].includes(b.event))fail('Неизвестное событие');
    if(b.event==='login')await backend(query('profiles',`id=eq.${p.id}`),{method:'PATCH',body:{last_seen_at:new Date(now()).toISOString()}});
    if(b.event==='logout')await backend(query('profiles',`id=eq.${p.id}`),{method:'PATCH',body:{last_seen_at:null,invalid_before:Math.floor(now()/1000)}});
    await audit(p,b.event,p.id);return json({ok:true});
   }
   if(p.must_change)fail('Сначала замените временный пароль',403);
   if(route==='payments'&&request.method==='GET'){
    const rows=await all('payments','at,id');return json({payments:isManager(p.role)?rows:rows.filter(r=>r.teacher_id===p.id)});
   }
   if(route==='payments'&&request.method==='POST'){
    isAdmin();if(!uuid(b.id)||!uuid(b.teacherId)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(b.month)||typeof b.subject!=='string'||!b.subject.trim()||b.subject.length>80||!['group','individual'].includes(b.lessonType)||!Number.isInteger(b.minutes)||!b.minutes||Math.abs(b.minutes)>60000||typeof b.note!=='string'||b.note.length>500)fail('Проверьте оплату: преподаватель, месяц, предмет и часы');
    const result=await backend('/rest/v1/rpc/orbita_record_payment',{method:'POST',body:{p_actor:p.id,p_iat:claims.iat,p_id:b.id,p_teacher:b.teacherId,p_month:b.month,p_subject:b.subject.trim(),p_type:b.lessonType,p_minutes:b.minutes,p_note:b.note.trim()}});return json({ok:true,payment:result});
   }
   if(route==='trash/purge'&&request.method==='POST'){
    if(p.role!=='owner')fail('Окончательное удаление доступно только главному admin',403);
    if(!uuid(b.requestId)||!Array.isArray(b.items)||!b.items.length||b.items.length>5000)fail('Проверьте выбранные записи');
    for(const i of b.items){
     if(!['groups','lessons'].includes(i.table)||!uuid(i.id)||!Number.isInteger(i.version)||i.version<1)fail('Проверьте выбранные записи');
     if(i.table==='groups'&&(!Array.isArray(i.children)||i.children.some(c=>!uuid(c.id)||!Number.isInteger(c.version))))fail('Обновите корзину перед удалением группы');
    }
    const result=await backend('/rest/v1/rpc/orbita_purge_trash',{method:'POST',body:{p_actor:p.id,p_iat:claims.iat,p_request:b.requestId,p_items:b.items}});return json({ok:true,...result});
   }
   const operation=route.match(/^operations\/(students|calendar)\/(preview|commit)$/);
   if(operation&&request.method==='POST'){
    const [,kind,step]=operation;if(kind==='students')isAdmin();
    if(step==='commit'){
     if(!uuid(b.requestId)||typeof b.digest!=='string'||!/^[a-f0-9]{64}$/.test(b.digest))fail('Сначала проверьте изменения');const saved=await one('imports',b.requestId);
     if(saved){if(saved.summary?.actor!==p.id||saved.summary?.digest!==b.digest)fail('ID операции уже занят',409);return json({ok:true,summary:saved.summary});}
    }
    const [gs,ls,profiles]=await Promise.all([all('groups','id'),all('lessons','id'),all('profiles','id')]);const groups=gs.map(r=>({...r.payload,version:r.version})),lessons=ls.map(r=>({...r.payload,version:r.version}));let plan;
    try{
     if(kind==='students'){if(!isManager(p.role)&&!groups.some(g=>!g.archived&&canTeachGroup(p,g)&&g.students.some(s=>personId(s)===b.input?.personId)))fail('Изменять можно только карточки своих учеников',403);plan=await studentPlan({groups,lessons,input:b.input});}
     else{
      if(!Array.isArray(b.input?.groupIds)||!b.input.groupIds.length||b.input.groupIds.length>1000||new Set(b.input.groupIds).size!==b.input.groupIds.length)fail('Выберите группы');
      const chosen=b.input.groupIds.map(id=>groups.find(g=>g.id===id));if(chosen.some(g=>!g||g.archived||!canTeachGroup(p,g)))fail('Недоступная группа',403);
      const eligible=chosen.map(g=>({...g,schedule:isManager(p.role)?g.schedule:g.schedule.filter(s=>!s.teacherId||s.teacherId===p.id)}));
      const added=generatePeriod(eligible,b.input.period,lessons);if(added.length>5000)fail('Не больше 5000 занятий за операцию');
      for(const l of added){validateLesson(l);l.id=await idFor(['calendar',l.groupId,l.date,l.start]);const g=groups.find(g=>g.id===l.groupId),tid=l.teacherId??g.teacherId;if(tid){const t=profiles.find(t=>t.id===tid);if(!t||t.disabled||!canTeachGroup(t,{...g,teacherId:tid}))fail('Проверьте назначение преподавателя и разрешённые предметы');}}
      const changes={groups:[],lessons:added.map(payload=>({expectedVersion:0,payload}))},checks={groups:groups.map(g=>({id:g.id,version:g.version})),lessons:lessons.map(l=>({id:l.id,version:l.version}))};
      plan={changes,checks,summary:{newGroups:0,updatedGroups:0,newStudents:0,newLessons:added.length,updatedLessons:0,skipped:0},details:added.map(l=>({label:`${groups.find(g=>g.id===l.groupId).name} · ${l.date} ${l.start}–${l.end}`})),warnings:[],conflicts:batchConflicts(added,lessons,groups),digest:await digest({input:b.input,changes,checks})};
     }
    }catch(e){fail(e.message,e.status||400);}
    if(step==='preview')return json({digest:plan.digest,summary:plan.summary,details:plan.details,warnings:plan.warnings,profile:plan.profile,conflicts:plan.conflicts||[]});
    if(b.digest!==plan.digest)fail('Данные изменились. Повторите предпросмотр.',409);
    if(plan.conflicts?.length&&b.confirmConflicts!==true)fail('Подтвердите создание занятий с пересечениями',409);
    if(!plan.changes.groups.length&&!plan.changes.lessons.length)return json({ok:true,summary:plan.summary});
    const summary=await backend('/rest/v1/rpc/orbita_apply_transfer',{method:'POST',body:{p_actor:p.id,p_iat:claims.iat,p_kind:kind,p_request:b.requestId,p_digest:plan.digest,p_changes:plan.changes,p_checks:plan.checks,p_summary:plan.summary}});return json({ok:true,summary});
   }
   if(route==='transfer/history'&&request.method==='GET'){
    if(p.role!=='owner')fail('История копий доступна только главному admin',403);
    const rows=await backend(query('imports','source=in.(orbita-csv,orbita-restore,orbita-students,orbita-calendar,orbita-purge)&order=at.desc&limit=20&select=id,at,source,summary'));
    return json({entries:rows.map(r=>({id:r.id,at:r.at,source:r.source,summary:r.summary}))});
   }
   const savedCopy=route.match(/^transfer\/backups\/([0-9a-f-]+)$/i);
   if(savedCopy&&request.method==='GET'){
    if(p.role!=='owner')fail('Доступ только главному admin',403);if(!uuid(savedCopy[1]))fail('Некорректный ID');
    const saved=await one('imports',savedCopy[1]);if(!saved||!['orbita-csv','orbita-restore','orbita-students','orbita-calendar','orbita-purge'].includes(saved.source))fail('Копия не найдена',404);
    await audit(p,'backup:journal',saved.id);return json(saved.snapshot);
   }
   const transfer=route.match(/^transfer\/(csv|restore)\/(preview|commit)$/);
   if(transfer&&request.method==='POST'){
    isAdmin();const [,kind,step]=transfer;if(kind==='restore'&&p.role!=='owner')fail('Восстановление доступно только главному admin',403);
    if(b.overwrite!==undefined&&typeof b.overwrite!=='boolean')fail('Некорректный режим восстановления');
    if(step==='commit'&&(!uuid(b.requestId)||typeof b.digest!=='string'||!/^[a-f0-9]{64}$/.test(b.digest)))fail('Сначала проверьте файл');
    if(step==='commit'){
     const applied=await one('imports',b.requestId);
     if(applied){if(applied.summary?.actor!==p.id||applied.summary?.digest!==b.digest)fail('ID операции уже использован',409);return json({ok:true,summary:applied.summary});}
    }
    const [gs,ls,profiles]=await Promise.all([all('groups','id'),all('lessons','id'),all('profiles','id')]);
    const existing={groups:gs.map(r=>({...r.payload,version:r.version})),lessons:ls.map(r=>({...r.payload,version:r.version}))};
    let plan;try{plan=await buildTransfer({kind,source:b.source,overwrite:b.overwrite===true,existing,users:profiles});}catch(e){fail(e.message);}
    if(kind==='csv')for(const {payload:g} of plan.changes.groups){const teacher=profiles.find(u=>u.id===g.teacherId);if(!teacher||teacher.disabled||!isManager(teacher.role)&&subjects.includes(g.subject)&&!teacher.subjects?.includes(g.subject)&&g.createdBy!==teacher.id)fail('Сначала разрешите преподавателю предмет группы в его профиле');}
    if(step==='preview')return json({digest:plan.digest,summary:plan.summary,details:plan.details,warnings:plan.warnings});
    if(plan.digest!==b.digest)fail('Данные изменились после предпросмотра. Проверьте файл заново.',409);
    if(!plan.changes.groups.length&&!plan.changes.lessons.length)return json({ok:true,summary:plan.summary});
    const summary=await backend('/rest/v1/rpc/orbita_apply_transfer',{method:'POST',body:{p_actor:p.id,p_iat:claims.iat,p_kind:kind,p_request:b.requestId,p_digest:plan.digest,p_changes:plan.changes,p_checks:plan.checks,p_summary:plan.summary}});
    return json({ok:true,summary});
   }
   if(route==='backup'&&request.method==='GET'){
    if(p.role!=='owner')fail('Резервная копия доступна только главному admin',403);
    const snapshot=await backend('/rest/v1/rpc/orbita_journal_backup',{method:'POST',body:{}});
    await audit(p,'backup:journal','journal');return json(snapshot);
   }
   if(route==='presence'&&request.method==='POST'){
    await backend(query('profiles',`id=eq.${p.id}`),{method:'PATCH',body:{last_seen_at:new Date(now()).toISOString()}});return json({ok:true});
   }
   if(route==='audit'&&request.method==='GET'){
    if(p.role!=='owner')fail('Журнал действий доступен только главному admin',403);
    const before=new URL(request.url).searchParams.get('before');
    if(before&&!/^\d{1,20}$/.test(before))fail('Некорректная страница журнала');
    const rows=await backend(query('audit',`order=id.desc&limit=101${before?`&id=lt.${before}`:''}`));
    const profiles=await all('profiles','id');const byId=new Map(profiles.map(profile=>[profile.id,profile]));
    return json({entries:rows.slice(0,100).map(r=>({id:String(r.id),at:r.at,action:r.action,target:r.target,actor:r.actor,actorName:byId.get(r.actor)?.name||'Сотрудник',actorLogin:byId.get(r.actor)?.login||''})),nextCursor:rows.length>100?String(rows[99].id):null});
   }
   if(route==='bootstrap'&&request.method==='GET'){
    // All active teachers see the same calendar. Only admins manage groups/accounts.
    const [groups,lessons,profiles]=await Promise.all([all('groups','id'),all('lessons','date,start,id'),all('profiles','name,id')]);
    const groupLookup=new Map(groups.map(g=>[g.id,g]));
     return json({groups:groups.map(r=>({...r.payload,history:(r.payload.history||[]).map(h=>({...h,students:(h.students||[]).map(s=>visibleStudent(s,isManager(p.role)))})),students:r.payload.students.map(s=>visibleStudent({...s,personId:personId(s)},isManager(p.role)||canTeachGroup(p,{teacherId:r.teacher_id,subject:r.payload.subject,createdBy:r.payload.createdBy})||canTeachGroup(p,{teacherId:p.id,subject:r.payload.subject,createdBy:r.payload.createdBy})&&(r.payload.schedule?.some(t=>t.teacherId===p.id&&t.active!==false)||lessons.some(l=>!l.payload.deleted&&l.group_id===r.id&&l.payload.teacherId===p.id)))),version:r.version})),lessons:lessons.filter(r=>{
      if(isManager(p.role)||!r.payload.deleted)return true;
      const g=groupLookup.get(r.group_id);
      return !!g&&canTeachGroup(p,{teacherId:r.payload.teacherId??g.teacher_id,subject:g.payload.subject,createdBy:g.payload.createdBy});
     }).map(r=>({...r.payload,...(r.payload.snapshot?{snapshot:{...r.payload.snapshot,students:(r.payload.snapshot.students||[]).map(s=>visibleStudent(s,false))}}:{}),version:r.version})),users:profiles.map(profile=>({...publicProfile(profile),...((isManager(p.role)||profile.id===p.id)?passwordStatus(profile):{}),...(isManager(p.role)?{lastSeenAt:profile.last_seen_at||null,online:!profile.disabled&&Date.parse(profile.last_seen_at)<=now()&&Date.parse(profile.last_seen_at)>now()-90000}:{})}))});
   }
   const match=route.match(/^(groups|lessons)\/([0-9a-f-]+)$/i);
   if(match&&request.method==='PUT'){
    const [_,table,id]=match;if(!uuid(id)||b.id!==id)fail('Некорректный ID');let event=`save:${table}`;
    if(table==='groups'){
     const previous=await one('groups',id);
     if(b.deleted!==undefined&&typeof b.deleted!=='boolean')fail('Некорректное удаление группы');if(!isManager(p.role)&&Boolean(b.deleted)!==Boolean(previous?.payload.deleted))fail('Удалять группы может администратор',403);
     if(b.lessonType!==undefined&&!['group','individual'].includes(b.lessonType))fail('Неизвестный формат занятий');
     if(typeof b.name!=='string'||!b.name.trim()||b.name.length>120||typeof b.subject!=='string'||!b.subject.trim()||b.subject.trim().length>80||/[\x00-\x1f\x7f]/.test(b.subject)||(b.teacherId!=null&&!uuid(b.teacherId)))fail('Проверьте название, предмет и преподавателя');
     const normalizedSubject=b.subject.trim();
     if(Array.isArray(b.students)&&b.students.length>Math.max(10,previous?.payload.students?.length||0))fail('Не больше 10 учеников в новой группе');
     if(!Array.isArray(b.students)||b.students.length>100||!Array.isArray(b.schedule)||b.schedule.length>20)fail('Проверьте учеников и расписание');
     if(b.students.some(s=>!s||typeof s!=='object')||b.schedule.some(s=>!s||typeof s!=='object'))fail('Проверьте учеников и расписание');
     for(const slot of b.schedule)if(slot.teacherId){if(!uuid(slot.teacherId))fail('Некорректный преподаватель в расписании');if(isManager(p.role)){const t=await one('profiles',slot.teacherId);if(!t||t.disabled)fail('Преподаватель расписания недоступен');}}
     if(!isManager(p.role)){
      if(p.role!=='teacher'||b.teacherId!==p.id)fail('Преподаватель может управлять только своими группами',403);
      if(previous){
       if(previous.teacher_id!==p.id||previous.payload.archived||!canTeachGroup(p,{teacherId:previous.teacher_id,subject:previous.payload.subject,createdBy:previous.payload.createdBy}))fail('Вы можете менять только свои активные группы',403);
       if(previous.payload.createdBy!==p.id&&normalizedSubject!==previous.payload.subject)fail('Предмет назначенной группы меняет только администратор',403);
       if(Boolean(b.archived)!==Boolean(previous.payload.archived))fail('Архивировать группы может только администратор',403);
      }else if(b.archived)fail('Нельзя создать группу сразу в архиве',403);
      if(b.schedule?.some(slot=>slot.teacherId&&slot.teacherId!==p.id))fail('Нельзя назначать в расписании другого преподавателя',403);
     }
     const people=new Set();for(const s of b.students){const pid=s.personId||previous?.payload.students?.find(x=>x.id===s.id)?.personId||s.id;if(people.has(pid))fail('Ученик уже есть в этой группе');people.add(pid);}
     const t=b.teacherId?await one('profiles',b.teacherId):null;if(b.teacherId&&(!t||t.disabled))fail('Преподаватель недоступен');
     if(isManager(p.role)&&t&&!isManager(t.role)&&subjects.includes(normalizedSubject)&&!t.subjects?.includes(normalizedSubject))fail('Сначала разрешите преподавателю этот предмет в его профиле');
     if(!Array.isArray(b.students)||b.students.length>100||!Array.isArray(b.schedule)||b.schedule.length>20)fail('Проверьте учеников и расписание');
     const ids=new Set();for(const s of b.students){if(!uuid(s.id)||ids.has(s.id)||typeof s.name!=='string'||!s.name.trim()||s.name.length>240)fail('Проверьте учеников');ids.add(s.id);}
     const slots=new Set();for(const s of b.schedule){if(!Number.isInteger(s.day)||s.day<0||s.day>6||![s.start,s.end].every(t=>typeof t==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(t))||duration(s.start,s.end)<=0)fail('Проверьте расписание');if([s.effectiveFrom,s.effectiveTo].some(d=>d&&(!/^\d{4}-\d{2}-\d{2}$/.test(d)||dateKey(new Date(`${d}T12:00:00`))!==d))||(s.effectiveFrom&&s.effectiveTo&&s.effectiveFrom>s.effectiveTo&&!previous?.payload.schedule?.some(old=>JSON.stringify(old)===JSON.stringify(s))))fail('Проверьте даты расписания');if(s.repeat!==undefined&&!['weekly','biweekly','once'].includes(s.repeat))fail('Неизвестная периодичность');if(['biweekly','once'].includes(s.repeat)&&!s.effectiveFrom)fail('Укажите дату начала повторения');if(s.repeat==='once'&&new Date(`${s.effectiveFrom}T12:00:00`).getDay()!==s.day)fail('Разовый урок должен совпадать с выбранной датой');const k=`${s.day}-${s.start}-${s.effectiveFrom||''}-${s.effectiveTo||''}`;if(slots.has(k))fail('Повтор времени в расписании');slots.add(k);}
     let common=[];if(b.students.some(s=>s.personId||previous?.payload.students?.some(x=>x.id===s.id))){
      common=await all('groups','id');for(const s of b.students){const old=previous?.payload.students?.find(x=>x.id===s.id);const pid=s.personId||old?.personId||old?.id;if(!pid)continue;if(!uuid(pid)||old&&personId(old)!==pid)fail('Связи учеников меняются в разделе «Ученики»');if(!old&&!isManager(p.role))fail('Связывать учеников может администратор',403);const canonical=common.flatMap(g=>g.payload.students).find(x=>personId(x)===pid);if(!canonical||!sameProfile(canonical,s))fail('Общие ФИО и контакты меняются в разделе «Ученики»');s.personId=pid;}
     }
     if(Boolean(previous?.payload.archived)!==Boolean(b.archived))event=b.archived?'archive:groups':'restore:groups';
     let groupPayload={...(previous?.payload||{}),id,name:b.name.trim(),subject:normalizedSubject,teacherId:b.teacherId||null,createdBy:previous?.payload.createdBy||(!isManager(p.role)?p.id:null),students:b.students.map(s=>{const old=previous?.payload.students?.find(x=>x.id===s.id)||{};const merged={...old,...s};let normalized;try{normalized=studentRecord(merged);}catch(e){fail(e.message);}const result={...old,...normalized,personId:s.personId||old.personId||s.id};for(const key of contactKeys)if(!(key in normalized))delete result[key];return result;}),schedule:b.schedule.map(s=>({day:s.day,start:s.start,end:s.end,...(s.id?{id:s.id}:{}),effectiveFrom:s.effectiveFrom||null,effectiveTo:s.effectiveTo||null,...(s.repeat?{repeat:s.repeat}:{}),active:s.active!==false,...(s.teacherId?{teacherId:s.teacherId}:{})})),archived:Boolean(b.archived)||Boolean(b.deleted),deleted:Boolean(b.deleted),lessonType:b.lessonType||previous?.payload.lessonType||(/индивидуал/i.test(b.name)?'individual':'group'),version:b.version};
     if(previous){const records=await all('lessons','id');groupPayload.frozenLessons=freezeLessons(previous.payload,records.map(r=>r.payload),centreDate(now()));}
     groupPayload=groupHistory(previous?.payload,groupPayload,centreDate(now()));
     const linking=b.students.some(s=>s.personId&&!previous?.payload.students?.some(old=>old.id===s.id));
     if(linking){
      const ls=await all('lessons','id');const checks={groups:common.map(r=>({id:r.id,version:r.version})),lessons:ls.map(r=>({id:r.id,version:r.version}))};const changes={groups:[{expectedVersion:b.version,payload:groupPayload}],lessons:[]};
      await backend('/rest/v1/rpc/orbita_apply_transfer',{method:'POST',body:{p_actor:p.id,p_iat:claims.iat,p_kind:'students',p_request:crypto.randomUUID(),p_digest:await digest({changes,checks}),p_changes:changes,p_checks:checks,p_summary:{newGroups:previous?0:1,updatedGroups:previous?1:0,newStudents:b.students.filter(s=>!previous?.payload.students?.some(x=>x.id===s.id)).length,newLessons:0,updatedLessons:0}}});
     }else await save(table,groupPayload,{teacher_id:b.teacherId||null});
    }else{
     try{validateLesson(b);}catch(e){fail(e.message);}if(!uuid(b.groupId))fail('Некорректная группа');const g=await one('groups',b.groupId);if(!g)fail('Группа не найдена');
     const old=await one('lessons',id);
     if(b.virtual&&(!Number.isInteger(b.groupVersion)||b.groupVersion!==g.version))fail('Расписание изменилось. Закройте занятие и откройте его заново.',409);
     const shifted=!old||['groupId','date','start','end','teacherId'].some(k=>(old.payload[k]??null)!==(b[k]??null))||old.payload.status==='cancelled'&&b.status!=='cancelled';
     if(shifted&&b.confirmConflicts!==true){const [allGroups,allLessons]=await Promise.all([all('groups','id'),all('lessons','id')]);if(lessonConflicts(b,calendarMonth(allGroups.map(r=>r.payload),allLessons.map(r=>r.payload),Number(b.date.slice(0,4)),Number(b.date.slice(5,7))-1,centreDate(now())).filter(l=>!(l.virtual&&l.groupId===b.groupId&&l.date===b.date&&l.start===b.start)),allGroups.map(r=>r.payload)).length)fail('Есть пересечения занятий. Проверьте предупреждение и подтвердите сохранение.',409);}
     if(b.deleted!==undefined&&typeof b.deleted!=='boolean')fail('Некорректное состояние удаления');
     const changingDeletion=Boolean(b.deleted)!==Boolean(old?.payload.deleted);
      if(!isManager(p.role)&&old?.payload.deleted&&!changingDeletion)fail('Удалённое занятие можно только восстановить',403);
      if(!isManager(p.role)&&changingDeletion){
       if(!old)fail('Удалять можно только сохранённые занятия',403);
       const existing=old.payload;
       if(b.groupId!==existing.groupId||b.date!==existing.date||b.start!==existing.start||b.end!==existing.end||b.status!==existing.status||b.report!==existing.report||JSON.stringify(b.attendance)!==JSON.stringify(existing.attendance)||(b.teacherId??null)!==(existing.teacherId??null))fail('При удалении и восстановлении нельзя менять содержание урока',403);
      }
     if(Boolean(b.deleted)!==Boolean(old?.payload.deleted))event=b.deleted?'delete:lessons':'restore:lessons';
     const permitted=(group,lesson)=>canTeachGroup(p,group&&{teacherId:lesson?.teacherId??group.teacher_id,subject:group.payload.subject,createdBy:group.payload.createdBy});
     if(!permitted(g,b)||(old&&!permitted(await one('groups',old.group_id),old.payload)))fail('Редактировать можно только свои группы по разрешённым предметам',403);
     if(!isManager(p.role)&&(b.teacherId??null)!==(old?.payload.teacherId??null)&&!( !old&&b.teacherId===p.id&&g.teacher_id===p.id))fail('Назначать преподавателя может только администратор',403);
     if(b.teacherId&&(!old||b.teacherId!==old.payload.teacherId||b.groupId!==old.group_id)){if(!uuid(b.teacherId))fail('Некорректный преподаватель');const t=await one('profiles',b.teacherId);if(!t||t.disabled)fail('Преподаватель недоступен');if(!isManager(t.role)&&subjects.includes(g.payload.subject)&&!t.subjects?.includes(g.payload.subject)&&g.payload.createdBy!==t.id)fail('Сначала разрешите преподавателю этот предмет в его профиле');}
     if(g.payload.archived&&(!old||old.group_id!==g.id))fail('Группа в архиве');
     if(!b.attendance||typeof b.attendance!=='object'||Array.isArray(b.attendance))fail('Некорректная посещаемость');
     const historical=old?.payload.snapshot||lessonGroup(g.payload,old?.payload||b);
     for(const [sid,mark] of Object.entries(b.attendance))if(!['present','absent','excused'].includes(mark)||(!(historical.students||[]).some(s=>s.id===sid)&&old?.payload.attendance?.[sid]!==mark))fail('Некорректная отметка');
     await save(table,{...(old?.payload||{}),id,snapshot:old?.group_id===b.groupId&&old.payload.snapshot?old.payload.snapshot:{name:historical.name,subject:historical.subject,teacherId:historical.teacherId,lessonType:historical.lessonType,students:(historical.students||[]).map(s=>({id:s.id,name:s.name,personId:s.personId||s.id}))},manual:old?.payload.manual??!b.virtual,deleted:Boolean(b.deleted),teacherId:b.teacherId||null,groupId:b.groupId,date:b.date,start:b.start,end:b.end,status:b.status,report:b.report,attendance:b.attendance,version:b.version},{group_id:b.groupId,date:b.date,start:b.start});
    }
    await audit(p,event,id);return json({ok:true});
   }
   if(route==='users'&&request.method==='POST'){
    isAdmin();if(!canCreateAccount(p.role,b.role))fail('Выдавать доступ субадмина может только главный admin',403);const login=loginCheck(b.login);
    const temporary=b.useDefault===true?defaultTemporaryPassword:b.password;
    if(b.useDefault===true&&!temporary)fail('Общий временный пароль ещё не настроен на сервере',503);
    passwordCheck(temporary);if(typeof b.name!=='string'||!b.name.trim()||b.name.length>80)fail('Проверьте имя и роль');const assigned=b.role==='teacher'?allowedSubjects(b.subjects||[]):[];
    const created=await backend('/auth/v1/admin/users',{method:'POST',body:{email:`${login}@users.orbita.invalid`,password:temporary,email_confirm:true}});
    try{await backend(query('profiles'),{method:'POST',body:{id:created.id,login,name:b.name.trim(),role:b.role,subjects:assigned,must_change:true,temporary_password_at:new Date(now()).toISOString()}});}catch(e){await backend(`/auth/v1/admin/users/${created.id}`,{method:'DELETE'});throw e;}
    await audit(p,'create:user',created.id);return json({ok:true});
   }
   const account=route.match(/^users\/([0-9a-f-]+)(\/(?:password|profile))?$/i);
   if(account){
    const id=account[1];if(!uuid(id))fail('Некорректный ID');const target=await one('profiles',id);if(!target)fail('Пользователь не найден',404);
    if(account[2]==='/profile'&&request.method==='PATCH'){
     if(Object.keys(b).some(key=>!['subjects','name','login'].includes(key)))fail('Изменять роль через профиль нельзя',403);
     if('subjects' in b){
      if(!canManageAccount(p.role,target.role)||target.role!=='teacher'||id===p.id)fail('Нет права назначать предметы этому сотруднику',403);
      if('name' in b||'login' in b)fail('Сохраните предметы и имя отдельно');
      const assigned=allowedSubjects(b.subjects);await backend(query('profiles',`id=eq.${id}`),{method:'PATCH',body:{subjects:assigned}});await audit(p,'subjects:user',id);return json({ok:true});
     }
     if(p.role!=='owner'&&id!==p.id)fail('Изменять чужое имя и логин может только главный admin',403);
     if(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>80)fail('Введите имя от 1 до 80 символов');
     const login=loginCheck(b.login);
     const duplicate=(await backend(query('profiles',`login=eq.${login}&limit=1`)))[0];
     if(duplicate&&duplicate.id!==id)fail('Этот логин уже занят',409);
     const changed=login!==target.login;
     if(changed)await backend(`/auth/v1/admin/users/${id}`,{method:'PUT',body:{email:`${login}@users.orbita.invalid`,email_confirm:true}});
     try{await backend(query('profiles',`id=eq.${id}`),{method:'PATCH',body:{name:b.name.trim(),login}});}catch(e){if(changed)await backend(`/auth/v1/admin/users/${id}`,{method:'PUT',body:{email:`${target.login}@users.orbita.invalid`,email_confirm:true}});throw e;}
     await audit(p,'identity:user',id);return json({ok:true});
    }
    isAdmin();if(id===p.id)fail('Свой доступ изменяйте через смену пароля');if(!canManageAccount(p.role,target.role))fail('Нет права изменять доступ этого сотрудника',403);
    if(account[2]==='/password'&&request.method==='POST'){
     const temporary=b.useDefault===true?defaultTemporaryPassword:b.password;
     if(b.useDefault===true&&!temporary)fail('Общий временный пароль ещё не настроен на сервере',503);
     passwordCheck(temporary);
     // Invalidate first: a failed Auth update never leaves old sessions authorized.
     await backend(query('profiles',`id=eq.${id}`),{method:'PATCH',body:{must_change:true,invalid_before:Math.floor(now()/1000),temporary_password_at:new Date(now()).toISOString()}});
     await backend(`/auth/v1/admin/users/${id}`,{method:'PUT',body:{password:temporary}});await audit(p,'reset:user',id);return json({ok:true});
    }
    if(!account[2]&&request.method==='PATCH'){
     if(typeof b.disabled!=='boolean')fail('Некорректное состояние');await backend(query('profiles',`id=eq.${id}`),{method:'PATCH',body:{disabled:b.disabled,invalid_before:Math.floor(now()/1000)}});await audit(p,'toggle:user',id);return json({ok:true});
    }
   }
   fail('Не найдено',404);
  }catch(e){return json({error:e.status?e.message:'Не удалось выполнить запрос'},e.status||500);}
 };
}
