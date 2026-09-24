const fs=require('node:fs/promises');
const path=require('node:path');

const SKILLS_DIR='.school-code/skills';
const AGENTS_SKILLS_DIR='.agents/skills';
const SKILL_ROOTS=[
  {relative:SKILLS_DIR,resolve:(root)=>path.join(root,'.school-code','skills')},
  {relative:AGENTS_SKILLS_DIR,resolve:(root)=>path.join(root,'.agents','skills')}
];
const MAX_SKILLS=50;
const MAX_SKILL_CHARS=120000;
const NAME=/^[a-z0-9][a-z0-9._-]{0,63}$/;

function parseDescription(text,name){
  const withoutFrontmatter=text.replace(/^---[\s\S]*?---\s*/,'');
  const heading=withoutFrontmatter.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const paragraph=withoutFrontmatter.split(/\r?\n\s*\r?\n/).map(x=>x.trim()).find(x=>x&&!x.startsWith('#'))||'';
  return (heading||paragraph||name).replace(/\s+/g,' ').slice(0,300);
}
async function listSkills(root){
  const skills=[];const seen=new Set();let foundRoot=false;
  for(const skillRoot of SKILL_ROOTS){
    if(skills.length>=MAX_SKILLS)break;
    let entries;try{entries=await fs.readdir(skillRoot.resolve(root),{withFileTypes:true});foundRoot=true;}catch(e){if(e.code==='ENOENT')continue;throw e;}
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
      if(skills.length>=MAX_SKILLS||!entry.isDirectory()||!NAME.test(entry.name)||seen.has(entry.name))continue;
      const file=path.join(skillRoot.resolve(root),entry.name,'SKILL.md');let text;try{text=await fs.readFile(file,'utf8');}catch{continue;}
      if(text.length>MAX_SKILL_CHARS)continue;
      seen.add(entry.name);
      skills.push({name:entry.name,path:`${skillRoot.relative}/${entry.name}/SKILL.md`,description:parseDescription(text,entry.name),chars:text.length});
    }
  }
  if(!foundRoot)return {root:SKILLS_DIR,skills};
  return {root:SKILLS_DIR,skills,truncated:skills.length>=MAX_SKILLS};
}
async function readSkill(root,name){
  if(typeof name!=='string'||!NAME.test(name))throw Error('Skill 이름이 올바르지 않습니다.');
  let missing;
  for(const skillRoot of SKILL_ROOTS){
    const file=path.join(skillRoot.resolve(root),name,'SKILL.md');let text;
    try{text=await fs.readFile(file,'utf8');}
    catch(e){if(e.code==='ENOENT'){missing=e;continue;}throw e;}
    if(text.length>MAX_SKILL_CHARS)throw Error('Skill 지침은 120,000자 이하만 읽을 수 있습니다.');
    return {name,path:`${skillRoot.relative}/${name}/SKILL.md`,content:text};
  }
  throw missing||Object.assign(Error('Skill을 찾을 수 없습니다.'),{code:'ENOENT'});
}
module.exports={SKILLS_DIR,AGENTS_SKILLS_DIR,MAX_SKILLS,MAX_SKILL_CHARS,listSkills,readSkill};
