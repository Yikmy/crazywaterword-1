import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export function createOfflineBrowser(root){
 return async function withOfflineBrowser(app,exercise,{commandTimeoutMs=10000}={}){
 const {spawn}=await import('node:child_process');
 const {setTimeout:delay}=await import('node:timers/promises');
 const profile=fs.mkdtempSync(path.join(root,'browser-'));
 const origin='http://127.0.0.1:'+app.server.address().port;
 const browser=spawn(process.env.CW_TEST_BROWSER, [
  '--headless=new','--no-first-run','--disable-background-networking','--remote-debugging-port=0',
  '--user-data-dir='+profile,origin
 ],{stdio:'ignore',windowsHide:true});
 let launchError,socket;
 browser.on('error',error=>{launchError=error;});
 async function waitFor(read,description,attempts=100){
  for(let attempt=0;attempt<attempts;attempt++){
   if(launchError)throw launchError;
   const result=await read();
   if(result)return result;
   await delay(100);
  }
  assert.fail('Timed out waiting for '+description);
 }
 try{
  const port=await waitFor(()=>{
   const file=path.join(profile,'DevToolsActivePort');
   return fs.existsSync(file)&&Number(fs.readFileSync(file,'utf8').split('\n')[0]);
  },'browser startup');
  const page=await waitFor(async()=>{
   const response=await fetch('http://127.0.0.1:'+port+'/json/list');
   return (await response.json()).find(item=>item.url===origin+'/');
  },'local console page');
  socket=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
   socket.addEventListener('open',resolve,{once:true});
   socket.addEventListener('error',reject,{once:true});
  });
  let commandId=0;
  const command=(method,params={})=>new Promise((resolve,reject)=>{
   const id=++commandId;
   const timer=setTimeout(()=>{
    socket.removeEventListener('message',onMessage);
    reject(Error('Browser command timed out: '+method+' '+String(params.expression??'').slice(0,120)));
   },commandTimeoutMs);
   const onMessage=event=>{
    const reply=JSON.parse(event.data);
    if(reply.id!==id)return;
    clearTimeout(timer);
    socket.removeEventListener('message',onMessage);
    if(reply.error||reply.result.exceptionDetails)reject(Error(JSON.stringify(reply.error??reply.result.exceptionDetails)));
    else resolve(reply.result);
   };
   socket.addEventListener('message',onMessage);
   socket.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>(await command('Runtime.evaluate',{awaitPromise:true,returnByValue:true,expression})).result.value;
  await command('Page.enable');
  await command('Page.addScriptToEvaluateOnNewDocument',{source:"globalThis.pageErrors=[]; addEventListener('error',e=>pageErrors.push(e.message+' '+e.lineno)); window.confirm=()=>{globalThis.confirmations=(globalThis.confirmations||0)+1;return true;};"});
  await command('Page.reload');
  await waitFor(async()=>{
   try{return await evaluate("document.readyState === 'complete' && !!globalThis.pageErrors && !!document.querySelector('#wf-json')");}
   catch(error){if(!/Execution context was destroyed|Cannot find context/.test(error.message))throw error;return false;}
  },'console initialization');
  await exercise({evaluate,waitFor});
 }finally{
  socket?.close();
  // Only the uniquely created test profile and processes using that exact path
  // may be cleaned up; Edge's launcher can exit while its children remain.
  const base=fs.realpathSync(root),target=fs.realpathSync(profile),relative=path.relative(base,target);
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Browser profile escaped its test directory');
  try{
   if(process.platform==='win32'){
    const script="$p=$env:CW_TEST_PROFILE_PATH; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq $env:CW_TEST_BROWSER_PROCESS -and $_.CommandLine -and $_.CommandLine.Contains($p) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
    const cleanup=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{stdio:'ignore',windowsHide:true,env:{...process.env,CW_TEST_PROFILE_PATH:target,CW_TEST_BROWSER_PROCESS:path.basename(process.env.CW_TEST_BROWSER)}});
    const timeout=new AbortController();let code;
    try{code=await Promise.race([new Promise((resolve,reject)=>{cleanup.once('exit',resolve);cleanup.once('error',reject);}),delay(15000,undefined,{signal:timeout.signal}).then(()=>{cleanup.kill();throw Error('Browser process cleanup timed out');})]);}
    finally{timeout.abort();}
    if(code!==0)throw Error('Browser process cleanup failed: '+code);
   }else if(browser.exitCode===null&&browser.signalCode===null)browser.kill();
  }finally{
   // The local test server must release connections even if browser cleanup fails.
   app.server.closeAllConnections();
  }
  fs.rmSync(target,{recursive:true,force:true,maxRetries:20,retryDelay:100});
 }
};
}
