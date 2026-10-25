import { app, BrowserWindow, dialog, ipcMain, Menu, shell,nativeImage,safeStorage,net } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Project } from '../core/project';
import { Compiler, inspectTools } from '../core/compiler';
import {FormulaCompiler} from '../core/formula';
import {RecoveryStore,atomicWrite} from '../core/recovery';
import {AiClient,AiSettings} from '../core/ai-client';
import type { Engine,RecoveryInfo } from '../core/types';
import {DEFAULT_DOCUMENT_NAME,documentFileName} from '../core/file-name';
import {attachAutomation} from './automation-bridge';

const customData=process.env.PAGEWEAVE_USER_DATA??process.env.MOGAO_USER_DATA;
if(customData)app.setPath('userData',path.resolve(customData));
// Keep the document compositor running when Windows temporarily occludes this window.
// backgroundThrottling alone does not prevent native occlusion from pausing paint.
if(process.platform==='win32')app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
let window: BrowserWindow, project: Project, compiler: Compiler, allowClose = false;
let recovery:RecoveryStore,pendingRecovery:{root:string;info:RecoveryInfo}|null=null;
const dataRoot = () => app.getPath('userData');
async function preferences() { try { return JSON.parse(await fs.readFile(path.join(dataRoot(), 'preferences.json'), 'utf8')); } catch { return {}; } }
async function persist() { await fs.mkdir(dataRoot(), { recursive: true }); await atomicWrite(path.join(dataRoot(), 'preferences.json'), JSON.stringify({ root: project.root, main: project.main, engine: project.engine,scope:project.scope }, null, 2)); if(window&&!window.isDestroyed())window.setTitle(documentFileName(project.main)+' — PageWeave'); }
const currentState=()=>({...project.state(),recovery:pendingRecovery?.info??null});
async function selectProject(next:Project){project=next;const info=await recovery.find(next.root);pendingRecovery=info?{root:next.root,info}:null;if(!info){project.prepareWritingLayout();await recovery.checkpoint(project);}await persist();return currentState();}
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
  if (choice.response === 0) await recovery.save(project);
  if (choice.response === 2) await recovery.clear(project.root);
  return true;
}
function handler(channel: string, callback: (...args: any[]) => any) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('无效的应用请求。');
    if(pendingRecovery&&!['project:initialize','project:recover','window:finish-close'].includes(channel))throw new Error('请先处理恢复记录。');
    const before=project,version=project?.version,result=await callback(...args);
    if(before===project&&project.version!==version)await recovery.checkpoint(project);
    return result;
  });
}
app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  if(!customData&&!await fs.stat(path.join(dataRoot(),'preferences.json')).catch(()=>null)){
    const legacy=path.join(app.getPath('appData'),'墨稿 TeX Workbench','preferences.json');
    if(await fs.stat(legacy).catch(()=>null)){await fs.mkdir(dataRoot(),{recursive:true});await fs.copyFile(legacy,path.join(dataRoot(),'preferences.json'));}
  }
  compiler = new Compiler(path.join(dataRoot(), 'builds'));
  recovery=new RecoveryStore(path.join(dataRoot(),'recovery'));
  const aiSettings=new AiSettings(path.join(dataRoot(),'ai-config.json'),safeStorage),ai=new AiClient(aiSettings,(input,init)=>net.fetch(input instanceof URL?input.toString():input,init));
  const formulaCompiler=new FormulaCompiler(path.join(dataRoot(),'formula-builds'));
  const prefs = await preferences();
  const requested = process.argv.find(a => a.startsWith('--project='))?.slice('--project='.length);
  try { const input=requested??prefs.root;if(typeof input!=='string')throw new Error('No previous document');project=/\.tex$/i.test(input)?await Project.openFile(input):await Project.open(input,!requested&&prefs.scope==='file'?prefs.main:undefined); if (!requested&&project.files.has(prefs.main)&&prefs.engine) project.configure(prefs.main, prefs.engine); }
  catch { project = await writingProject(); }
  const recoveryRoot=requested?project.root:typeof prefs.root==='string'?prefs.root:project.root,recoveryInfo=await recovery.find(recoveryRoot);
  pendingRecovery=recoveryInfo?{root:recoveryRoot,info:recoveryInfo}:null;
  if(!pendingRecovery){project.prepareWritingLayout();await recovery.checkpoint(project);}
  if(!pendingRecovery)await persist();
  window = new BrowserWindow({ width: 1600, height: 1000, minWidth: 1100, minHeight: 720, title: documentFileName(project.main)+' — PageWeave', backgroundColor: '#f2f5f9', show: false, icon: path.join(app.getAppPath(), 'assets', 'pageweave.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false, backgroundThrottling: false, offscreen: process.env.PAGEWEAVE_BACKGROUND_TEST==='offscreen' } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => { if(event.url!==window.webContents.getURL())event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  // Present only after Chromium has produced a frame; a loaded DOM need not be painted yet.
  window.once('ready-to-show',()=>{if(!process.env.PAGEWEAVE_BACKGROUND_TEST)window.show();});
  window.on('show',()=>window.webContents.invalidate());
  window.on('restore',()=>window.webContents.invalidate());
  let rendererFailed=false,recoveringRenderer=false;
  const rendererFailure=async()=>{
    rendererFailed=true;if(recoveringRenderer||window.isDestroyed())return;recoveringRenderer=true;
    try{
      await recovery.checkpoint(project);
      const choice=await dialog.showMessageBox(window,{type:'error',title:'PageWeave',message:'界面暂时无法显示。',buttons:['重新加载','关闭'],defaultId:0,cancelId:1});
      if(choice.response===0){rendererFailed=false;window.webContents.reload();}
      else if(await confirmLeave()){allowClose=true;window.close();}
    }finally{recoveringRenderer=false;}
  };
  window.webContents.on('render-process-gone',()=>void rendererFailure().catch(error=>dialog.showErrorBox('PageWeave',String(error))));
  window.webContents.on('preload-error',()=>{rendererFailed=true;});
  window.on('close',event=>{if(!allowClose&&rendererFailed){event.preventDefault();void confirmLeave().then(leave=>{if(leave){allowClose=true;window.close();}}).catch(error=>dialog.showErrorBox('PageWeave',String(error)));}});
  window.on('close', event => { if (!allowClose) { event.preventDefault(); window.webContents.send('window:close-request'); } });
  handler('project:initialize', async () => ({ project: currentState(), tools: await inspectTools() }));
  handler('ai:status',()=>aiSettings.status());
  handler('ai:configure',(config,key)=>{ai.cancelAll();return aiSettings.configure(config,key);});
  handler('ai:request',request=>ai.request(request));
  handler('ai:cancel',id=>ai.cancel(id));
  window.on('closed',()=>ai.cancelAll());
  handler('project:recover',async(id:string,action:string)=>{
    if(!pendingRecovery||id!==pendingRecovery.info.id||!['restore','discard'].includes(action))throw new Error('恢复操作无效。');
    const root=pendingRecovery.root;
    if(action==='restore')project=await recovery.restore(root,id);else await recovery.clear(root);
    pendingRecovery=null;project.prepareWritingLayout();await recovery.checkpoint(project);await persist();return currentState();
  });
  handler('project:open', async (mode='file') => {
    if (!await confirmLeave()) return null;
    const folder=mode==='folder';
    const choice = await dialog.showOpenDialog(window, { title: folder?'打开 LaTeX 工程文件夹':'打开 LaTeX 文稿', properties: folder?['openDirectory']:['openFile'],...(!folder?{filters:[{name:'LaTeX 文稿',extensions:['tex']}]}:{}) });
    if (choice.canceled) return null;
    return selectProject(folder?await Project.open(choice.filePaths[0]):await Project.openFile(choice.filePaths[0]));
  });
  handler('project:rename',async(name:string,version:number)=>{project.assertVersion(version);await recovery.save(project);await project.renameMain(name,project.version);await recovery.checkpoint(project);await persist();return currentState();});
  handler('project:demo', async () => { if (!await confirmLeave()) return null; return selectProject(await demoProject()); });
  handler('writing:demo',async()=>{if(!await confirmLeave())return null;return selectProject(await writingProject());});
  handler('writing:new',async()=>{if(!await confirmLeave())return null;const directory=path.join(app.getPath('documents'),'PageWeave');await fs.mkdir(directory,{recursive:true});const choice=await dialog.showSaveDialog(window,{title:'新建 LaTeX 文稿',defaultPath:path.join(directory,DEFAULT_DOCUMENT_NAME),buttonLabel:'创建',filters:[{name:'LaTeX 文稿',extensions:['tex']}]});if(choice.canceled||!choice.filePath)return null;return selectProject(await Project.createDocument(choice.filePath,path.join(app.getAppPath(),'examples','writing')));});
  handler('writing:edit',(id,content,version)=>project.writeBlock(id,content,version));
  handler('writing:flow',(parts,version,document)=>project.writeFlow(parts,version,document));
  handler('writing:plan',(plan,version)=>project.pagePlan(plan,version));
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
  handler('project:source', (file: string, text: string, version: number) => project.sourceWithDependencies(file,text,version));
  handler('project:width', (id: string, value: number, unit: string, version: number) => project.width(id, value, unit, version));
  handler('project:undo', (version: number) => project.undo(version));
  handler('project:redo', (version: number) => project.redo(version));
  handler('project:save', async () => { const state = await recovery.save(project); await persist(); return state; });
  handler('project:auto-save',()=>recovery.save(project));
  handler('project:save-as',async()=>{
    const choice=await dialog.showSaveDialog(window,{title:'文稿另存为',buttonLabel:'保存工程',defaultPath:path.join(path.dirname(project.root),path.basename(project.root)+'-副本')});
    if(choice.canceled||!choice.filePath)return null;
    const previous=project.root,next=await project.saveAs(choice.filePath);await recovery.clear(previous);return selectProject(next);
  });
  handler('project:reload', async () => { if (!await confirmLeave()) return null; const next = await Project.open(project.root,project.scope==='file'?project.main:undefined); next.configure(project.main, project.engine); return selectProject(next); });
  handler('project:configure', async (main: string, engine: Engine) => { const state = project.configure(main, engine); await persist(); return state; });
  handler('project:reveal', async () => { await shell.openPath(project.root); });
  handler('build:compile', () => compiler.compile(project));
  handler('formula:compile',latex=>formulaCompiler.compile(project,latex));
  handler('build:locate', (token: string, page: number, x: number, y: number) => compiler.locate(token, page, x, y));
  handler('export:pdf', async (token: string) => {
    const source = compiler.pdfPath(token);
    const choice = await dialog.showSaveDialog(window, { title: '导出当前预览的 PDF', defaultPath: path.join(project.root, path.basename(project.main).replace(/\.tex$/i,'') + '.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
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
  await attachAutomation(window,dataRoot(),()=>project,recovery,compiler,()=>!!pendingRecovery).catch(error=>console.warn('CLI connection unavailable:',error.code??error.message));
}).catch(error => { dialog.showErrorBox('PageWeave 无法启动', String(error)); app.quit(); });
app.on('window-all-closed', () => app.quit());
