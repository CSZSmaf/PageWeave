import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import os from 'node:os';import path from 'node:path';
import {AiClient,AiSettings} from '../core/ai-client';
import {AI_DEFAULT,parseAiFormat,parseAiReply,validateAiConfig,type AiProvider} from '../core/ai';

async function fixture(t:any){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pageweave-ai-'));t.after(async()=>{if(path.basename(dir).startsWith('pageweave-ai-'))await fs.rm(dir,{recursive:true,force:true});});const vault={isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from([...s].reverse().join('')),decryptString:(b:Buffer)=>[...b.toString()].reverse().join('')};const file=path.join(dir,'ai-config.json');return {file,vault,settings:new AiSettings(file,vault)};}
test('AI credentials stay out of status and are never reused for a different endpoint',async t=>{
 const {file,settings,vault}=await fixture(t);const key='local-test-credential';const config={...AI_DEFAULT,model:'test-model'};
 const status=await settings.configure(config,key);assert.equal(status.hasKey,true);assert.ok(!JSON.stringify(status).includes(key));assert.ok(!(await fs.readFile(file,'utf8')).includes(key));assert.equal((await new AiSettings(file,vault).status()).hasKey,true);
 assert.equal((await settings.configure({...config,baseUrl:'https://other.example/v1'})).hasKey,false);
 await settings.configure({...config,rememberKey:false},key);assert.equal((await new AiSettings(file,vault).status()).hasKey,false);assert.equal((await settings.status()).hasKey,true);
 await settings.configure(config,'');assert.equal((await settings.status()).hasKey,false);
});
test('AI adapters send native provider requests and extract only final text',async t=>{
 const {settings}=await fixture(t);const calls:any[]=[];let payload:any;
 const client=new AiClient(settings,async(input,init)=>{calls.push({url:String(input),headers:init?.headers,body:JSON.parse(String(init?.body)),redirect:init?.redirect});return new Response(JSON.stringify(payload));});
 const responses:Record<AiProvider,unknown>={openai:{status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:'answer'}]}]},deepseek:{choices:[{finish_reason:'stop',message:{content:'answer'}}]},compatible:{choices:[{finish_reason:'stop',message:{content:'answer'}}]},gemini:{candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'private reasoning'},{text:'answer'}]}}]}};
 for(const provider of ['openai','deepseek','gemini','compatible'] as const){await settings.configure({...AI_DEFAULT,provider,baseUrl:'http://127.0.0.1:9999/v1',model:'test-model'},'test-key');payload=responses[provider];assert.equal((await client.request({id:provider,mode:'chat',messages:[{role:'user',content:'question'}],context:'selected'})).text,'answer');}
 assert.ok(calls[0].url.endsWith('/responses'));assert.equal(calls[0].body.store,false);assert.ok(calls[1].url.endsWith('/chat/completions'));assert.ok(calls[2].url.endsWith('/models/test-model:generateContent'));assert.equal(calls[2].headers['x-goog-api-key'],'test-key');assert.equal(calls[2].headers.Authorization,undefined);assert.ok(calls.every(c=>c.redirect==='error'));assert.ok(calls.every(c=>JSON.stringify(c.body).includes('selected')));
});
test('AI cancellation, timeout, errors and format application are bounded',async t=>{
 const {settings}=await fixture(t);await settings.configure({...AI_DEFAULT,model:'test'},'local-test-key');
 const request={id:'test',mode:'chat' as const,messages:[{role:'user' as const,content:'hello'}]};
 const failure=new AiClient(settings,async()=>new Response('local-test-key',{status:401}));await assert.rejects(failure.request(request),e=>String(e).includes('密钥无效')&&!String(e).includes('local-test-key'));
 const waiting:typeof fetch=async(_url,init)=>new Promise((_resolve,reject)=>{if(init?.signal?.aborted)reject(new Error('aborted'));init?.signal?.addEventListener('abort',()=>reject(new Error('aborted')));});
 const slow=new AiClient(settings,waiting,15);await assert.rejects(slow.request(request),/超时/);
 const cancellable=new AiClient(settings,waiting);const pending=cancellable.request(request);cancellable.cancel('test');await assert.rejects(pending,/已停止/);
 assert.deepEqual(parseAiFormat('{"fontSize":14,"lineHeight":1.5,"color":"#2463c7"}'),{fontSize:14,lineHeight:1.5,color:'#2463c7'});assert.throws(()=>parseAiFormat('{"execute":"anything"}'));assert.throws(()=>parseAiFormat('{"fontSize":1000}'));assert.throws(()=>validateAiConfig({...AI_DEFAULT,baseUrl:'https://user:secret@example.com'}));assert.throws(()=>validateAiConfig({...AI_DEFAULT,baseUrl:'http://example.com'}));
});
test('unified assistant keeps conversation and accepts only explicit, bounded editing suggestions',async t=>{
 const {settings}=await fixture(t);await settings.configure({...AI_DEFAULT,model:'test'},'local-test-key');
 let body:any;const answer={reply:'正文建议',draft:'第一段。\n\n第二段。',format:{fontSize:14,lineHeight:1.5}};
 const client=new AiClient(settings,async(_url,init)=>{body=JSON.parse(String(init?.body));return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}]}));});
 const messages=[{role:'user' as const,content:'起草一个段落'},{role:'assistant' as const,content:'原有草稿'},{role:'user' as const,content:'继续修改并设置字号'}];
 const reply=await client.request({id:'unified',mode:'assistant',messages,hasSelection:true});
 assert.equal(reply.draft,answer.draft);assert.equal(reply.format?.fontSize,14);assert.deepEqual(body.input,messages);assert.match(body.instructions,/当前有可应用格式/);
 assert.deepEqual(parseAiReply('普通回答'),{text:'普通回答'});assert.deepEqual(parseAiReply('```json\n{"reply":"建议","format":{"color":"#2463c7"}}\n```'),{text:'建议',format:{color:'#2463c7'}});
 for(const raw of ['{"reply":"a","execute":"anything"}','{"reply":"a","format":{"fontSize":999}}','{"reply":"a","draft":[]}','{"reply":""}','{"reply":"incomplete"'])assert.throws(()=>parseAiReply(raw));
});
