const vscode=require('vscode');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
exports.run=async()=>{
  const ext=vscode.extensions.getExtension('skylight-local.koreatech-school-code');assert(ext,'Extension discovered');await ext.activate();assert(ext.isActive,'Activated');
  const commands=await vscode.commands.getCommands(true);for(const id of ['schoolCode.open','schoolCode.connect','schoolCode.relay','schoolCode.disconnectRelay'])assert(commands.includes(id));
  await vscode.commands.executeCommand('schoolCode.open');await new Promise(r=>setTimeout(r,1500));
  await fs.writeFile(path.join(__dirname,'../.local/extension-host-result.json'),JSON.stringify({version:ext.packageJSON.version,activated:ext.isActive,commands:true,webviewCommand:true,time:new Date().toISOString()},null,2));
};
