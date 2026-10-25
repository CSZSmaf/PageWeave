import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Project } from './project';
import type { CompileResult, Diagnostic, Region, ToolInfo } from './types';
import { parseWritingPositions } from './writing';

export async function run(command: string, args: string[], cwd?: string, timeout = 120000): Promise<{code: number; output: string}> {
  return new Promise(resolve => {
    let output = '', finished = false;
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true, env: { ...process.env, LC_ALL: 'C', LANG: 'C', openin_any: 'p', openout_any: 'p' } });
    const done = (code: number) => { if (!finished) { finished = true; clearTimeout(timer); resolve({ code, output }); } };
    const add = (data: Buffer) => { output = (output + data.toString('utf8')).slice(-150000); };
    child.stdout.on('data', add); child.stderr.on('data', add);
    child.on('error', e => { output += e.message; done(-1); });
    child.on('close', code => done(code ?? -1));
    const timer = setTimeout(() => {
      output += '\n编译超过 120 秒，已停止。\n';
      if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      else child.kill('SIGKILL');
      done(-2);
    }, timeout);
  });
}
export async function inspectTools(): Promise<ToolInfo[]> {
  return Promise.all(['xelatex', 'pdflatex', 'lualatex', 'latexmk', 'synctex'].map(async name => {
    const r = await run(name, name === 'synctex' ? ['help'] : ['--version'], undefined, 8000);
    return { name, available: r.code === 0, detail: r.output.split(/\r?\n/).find(l => /TeX|Latexmk|version/i.test(l)) ?? r.output.slice(0, 150) };
  }));
}
function diagnostics(log: string, root: string): Diagnostic[] {
  const result: Diagnostic[] = [];
  for (const line of log.split(/\r?\n/)) {
    const match = /^(.*?\.(?:tex|sty|cls)):(\d+):\s*(.*)/.exec(line);
    if (match) result.push({ file: path.isAbsolute(match[1]) ? path.relative(root, match[1]).replaceAll(path.sep, '/') : match[1].replace(/^\.\//, ''), line: Number(match[2]), message: match[3] });
    else if (line.startsWith('!')) result.push({ message: line.slice(1).trim() });
  }
  return result.slice(0, 50);
}
function syncBlocks(output: string) {
  return output.split(/(?=^Output:)/m).slice(1).map(block => Object.fromEntries(block.split(/\r?\n/).map(l => { const i = l.indexOf(':'); return [l.slice(0, i), l.slice(i + 1).trim()]; }).filter(([k]) => k)));
}
export class Compiler {
  private builds = new Map<string, { dir: string; pdf: string; projectId: string; version: number }>();
  private active:{id:string;version:number;promise:Promise<CompileResult>}|null=null;
  constructor(readonly cacheRoot: string) {}
  compile(project: Project): Promise<CompileResult> {
    if(this.active?.id===project.id&&this.active.version===project.version)return this.active.promise;
    const previous=this.active?.promise,job={id:project.id,version:project.version,promise:Promise.resolve(null as unknown as CompileResult)};
    job.promise=(previous?previous.catch(()=>{}):Promise.resolve()).then(()=>this.performCompile(project)).finally(()=>{if(this.active===job)this.active=null;});this.active=job;return job.promise;
  }
  private async performCompile(project: Project): Promise<CompileResult> {
    const token = randomUUID(), started = Date.now(), dir = path.join(this.cacheRoot, token);
      const state = await project.snapshot(dir);
      await fs.mkdir(path.join(dir, 'out'), { recursive: true });
      const latexmk = await run('latexmk', ['-v'], undefined, 8000);
      let build: {code: number; output: string};
      if (latexmk.code === 0) {
        const mode = { xelatex: '-xelatex', pdflatex: '-pdf', lualatex: '-lualatex' }[state.engine];
        build = await run('latexmk', ['-norc', mode, '-synctex=1', '-interaction=nonstopmode', '-halt-on-error', '-file-line-error', '-latexoption=-no-shell-escape', '-outdir=out', './' + state.main], dir);
      } else {
        const args = ['-no-shell-escape', '-synctex=1', '-interaction=nonstopmode', '-halt-on-error', '-file-line-error', '-output-directory=out', './' + state.main];
        build = await run(state.engine, args, dir);
        if (build.code === 0) { const second = await run(state.engine, args, dir); build = {code: second.code, output: build.output + '\n' + second.output}; }
      }
      const pdf = path.join(dir, 'out', path.basename(state.main, '.tex') + '.pdf');
      const ok = build.code === 0 && await fs.stat(pdf).then(s => s.size > 0).catch(() => false);
      const regions: Region[] = [];
      if (ok) {
        const images = state.objects.filter(o => o.kind === 'image');
        for (const object of images) {
          // SyncTeX's line-based navigation cannot distinguish two calls on one line.
          if (images.filter(other => other.file === object.file && other.line === object.line).length > 1) continue;
          const forward = await run('synctex', ['view', '-i', `${object.line}:0:${path.join(dir, object.file)}`, '-o', pdf], dir, 8000);
          for (const box of syncBlocks(forward.output)) {
            const x = Number(box.h), baseline = Number(box.v), width = Number(box.W), height = Number(box.H), page = Number(box.Page);
            if ([x, baseline, width, height, page].every(Number.isFinite) && width > 1 && height > 2 && page >= 1) regions.push({ objectId: object.id, file: object.file, line: object.line, page, x, y: baseline - height, width, height });
          }
        }
        this.builds.set(token, { dir, pdf, projectId: state.id, version: state.version });
      }
      const aux=await fs.readFile(path.join(dir,'out',path.basename(state.main,'.tex')+'.aux'),'utf8').catch(()=>'');
      return { ok, projectId: state.id, version: state.version, token, durationMs: Date.now() - started, log: build.output,
        diagnostics: diagnostics(build.output, dir), regions, writingRegions:parseWritingPositions(aux), pdf: ok ? new Uint8Array(await fs.readFile(pdf)) : undefined };
  }
  async locate(token: string, page: number, x: number, y: number) {
    const build = this.builds.get(token); if (!build) throw new Error('预览已失效，请重新编译。');
    if (![page, x, y].every(Number.isFinite) || page < 1 || x < 0 || y < 0) return null;
    const result = await run('synctex', ['edit', '-o', `${page}:${x.toFixed(2)}:${y.toFixed(2)}:${build.pdf}`], build.dir, 8000);
    const input = /^Input:(.*)$/m.exec(result.output)?.[1].trim(), line = Number(/^Line:(\d+)/m.exec(result.output)?.[1]);
    if (!input || !line) return null;
    const file = path.relative(build.dir, path.resolve(build.dir, input)).replaceAll(path.sep, '/');
    if (file.startsWith('..') || path.isAbsolute(file)) return null;
    return { file, line };
  }
  pdfPath(token: string) { const build = this.builds.get(token); if (!build) throw new Error('请先成功编译。'); return build.pdf; }
}
