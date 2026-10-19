import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const config=JSON.parse(await readFile('supabase/public-config.json','utf8'));
// Publishable key only. Service keys are never included in the browser bundle.
const publicConfig={url:config.url||config.projectUrl,key:config.publishableKey||config.key};
if(!publicConfig.url?.startsWith('https://')||!publicConfig.key?.startsWith('sb_publishable_'))throw Error('Проверьте public-config.json');
await mkdir('shared-dist',{recursive:true});
const result=await build({entryPoints:['src/App.jsx'],bundle:true,minify:true,format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"','ORBITA_SUPABASE':JSON.stringify(publicConfig)}});
const css=(await readFile('src/styles.css','utf8')).replace(/\r\n/g,'\n');
const js=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
await writeFile('shared-dist/index.html',`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Орбита · Планета успеха</title><style>${css}</style></head><body><div id="orbita-root"></div><script>${js}</script></body></html>`);
await mkdir('supabase/functions/calendar-api',{recursive:true});
await build({stdin:{contents:`import {createHandler} from './supabase/handler.mjs';\nDeno.serve(createHandler({url:Deno.env.get('SUPABASE_URL'),serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),defaultTemporaryPassword:Deno.env.get('ORBITA_TEMP_PASSWORD'),allowedOrigins:['http://localhost:4174','http://127.0.0.1:4174','https://merwine-ivan.github.io']}));`,resolveDir:process.cwd()},bundle:true,format:'esm',platform:'neutral',outfile:'supabase/functions/calendar-api/index.ts'});
console.log('Готовы shared-dist/index.html и Edge Function calendar-api. Для Pages скопируйте shared-dist/index.html в index.html.');
