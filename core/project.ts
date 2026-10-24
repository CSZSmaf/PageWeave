import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { TextHistory, minimalPatch } from './history';
import { parseLatex, widthReplacement } from './parser';
import type { Engine, ProjectState, ProjectFile } from './types';
import { parseWriting, serializeRich, blockSource, type RichNode } from './writing';
import {canFlow,flowDocument,type FlowPart} from './flow';
import {WRITING_TOOLS_STYLE} from './writing-tools';
import {LIST_STYLE,LIST_STYLE_FILE} from './lists';
import {REVIEW_FILE,readReviewStore,validateReviewDocument,documentSource,reviewData,reviewLocked,relocateComments,type ReviewStore} from './review';

const sourceExtensions = new Set(['.tex', '.bib', '.sty', '.cls', '.txt', '.md', '.bst', '.cfg']);
const excludedDirectories = new Set(['node_modules', '.git', '.tex-workbench', 'dist', 'dist-electron', 'release']);
const buildFile = /\.(aux|log|toc|out|fls|fdb_latexmk|xdv|synctex(?:\.gz)?|nav|snm|vrb)$/i;
interface DiskFile { info: ProjectFile; bytes: Buffer; bom: boolean; original: string | null; pendingWrite?:boolean }
export function contained(root: string, relative: string) {
  if (path.isAbsolute(relative)) throw new Error('仅允许访问当前工程内的相对路径。');
  const target = path.resolve(root, relative), rel = path.relative(root, target);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error('路径越出了当前工程。');
  return target;
}
export async function inventory(root: string): Promise<string[]> {
  const result: string[] = [];
  let bytes = 0;
  async function walk(relative: string) {
    for (const entry of await fs.readdir(path.join(root, relative), { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const rel = path.join(relative, entry.name);
      if (entry.isDirectory()) { if (!excludedDirectories.has(entry.name) && !entry.name.startsWith('.')) await walk(rel); }
      else if (entry.isFile() && !buildFile.test(entry.name) && !entry.name.startsWith('.')) {
        const info = await fs.stat(path.join(root, rel)); bytes += info.size;
        if (result.length >= 3000 || bytes > 300 * 1024 * 1024) throw new Error('工程支持最多 3000 个文件、总计 300 MB 的工程，请选择论文工程子目录。');
        result.push(rel.replaceAll(path.sep, '/'));
      }
    }
  }
  await walk(''); return result.sort();
}
export class Project {
  readonly id = randomUUID();
  version = 0;
  main = '';
  engine: Engine = 'xelatex';
  readonly files = new Map<string, DiskFile>();
  readonly history = new TextHistory(new Map());
  private reviewCache?:{text:string;store:ReviewStore};
  constructor(readonly root: string) {}
  static async open(root: string) {
    root = await fs.realpath(root);
    const p = new Project(root);
    for (const file of await inventory(root)) {
      const bytes = await fs.readFile(contained(root, file));
      let content: string | null = null, editable = false, encoding = 'binary', bom = false;
      if ((sourceExtensions.has(path.extname(file).toLowerCase())||file===REVIEW_FILE) && bytes.length < (file===REVIEW_FILE?20:5) * 1024 * 1024) {
        bom = bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]));
        try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); editable = true; encoding = bom ? 'UTF-8 BOM' : 'UTF-8'; }
        catch { content = bytes.toString('utf8'); encoding = '非 UTF-8 · 只读'; }
      }
      p.files.set(file, { info: { path: file, content, editable, dirty: false, encoding, size: bytes.length }, bytes, bom, original: content });
      if (content !== null) p.history.texts.set(file, content);
    }
    const candidates = [...p.files].filter(([file, data]) => file.endsWith('.tex') && /\\documentclass(?:\s|\[|\{)/.test(data.original ?? '')).map(([file]) => file);
    p.main = candidates.includes('main.tex') ? 'main.tex' : candidates[0] ?? [...p.files.keys()].find(f => f.endsWith('.tex')) ?? '';
    if (!p.main) throw new Error('目录内没有 .tex 文件。请选择 LaTeX 工程目录。');
    return p;
  }
  assertVersion(version: number) { if (version !== this.version) throw new Error('工程版本已变化，请刷新后重试。'); }
  state(): ProjectState {
    const files = [...this.files].map(([file, disk]) => {
      const content = this.history.texts.get(file) ?? null;
      return { ...disk.info, content, dirty: !!disk.pendingWrite || (disk.info.editable && content !== disk.original) };
    });
    const state:ProjectState={ id: this.id, root: this.root, name: path.basename(this.root), main: this.main, engine: this.engine, version: this.version, files,
      objects: files.filter(f => f.path.endsWith('.tex') && f.content !== null).flatMap(f => parseLatex(f.content!, f.path)),
      writing:files.filter(f=>f.path.endsWith('.tex')&&f.content!==null).flatMap(f=>parseWriting(f.content!,f.path)),
      canUndo: this.history.canUndo, canRedo: this.history.canRedo, undoLabel: this.history.undoLabel, redoLabel: this.history.redoLabel };
    try{const stored=this.reviewStore().documents[this.main];if(stored&&canFlow(state))state.reviewDocument=documentSource(stored)===documentSource(flowDocument(state.writing))?stored:relocateComments(stored,flowDocument(state.writing));}
    catch(error){state.reviewError=String(error instanceof Error?error.message:error);}
    return state;
  }
  private reviewStore():ReviewStore{
    if(!this.files.has(REVIEW_FILE))return {version:1,documents:{}};
    const text=this.history.texts.get(REVIEW_FILE);if(text===undefined)throw new Error('审阅文件无法读取，原文件已保留。');
    if(this.reviewCache?.text!==text)this.reviewCache={text,store:readReviewStore(text)};return this.reviewCache!.store;
  }
  private reviewPatch(document:RichNode){
    validateReviewDocument(document);const store=this.reviewStore();
    const after=JSON.stringify({...store,documents:{...store.documents,[this.main]:document}});
    if(Buffer.byteLength(after)>20*1024*1024)throw new Error('审阅记录超过 20 MB，请先处理已有修订。');
    const before=this.history.texts.get(REVIEW_FILE)??JSON.stringify({version:1,documents:{}});
    return minimalPatch(REVIEW_FILE,before,after);
  }
  private ensureReviewFile(){if(!this.files.has(REVIEW_FILE)){const text=JSON.stringify({version:1,documents:{}});this.addFile(REVIEW_FILE,Buffer.from(text),'UTF-8',text);}}
  writeBlock(id:string,content:RichNode,version:number){
    this.assertVersion(version);const matches=this.state().writing.filter(b=>b.id===id),block=matches[0];if(matches.length!==1||!block?.editable||!this.files.get(block.file)?.info.editable)throw new Error('此段落暂不支持页面编辑，或区域 ID 重复。');
    const source=this.history.texts.get(block.file)!;const after='\n'+serializeRich(content)+'\n';
    if(this.history.commit('页面写作',[{file:block.file,...block.bodyRange,before:source.slice(block.bodyRange.from,block.bodyRange.to),after}]))this.version++;
    return this.state();
  }
  writeFlow(parts:FlowPart[],version:number,document?:RichNode){
    this.assertVersion(version);const state=this.state();
    if(!canFlow(state)||!this.files.get(this.main)?.info.editable)throw new Error('这个工程的正文需要在源码视图中编辑。');
    if(!Array.isArray(parts)||!parts.length||new Set(parts.map(p=>p.id)).size!==parts.length||parts.some(p=>!/^[a-zA-Z0-9_-]+$/.test(p.id)))throw new Error('连续文稿的区域标识无效。');
    const blocks=state.writing,existing=new Map(blocks.map(b=>[b.id,b]));
    const oldOrder=blocks.filter(b=>parts.some(p=>p.id===b.id)).map(b=>b.id);
    if(JSON.stringify(oldOrder)!==JSON.stringify(parts.filter(p=>existing.has(p.id)).map(p=>p.id)))throw new Error('区域顺序已变化，请重新打开文稿。');
    const source=this.history.texts.get(this.main)!;
    const edits:{from:number;to:number;after:string}[]=[];
    for(const block of blocks){
      const part=parts.find(p=>p.id===block.id);
      if(!part)edits.push({...block.range,after:''});
      else if(serializeRich(part.content)!==serializeRich(block.content))edits.push({...block.bodyRange,after:'\n'+serializeRich(part.content)+'\n'});
    }
    // Reintroduce IDs on editor undo, or insert newly pasted groups at their actual position.
    const insertions=new Map<number,string>();
    for(let i=0;i<parts.length;i++)if(!existing.has(parts[i].id)){
      const next=parts.slice(i+1).find(p=>existing.has(p.id));
      const at=next?existing.get(next.id)!.range.from:blocks.at(-1)!.range.to;
      insertions.set(at,(insertions.get(at)??'')+'\n'+blockSource(parts[i].id,parts[i].content)+'\n');
    }
    for(const [at,after]of insertions)edits.push({from:at,to:at,after});
    let text=source;
    // At an equal offset, replace/remove the old macro before inserting its predecessor.
    for(const edit of edits.sort((a,b)=>b.from-a.from||b.to-a.to))text=text.slice(0,edit.from)+edit.after+text.slice(edit.to);
    let addTools=false,addLists=false;
    if(parts.some(part=>/"type":"(?:bulletList|orderedList)"/.test(JSON.stringify(part.content)))){
      const existing=this.files.get(LIST_STYLE_FILE);
      if(existing&&this.history.texts.get(LIST_STYLE_FILE)!==LIST_STYLE)throw new Error('工程已有不同的列表样式文件，请先在源码视图中检查。');
      addLists=!existing;
      if(!/\\usepackage(?:\[[^\]]*\])?\{pageweave-lists\}/.test(text))text=text.replace('\\begin{document}','\\usepackage{pageweave-lists}\n\\begin{document}');
    }
    if(parts.some(part=>['"type":"flowImage"','"type":"table"','"type":"textStyle"'].some(type=>JSON.stringify(part.content).includes(type)))){
      const tools=this.files.get('mogao-tools.sty');
      if(tools&&this.history.texts.get('mogao-tools.sty')!==WRITING_TOOLS_STYLE)throw new Error('工程已有不同的 mogao-tools.sty，请在源码视图中处理后再插入图片或表格。');
      addTools=!tools;
      if(!/\\usepackage(?:\[[^\]]*\])?\{mogao-tools\}/.test(text))text=text.replace('\\begin{document}','\\usepackage{mogao-tools}\n\\begin{document}');
    }
    if(Buffer.byteLength(text)>5*1024*1024)throw new Error('单个源码文件不能超过 5 MB。');
    let reviewPatch;
    const stored=this.reviewStore().documents[this.main];
    if(document&&(reviewData(document)||stored)){
      if(documentSource(document)!==serializeRich({type:'doc',content:parts.flatMap(part=>part.content.content??[])}))throw new Error('审阅记录与正文不一致，未保存此次修改。');
      reviewPatch=this.reviewPatch(document);
    }else if(stored&&text!==source)throw new Error('请在写作视图中同步审阅信息后修改正文。');
    if(addTools)this.addFile('mogao-tools.sty',Buffer.from(WRITING_TOOLS_STYLE),'UTF-8',WRITING_TOOLS_STYLE);
    if(addLists)this.addFile(LIST_STYLE_FILE,Buffer.from(LIST_STYLE),'UTF-8',LIST_STYLE);
    if(reviewPatch)this.ensureReviewFile();
    if(this.history.commit('连续写作',[minimalPatch(this.main,source,text),...(reviewPatch?[reviewPatch]:[])]))this.version++;
    return this.state();
  }
  private addFile(file:string,bytes:Buffer,encoding:string,content:string|null=null){
    if(this.files.has(file))throw new Error('工程文件已存在。');
    this.files.set(file,{bytes,bom:false,original:null,pendingWrite:true,info:{path:file,content,editable:content!==null,dirty:true,encoding,size:bytes.length}});
    if(content!==null)this.history.texts.set(file,content);
  }
  addImage(bytes:Buffer,version:number){
    this.assertVersion(version);const file='images/mogao-'+randomUUID()+'.png';this.addFile(file,bytes,'binary');this.version++;return {project:this.state(),src:file};
  }
  imageData(file:string){const data=this.files.get(file);if(!data||!/^\x89PNG/.test(data.bytes.subarray(0,4).toString('latin1'))&&!/^\xff\xd8/.test(data.bytes.subarray(0,2).toString('latin1')))throw new Error('图片不在当前工程内。');return `data:image/${data.bytes[0]===137?'png':'jpeg'};base64,${data.bytes.toString('base64')}`;}
  insertBlock(afterId:string|null,kind:'paragraph'|'equation'|'pageBreak',version:number){
    this.assertVersion(version);const block=this.state().writing.find(b=>b.id===afterId);const file=block?.file??this.main;const source=this.history.texts.get(file)!;
    const at=block?.range.to??source.lastIndexOf('\\end{document}');if(at<0)throw new Error('未找到正文入口。');
    const id='block-'+randomUUID().slice(0,8);
    const content:RichNode=kind==='equation'?{type:'doc',content:[{type:'displayMath',attrs:{latex:'E=mc^2'}}]}:{type:'doc',content:[...(kind==='pageBreak'?[{type:'pageBreak'}]:[]),{type:'paragraph',attrs:{textAlign:'justify',lineHeight:'1.5'}}]};
    this.history.commit(kind==='pageBreak'?'插入分页':kind==='equation'?'插入公式':'插入段落',[{file,from:at,to:at,before:'',after:'\n'+blockSource(id,content)+'\n'}]);this.version++;
    return {project:this.state(),id};
  }
  deleteBlock(id:string,version:number){this.assertVersion(version);const block=this.state().writing.find(b=>b.id===id);if(!block)throw new Error('段落已变化');const source=this.history.texts.get(block.file)!;this.history.commit('删除段落',[{file:block.file,...block.range,before:source.slice(block.range.from,block.range.to),after:''}]);this.version++;return this.state();}
  pageSettings(margin:number,paper:string,landscape:boolean,version:number){
    this.assertVersion(version);if(!Number.isFinite(margin)||margin<10||margin>50||!['a4paper','letterpaper','a5paper'].includes(paper))throw new Error('页面参数无效。');
    const source=this.history.texts.get(this.main)!;const match=/\\usepackage\[[^\]]*\]\{geometry\}/.exec(source);if(!match)throw new Error('当前工程的页面设置需要从源码修改。');
    this.history.commit('页面设置',[{file:this.main,from:match.index,to:match.index+match[0].length,before:match[0],after:`\\usepackage[${paper},margin=${margin}mm${landscape?',landscape':''}]{geometry}`}]);this.version++;return this.state();
  }
  source(file: string, text: string, version: number) {
    this.assertVersion(version);
    if(file===REVIEW_FILE)throw new Error('请通过审阅栏修改批注和修订。');
    const review=this.reviewStore().documents[this.main];
    if(file===this.main&&reviewLocked(review))throw new Error('请先关闭修订并处理待审修改，再编辑正文源码。');
    if (!this.files.get(file)?.info.editable) throw new Error('文件不可编辑。');
    if (Buffer.byteLength(text) > 5 * 1024 * 1024) throw new Error('单个源码文件不能超过 5 MB。');
    const before = this.history.texts.get(file)!;
    const patches=[minimalPatch(file,before,text)];
    if(file===this.main&&review){const next=this.state();next.files=next.files.map(f=>f.path===file?{...f,content:text}:f);next.writing=parseWriting(text,file);if(canFlow(next)){const doc=flowDocument(next.writing);if(documentSource(review)!==documentSource(doc))patches.push(this.reviewPatch(relocateComments(review,doc)));}}
    if (this.history.commit(`编辑 ${file}`, patches)) this.version++;
    return this.state();
  }
  width(id: string, value: number, unit: string, version: number) {
    this.assertVersion(version);
    const image = this.state().objects.find(o => o.id === id);
    if (!image || image.kind !== 'image' || !this.files.get(image.file)?.info.editable) throw new Error('当前图片不可编辑，请重新选择。');
    const patch = widthReplacement(image, value, unit, this.history.texts.get(image.file)!);
    if (this.history.commit('调整图片宽度', [patch])) this.version++;
    return this.state();
  }
  undo(version: number) { this.assertVersion(version); if (this.history.undo()) this.version++; return this.state(); }
  redo(version: number) { this.assertVersion(version); if (this.history.redo()) this.version++; return this.state(); }
  configure(main: string, engine: Engine) {
    if (!this.files.has(main) || !main.endsWith('.tex')) throw new Error('请选择工程内的 .tex 入口。');
    if (!['xelatex', 'pdflatex', 'lualatex'].includes(engine)) throw new Error('不支持的编译器。');
    if (this.main !== main || this.engine !== engine) { this.main = main; this.engine = engine; this.version++; }
    return this.state();
  }
  private encode(file: string) {
    const data = this.files.get(file)!;
    if (!data.info.editable) return data.bytes;
    return Buffer.concat([data.bom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0), Buffer.from(this.history.texts.get(file)!, 'utf8')]);
  }
  async save() {
    const dirty = this.state().files.filter(f => f.dirty).map(file => ({...file, bytes: this.encode(file.path)}));
    // Check the entire write set first. Never overwrite an externally modified file.
    for (const file of dirty) {
      const full = contained(this.root, file.path);
      if(this.files.get(file.path)!.pendingWrite){
        if(await fs.lstat(full).catch(()=>null))throw new Error(`${file.path} 已由外部创建，未覆盖。`);
        const parent=path.dirname(full);await fs.mkdir(parent,{recursive:true});
        const actualParent=await fs.realpath(parent);const rel=path.relative(this.root,actualParent);
        if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))throw new Error('图片存放位置越出了工程。');
        continue;
      }
      const actual = await fs.realpath(full).catch(() => '');
      if (!actual || path.relative(this.root, actual).startsWith('..') || !(await fs.readFile(full)).equals(this.files.get(file.path)!.bytes)) throw new Error(`${file.path} 已被外部修改或移动。请先导出当前工程以保留修改，再重新读取磁盘文件。`);
    }
    for (const file of dirty) {
      const full = contained(this.root, file.path), temp = full + '.mogao-' + randomUUID() + '.tmp';
      const bytes = file.bytes;
      await fs.writeFile(temp, bytes, { flag: 'wx' });
      try { await fs.rename(temp, full); } catch (e) { await fs.unlink(temp).catch(() => {}); throw e; }
      const disk = this.files.get(file.path)!; disk.bytes = bytes; disk.original = file.content; disk.info.size = bytes.length;disk.pendingWrite=false;
    }
    return this.state();
  }
  async snapshot(destination: string) {
    // Freeze all bytes before the first await so edits during I/O belong to the next version.
    const state = this.state();
    const contents = [...this.files.keys()].map(file => [file, this.encode(file)] as const);
    await fs.mkdir(destination, { recursive: true });
    for (const [file, bytes] of contents) {
      const target = contained(destination, file); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, bytes);
    }
    return state;
  }
  async saveAs(destination:string){
    const state=this.state(),contents=[...this.files.keys()].map(file=>[file,this.encode(file)] as const);
    const parent=await fs.realpath(path.dirname(path.resolve(destination)));
    const target=path.join(parent,path.basename(destination)),relative=path.relative(this.root,target);
    if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw new Error('请选择当前工程以外的保存位置。');
    // Create a fresh directory. Existing documents, including an empty directory,
    // are never overwritten by Save As.
    try{await fs.mkdir(target);}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw new Error('这个位置已存在，请换一个名称。');throw error;}
    for(const [file,bytes]of contents){const full=contained(target,file);await fs.mkdir(path.dirname(full),{recursive:true});await fs.writeFile(full,bytes,{flag:'wx'});}
    const next=await Project.open(target);next.configure(state.main,state.engine);return next;
  }
}
