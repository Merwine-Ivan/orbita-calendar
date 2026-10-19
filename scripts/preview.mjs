import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
// Serve only the built app. Never expose project files or local backups.
const html=await readFile(new URL('../shared-dist/index.html',import.meta.url));
createServer((req,res)=>{
 if(!['/','/index.html'].includes(new URL(req.url,'http://localhost').pathname)){res.writeHead(404);return res.end('Not found');}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);
}).listen(4174,'127.0.0.1',()=>console.log('Орбита: http://127.0.0.1:4174'));
