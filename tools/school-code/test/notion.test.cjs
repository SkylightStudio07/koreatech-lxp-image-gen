const test=require('node:test');
const assert=require('node:assert/strict');
const {NotionClient,notionId,blockText,parsePublicNotionUrl}=require('../src/notion.cjs');

function response(status,data){return {ok:status>=200&&status<300,status,headers:{get:()=>String(JSON.stringify(data).length)},text:async()=>JSON.stringify(data)};}

test('Notion read-only client searches, fetches pages and lists block text',async()=>{
  const calls=[];const token='secret_test_token_1234567890';
  const client=new NotionClient({getToken:async()=>token,fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/search'))return response(200,{results:[{object:'page',id:'01234567-89ab-cdef-0123-456789abcdef',url:'https://notion.so/page',archived:false,last_edited_time:'2026-01-01T00:00:00.000Z',properties:{Name:{type:'title',title:[{plain_text:'기획'}]}}}],has_more:true,next_cursor:'fedcba98-7654-3210-fedc-ba9876543210'});
    if(url.includes('/pages/'))return response(200,{object:'page',id:'01234567-89ab-cdef-0123-456789abcdef',url:'https://notion.so/page',archived:false,last_edited_time:'2026-01-01T00:00:00.000Z',properties:{Name:{type:'title',title:[{plain_text:'기획'}]}}});
    return response(200,{results:[{id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',type:'heading_1',has_children:false,heading_1:{rich_text:[{plain_text:'목표'}]}},{id:'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',type:'paragraph',has_children:false,paragraph:{rich_text:[{plain_text:'구현'}]}}],has_more:false,next_cursor:null});
  }});
  const search=await client.search({query:'기획',page_size:10,start_cursor:'fedcba98-7654-3210-fedc-ba9876543210'});
  assert.equal(search.results[0].title,'기획');assert.equal(search.has_more,true);
  const page=await client.fetchPage('01234567-89ab-cdef-0123-456789abcdef');assert.equal(page.title,'기획');
  const children=await client.listChildren({block_id:'01234567-89ab-cdef-0123-456789abcdef'});assert.deepEqual(children.results.map(x=>x.text),['목표','구현']);
  assert.equal(calls[0].options.headers.Authorization,`Bearer ${token}`);assert.equal(calls[0].options.headers['Notion-Version'],'2022-06-28');
  assert.match(calls[0].options.body,/"query":"기획"/);
});

test('Notion client rejects missing token, malformed IDs and API errors',async()=>{
  const missing=new NotionClient({getToken:async()=>''});await assert.rejects(missing.search(),/토큰이 설정되지 않았습니다/);
  assert.throws(()=>notionId('not-an-id'),/형식이 올바르지 않습니다/);
  const failed=new NotionClient({getToken:async()=>'secret_test_token_1234567890',fetchImpl:async()=>response(401,{message:'unauthorized'})});
  await assert.rejects(failed.fetchPage('01234567-89ab-cdef-0123-456789abcdef'),/Notion 요청 실패: unauthorized/);
  assert.equal(blockText({type:'paragraph',paragraph:{rich_text:[{plain_text:'안녕'}]}}),'안녕');
});

test('public Notion links can be searched and fetched without an integration token',async()=>{
  const root='01234567-89ab-cdef-0123-456789abcdef';
  const child='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const publicLink='https://example.notion.site/공개-문서-0123456789abcdef0123456789abcdef';
  const calls=[];
  const client=new NotionClient({getToken:async()=>'',getPublicLinks:async()=>[publicLink],fetchImpl:async(url,options)=>{
    calls.push({url,options});
    return response(200,{recordMap:{block:{
      [root]:{value:{value:{id:root,type:'page',properties:{title:[['공개 문서']]},content:[child],last_edited_time:1780000000000}}},
      [child]:{value:{value:{id:child,type:'text',properties:{title:[['학교 에이전트 사용법']]}}}},
    }}});
  }});
  assert.equal(parsePublicNotionUrl(publicLink).pageId,root);
  const page=await client.fetchPage(publicLink);
  assert.equal(page.title,'공개 문서');
  assert.match(page.text,/학교 에이전트 사용법/);
  const search=await client.search({query:'에이전트'});
  assert.equal(search.results[0].id,root);
  assert.equal(search.results[0].public,true);
  assert.match(calls[0].url,/api\/v3\/loadCachedPageChunk$/);
});
