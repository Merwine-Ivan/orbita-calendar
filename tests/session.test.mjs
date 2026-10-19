import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupabaseApi} from '../src/supabase-api.mjs';

function fixture(){
 let time=0,expired=0,refreshCount=0,refresh=async()=>Response.json({access_token:'new-access',refresh_token:'new-refresh',expires_in:3600});
 const saved=new Map(),storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 const api=createSupabaseApi({url:'https://test.supabase.co',key:'public',storage,now:()=>time,onExpired:()=>expired++,fetchImpl:async(url)=>{
  if(url.includes('grant_type=password'))return Response.json({access_token:'first-access',refresh_token:'first-refresh',expires_in:3600});
  if(url.includes('grant_type=refresh_token')){refreshCount++;return refresh();}
  return Response.json(url.endsWith('/session')?{user:{id:'teacher'}}:{ok:true});
 }});
 return {api,saved,setRefresh:fn=>refresh=fn,advance:()=>time=3600000,stats:()=>({expired,refreshCount})};
}
test('temporary refresh network and server errors preserve the session for retry',async()=>{
 for(const status of [0,503]){
  const f=fixture();await f.api('login','POST',{login:'teacher',password:'fictional'});f.advance();
  f.setRefresh(async()=>{if(!status)throw Error('offline');return Response.json({error:'temporary'},{status});});
  await assert.rejects(f.api('bootstrap'));assert.equal(f.saved.size,1);assert.equal(f.stats().expired,0);
  f.setRefresh(async()=>Response.json({access_token:'recovered',refresh_token:'valid',expires_in:3600}));
  assert.deepEqual(await f.api('bootstrap'),{ok:true});assert.equal(f.stats().refreshCount,2);
 }
});
test('revoked refresh credentials clear the session and prompt a new login',async()=>{
 const f=fixture();await f.api('login','POST',{login:'teacher',password:'fictional'});f.advance();
 f.setRefresh(async()=>Response.json({error:'invalid refresh token'},{status:400}));
 await assert.rejects(f.api('bootstrap'));assert.equal(f.saved.size,0);assert.equal(f.stats().expired,1);
 assert.equal((await f.api('session')).user,null);
});
test('parallel requests rotate the refresh token only once',async()=>{
 const f=fixture();await f.api('login','POST',{login:'teacher',password:'fictional'});f.advance();
 let release;f.setRefresh(()=>new Promise(resolve=>release=resolve));
 const requests=[f.api('bootstrap'),f.api('session')];await Promise.resolve();
 release(Response.json({access_token:'rotated',refresh_token:'rotated-refresh',expires_in:3600}));
 await Promise.all(requests);assert.equal(f.stats().refreshCount,1);
});
test('a refresh finishing after logout cannot recreate a signed-in session',async()=>{
 const f=fixture();await f.api('login','POST',{login:'teacher',password:'fictional'});f.advance();
 let release;f.setRefresh(()=>new Promise(resolve=>release=resolve));
 const pending=assert.rejects(f.api('bootstrap'));await Promise.resolve();
 await f.api('logout','POST');release(Response.json({access_token:'late',refresh_token:'late-refresh',expires_in:3600}));await pending;
 assert.equal(f.saved.size,0);assert.equal((await f.api('session')).user,null);assert.equal(f.stats().expired,1);
});
