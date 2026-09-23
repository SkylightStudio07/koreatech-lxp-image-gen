const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {listSkills,readSkill}=require('../src/skills.cjs');

test('skill loader only discovers project .school-code/skills',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'school-skills-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'.school-code','skills','unity-game-dev'),{recursive:true});await fs.writeFile(path.join(root,'.school-code','skills','unity-game-dev','SKILL.md'),'# Unity Game Dev\n\nUse Unity tools first.');
  await fs.mkdir(path.join(root,'tools','school-image-mcp','skills','school-image'),{recursive:true});await fs.writeFile(path.join(root,'tools','school-image-mcp','skills','school-image','SKILL.md'),'# Do not load me');
  const found=await listSkills(root);assert.deepEqual(found.skills.map(x=>x.name),['unity-game-dev']);assert.equal(found.skills[0].description,'Unity Game Dev');
  const skill=await readSkill(root,'unity-game-dev');assert.match(skill.content,/Use Unity tools/);await assert.rejects(readSkill(root,'school-image'),/ENOENT/);await assert.rejects(readSkill(root,'..\\school-image'),/올바르지 않습니다/);
});

test('skill loader handles missing directory without error',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'school-skills-empty-'));try{assert.deepEqual(await listSkills(root),{root:'.school-code/skills',skills:[]});}finally{await fs.rm(root,{recursive:true,force:true});}});
