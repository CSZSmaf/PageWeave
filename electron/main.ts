import { app, BrowserWindow, dialog, ipcMain, Menu, shell,nativeImage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Project } from '../core/project';
import { Compiler, inspectTools } from '../core/compiler';
import {FormulaCompiler} from '../core/formula';
import type { Engine } from '../core/types';

const customData=process.env.PAGEWEAVE_USER_DATA??process.env.MOGAO_USER_DATA;
if(customData)app.setPath('userData',path.resolve(customData));
// Keep the document compositor running when Windows temporarily occludes this window.
// backgroundThrottling alone does not prevent native occlusion from pausing paint.
if(process.platform==='win32')app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
let window: BrowserWindow, project: Project, compiler: Compiler, allowClose = false;
const dataRoot = () => app.getPath('userData');
async function preferences() { try { return JSON.parse(await fs.readFile(path.join(dataRoot(), 'preferences.json'), 'utf8')); } catch { return {}; } }
async function persist() { await fs.mkdir(dataRoot(), { recursive: true }); await fs.writeFile(path.join(dataRoot(), 'preferences.json'), JSON.stringify({ root: project.root, main: project.main, engine: project.engine }, null, 2)); }
async function demoProject() {
  const destination = path.join(dataRoot(), 'papers', 'LaTeX 工程教程');
  if (!await fs.stat(path.join(destination, 'main.tex')).catch(() => null)) {
    await fs.mkdir(destination, { recursive: true }); await fs.cp(path.join(app.getAppPath(), 'examples', 'paper'), destination, { recursive: true });
  }
  return Project.open(destination);
}
async function writingProject(destination?:string){
  destination??=path.join(dataRoot(),'papers','入门教程');
  if(!await fs.stat(path.join(destination,'main.tex')).catch(()=>null)){
    await fs.mkdir(destination,{recursive:true});await fs.cp(path.join(app.getAppPath(),'examples','writing'),destination,{recursive:true});
  }
  return Project.open(destination);
}
async function confirmLeave() {
  if (!project?.state().files.some(f => f.dirty)) return true;
  const choice = await dialog.showMessageBox(window, { type: 'question', title: '保留当前修改', message: '当前工程有尚未保存的修改。', buttons: ['保存并继续', '取消', '放弃修改'], defaultId: 0, cancelId: 1 });
  if (choice.response === 1) return false;
  if (choice.response === 0) await project.save();
  return true;
}
function handler(channel: string, callback: (...args: any[]) => any) {
  ipcMain.handle(channel, (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('无效的应用请求。');
    return callback(...args);
  });
}
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  if(!customData&&!await fs.stat(path.join(dataRoot(),'preferences.json')).catch(()=>null)){
    const legacy=path.join(app.getPath('appData'),'墨稿 TeX Workbench','preferences.json');
    if(await fs.stat(legacy).catch(()=>null)){await fs.mkdir(dataRoot(),{recursive:true});await fs.copyFile(legacy,path.join(dataRoot(),'preferences.json'));}
  }
  compiler = new Compiler(path.join(dataRoot(), 'builds'));
  const formulaCompiler=new FormulaCompiler(path.join(dataRoot(),'formula-builds'));
  const prefs = await preferences();
  const requested = process.argv.find(a => a.startsWith('--project='))?.slice('--project='.length);
  try { project = await Project.open(requested ?? prefs.root); if (prefs.root === project.root && prefs.main && prefs.engine) project.configure(prefs.main, prefs.engine); }
  catch { project = await writingProject(); }
  await persist();
  window = new BrowserWindow({ width: 1600, height: 1000, minWidth: 1100, minHeight: 720, title: 'PageWeave', backgroundColor: '#f2f5f9', show: false, icon: path.join(app.getAppPath(), 'assets', 'pageweave.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  window.on('close', event => { if (!allowClose) { event.preventDefault(); window.webContents.send('window:close-request'); } });
  handler('project:initialize', async () => ({ project: project.state(), tools: await inspectTools() }));
  handler('project:open', async () => {
    if (!await confirmLeave()) return null;
    const choice = await dialog.showOpenDialog(window, { title: '打开 LaTeX 工程目录', properties: ['openDirectory'] });
    if (choice.canceled) return null;
    const next = await Project.open(choice.filePaths[0]); project = next; await persist(); return project.state();
  });
  handler('project:demo', async () => { if (!await confirmLeave()) return null; project = await demoProject(); await persist(); return project.state(); });
  handler('writing:demo',async()=>{if(!await confirmLeave())return null;project=await writingProject();await persist();return project.state();});
  handler('writing:new',async()=>{if(!await confirmLeave())return null;const choice=await dialog.showOpenDialog(window,{title:'选择新文稿的存放目录',properties:['openDirectory','createDirectory']});if(choice.canceled)return null;const destination=path.join(choice.filePaths[0],'新文稿-'+Date.now());const next=await writingProject(destination);const text=next.history.texts.get('main.tex')!;next.source('main.tex',text.replace(/\\begin\{document\}[\s\S]*\\end\{document\}/,'\\begin{document}\n\\MogaoBlock{start}{\n\\MogaoPara{justify}{1.5}{\\strut}\n}\n\\end{document}'),0);await next.save();project=await Project.open(destination);await persist();return project.state();});
  handler('writing:edit',(id,content,version)=>project.writeBlock(id,content,version));
  handler('writing:flow',(parts,version,document)=>project.writeFlow(parts,version,document));
  handler('writing:import-image',(bytes:Uint8Array,version:number)=>{
    if(!(bytes instanceof Uint8Array)||bytes.length>20*1024*1024)throw new Error('请选择 20 MB 以内的图片。');
    const image=nativeImage.createFromBuffer(Buffer.from(bytes));if(image.isEmpty())throw new Error('无法读取图片，请使用 PNG、JPEG 或 WebP。');
    const {width,height}=image.getSize();if(width*height>16000000)throw new Error('图片最多支持 1600 万像素，请缩小后插入。');
    const png=image.toPNG();if(png.length>30*1024*1024)throw new Error('图片转换后过大，请缩小后插入。');
    return {...project.addImage(png,version),naturalWidth:width,naturalHeight:height};
  });
  handler('writing:image-data',file=>project.imageData(file));
  handler('writing:insert',(id,kind,version)=>project.insertBlock(id,kind,version));
  handler('writing:delete',(id,version)=>project.deleteBlock(id,version));
  handler('writing:page',(margin,paper,landscape,version)=>project.pageSettings(margin,paper,landscape,version));
  handler('project:source', (file: string, text: string, version: number) => project.source(file, text, version));
  handler('project:width', (id: string, value: number, unit: string, version: number) => project.width(id, value, unit, version));
  handler('project:undo', (version: number) => project.undo(version));
  handler('project:redo', (version: number) => project.redo(version));
  handler('project:save', async () => { const state = await project.save(); await persist(); return state; });
  handler('project:save-as',async()=>{
    const choice=await dialog.showSaveDialog(window,{title:'文稿另存为',buttonLabel:'保存工程',defaultPath:path.join(path.dirname(project.root),path.basename(project.root)+'-副本')});
    if(choice.canceled||!choice.filePath)return null;
    const next=await project.saveAs(choice.filePath);project=next;await persist();return project.state();
  });
  handler('project:reload', async () => { if (!await confirmLeave()) return null; const next = await Project.open(project.root); next.configure(project.main, project.engine); project = next; return project.state(); });
  handler('project:configure', async (main: string, engine: Engine) => { const state = project.configure(main, engine); await persist(); return state; });
  handler('project:reveal', async () => { await shell.openPath(project.root); });
  handler('build:compile', () => compiler.compile(project));
  handler('formula:compile',latex=>formulaCompiler.compile(project,latex));
  handler('build:locate', (token: string, page: number, x: number, y: number) => compiler.locate(token, page, x, y));
  handler('export:pdf', async (token: string) => {
    const source = compiler.pdfPath(token);
    const choice = await dialog.showSaveDialog(window, { title: '导出当前预览的 PDF', defaultPath: path.join(project.root, path.basename(project.main, '.tex') + '.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (choice.canceled || !choice.filePath) return null;
    await fs.copyFile(source, choice.filePath); return choice.filePath;
  });
  handler('export:project', async () => {
    const choice = await dialog.showOpenDialog(window, { title: '选择导出位置（将创建新目录）', properties: ['openDirectory', 'createDirectory'] });
    if (choice.canceled) return null;
    const dest = path.join(choice.filePaths[0], project.state().name + '-export-' + Date.now());
    await fs.mkdir(dest, { recursive: false }); await project.snapshot(dest); return dest;
  });
  handler('window:finish-close', async () => { if (await confirmLeave()) { allowClose = true; window.close(); } });
  if (process.env.VITE_DEV_SERVER_URL) await window.loadURL(process.env.VITE_DEV_SERVER_URL);
  else await window.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  window.show();
}).catch(error => { dialog.showErrorBox('PageWeave 无法启动', String(error)); app.quit(); });
app.on('window-all-closed', () => app.quit());
