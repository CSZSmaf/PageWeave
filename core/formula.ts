import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Project} from './project';
import {Compiler} from './compiler';

/** Compile just the equation in an isolated snapshot. Never edit the document. */
export class FormulaCompiler {
  private compiler:Compiler;
  constructor(readonly root:string){this.compiler=new Compiler(path.join(root,'builds'));}
  async compile(project:Project,latex:string){
    if(typeof latex!=='string'||!latex.trim()||latex.length>20000)throw new Error('请输入有效公式。');
    const location=path.join(this.root,'sources',randomUUID());
    const state=await project.snapshot(location);
    const copy=await Project.open(location);copy.configure(state.main,'xelatex');
    const source=copy.history.texts.get(state.main)!;const start=source.indexOf('\\begin{document}');
    if(start<0)throw new Error('未找到文档正文入口。');
    const preamble=source.slice(0,start)
      .replace(/\\documentclass(?:\s*\[[^\]]*\])?\s*\{[^}]+\}/,'\\documentclass[12pt,border=8pt]{standalone}')
      .replace(/\\usepackage(?:\s*\[[^\]]*\])?\s*\{geometry\}/g,'')
      .replace(/\\pagestyle\{[^}]*\}/g,'');
    copy.source(state.main,preamble+'\n\\begin{document}\n$\\displaystyle '+latex+'$\n\\end{document}\n',copy.version);
    return this.compiler.compile(copy);
  }
}
