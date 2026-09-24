const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {listSkills,readSkill}=require('../src/skills.cjs');

test('skill loader discovers standard .agents skills with project-local overrides',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'school-skills-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'.school-code','skills','unity-game-dev'),{recursive:true});await fs.writeFile(path.join(root,'.school-code','skills','unity-game-dev','SKILL.md'),'# Unity Game Dev\n\nUse Unity tools first.');
  await fs.mkdir(path.join(root,'.agents','skills','unity-cli'),{recursive:true});await fs.writeFile(path.join(root,'.agents','skills','unity-cli','SKILL.md'),'# Unity CLI\n\nUse the official Unity CLI skill.');
  await fs.mkdir(path.join(root,'.agents','skills','unity-game-dev'),{recursive:true});await fs.writeFile(path.join(root,'.agents','skills','unity-game-dev','SKILL.md'),'# Wrong override');
  await fs.mkdir(path.join(root,'tools','school-image-mcp','skills','school-image'),{recursive:true});await fs.writeFile(path.join(root,'tools','school-image-mcp','skills','school-image','SKILL.md'),'# Do not load me');
  const found=await listSkills(root);assert.deepEqual(found.skills.map(x=>x.name),['unity-game-dev','unity-cli']);assert.equal(found.skills[0].description,'Unity Game Dev');assert.equal(found.skills[1].path,'.agents/skills/unity-cli/SKILL.md');
  const skill=await readSkill(root,'unity-game-dev');assert.match(skill.content,/Use Unity tools/);assert.equal(skill.path,'.school-code/skills/unity-game-dev/SKILL.md');
  const official=await readSkill(root,'unity-cli');assert.match(official.content,/official Unity CLI/);assert.equal(official.path,'.agents/skills/unity-cli/SKILL.md');
  await assert.rejects(readSkill(root,'school-image'),/ENOENT/);await assert.rejects(readSkill(root,'..\\school-image'),/올바르지 않습니다/);
});

test('skill loader handles missing directory without error',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'school-skills-empty-'));try{assert.deepEqual(await listSkills(root),{root:'.school-code/skills',skills:[]});}finally{await fs.rm(root,{recursive:true,force:true});}});
