import test from 'node:test';
import assert from 'node:assert/strict';
import {countWords,documentText} from '../core/word-count';

test('中英文混排字数，正确处理 Unicode、空格和标点',()=>{
  assert.deepEqual(countWords('中文 hello world 2026'),{words:5,characters:16,charactersWithSpaces:19});
  assert.deepEqual(countWords('𠀀🙂\n'),{words:1,characters:2,charactersWithSpaces:2});
  assert.equal(countWords("don't stop 3.14，继续！").words,5);
});
test('统计段落和表格正文，不把公式源码或图片路径计入字数',()=>{
  const text=documentText({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'中文 hello world 2026'},{type:'inlineMath',attrs:{latex:'\\frac{123}{456}'}},{type:'text',text:'再写'}]},{type:'flowImage',attrs:{src:'images/file.png'}}]});
  assert.deepEqual(countWords(text),{words:7,characters:18,charactersWithSpaces:21});
  const table=documentText({type:'table',content:[{type:'tableRow',content:[{type:'tableCell',content:[{type:'paragraph',content:[{type:'text',text:'第一列'}]}]},{type:'tableCell',content:[{type:'paragraph',content:[{type:'text',text:'one word'}]}]}]}]});
  assert.equal(countWords(table).words,5);
});
