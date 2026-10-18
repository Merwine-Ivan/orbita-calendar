// A tab-scoped session survives reloads for at most eight hours; never localStorage.
function tabStorage(){try{return globalThis.sessionStorage||null;}catch{return null;}}
export function createSupabaseApi({url,key,fetchImpl=fetch,onExpired=()=>{},now=Date.now,storage=tabStorage()}){
 let session=null,refreshing=null;
 const storageKey=`orbita-session-v1:${new URL(url).host}`;
 const maxAge=8*60*60*1000;
 function clear(){session=null;try{storage?.removeItem(storageKey);}catch{}}
 function persist(){try{storage?.setItem(storageKey,JSON.stringify({access_token:session.access_token,refresh_token:session.refresh_token,until:session.until,startedAt:session.startedAt}));}catch{}}
 try{const saved=JSON.parse(storage?.getItem(storageKey)||'null');if(saved&&typeof saved.access_token==='string'&&typeof saved.refresh_token==='string'&&Number.isFinite(saved.until)&&Number.isFinite(saved.startedAt)&&saved.startedAt<=now()&&now()-saved.startedAt<maxAge)session=saved;else clear();}catch{clear();}
 async function call(path,{method='GET',body,token}={}){
  const r=await fetchImpl(`${url}${path}`,{method,headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  let d;try{d=await r.json();}catch{throw Error('Сервис вернул некорректный ответ');}
  if(!r.ok){if(r.status===401&&token){clear();onExpired();}throw Error(d.error_description||d.msg||d.error||'Не удалось выполнить запрос');}return d;
 }
 function keep(s){session={...s,until:now()+s.expires_in*1000,startedAt:session?.startedAt??now()};persist();}
 async function access(){
  if(!session)throw Error('Войдите в журнал');
  if(now()-session.startedAt>=maxAge){clear();onExpired();throw Error('Время входа истекло. Войдите заново.');}
  if(session.until<now()+60000){if(!refreshing)refreshing=call('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}}).then(keep).catch(e=>{clear();onExpired();throw e;}).finally(()=>{refreshing=null;});await refreshing;}
  return session.access_token;
 }
 return async function request(path,method='GET',body){
  if(path==='session'&&!session)return {demo:false,vkOnly:false,user:null};
  if(path==='login'){
   const login=String(body.login||'').trim().toLowerCase().replace(/@users\.orbita\.invalid$/,'');
   if(!/^[a-z0-9_.-]{3,40}$/.test(login))throw Error('Введите логин, выданный администратором, например admin');
   try{clear();keep(await call('/auth/v1/token?grant_type=password',{method:'POST',body:{email:`${login}@users.orbita.invalid`,password:body.password}}));const state=await request('session');await request('activity','POST',{event:'login'}).catch(()=>{});return state;}
   catch(e){clear();throw Error(e.message.includes('Invalid login')?'Неверный логин или пароль':e.message);}
  }
  if(path==='logout'){try{if(session){await request('activity','POST',{event:'logout'}).catch(()=>{});await call('/auth/v1/logout',{method:'POST',token:await access()});}}finally{clear();onExpired();}return {ok:true};}
  return call(`/functions/v1/calendar-api/${path}`,{method,body,token:await access()});
 };
}
