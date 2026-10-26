import test from 'node:test';
import assert from 'node:assert/strict';
import {linkAddress,linkTex,readLinkTex} from '../core/inline-format';
import {serializeRich,parseRich,type RichNode} from '../core/writing';

test('links reject local files, executable schemes, embedded credentials and TeX commands',()=>{
 for(const input of ['javascript:alert(1)','file:///C:/private.txt','data:text/html,abc','https://user:pass@example.com','https://example.com/\\input{x}','mailto:a@example.com?body=%0Asecret'])assert.throws(()=>linkAddress(input));
 assert.throws(()=>readLinkTex('https://example.com/\\input{secret}'));
 const address='https://example.com/a_b?x=1&y=2%20three#part';assert.equal(readLinkTex(linkTex(address)),address);
 assert.match(linkTex('https://example.com/100%25'),/\\%/);
});
test('superscripts, subscripts and links preserve mixed formatting through TeX round trips',()=>{
 const doc:RichNode={type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'H'},{type:'text',text:'2',marks:[{type:'subscript'}]},{type:'text',text:'O; cm'},{type:'text',text:'2',marks:[{type:'superscript'},{type:'bold'}]},
 {type:'text',text:'中文 & 资料',marks:[{type:'link',attrs:{href:'https://example.com/a_b?q=1&n=2#part'}},{type:'italic'}]}]}]};
 const source=serializeRich(doc),round=serializeRich(parseRich(source));assert.equal(round,source);
 const nodes=parseRich(source).content![0].content!;assert.equal(nodes[1].marks?.[0].type,'subscript');assert.ok(nodes[3].marks?.some(mark=>mark.type==='superscript'));assert.equal(nodes[4].marks?.find(mark=>mark.type==='link')?.attrs?.href,'https://example.com/a_b?q=1&n=2#part');
});
