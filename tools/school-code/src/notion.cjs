const API_VERSION='2022-06-28';
const MAX_RESPONSE_BYTES=1024*1024;

function notionId(value){
  if(typeof value!=='string')throw Error('Notion ID가 필요합니다.');
  const id=value.trim().replace(/-/g,'');
  if(!/^[a-f0-9]{32}$/i.test(id))throw Error('Notion ID 형식이 올바르지 않습니다.');
  return id;
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

function compactPage(page){
  return {id:page.id,url:page.url||null,object:page.object,archived:!!page.archived,title:titleFromProperties(page.properties),last_edited_time:page.last_edited_time||null};
}

class NotionClient{
  constructor({getToken,fetchImpl=globalThis.fetch,baseUrl='https://api.notion.com/v1'}={}){this.getToken=getToken;this.fetch=fetchImpl;this.baseUrl=baseUrl.replace(/\/$/,'');}
  async request(route,{method='GET',body}={}){
    const token=await this.getToken?.();
    if(!token)throw Error('Notion 연동 토큰이 설정되지 않았습니다. VS Code 명령 팔레트에서 School Code: Notion 연결 설정을 실행하세요.');
    const response=await this.fetch(this.baseUrl+route,{method,headers:{Authorization:`Bearer ${token}`,'Notion-Version':API_VERSION,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error'});
    const length=Number(response.headers?.get?.('content-length')||0);if(length>MAX_RESPONSE_BYTES)throw Error('Notion 응답이 너무 큽니다. 검색 범위나 page_size를 줄여 주세요.');
    const text=await response.text();if(text.length>MAX_RESPONSE_BYTES)throw Error('Notion 응답이 너무 큽니다. 검색 범위나 page_size를 줄여 주세요.');
    let data={};try{data=text?JSON.parse(text):{};}catch{throw Error(`Notion 응답을 해석할 수 없습니다 (HTTP ${response.status}).`);}
    if(!response.ok){const message=String(data.message||data.code||`HTTP ${response.status}`).slice(0,300);throw Error(`Notion 요청 실패: ${message}`);}
    return data;
  }
  async search({query='',page_size=20,start_cursor}={}){
    const body={query:String(query||'').slice(0,200),page_size:Math.min(100,Math.max(1,Number(page_size)||20))};
    if(start_cursor)body.start_cursor=cursorValue(start_cursor);
    const data=await this.request('/search',{method:'POST',body});
    return {results:(data.results||[]).map(item=>item.object==='page'?compactPage(item):{id:item.id,object:item.object,url:item.url||null,title:item.title?.map(x=>x.plain_text||'').join('')||'',last_edited_time:item.last_edited_time||null}),has_more:!!data.has_more,next_cursor:data.next_cursor||null};
  }
  async fetchPage(page_id){const page=await this.request(`/pages/${notionId(page_id)}`);return compactPage(page);}
  async listChildren({block_id,page_size=50,start_cursor}={}){
    const query=new URLSearchParams({page_size:String(Math.min(100,Math.max(1,Number(page_size)||50)))});if(start_cursor)query.set('start_cursor',cursorValue(start_cursor));
    const data=await this.request(`/blocks/${notionId(block_id)}/children?${query}`);
    return {results:(data.results||[]).map(block=>({id:block.id,type:block.type,has_children:!!block.has_children,text:blockText(block),created_time:block.created_time||null,last_edited_time:block.last_edited_time||null})),has_more:!!data.has_more,next_cursor:data.next_cursor||null};
  }
}

module.exports={NotionClient,notionId,titleFromProperties,blockText};
