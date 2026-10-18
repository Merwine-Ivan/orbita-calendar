import {createSupabaseApi} from './supabase-api.mjs';
const shared = typeof ORBITA_SUPABASE!=='undefined' ? createSupabaseApi({...ORBITA_SUPABASE,onExpired:()=>window.dispatchEvent(new Event('orbita-session-expired'))}) : null;
let sessionToken='';
export function setSessionToken(token){sessionToken=token;}
export async function request(path,method='GET',body) {
 if(shared)return shared(path,method,body);
 if(typeof ORBITA_DEMO!=='undefined'&&ORBITA_DEMO){if(path==='session')return {demo:true,user:null};throw Error('Деморежим: общая база не подключена');}
 const res=await fetch(`/api/${path}`,{method,credentials:'same-origin',headers:{...(body?{'Content-Type':'application/json'}:{}),...(sessionToken?{Authorization:`Bearer ${sessionToken}`}:{})},body:body?JSON.stringify(body):undefined});
 const data=await res.json(); if(!res.ok) throw Error(data.error||'Сервер недоступен'); return data;
}
