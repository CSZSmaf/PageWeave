import net from 'node:net';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {CLI_PROTOCOL,MAX_CLI_BYTES,CliError,cliError,validateCliRequest,type CliRequest,type CliResponse} from './automation';

interface Connection {protocol:number;endpoint:string;token:string;pid:number}
export const connectionFile=(directory:string)=>path.join(directory,'cli-connection.json');
function endpointFor(directory:string){const id=createHash('sha256').update(path.resolve(directory).toLowerCase()).digest('hex').slice(0,24);return process.platform==='win32'?`\\\\.\\pipe\\pageweave-${id}`:path.join(os.tmpdir(),`pageweave-${id}.sock`);}
export async function serveCli(directory:string,execute:(request:CliRequest,signal:AbortSignal)=>Promise<CliResponse>){
  const endpoint=endpointFor(directory),token=randomBytes(32).toString('hex'),sockets=new Set<net.Socket>();let queued=0;
  const server=net.createServer(socket=>{
    sockets.add(socket);const controller=new AbortController();let bytes=Buffer.alloc(0),started=false;
    socket.on('error',()=>{});socket.on('close',()=>{sockets.delete(socket);controller.abort();});socket.setTimeout(15000,()=>socket.destroy());
    const reply=(value:CliResponse)=>{if(!socket.destroyed)socket.end(JSON.stringify(value)+'\n');};
    socket.on('data',chunk=>{
      if(started)return;bytes=Buffer.concat([bytes,chunk]);
      if(bytes.length>MAX_CLI_BYTES){started=true;reply(cliError(new CliError('TOO_LARGE','请求过大。')));return;}
      const newline=bytes.indexOf(10);if(newline<0)return;started=true;
      void (async()=>{let counted=false;try{
        const packet=JSON.parse(bytes.subarray(0,newline).toString('utf8'));
        if(packet.protocol!==CLI_PROTOCOL||typeof packet.token!=='string'||!/^[a-f0-9]{64}$/.test(packet.token)||!timingSafeEqual(Buffer.from(packet.token),Buffer.from(token)))throw new CliError('UNAUTHORIZED','CLI 连接凭据无效，请重新连接。');
        const request=validateCliRequest(packet.request);
        if(queued>=4)throw new CliError('BUSY','当前请求过多，请稍后重试。');queued++;counted=true;socket.setTimeout(300000,()=>socket.destroy());
        reply(await execute(request,controller.signal));
      }catch(error){reply(cliError(error));}finally{if(counted)queued--;}})();
    });
  });
  await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(endpoint,()=>{server.removeListener('error',reject);resolve();});});
  server.on('error',()=>{});
  try{
    await fs.mkdir(directory,{recursive:true});if(process.platform!=='win32')await fs.chmod(endpoint,0o600);
    const temporary=connectionFile(directory)+'.'+process.pid+'.tmp';
    await fs.writeFile(temporary,JSON.stringify({protocol:CLI_PROTOCOL,endpoint,token,pid:process.pid}),{mode:0o600});await fs.rename(temporary,connectionFile(directory));
  }catch(error){server.close();throw error;}
  return async()=>{for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));const current=await fs.readFile(connectionFile(directory),'utf8').then(s=>JSON.parse(s)).catch(()=>null);if(current?.token===token)await fs.unlink(connectionFile(directory)).catch(()=>{});};
}

export async function callCli(directory:string,request:CliRequest,timeout=300000):Promise<CliResponse>{
  let connection:Connection;
  try{connection=JSON.parse(await fs.readFile(connectionFile(directory),'utf8'));}catch{throw new CliError('NOT_RUNNING','未找到正在运行的 PageWeave，请先打开软件。');}
  if(connection.protocol!==CLI_PROTOCOL||connection.endpoint!==endpointFor(directory)||typeof connection.token!=='string'||!/^[a-f0-9]{64}$/.test(connection.token))throw new CliError('BAD_CONNECTION','CLI 连接记录无效，请重新打开软件。');
  return new Promise((resolve,reject)=>{
    const socket=net.createConnection(connection.endpoint);let buffer=Buffer.alloc(0),settled=false;
    const finish=(error:Error|null,value?:CliResponse)=>{if(settled)return;settled=true;socket.destroy();if(error)reject(error);else resolve(value!);};
    socket.setTimeout(timeout,()=>finish(new CliError('TIMEOUT','CLI 请求超时。请重新读取文稿状态，确认操作结果。')));
    socket.on('error',()=>finish(new CliError('NOT_RUNNING','无法连接 PageWeave，请确认软件已打开。')));
    socket.on('connect',()=>socket.write(JSON.stringify({protocol:CLI_PROTOCOL,token:connection.token,request})+'\n'));
    socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);if(buffer.length>MAX_CLI_BYTES*2){finish(new CliError('TOO_LARGE','响应过大。'));return;}const newline=buffer.indexOf(10);if(newline<0)return;try{const value=JSON.parse(buffer.subarray(0,newline).toString('utf8'));if(typeof value.ok!=='boolean')throw new Error();finish(null,value);}catch{finish(new CliError('BAD_RESPONSE','CLI 响应无效。'));}});
    socket.on('close',()=>{if(!settled)finish(new CliError('DISCONNECTED','软件连接已关闭，请重新读取文稿状态。'));});
  });
}
