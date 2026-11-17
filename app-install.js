/* Native browser installation when available; manual iOS/Android instructions otherwise. */
(()=>{
 let installPrompt=null,installedFlag=false;
 const standalone=window.matchMedia('(display-mode: standalone)');
 const installed=()=>installedFlag||standalone.matches||navigator.standalone===true;
 function update(){const button=document.getElementById('installDockFlow');if(button)button.classList.toggle('hidden',installed());}
 function instructions(){
  const apple=/iPad|iPhone|iPod/.test(navigator.userAgent)||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1;
  openModal('Install DockFlow',`<div class="install-intro"><img src="icons/icon-192.png" alt="" width="64" height="64"><div><h3>DockFlow</h3><p class="muted">${tr('Open your warehouse from your home screen.')}</p></div></div><section class="install-guide"><h3>${tr(apple?'iPhone or iPad':'Android')}</h3><ol>${(apple?['Open this website in Safari.','Tap Share, then Add to Home Screen.','Turn on Open as Web App if shown, then tap Add.']:['Open this website in Chrome.','Open the browser menu (⋮).','Tap Install app or Add to Home screen, then confirm.']).map(step=>`<li>${tr(step)}</li>`).join('')}</ol></section><p class="muted">${tr('On a computer, use the install icon in the browser address bar when available.')}</p><p class="muted">${tr('Use your approved employee account. An internet connection is needed for shared tasks and photos.')}</p><div class="actions"><button class="btn" type="button" id="closeInstallHelp">${tr('Got it')}</button></div>`);
  document.getElementById('closeInstallHelp').onclick=closeModal;
 }
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;update();});
 window.addEventListener('appinstalled',()=>{installedFlag=true;installPrompt=null;document.getElementById('installDockFlow')?.classList.add('hidden');});
 standalone.addEventListener?.('change',update);
 document.addEventListener('click',async event=>{
  if(!event.target.closest('#installDockFlow'))return;
  if(installPrompt){const prompt=installPrompt;installPrompt=null;try{await prompt.prompt();await prompt.userChoice;}catch{instructions();}update();}else instructions();
 });
 update();
})();
