const fs = require('node:fs');
const {randomBytes} = require('node:crypto');
fs.mkdirSync('.local',{recursive:true});
fs.writeFileSync('.local/relay.env',`MCP_TOKEN=${randomBytes(32).toString('hex')}\nWORKER_TOKEN=${randomBytes(32).toString('hex')}\n`,{flag:'wx',mode:0o600});
console.log('Created .local/relay.env (keep private). MCP_TOKEN: school registration; WORKER_TOKEN: VS Code SecretStorage.');
