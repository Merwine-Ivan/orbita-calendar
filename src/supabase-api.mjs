// A tab-scoped session survives reloads for at most eight hours; never localStorage.
function tabStorage(){try{return globalThis.sessionStorage||null;}catch{return null;}}
export function createSupabaseApi({url,key,fetchImpl=fetch,onExpired=()=>{},now=Date.now,storage=tabStorage()}){
 let session=null,refreshing=null,generation=0;
 const storageKey=`orbita-session-v1:${new URL(url).host}`;
 const maxAge=8*60*60*1000;
 function clear(){generation++;session=null;refreshing=null;try{storage?.removeItem(storageKey);}catch{}}
 function persist(){try{storage?.setItem(storageKey,JSON.stringify({access_token:session.access_token,refresh_token:session.refresh_token,until:session.until,startedAt:session.startedAt}));}catch{}}
 try{const saved=JSON.parse(storage?.getItem(storageKey)||'null');if(saved&&typeof saved.access_token==='string'&&typeof saved.refresh_token==='string'&&Number.isFinite(saved.until)&&Number.isFinite(saved.startedAt)&&saved.startedAt<=now()&&now()-saved.startedAt<maxAge)session=saved;else clear();}catch{clear();}
 async function call(path,{method='GET',body,token,epoch=generation}={}){
  let r;try{r=await fetchImpl(`${url}${path}`,{method,headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});}catch{throw Error('Нет связи с сервером. Проверьте интернет и повторите.');}
  let d;try{d=await r.json();}catch{throw Object.assign(Error('Сервис вернул некорректный ответ'),{status:r.status});}
  if(!r.ok){if(r.status===401&&token&&epoch===generation&&token===session?.access_token){clear();onExpired();}throw Object.assign(Error(d.error_description||d.msg||d.error||'Не удалось выполнить запрос'),{status:r.status});}return d;
 }
 function keep(s){session={...s,until:now()+s.expires_in*1000,startedAt:session?.startedAt??now()};persist();}
 async function access(){
  if(!session)throw Error('Войдите в журнал');
  if(now()-session.startedAt>=maxAge){clear();onExpired();throw Error('Время входа истекло. Войдите заново.');}
  if(session.until<now()+60000){
   if(!refreshing){
    const epoch=generation,refreshToken=session.refresh_token;
    const pending=call('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refreshToken},epoch}).then(s=>{if(epoch===generation)keep(s);}).catch(e=>{
     // A temporary network/server failure must not discard a valid refresh token.
     if(epoch===generation&&[400,401,403].includes(e.status)){clear();onExpired();}throw e;
    }).finally(()=>{if(refreshing===pending)refreshing=null;});
    refreshing=pending;
   }
   await refreshing;
  }
  if(!session)throw Error('Войдите в журнал');
  return session.access_token;
 }
 return async function request(path,method='GET',body){
  if(path==='session'&&!session)return {demo:false,vkOnly:false,user:null};
  if(path==='login'){
   const login=String(body.login||'').trim().toLowerCase().replace(/@users\.orbita\.invalid$/,'');
   if(!/^[a-z0-9_.-]{3,40}$/.test(login))throw Error('Введите логин, выданный администратором, например admin');
   clear();const epoch=generation;
   try{const s=await call('/auth/v1/token?grant_type=password',{method:'POST',body:{email:`${login}@users.orbita.invalid`,password:body.password},epoch});if(epoch!==generation)throw Error('Вход отменён');keep(s);const state=await request('session');await request('activity','POST',{event:'login'}).catch(()=>{});return state;}
   catch(e){if(epoch===generation)clear();throw Error(e.message.includes('Invalid login')?'Неверный логин или пароль':e.message);}
  }
  if(path==='logout'){
   const token=session?.access_token;clear();onExpired({manual:true});
   if(token){await call('/functions/v1/calendar-api/activity',{method:'POST',body:{event:'logout'},token}).catch(()=>{});await call('/auth/v1/logout',{method:'POST',token}).catch(()=>{});}return {ok:true};
  }
  const epoch=generation,token=await access();
  if(epoch!==generation)throw Error('Сессия изменилась. Повторите действие.');
  const result=await call(`/functions/v1/calendar-api/${path}`,{method,body,token,epoch});
  if(epoch!==generation)throw Error('Сессия изменилась. Повторите действие.');
  return result;
 };
}
