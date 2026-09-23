import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { origin, stateDir, validRoute } from './common.js';
import { browserWorker } from './browser-worker.js';

const port = Number(process.env.SCHOOL_AI_BRIDGE_PORT || 18765);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid port');
const clientToken = randomBytes(32).toString('hex'), workerToken = randomBytes(32).toString('hex');
const jobs = new Map(); let poll = null, lastSeen = 0;
function authorized(req, token) {
  const actual = Buffer.from(req.headers.authorization || ''), expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function send(res, status, data) { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); } }
async function body(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 48*1024*1024) throw new Error('too large'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString());
}
function dispatch() {
  if (!poll) return;
  const next = [...jobs.values()].find(j => !j.delivered);
  if (next) { next.delivered = true; const p = poll; poll = null; clearTimeout(p.timer); send(p.res, 200, { ...next.payload, id: next.id }); }
}
const server = http.createServer(async (req, res) => {
  try {
    if (req.headers.host !== `127.0.0.1:${port}`) return send(res,403,{error:'FORBIDDEN'});
    const site = req.headers.origin;
    if (site && site !== origin) return send(res,403,{error:'FORBIDDEN'});
    if (site === origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Private-Network','true');
      res.setHeader('Vary','Origin');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.url === '/worker.js' && req.method === 'GET' && site === origin) {
      res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store'});
      return res.end(`void (${browserWorker.toString()})(${port})`);
    }
    if (req.url === '/connect' && req.method === 'GET' && site === origin) return send(res,200,{workerToken});
    if (req.url === '/health' && authorized(req,clientToken)) return send(res,200,{connected:Date.now()-lastSeen < 35000,pending:jobs.size});
    if (req.url === '/rpc' && req.method === 'POST' && !site && authorized(req,clientToken)) {
      if (Date.now()-lastSeen > 35000) return send(res,503,{error:'BROWSER_OFFLINE'});
      if (jobs.size >= 4) return send(res,429,{error:'BRIDGE_BUSY'});
      const payload = await body(req);
      if (!validRoute(payload.route,payload.method)) return send(res,400,{error:'INVALID_REQUEST'});
      const id = randomUUID();
      const timer = setTimeout(()=>{ jobs.delete(id); send(res,504,{error:'NETWORK_ERROR'}); },650000);
      jobs.set(id,{id,payload,res,timer,delivered:false}); dispatch(); return;
    }
    if (!authorized(req,workerToken) || site !== origin) return send(res,403,{error:'FORBIDDEN'});
    if (req.url === '/poll' && req.method === 'GET') {
      lastSeen = Date.now();
      if (poll) {clearTimeout(poll.timer); send(poll.res,200,{});}
      const timer = setTimeout(()=>{if(poll?.res===res)poll=null;send(res,200,{});},20000);
      poll = {res,timer}; dispatch(); return;
    }
    if (req.url === '/result' && req.method === 'POST') {
      lastSeen = Date.now(); const data = await body(req), job = jobs.get(data.id);
      if (job) {clearTimeout(job.timer); jobs.delete(data.id);send(job.res,200,data.result);}
      return send(res,200,{ok:true});
    }
    send(res,404,{error:'NOT_FOUND'});
  } catch {send(res,400,{error:'INVALID_REQUEST'});}
});
server.on('error',()=>{console.error('Bridge could not bind to loopback port.');process.exit(1);});
server.listen(port,'127.0.0.1',async()=>{
  await fs.mkdir(stateDir,{recursive:true});
  await fs.writeFile(path.join(stateDir,'connection.json'),JSON.stringify({port,clientToken}),{mode:0o600});
  await fs.writeFile(path.join(stateDir,'connect-bookmarklet.txt'),`javascript:void (${browserWorker.toString()})(${port})`);
  console.error(`School browser bridge ready at 127.0.0.1:${port}. Use .local/connect-bookmarklet.txt on the school chat tab.`);
});
