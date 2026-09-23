import fs from 'node:fs/promises';
import path from 'node:path';
import {home} from '../src/common.js';
const project=path.resolve(process.argv[2]||'');
if(!process.argv[2])throw new Error('Supply a project directory.');
const configPath=path.join(project,'.mcp.json');
if (!(await fs.stat(project)).isDirectory()) throw new Error('Project must be an existing directory.');
const skillSource=path.join(home,'skills','school-image','SKILL.md');
const skillPath=path.join(project,'.claude','skills','school-image','SKILL.md');
const skillText=await fs.readFile(skillSource,'utf8');
try {
  const existingSkill=await fs.readFile(skillPath,'utf8');
  if(existingSkill!==skillText)throw new Error('Existing school-image skill differs; review it before replacing.');
} catch(e) {if(e.code!=='ENOENT')throw e;}
let config={};
try {config=JSON.parse(await fs.readFile(configPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
config.mcpServers??={};
const entry={type:'stdio',command:process.execPath,args:[path.join(home,'src/server.js')],env:{SCHOOL_AI_TRANSPORT:'browser',ALLOWED_OUTPUT_ROOT:path.join(project,'GeneratedAssets','SchoolAI'),ALLOWED_REFERENCE_ROOT:project}};
if(config.mcpServers['school-image']&&JSON.stringify(config.mcpServers['school-image'])!==JSON.stringify(entry))throw new Error('Existing school-image configuration differs; review it first.');
config.mcpServers['school-image']=entry;
await fs.mkdir(entry.env.ALLOWED_OUTPUT_ROOT,{recursive:true});
await fs.writeFile(configPath,JSON.stringify(config,null,2)+'\n');
await fs.mkdir(path.dirname(skillPath),{recursive:true});
await fs.writeFile(skillPath,skillText);
console.log(JSON.stringify({configPath,skillPath,outputRoot:entry.env.ALLOWED_OUTPUT_ROOT,referenceRoot:project}));
