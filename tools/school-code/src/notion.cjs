const API_VERSION='2022-06-28';
const MAX_RESPONSE_BYTES=1024*1024;
const MAX_PUBLIC_RESPONSE_BYTES=8*1024*1024;
const MAX_PUBLIC_PAGES=64;
const MAX_PUBLIC_TEXT=200000;
const PUBLIC_CACHE_TTL=60*1000;

function notionId(value){
  if(typeof value!=='string')throw Error('Notion ID가 필요합니다.');
  const id=value.trim().replace(/-/g,'');
  if(!/^[a-f0-9]{32}$/i.test(id))throw Error('Notion ID 형식이 올바르지 않습니다.');
  return id;
}
function hyphenatedNotionId(value){
  const id=notionId(value);
  return id.slice(0,8)+'-'+id.slice(8,12)+'-'+id.slice(12,16)+'-'+id.slice(16,20)+'-'+id.slice(20);
}
function parsePublicNotionUrl(value){
  if(typeof value!=='string'||!value.trim())throw Error('공개 Notion 링크가 필요합니다.');
  let parsed;
  try{parsed=new URL(value.trim());}catch{throw Error('Notion 공개 링크 URL이 올바르지 않습니다.');}
  const host=parsed.hostname.toLowerCase();
  const allowed=parsed.protocol==='https:'&&(host==='notion.so'||host==='www.notion.so'||host==='notion.site'||host.endsWith('.notion.site'));
  if(!allowed)throw Error('공개 Notion 링크는 notion.so 또는 notion.site 주소만 허용합니다.');
  const matches=parsed.pathname.match(/[a-f0-9]{32}/ig)||[];
  if(!matches.length)throw Error('공개 Notion 링크에서 페이지 ID를 찾지 못했습니다.');
  const pageId=hyphenatedNotionId(matches[matches.length-1]);
  return {url:parsed.origin+parsed.pathname.replace(/\/+$/,''),origin:parsed.origin,pageId};
}
function cursorValue(value){
  if(typeof value!=='string'||value.length>200||!/^[a-zA-Z0-9_-]+$/.test(value))throw Error('Notion 페이지 커서 형식이 올바르지 않습니다.');
  return value;
}
function titleFromProperties(properties={}){
  for(const value of Object.values(properties)){
    if(value?.type==='title'&&Array.isArray(value.title))return value.title.map(x=>x.plain_text||x.text?.content||'').join('');
  }
  return '';
}
function richText(value){
  if(!Array.isArray(value))return '';
  return value.map(x=>x.plain_text||x.text?.content||x.equation?.expression||'').join('');
}
function blockText(block){
  const value=block?.[block?.type];
  if(!value)return '';
  if(Array.isArray(value.rich_text))return richText(value.rich_text);
  if(value.caption)return richText(value.caption);
  if(block.type==='child_page')return value.title||'';
  if(block.type==='child_database')return value.title||'';
  return '';
}
function propertyText(value){
  if(typeof value==='string')return value;
  if(!Array.isArray(value))return '';
  return value.map(item=>{
    if(typeof item==='string')return item;
    if(Array.isArray(item))return typeof item[0]==='string'?item[0]:propertyText(item);
    return '';
  }).join('');
}
function publicBlockValue(entry){return entry?.value?.value||entry?.value||null;}
function publicBlockText(value){
  const properties=value?.properties||{},pieces=[];
  for(const item of Object.values(properties)){
    const text=propertyText(item);
    if(text.trim())pieces.push(text.trim());
  }
  return [...new Set(pieces)].join('\n').slice(0,10000);
}
function publicTime(value){
  if(!Number.isFinite(value))return null;
  try{return new Date(value).toISOString();}catch{return null;}
}
function compactPage(page){
  return {id:page.id,url:page.url||null,object:page.object,archived:!!page.archived,title:titleFromProperties(page.properties),last_edited_time:page.last_edited_time||null};
}
function publicUrl(origin,id){return origin+'/'+String(id).replace(/-/g,'');}

