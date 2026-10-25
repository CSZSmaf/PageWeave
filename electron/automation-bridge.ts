import {ipcMain,type BrowserWindow,type IpcMainInvokeEvent} from 'electron';
import {randomUUID} from 'node:crypto';
import {serveCli} from '../core/cli-transport';
import {AutomationService,CliError,cliError,type CliRequest,type CliResponse,type AutomationStep} from '../core/automation';
import type {Project} from '../core/project';
import type {RecoveryStore} from '../core/recovery';
import type {Compiler} from '../core/compiler';

export async function attachAutomation(window:BrowserWindow,directory:string,getProject:()=>Project,recovery:RecoveryStore,compiler:Compiler,needsRecovery:()=>boolean){
  const service=new AutomationService(getProject,recovery,compiler);
  const pending=new Map<string,{request:CliRequest;started:boolean;step?:AutomationStep;finish:(response:CliResponse)=>void}>();
  const trusted=(event:IpcMainInvokeEvent)=>{if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('无效的应用请求。');};
  ipcMain.handle('automation:execute',async(event,id:string)=>{
    trusted(event);const task=pending.get(id);
    if(!task||task.started)throw new Error('CLI 请求已结束或失效。');
    task.started=true;
    const step=needsRecovery()?{response:cliError(new CliError('RECOVERY_PENDING','请先在软件中处理恢复记录。')),project:getProject().state(),refresh:'none' as const}:await service.execute(task.request);
    task.step=step;return step;
  });
  ipcMain.handle('automation:finish',(event,id:string,error?:string)=>{
    trusted(event);const task=pending.get(id);if(!task)return;
    if(error){const result=cliError(new CliError(task.started?'UI_SYNC_FAILED':'BUSY',error));if(!result.ok&&task.step?.response.ok)result.data={applied:true,result:task.step.response.data};task.finish(result);}
    else task.finish(task.step?.response??cliError(new CliError('NOT_READY','编辑器尚未准备好。')));
  });
  let closeServer:()=>Promise<void>;
  try{closeServer=await serveCli(directory,(request,signal)=>new Promise(resolve=>{
    if(window.isDestroyed()||needsRecovery()){resolve(cliError(new CliError('NOT_READY','请先打开文稿并处理恢复提示。')));return;}
    const id=randomUUID();
    const finish=(response:CliResponse)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);pending.delete(id);resolve(response);};
    const abort=()=>finish(cliError(new CliError('DISCONNECTED','CLI 连接已关闭。')));
    const timer=setTimeout(()=>finish(cliError(new CliError('TIMEOUT','编辑器未能完成请求，请重新读取文稿状态。'))),290000);
    pending.set(id,{request,started:false,finish});signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}
    window.webContents.send('automation:request',{id,action:request.action});
  }));}catch(error){ipcMain.removeHandler('automation:execute');ipcMain.removeHandler('automation:finish');throw error;}
  window.once('closed',()=>{for(const task of pending.values())task.finish(cliError(new CliError('DISCONNECTED','PageWeave 已关闭。')));void closeServer();ipcMain.removeHandler('automation:execute');ipcMain.removeHandler('automation:finish');});
}
