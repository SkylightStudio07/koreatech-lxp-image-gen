import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ImageService } from './service.js';
import { safeError } from './common.js';

const server=new McpServer({name:'school-image-mcp',version:'0.1.0'});
const service=new ImageService();
const common={output_path:z.string().min(1),conversation_id:z.string().optional(),locale:z.enum(['ko','en']).default('ko'),reference_images:z.array(z.string()).max(4).default([]),overwrite:z.boolean().default(false)};
const wrap=fn=>async args=>{try{return {content:[{type:'text',text:JSON.stringify(await fn(args))}]};}catch(e){return {isError:true,content:[{type:'text',text:JSON.stringify(safeError(e))}]};}};
server.registerTool('generate_image',{description:'Generate a PNG using the logged-in KOREATECH account quota. Output and reference paths must be inside configured roots. No automatic generation retries.',inputSchema:{prompt:z.string().min(1).max(30000),...common}},wrap(a=>service.generate(a)));
server.registerTool('generate_image_with_context',{description:'Combine art direction and a task without rewriting, then generate an image.',inputSchema:{art_direction:z.string().max(15000),task:z.string().min(1).max(15000),...common}},wrap(({art_direction,task,...rest})=>service.generate({...rest,prompt:`Art direction:\n${art_direction}\n\nTask:\n${task}`})));
server.registerTool('download_attachment',{description:'Download a school attachment as PNG inside the allowed output root.',inputSchema:{file_id:z.string().min(1),output_path:z.string().min(1),overwrite:z.boolean().default(false)}},wrap(a=>service.download(a)));
server.registerTool('get_remaining_quota',{description:'Read the account quota; zero daily limit may mean unlimited. Use exceeded flags.',inputSchema:{}},wrap(()=>service.quota()));
server.registerTool('list_models',{description:'List available school chat models and capabilities.',inputSchema:{}},wrap(()=>service.listModels()));
await server.connect(new StdioServerTransport());
