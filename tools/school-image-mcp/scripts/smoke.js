import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { home } from '../src/common.js';
import path from 'node:path';
const client=new Client({name:'school-image-smoke',version:'1.0.0'});
await client.connect(new StdioClientTransport({command:process.execPath,args:[path.join(home,'src/server.js')],stderr:'pipe'}));
try {
  const tools=await client.listTools();console.log(JSON.stringify({tools:tools.tools.map(t=>t.name)}));
  if(process.argv.includes('--live')){
    for(const name of ['get_remaining_quota','list_models']){
      const r=await client.callTool({name,arguments:{}});if(r.isError)throw new Error(`${name} failed`);console.log(`${name}: PASS`);
    }
    if(process.argv.includes('--generate')){
      const stamp=Date.now();const first=await client.callTool({name:'generate_image',arguments:{prompt:'Create an image: a simple blue geometric game UI icon, a blue hexagonal crystal on a plain white background. No text.',output_path:`smoke-${stamp}.png`} },undefined,{timeout:650000});
      if(first.isError)throw new Error(first.content[0].text);
      const result=JSON.parse(first.content[0].text);console.log(JSON.stringify(result));
      if(process.argv.includes('--reference')){
        const second=await client.callTool({name:'generate_image_with_context',arguments:{art_direction:'Minimal geometric game UI icons on plain white backgrounds. Preserve the reference silhouette.',task:'Generate a new image based on the attached reference: recolor the blue crystal green. No text.',reference_images:[result.saved_path],output_path:`smoke-reference-${stamp}.png`} },undefined,{timeout:650000});
        if(second.isError)throw new Error(second.content[0].text);console.log(second.content[0].text);
      }
    }
  }
} finally {await client.close();}
