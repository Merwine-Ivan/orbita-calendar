export const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
export function stable(v){return JSON.stringify(v,function(k,x){return plain(x)?Object.fromEntries(Object.keys(x).sort().map(key=>[key,x[key]])):x;});}
export async function digest(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(v))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
