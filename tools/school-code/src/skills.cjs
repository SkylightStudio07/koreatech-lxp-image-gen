const fs=require('node:fs/promises');
const path=require('node:path');

const SKILLS_DIR='.school-code/skills';
const MAX_SKILLS=50;
const MAX_SKILL_CHARS=120000;
const NAME=/^[a-z0-9][a-z0-9._-]{0,63}$/;

function skillRoot(root){return path.join(root,'.school-code','skills');}
function parseDescription(text,name){
  const withoutFrontmatter=text.replace(/^---[\s\S]*?---\s*/,'');
  const heading=withoutFrontmatter.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const paragraph=withoutFrontmatter.split(/\r?\n\s*\r?\n/).map(x=>x.trim()).find(x=>x&&!x.startsWith('#'))||'';
  return (heading||paragraph||name).replace(/\s+/g,' ').slice(0,300);
}
async function listSkills(root){
  const directory=skillRoot(root);let entries;try{entries=await fs.readdir(directory,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return {root:SKILLS_DIR,skills:[]};throw e;}
  const skills=[];for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
    if(skills.length>=MAX_SKILLS||!entry.isDirectory()||!NAME.test(entry.name))continue;
    const file=path.join(directory,entry.name,'SKILL.md');let text;try{text=await fs.readFile(file,'utf8');}catch{continue;}
    if(text.length>MAX_SKILL_CHARS)continue;
    skills.push({name:entry.name,path:`${SKILLS_DIR}/${entry.name}/SKILL.md`,description:parseDescription(text,entry.name),chars:text.length});
  }
  return {root:SKILLS_DIR,skills,truncated:skills.length>=MAX_SKILLS};
}
async function readSkill(root,name){
  if(typeof name!=='string'||!NAME.test(name))throw Error('Skill 이름이 올바르지 않습니다.');
  const file=path.join(skillRoot(root),name,'SKILL.md');const text=await fs.readFile(file,'utf8');if(text.length>MAX_SKILL_CHARS)throw Error('Skill 지침은 120,000자 이하만 읽을 수 있습니다.');return {name,path:`${SKILLS_DIR}/${name}/SKILL.md`,content:text};
}
module.exports={SKILLS_DIR,MAX_SKILLS,MAX_SKILL_CHARS,listSkills,readSkill};
