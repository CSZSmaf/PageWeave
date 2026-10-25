(() => {
  const root=document.getElementById('root');
  const fail=()=>{
    if(root.dataset.ready==='true')return;
    const message=document.getElementById('startup-message'),retry=document.getElementById('startup-retry');
    if(message)message.textContent='界面加载未完成';
    if(retry)retry.hidden=false;
  };
  document.getElementById('startup-retry').addEventListener('click',()=>location.reload());
  window.addEventListener('error',fail,true);
  window.addEventListener('unhandledrejection',fail);
  setTimeout(fail,15000);
})();
