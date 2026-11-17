/* Task discussions use authenticated access and short-lived private photo links. */
let taskUpdateThread=null,taskUpdateTimer=null;
function stopTaskUpdates(){if(taskUpdateTimer)clearTimeout(taskUpdateTimer);taskUpdateTimer=null;taskUpdateThread=null;}
function currentTaskThread(thread){return !!thread&&cloud&&thread===taskUpdateThread&&thread.epoch===epoch;}
function validateTaskUpdate(body,file){const text=String(body||'').trim();if(text.length>4000)throw Error(tr('Keep updates under 4000 characters.'));if(!text&&!file?.size)throw Error(tr('Write an update or choose a photo.'));if(file?.size){if(file.size>5000000)throw Error(tr('Maximum attachment size is 5 MB'));if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type))throw Error(tr('Choose a JPG, PNG, WebP, or GIF photo.'));}return text;}
function taskUpdateHtml(update){return `<article class="task-update"><header><span class="update-avatar" aria-hidden="true">${esc(String(update.author_name||'?').slice(0,1).toUpperCase())}</span><div><strong>${esc(update.author_name||tr('Employee'))}</strong><time datetime="${esc(update.created_at)}">${esc(taskTimestamp(update.created_at))}</time></div></header>${update.body?`<p class="update-body">${esc(update.body)}</p>`:''}${update.photo_path?`<button type="button" class="update-photo" data-update-photo="${esc(update.id)}">${uiIcon('box')}${tr('View photo')}</button>`:''}</article>`;}
async function refreshTaskUpdates(thread=taskUpdateThread){
 if(!currentTaskThread(thread)||thread.reading)return;thread.reading=true;
 try{const result=await withTimeout(client.from('dockflow_task_updates').select('id,task_id,author_id,author_name,body,photo_path,created_at').eq('task_id',thread.id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100));if(result.error)throw result.error;if(!currentTaskThread(thread))return;thread.updates=result.data||[];$('#taskUpdateList').innerHTML=thread.updates.length?[...thread.updates].reverse().map(taskUpdateHtml).join(''):`<div class="empty">${tr('No updates yet. Share the first update.')}</div>`;$('#taskUpdateNotice').textContent='';}
 catch(error){if(currentTaskThread(thread))$('#taskUpdateNotice').textContent=tr('Could not load updates: ')+tr(error.message);}
 finally{thread.reading=false;}
}
function scheduleTaskUpdates(thread){if(!currentTaskThread(thread))return;taskUpdateTimer=setTimeout(async()=>{if(!currentTaskThread(thread))return;if(!document.hidden)await refreshTaskUpdates(thread);scheduleTaskUpdates(thread);},20000);}
async function taskUpdatesModal(id){
 if(!cloud)return;const task=db.tasks.find(t=>t.id===id);if(!task)return;stopTaskUpdates();
 const thread={id,epoch,updates:[],reading:false,posting:false};
 openModal('Task updates',`<div class="updates-task-title">${esc(task.title)}</div><div class="updates-toolbar"><span class="muted">${tr('Latest 100 updates')}</span><button type="button" class="btn secondary" id="refreshTaskUpdates">${tr('Refresh')}</button></div><p id="taskUpdateNotice" role="status" class="muted"></p><div id="taskUpdateList" class="task-update-list"><p class="muted">${tr('Loading updates…')}</p></div><form id="taskUpdateForm" class="task-update-form"><label for="taskUpdateBody">${tr('Share an update')}</label><textarea id="taskUpdateBody" name="body" maxlength="4000" placeholder="${tr('Progress, questions, or anything the team should know…')}"></textarea><label for="taskUpdatePhoto">${tr('Photo (optional, up to 5 MB)')}</label><input id="taskUpdatePhoto" name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif"><p id="taskUpdatePostError" role="alert" class="update-error"></p><button class="btn" type="submit">${tr('Post update')}</button></form>`);
 taskUpdateThread=thread;
 $('#refreshTaskUpdates').onclick=()=>refreshTaskUpdates(thread);
 $('#taskUpdateList').onclick=event=>{const button=event.target.closest('[data-update-photo]');if(button)openTaskUpdatePhoto(button.dataset.updatePhoto,thread);};
 $('#taskUpdateForm').onsubmit=event=>postTaskUpdate(event,thread);
 await refreshTaskUpdates(thread);scheduleTaskUpdates(thread);
}
async function postTaskUpdate(event,thread=taskUpdateThread){
 event.preventDefault();if(!currentTaskThread(thread)||thread.posting)return;
 const form=event.target,values=new FormData(form),file=values.get('photo'),button=form.querySelector('[type="submit"]');let uploaded='',written=false;
 thread.posting=true;button.disabled=true;$('#taskUpdatePostError').textContent='';
 try{const body=validateTaskUpdate(values.get('body'),file),id=uid();
  if(file?.size){uploaded=`${user.id}/updates/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const result=await client.storage.from('dockflow-attachments').upload(uploaded,file,{contentType:file.type});if(result.error)throw result.error;}
  if(!currentTaskThread(thread))throw Error(tr('Your session changed. Please sign in again.'));
  const result=await client.from('dockflow_task_updates').insert({id,task_id:thread.id,body,photo_path:uploaded||null}).select('id').single();if(result.error)throw result.error;written=true;
  if(!currentTaskThread(thread))return;form.reset();await refreshTaskUpdates(thread);
 }catch(error){if(uploaded&&!written&&thread.epoch===epoch&&cloud)await client.storage.from('dockflow-attachments').remove([uploaded]);if(currentTaskThread(thread))$('#taskUpdatePostError').textContent=tr('Could not post update: ')+tr(error.message);}
 finally{thread.posting=false;if(currentTaskThread(thread))button.disabled=false;}
}
async function openTaskUpdatePhoto(id,thread=taskUpdateThread){
 if(!currentTaskThread(thread))return;const update=thread.updates.find(u=>u.id===id);if(!update?.photo_path)return;const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;
 try{const result=await client.storage.from('dockflow-attachments').createSignedUrl(update.photo_path,60);if(result.error)throw result.error;if(!currentTaskThread(thread)){tab?.close();return;}if(tab)tab.location.replace(result.data.signedUrl);else alert(tr('Allow pop-ups for DockFlow to view attachments.'));}
 catch(error){tab?.close();if(currentTaskThread(thread))$('#taskUpdateNotice').textContent=tr('Could not open attachment: ')+tr(error.message);}
}