class NotionClient{
  constructor({getToken,getPublicLinks,fetchImpl=globalThis.fetch,baseUrl='https://api.notion.com/v1'}={}){
    this.getToken=getToken;
    this.getPublicLinks=getPublicLinks||(()=>[]);
    this.fetch=fetchImpl;
    this.baseUrl=baseUrl.replace(/\/$/,'');
    this.publicCache=new Map();
  }
  async publicLinks(){
    const value=await this.getPublicLinks?.();
    return (Array.isArray(value)?value:[value]).filter(x=>typeof x==='string'&&x.trim()).map(parsePublicNotionUrl);
  }
  async request(route,{method='GET',body}={}){
    const token=await this.getToken?.();
    if(!token)throw Error('Notion Integration Secret 또는 공개 Notion 링크가 설정되지 않았습니다.');
    const response=await this.fetch(this.baseUrl+route,{method,headers:{Authorization:'Bearer '+token,'Notion-Version':API_VERSION,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error'});
    const length=Number(response.headers?.get?.('content-length')||0);
    if(length>MAX_RESPONSE_BYTES)throw Error('Notion 응답이 너무 큽니다. 검색 범위나 page_size를 줄여 주세요.');
    const text=await response.text();
    if(text.length>MAX_RESPONSE_BYTES)throw Error('Notion 응답이 너무 큽니다. 검색 범위나 page_size를 줄여 주세요.');
    let data={};try{data=text?JSON.parse(text):{};}catch{throw Error('Notion 응답을 해석할 수 없습니다 (HTTP '+response.status+').');}
    if(!response.ok){const message=String(data.message||data.code||'HTTP '+response.status).slice(0,300);throw Error('Notion 요청 실패: '+message);}
    return data;
  }
  async publicRequest(source,pageId){
    const id=hyphenatedNotionId(pageId),key=source.origin+'|'+id,cached=this.publicCache.get(key);
    if(cached&&Date.now()-cached.time<PUBLIC_CACHE_TTL)return cached.data;
    const body={pageId:id,limit:100,cursor:{stack:[]},verticalColumns:false};
    const response=await this.fetch(source.origin+'/api/v3/loadCachedPageChunk',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json',Origin:source.origin,Referer:source.origin+'/'},body:JSON.stringify(body),redirect:'error'});
    const length=Number(response.headers?.get?.('content-length')||0);
    if(length>MAX_PUBLIC_RESPONSE_BYTES)throw Error('공개 Notion 응답이 너무 큽니다. 링크 범위를 줄여 주세요.');
    const text=await response.text();
    if(text.length>MAX_PUBLIC_RESPONSE_BYTES)throw Error('공개 Notion 응답이 너무 큽니다. 링크 범위를 줄여 주세요.');
    let data={};try{data=text?JSON.parse(text):{};}catch{throw Error('공개 Notion 응답을 해석할 수 없습니다 (HTTP '+response.status+').');}
    if(!response.ok)throw Error('공개 Notion 페이지를 읽지 못했습니다 (HTTP '+response.status+').');
    if(!data.recordMap?.block)throw Error('공개 Notion 페이지 데이터가 없습니다. 링크 공개 설정을 확인하세요.');
    this.publicCache.set(key,{time:Date.now(),data});
    while(this.publicCache.size>32)this.publicCache.delete(this.publicCache.keys().next().value);
    return data;
  }
  async publicTree(source,pageId,{maxPages=MAX_PUBLIC_PAGES}={}){
    const pages=new Map(),blocks=new Map(),visited=new Set();
    const visit=async id=>{
      const normalized=hyphenatedNotionId(id);
      if(visited.has(normalized)||pages.size>=maxPages)return;
      visited.add(normalized);
      const data=await this.publicRequest(source,normalized);
      for(const [blockId,entry] of Object.entries(data.recordMap?.block||{})){
        const value=publicBlockValue(entry);if(value)blocks.set(blockId,value);
      }
      const value=blocks.get(normalized);if(!value)return;
      pages.set(normalized,{id:normalized,value,source});
      for(const childId of Array.isArray(value.content)?value.content:[]){
        const child=blocks.get(childId);
        if(child?.type==='page')await visit(childId);
      }
    };
    await visit(pageId);
    const root=pages.get(hyphenatedNotionId(pageId));
    if(!root)throw Error('공개 Notion 페이지를 찾지 못했습니다. 링크가 만료되었거나 비공개일 수 있습니다.');
    return {source,pages,blocks,root};
  }
  pageText(page,blocks,pages,seen=new Set()){
    if(!page||seen.has(page.id))return '';
    seen.add(page.id);
    const lines=[],title=publicBlockText(page.value);if(title)lines.push(title);
    const walk=id=>{
      const child=blocks.get(id);if(!child)return;
      if(child.type==='page'){
        const childPage=pages.get(hyphenatedNotionId(id));
        if(childPage){const text=this.pageText(childPage,blocks,pages,seen);if(text)lines.push(text);}
        return;
      }
      const text=publicBlockText(child);if(text)lines.push(text);
      for(const nested of Array.isArray(child.content)?child.content:[])walk(nested);
    };
    for(const id of Array.isArray(page.value.content)?page.value.content:[])walk(id);
    return lines.join('\n').replace(/\n{3,}/g,'\n\n').slice(0,MAX_PUBLIC_TEXT);
  }
  publicPage(page,tree){
    const text=this.pageText(page,tree.blocks,tree.pages);
    return {id:page.id,url:page.id===tree.root.id?tree.source.url:publicUrl(tree.source.origin,page.id),object:'page',archived:false,title:publicBlockText(page.value).split('\n')[0]||'',last_edited_time:publicTime(page.value.last_edited_time),text,source:tree.source.url,public:true,truncated:text.length>=MAX_PUBLIC_TEXT};
  }
  async resolvePublicPage(value){
    const raw=String(value||'').trim(),links=await this.publicLinks();
    if(/^https?:\/\//i.test(raw)){
      const source=parsePublicNotionUrl(raw);return {source,pageId:source.pageId};
    }
    const pageId=hyphenatedNotionId(raw),source=links.find(item=>item.pageId===pageId)||links[0];
    if(!source)throw Error('공개 Notion 링크를 먼저 등록하세요.');
    return {source,pageId};
  }
  async validatePublicLink(value){
    const source=parsePublicNotionUrl(value);
    await this.publicTree(source,source.pageId,{maxPages:1});
    return source.url;
  }
  async searchApi({query='',page_size=20,start_cursor}={}){
    const body={query:String(query||'').slice(0,200),page_size:Math.min(100,Math.max(1,Number(page_size)||20))};
    if(start_cursor)body.start_cursor=cursorValue(start_cursor);
    const data=await this.request('/search',{method:'POST',body});
    return {results:(data.results||[]).map(item=>item.object==='page'?compactPage(item):{id:item.id,object:item.object,url:item.url||null,title:item.title?.map(x=>x.plain_text||'').join('')||'',last_edited_time:item.last_edited_time||null}),has_more:!!data.has_more,next_cursor:data.next_cursor||null};
  }
  async searchPublic({query='',page_size=20}={}){
    const links=await this.publicLinks();
    if(!links.length)throw Error('Notion 토큰이 설정되지 않았습니다. 공개 링크도 없습니다. Integration Secret 또는 공개 Notion 링크를 먼저 설정하세요.');
    const needle=String(query||'').trim().toLocaleLowerCase(),found=new Map();
    for(const source of links){
      const tree=await this.publicTree(source,source.pageId);
      for(const page of tree.pages.values()){
        const result=this.publicPage(page,tree),haystack=(result.title+'\n'+result.text).toLocaleLowerCase();
        if(!needle||haystack.includes(needle)){
          const position=needle?haystack.indexOf(needle):-1;
          const snippet=position>=0?result.text.slice(Math.max(0,position-120),position+needle.length+280):result.text.slice(0,400);
          found.set(result.id,{...result,snippet});
        }
      }
    }
    return {results:[...found.values()].slice(0,Math.min(100,Math.max(1,Number(page_size)||20))),has_more:false,next_cursor:null,source:'public'};
  }
  async search(options={}){
    const links=await this.publicLinks(),token=await this.getToken?.();
    if(token&&links.length){
      const [api,publicResult]=await Promise.allSettled([this.searchApi(options),this.searchPublic(options)]);
      if(api.status==='fulfilled'&&publicResult.status==='fulfilled'){
        const merged=new Map([...api.value.results,...publicResult.value.results].map(item=>[item.id,item]));
        return {results:[...merged.values()].slice(0,Math.min(100,Math.max(1,Number(options.page_size)||20))),has_more:!!api.value.has_more,next_cursor:api.value.next_cursor||null,source:'mixed'};
      }
      if(api.status==='fulfilled')return api.value;
      if(publicResult.status==='fulfilled')return publicResult.value;
      throw api.reason;
    }
    if(token)return this.searchApi(options);
    return this.searchPublic(options);
  }
  async fetchPage(page_id){
    if(/^https?:\/\//i.test(String(page_id||''))||!(await this.getToken?.())){
      const target=await this.resolvePublicPage(page_id),tree=await this.publicTree(target.source,target.pageId);
      const page=tree.pages.get(target.pageId);return this.publicPage(page,tree);
    }
    const page=await this.request('/pages/'+notionId(page_id));return compactPage(page);
  }
  async listChildren({block_id,page_size=50,start_cursor}={}){
    if(/^https?:\/\//i.test(String(block_id||''))||!(await this.getToken?.())){
      const target=await this.resolvePublicPage(block_id),data=await this.publicRequest(target.source,target.pageId);
      const blocks=data.recordMap?.block||{},parent=publicBlockValue(blocks[target.pageId]),ids=Array.isArray(parent?.content)?parent.content:[];
      const limit=Math.min(100,Math.max(1,Number(page_size)||50)),offset=Number(start_cursor)||0;
      return {results:ids.slice(offset,offset+limit).map(id=>{const value=publicBlockValue(blocks[id]);return {id,type:value?.type||'unknown',has_children:Array.isArray(value?.content)&&value.content.length>0,text:publicBlockText(value),created_time:publicTime(value?.created_time),last_edited_time:publicTime(value?.last_edited_time),url:publicUrl(target.source.origin,id),public:true};}),has_more:offset+limit<ids.length,next_cursor:offset+limit<ids.length?String(offset+limit):null,source:'public'};
    }
    const query=new URLSearchParams({page_size:String(Math.min(100,Math.max(1,Number(page_size)||50)))});if(start_cursor)query.set('start_cursor',cursorValue(start_cursor));
    const data=await this.request('/blocks/'+notionId(block_id)+'/children?'+query);
    return {results:(data.results||[]).map(block=>({id:block.id,type:block.type,has_children:!!block.has_children,text:blockText(block),created_time:block.created_time||null,last_edited_time:block.last_edited_time||null})),has_more:!!data.has_more,next_cursor:data.next_cursor||null};
  }
}
module.exports={NotionClient,notionId,titleFromProperties,blockText,parsePublicNotionUrl,propertyText,publicBlockText};
