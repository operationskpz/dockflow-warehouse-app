'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const config={url:'https://xuejfaaovxlqfckkdjyq.supabase.co',key:'sb_publishable_oDReXHUZkwPWRUue-wxd9A_Ee4rc1gg'};
let client=null,user=null,cloud=false,view='dashboard',search='',statusFilter='all',categoryFilter='all',db={employees:[],tasks:[]},epoch=0,authError='',loading=true,recoveryMode=typeof location!=='undefined'&&new URL(location.href).searchParams.get('reset')==='1',recoveryReady=false;
const cats=['Receiving','Shipping','FBA','Inventory','General'],statuses=['To Do','In Progress','Blocked','Done'];
const uid=()=>crypto.randomUUID(),who=id=>db.employees.find(e=>e.id===id)?.name||tr('Unassigned');
const today=()=>new Date().toLocaleDateString('en-CA');
let displayedDashboardDay=today();
const fmt=d=>d?new Date(d+'T12:00:00').toLocaleDateString(language==='es'?'es':'en',{month:'short',day:'numeric'}):tr('No deadline');
const overdue=t=>t.due&&t.due<today()&&t.status!=='Done',count=s=>db.tasks.filter(t=>t.status===s).length,pct=(a,b)=>b?Math.round(a/b*100):0;
const options=(arr,v)=>arr.map(x=>`<option value="${esc(x)}" ${x===v?'selected':''}>${esc(tr(x))}</option>`).join('');
const assignedIds=t=>Array.isArray(t.assignees)?[...new Set(t.assignees.filter(Boolean))]:(t.assignee?[t.assignee]:[]);
const assignedNames=t=>assignedIds(t).map(who).join(', ')||tr('Unassigned');
const isAssigned=(t,id)=>assignedIds(t).includes(id);
const workerChoices=t=>db.employees.length?`<div style="display:grid;gap:10px">`+db.employees.map(e=>`<label style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:400"><input type="checkbox" name="assignees" value="${esc(e.id)}" ${isAssigned(t,e.id)?'checked':''} style="width:auto">${esc(e.name)}</label>`).join('')+`</div><p class="muted">${tr("Select one or more workers. Leave all unchecked for unassigned.")}</p>`:`<p class="muted">${tr("Add workers in Team first, then select them here.")}</p>`;
const durationText=milliseconds=>{const seconds=Math.max(0,Math.floor(milliseconds/1000)),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),sec=seconds%60;return (h?h+' h ':'')+(m||h?m+' min ':'')+sec+' s';};
const taskTimestamp=value=>value?new Date(value).toLocaleString(language==='es'?'es':'en',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}):'—';
const taskElapsed=(t,now=Date.now())=>Math.max(0,(t.finished_at?Date.parse(t.finished_at):t.paused_at?Date.parse(t.paused_at):now)-Date.parse(t.started_at)-Number(t.total_pause_seconds||0)*1000);
function taskTiming(t){
 if(!t.started_at)return `<div class="muted" style="margin-top:10px">${tr('Time not recorded')}</div>`;
 return `<div class="muted" style="margin-top:10px;line-height:1.7"><div>${tr('Started')}: ${esc(taskTimestamp(t.started_at))}</div><div>${tr('Finished')}: ${esc(taskTimestamp(t.finished_at))}</div>${t.paused_at?`<div>${tr('Paused since')}: ${esc(taskTimestamp(t.paused_at))}</div>`:''}<div><strong>${tr(t.finished_at?'Total time':'Time elapsed')}: <span ${!t.finished_at&&!t.paused_at?`data-elapsed-start="${esc(t.started_at)}" data-pause-seconds="${Number(t.total_pause_seconds||0)}"`:''}>${durationText(taskElapsed(t))}</span></strong></div></div>`;
}
function taskButtons(t){return `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">${t.status!=='Done'&&!t.finished_at?(t.started_at?`${t.paused_at?`<button class="btn secondary" data-resume="${esc(t.id)}">${tr('Resume task')}</button>`:`<button class="btn secondary" data-pause="${esc(t.id)}">${tr('Pause task')}</button>`}<button class="btn" data-finish="${esc(t.id)}">${tr('Finish task')}</button>`:`<button class="btn" data-start="${esc(t.id)}">${tr('Start task')}</button>`):''}<button class="btn secondary" data-edit="${esc(t.id)}">${tr('Edit')}</button></div>`;}
async function changeTaskTiming(id,action,button){
 if(!cloud)return;const run=epoch;button.disabled=true;
 try{const r=await client.rpc('dockflow_task_action',{task_id:id,action});if(r.error)throw r.error;await loadCloud(run);render();}
 catch(err){if(run===epoch){alert(tr('Could not update task: ')+tr(err.message));button.disabled=false;}}
}
function taskHtml(t){return `<div class="task"><div><h3>${esc(t.title)}</h3><div class="muted">${esc(assignedNames(t))} · ${esc(tr(t.category))} · ${tr("Due")} ${fmt(t.due)}</div><span class="pill ${t.priority==='High'?'high':''}">${esc(tr(t.priority))}</span><span class="pill ${t.status==='Done'?'done':t.status==='In Progress'?'progress':''}">${esc(tr(t.paused_at?'Paused':t.status))}</span>${overdue(t)?`<span class="pill overdue">${tr("Overdue")}</span>`:''}${t.attachment?`<div><a class="attach" href="#" data-attachment="${esc(t.id)}">${tr("📎 View attachment")}</a></div>`:''}${taskTiming(t)}</div>${taskButtons(t)}</div>`}function taskList(items){return items.length?items.map(taskHtml).join(''):`<div class="empty">${tr("No tasks found. Create one to get started.")}</div>`}function todaysTasks(){return db.tasks.filter(t=>t.due===today());}
function dashboard(){
 displayedDashboardDay=today();
 const tasks=todaysTasks(),done=tasks.filter(t=>t.status==='Done').length;
 const cards=db.employees.map(e=>({name:e.name,tasks:tasks.filter(t=>isAssigned(t,e.id))}));
 const known=new Set(db.employees.map(e=>e.id));const unassigned=tasks.filter(t=>!assignedIds(t).some(id=>known.has(id)));
 if(unassigned.length)cards.push({name:tr('Unassigned'),tasks:unassigned});
 const stats=[['Today’s tasks',tasks.length],['In progress',tasks.filter(t=>t.status==='In Progress'&&!t.paused_at).length],['Paused',tasks.filter(t=>t.paused_at&&!t.finished_at).length],['Completed',done]];
 return `<p class="muted" style="margin-bottom:18px">${tr('Tasks due today')} · ${esc(new Date().toLocaleDateString(language==='es'?'es':'en',{weekday:'long',month:'long',day:'numeric',year:'numeric'}))}</p><div class="stats">${stats.map(([label,value])=>`<div class="stat"><label>${tr(label)}</label><strong>${value}</strong></div>`).join('')}</div><p class="muted">${tr('Shared tasks appear under each assigned worker.')}</p><div class="worker-board">${cards.map(card=>`<section class="panel worker-card"><div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px"><h2 style="margin:0">${esc(card.name)}</h2><span class="pill">${card.tasks.length} ${tr('tasks today')}</span></div>${card.tasks.length?taskList([...card.tasks].sort((a,b)=>(a.status==='Done')-(b.status==='Done'))):`<div class="empty">${tr('No tasks due today.')}</div>`}</section>`).join('')||`<section class="panel"><div class="empty">${tr('No tasks due today.')}</div></section>`}</div><div style="margin-top:20px"><button class="btn secondary" data-goto="tasks">${tr('View all tasks')}</button></div>`;
}
function taskPage(op=false){let items=db.tasks.filter(t=>(!op||t.category!=='General')&&(statusFilter==='all'||t.status===statusFilter)&&(categoryFilter==='all'||t.category===categoryFilter)&&(t.title+' '+t.description+' '+assignedNames(t)).toLowerCase().includes(search.toLowerCase()));return `<section class="panel"><div class="toolbar"><input id="search" placeholder="${tr("Search tasks or employees")}" value="${esc(search)}"><select id="statusFilter"><option value="all">${tr("All statuses")}</option>${options(statuses,statusFilter)}</select><select id="categoryFilter"><option value="all">${tr("All operations")}</option>${options(cats,categoryFilter)}</select></div><div id="taskResults">${taskList(items)}</div></section>`}function teamPage(){return `<section class="panel"><h2>${tr("Employees and teams")}</h2>${db.employees.map(e=>`<div class="employee"><span>${esc(e.name)} <span class="muted">(${db.tasks.filter(t=>isAssigned(t,e.id)&&t.status!=='Done').length} ${tr("open")})</span></span><button class="btn secondary" data-employee="${esc(e.id)}">${tr("Edit")}</button></div>`).join('')}<div style="margin-top:20px"><button class="btn" id="addEmployee">${tr("+ Add employee")}</button></div><p class="muted">${tr("Employees are assignment labels. In shared mode, each person also needs their own login.")}</p></section>`}function reportPage(){return `<div class="grid"><section class="panel"><h2>${tr("Status breakdown")}</h2>${statuses.map(s=>`<div class="reportrow"><span>${tr(s)}</span><strong>${count(s)}</strong></div>`).join('')}<button class="btn secondary" style="margin-top:20px" id="exportCsv">${tr("Export tasks CSV")}</button></section><section class="panel"><h2>${tr("Employee workload")}</h2>${db.employees.map(e=>`<div class="reportrow"><span>${esc(e.name)}</span><strong>${db.tasks.filter(t=>isAssigned(t,e.id)&&t.status!=='Done').length} ${tr("open")}</strong></div>`).join('')}</section></div>`}function settingsPage(){return `<section class="panel" style="max-width:680px"><h2>${tr("Warehouse account")}</h2><p>${tr("Signed in as")} ${esc(user?.email)}</p><p class="muted">${tr("Only approved employees can access this warehouse. Contact your warehouse manager for account access.")}</p><div class="actions" style="justify-content:flex-start"><button class="btn secondary" id="refreshCloud">${tr("Refresh shared data")}</button><button class="btn secondary" id="logout">${tr("Sign out")}</button></div></section>`}
function render(){applyLanguage();if(recoveryMode){renderPasswordReset();return;}if(!cloud){renderLogin();return;}document.querySelectorAll('.nav').forEach(n=>{n.disabled=false;n.classList.toggle('active',n.dataset.view===view)});let titles={dashboard:['Warehouse overview','Today’s tasks'],tasks:['Task management','All tasks'],operations:['Warehouse workflow','Operations'],team:['People & assignments','Team'],reports:['Insights & activity','Reports'],settings:['Workspace configuration','Settings']};$('#subtitle').textContent=tr(titles[view][0]);$('#pageTitle').textContent=tr(titles[view][1]);$('#content').innerHTML=({dashboard:dashboard,tasks:()=>taskPage(false),operations:()=>taskPage(true),team:teamPage,reports:reportPage,settings:settingsPage})[view]();$('#modeLabel').textContent=tr('Shared warehouse');$('#notice').classList.toggle('hidden',cloud);$('#newTask').classList.toggle('hidden',view==='settings');}function openModal(title,body,actions=''){ $('#modalHost').innerHTML=`<div class="modalwrap"><div class="modal"><div class="modalhead"><h2>${esc(tr(title))}</h2><button class="btn secondary" id="closeModal">✕</button></div>${body}${actions}</div></div>`}function closeModal(){$('#modalHost').innerHTML=''}function taskModal(id){let t=db.tasks.find(x=>x.id===id)||{title:'',description:'',category:'Receiving',status:'To Do',priority:'Medium',assignee:'',due:view==='dashboard'?today():'',attachment:''};openModal(id?'Edit task':'Create task',`<form id="taskForm"><div class="field"><label>${tr("Task title *")}</label><input name="title" required maxlength="120" value="${esc(t.title)}" placeholder="${tr("e.g. Receive pallet shipment")}"></div><div class="formgrid"><div class="field"><label>${tr("Operation")}</label><select name="category">${options(cats,t.category)}</select></div><div class="field"><fieldset style="border:0;padding:0;margin:0"><legend style="font-size:12px;font-weight:750;color:#50677e;margin-bottom:10px">${tr("Assign workers")}</legend>${workerChoices(t)}</fieldset></div><div class="field"><label>${tr("Status")}</label><select name="status">${options(statuses,t.status)}</select></div><div class="field"><label>${tr("Priority")}</label><select name="priority">${options(['Low','Medium','High'],t.priority)}</select></div><div class="field"><label>${tr("Due date")}</label><input type="date" name="due" value="${esc(t.due)}"></div></div><div class="field"><label>${tr("Instructions / notes")}</label><textarea name="description">${esc(t.description)}</textarea></div><div class="field"><label>${tr("Photo or attachment (up to 5 MB)")}</label><input type="file" name="file" accept="image/*,.pdf"><p class="muted">${t.attachment?tr('Existing attachment is kept unless replaced.'):''} ${tr("Cloud uploads require storage setup.")}</p></div><div class="actions">${id?`<button type="button" class="btn danger" id="deleteTask">${tr("Delete")}</button>`:''}<button type="button" class="btn secondary" id="cancelModal">${tr("Cancel")}</button><button class="btn" type="submit">${tr("Save task")}</button></div></form>`);$('#taskForm').onsubmit=async e=>{
 e.preventDefault();if(!cloud)return;
 const run=epoch,f=new FormData(e.target),file=f.get('file'),button=e.target.querySelector('[type="submit"]');button.disabled=true;
 let attachment=t.attachment,uploaded='',written=false;
 try{
  if(file&&file.size){
   if(file.size>5e6)throw Error(tr('Maximum attachment size is 5 MB'));
   if(!['application/pdf','image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'].includes(file.type))throw Error(tr('Choose a photo or PDF file.'));
   uploaded=`${user.id}/${uid()}/${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
   const r=await client.storage.from('dockflow-attachments').upload(uploaded,file,{contentType:file.type});if(r.error)throw r.error;attachment=uploaded;
  }
  if(run!==epoch)throw Error(tr('Your session changed. Please sign in again.'));
  const obj={id:id||uid(),title:String(f.get('title')).trim(),description:String(f.get('description')),category:f.get('category'),assignee:f.getAll('assignees')[0]||'',assignees:[...new Set(f.getAll('assignees'))],status:f.get('status'),priority:f.get('priority'),due:f.get('due'),attachment};
  if(!obj.title)throw Error(tr('Enter a task title.'));
  const r=await client.from('dockflow_tasks').upsert(obj).select('id').single();if(r.error)throw r.error;written=true;
  if(uploaded&&t.attachment)await client.storage.from('dockflow-attachments').remove([t.attachment]);
  await loadCloud(run);closeModal();render();
 }catch(err){if(uploaded&&!written)await client.storage.from('dockflow-attachments').remove([uploaded]);alert(tr('Could not save task: ')+tr(err.message));button.disabled=false;}
};
if(id)$('#deleteTask').onclick=async()=>{
 if(!cloud||!confirm(tr('Delete this task?')))return;const run=epoch;
 try{const r=await client.from('dockflow_tasks').delete().eq('id',id).select('id');if(r.error)throw r.error;if(!r.data.length)throw Error(tr('Task was already removed or access changed.'));if(t.attachment)await client.storage.from('dockflow-attachments').remove([t.attachment]);await loadCloud(run);closeModal();render();}catch(err){alert(tr(err.message));}
};}
function employeeModal(id){let e=db.employees.find(x=>x.id===id)||{name:''};openModal(id?'Edit employee':'Add employee',`<form id="employeeForm"><div class="field"><label>${tr("Employee / team name")}</label><input name="name" required maxlength="80" value="${esc(e.name)}"></div><div class="actions"><button type="button" class="btn secondary" id="cancelModal">${tr("Cancel")}</button><button class="btn">${tr("Save")}</button></div></form>`);$('#employeeForm').onsubmit=async ev=>{ev.preventDefault();if(!cloud)return;const run=epoch,obj={id:id||uid(),name:ev.target.elements.name.value.trim()};if(!obj.name)return;const button=ev.target.querySelector('button.btn:not([type="button"])');button.disabled=true;try{const r=await client.from('dockflow_employees').upsert(obj).select('id').single();if(r.error)throw r.error;await loadCloud(run);closeModal();render();}catch(err){alert(tr(err.message));button.disabled=false;}};}
function download(name,contents,type){let a=document.createElement('a'),u=URL.createObjectURL(new Blob([contents],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)}function exportCsv(){let fields=['title','category','status','priority','assignee','due','description','attachment','started_at','finished_at','duration_seconds'],rows=[fields.join(','),...db.tasks.map(t=>fields.map(k=>'"'+String(k==='assignee'?assignedNames(t):k==='duration_seconds'?(t.started_at&&t.finished_at?Math.floor(taskElapsed(t)/1000):''):t[k]??'').replace(/^[=+@\-\t\r]/,m=>"'"+m).replaceAll('"','""')+'"').join(','))];download('warehouse-tasks.csv',rows.join('\r\n'),'text/csv')}
async function loadCloud(expected=epoch){
 const sessionUser=user;
 if(!sessionUser)throw Error(tr('Please sign in.'));
 const member=await client.from('dockflow_members').select('user_id').eq('user_id',sessionUser.id).maybeSingle();
 if(member.error)throw member.error;
 if(!member.data)throw Error(tr('Your account has not been approved for this warehouse. Contact your manager.'));
 const [a,b]=await Promise.all([client.from('dockflow_tasks').select('*').order('created_at',{ascending:false}),client.from('dockflow_employees').select('*').order('name')]);
 if(a.error||b.error)throw(a.error||b.error);
 if(expected!==epoch||user?.id!==sessionUser.id)throw Error(tr('Your session changed. Please sign in again.'));
 db={tasks:a.data,employees:b.data};
}
function clearWorkspace(){epoch++;cloud=false;user=null;db={tasks:[],employees:[]};closeModal();render();}
async function startCloud(){
 const run=++epoch;cloud=false;user=null;db={tasks:[],employees:[]};recoveryReady=false;loading=true;authError='';closeModal();render();
 try{
  const {data,error}=await client.auth.getSession();if(error)throw error;if(run!==epoch)return;
  if(recoveryMode){recoveryReady=Boolean(data.session);user=data.session?.user||null;if(!recoveryReady)authError=tr('This reset link has expired or is invalid. Request a new link.');return;}
  if(data.session){user=data.session.user;await loadCloud(run);if(run!==epoch)return;cloud=true;}
 }catch(err){if(run!==epoch)return;user=null;db={tasks:[],employees:[]};authError=tr(err.message);}
 finally{if(run===epoch){loading=false;render();}}
}
function renderLogin(){
 document.querySelectorAll('.nav').forEach(n=>n.disabled=true);
 $('#newTask').classList.add('hidden');$('#notice').classList.add('hidden');$('#modeLabel').textContent=tr('Employee sign-in');
 $('#subtitle').textContent=tr('Warehouse workspace');$('#pageTitle').textContent=tr('Welcome to DockFlow');
 $('#content').innerHTML=`<section class="panel login"><h2>${tr("Employee sign-in")}</h2><p>${tr("Sign in with the account approved by your warehouse manager.")}</p>${loading?`<p role="status">${tr("Connecting to your warehouse…")}</p>`:`<form id="loginForm"><div class="field"><label for="loginEmail">${tr("Email")}</label><input id="loginEmail" type="email" name="email" autocomplete="username" required></div><div class="field"><label for="loginPassword">${tr("Password")}</label><input id="loginPassword" type="password" name="password" autocomplete="current-password" required></div><button class="btn" type="submit">${tr("Sign in")}</button><button class="btn secondary" type="button" id="forgotPassword" style="margin-left:8px">${tr("Forgot password?")}</button></form>`}<p id="authMsg" role="alert">${esc(authError)}</p>${!loading?`<p class="muted">${tr("Need an account? Contact your warehouse manager.")}</p>`:''}</section>`;
 if(!loading)$('#forgotPassword').onclick=()=>showForgotPassword();
 if(!loading)$('#loginForm').onsubmit=async e=>{
  e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;$('#authMsg').textContent=tr('Signing in…');
  const f=new FormData(e.target);
  try{const r=await client.auth.signInWithPassword({email:String(f.get('email')).trim(),password:f.get('password')});if(r.error)throw r.error;await startCloud();}
  catch(err){const msg=$('#authMsg');if(msg)msg.textContent=tr(err.message);button.disabled=false;}
 };
}
function showForgotPassword(){
 const email=$('#loginEmail')?.value||'';
 $('#content').innerHTML=`<section class="panel login"><h2>${tr("Reset your password")}</h2><p>${tr("Enter your employee email. We will email you a link to choose a new password.")}</p><form id="forgotForm"><div class="field"><label for="resetEmail">${tr("Email")}</label><input id="resetEmail" type="email" name="email" autocomplete="username" required value="${esc(email)}"></div><button class="btn" type="submit">${tr("Send reset link")}</button><button class="btn secondary" type="button" id="backToLogin" style="margin-left:8px">${tr("Back to sign in")}</button></form><p id="resetMsg" role="status"></p></section>`;
 $('#backToLogin').onclick=()=>{authError='';render();};
 $('#forgotForm').onsubmit=async e=>{
  e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;const email=String(new FormData(e.target).get('email')).trim();
  try{
   const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:'https://operationskpz.github.io/dockflow-warehouse-app/?reset=1'});
   if(error)throw error;
   $('#resetMsg').textContent=tr('If this email has an account, a reset link has been sent. Check your inbox and spam folder. Open the newest link to choose a new password.');
  }catch(err){$('#resetMsg').textContent=tr('Could not send the reset link: ')+tr(err.message);button.disabled=false;}
 };
}
function renderPasswordReset(){
 document.querySelectorAll('.nav').forEach(n=>n.disabled=true);
 $('#newTask').classList.add('hidden');$('#notice').classList.add('hidden');$('#modeLabel').textContent=tr('Password reset');
 $('#subtitle').textContent=tr('Warehouse account');$('#pageTitle').textContent=tr('Choose a new password');
 $('#content').innerHTML=`<section class="panel login"><h2>${tr("Reset your password")}</h2>${loading?`<p role="status">${tr("Checking your reset link…")}</p>`:recoveryReady?`<p>${tr("Set a new password for")} ${esc(user?.email)}.</p><form id="passwordForm"><div class="field"><label for="newPassword">${tr("New password (at least 12 characters)")}</label><input id="newPassword" type="password" name="password" autocomplete="new-password" minlength="12" required></div><div class="field"><label for="confirmPassword">${tr("Confirm new password")}</label><input id="confirmPassword" type="password" name="confirm" autocomplete="new-password" minlength="12" required></div><button class="btn" type="submit">${tr("Save new password")}</button></form>`:''}<p id="passwordMsg" role="alert">${esc(authError)}</p>${!loading&&!recoveryReady?`<button class="btn secondary" id="retryReset" type="button">${tr("Request a new link")}</button>`:''}</section>`;
 if(!loading&&!recoveryReady)$('#retryReset').onclick=()=>{recoveryMode=false;authError='';render();showForgotPassword();};
 if(!loading&&recoveryReady)$('#passwordForm').onsubmit=async e=>{
  e.preventDefault();const f=new FormData(e.target),password=String(f.get('password')),confirm=String(f.get('confirm')),msg=$('#passwordMsg');
  if(password.length<12){msg.textContent=tr('Use at least 12 characters.');return;}
  if(password!==confirm){msg.textContent=tr('The passwords do not match.');return;}
  const button=e.target.querySelector('button');button.disabled=true;msg.textContent=tr('Saving your password…');
  try{
   const {error}=await client.auth.updateUser({password});if(error)throw error;
   e.target.reset();recoveryReady=false;
   const result=await client.auth.signOut({scope:'global'});
   recoveryMode=false;loading=false;clearWorkspace();
   if(typeof history!=='undefined')history.replaceState(null,'','./');
   authError=tr(result.error?'Password saved. Please sign in with your new password. Other sessions could not be signed out.':'Password saved. Sign in with your new password.');render();
  }catch(err){msg.textContent=tr('Could not reset your password: ')+tr(err.message);button.disabled=false;}
 };
}
async function signOut(){
 clearWorkspace();loading=true;render();
 const {error}=await client.auth.signOut({scope:'local'});
 loading=false;authError=error?tr('Could not finish sign-out. Retry when your connection returns.'):'';render();
}
async function openAttachment(id){
 const task=db.tasks.find(t=>t.id===id);if(!cloud||!task?.attachment)return;
 const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;
 const run=epoch;
 try{const r=await client.storage.from('dockflow-attachments').createSignedUrl(task.attachment,60);if(r.error)throw r.error;if(run!==epoch){tab?.close();return;}if(tab)tab.location.replace(r.data.signedUrl);else alert(tr('Allow pop-ups for DockFlow to view attachments.'));}
 catch(err){tab?.close();alert(tr('Could not open attachment: ')+tr(err.message));}
}
document.addEventListener('click',async e=>{
 const attachment=e.target.closest('[data-attachment]');if(attachment){e.preventDefault();await openAttachment(attachment.dataset.attachment);return;}
 const b=e.target.closest('button');if(!b||!cloud)return;
 if(b.dataset.view){view=b.dataset.view;render();}
 else if(b.dataset.goto){view=b.dataset.goto;render();}
 else if(b.dataset.start)await changeTaskTiming(b.dataset.start,'start',b);
 else if(b.dataset.pause)await changeTaskTiming(b.dataset.pause,'pause',b);
 else if(b.dataset.resume)await changeTaskTiming(b.dataset.resume,'resume',b);
 else if(b.dataset.finish)await changeTaskTiming(b.dataset.finish,'finish',b);
 else if(b.id==='newTask')taskModal();
 else if(b.dataset.edit)taskModal(b.dataset.edit);
 else if(b.dataset.employee)employeeModal(b.dataset.employee);
 else if(b.id==='addEmployee')employeeModal();
 else if(['closeModal','cancelModal'].includes(b.id))closeModal();
 else if(b.id==='exportCsv')exportCsv();
 else if(b.id==='refreshCloud'){try{await loadCloud();render();}catch(err){authError=tr(err.message);clearWorkspace();}}
 else if(b.id==='logout')await signOut();
});
document.addEventListener('input',e=>{if(cloud&&e.target.id==='search'){search=e.target.value;$('#taskResults').innerHTML=taskList(db.tasks.filter(t=>(view!=='operations'||t.category!=='General')&&(statusFilter==='all'||t.status===statusFilter)&&(categoryFilter==='all'||t.category===categoryFilter)&&(t.title+' '+t.description+' '+assignedNames(t)).toLowerCase().includes(search.toLowerCase())));}});
document.addEventListener('change',e=>{if(e.target.id==='languageSelect'){setLanguage(e.target.value);render();return;}if(cloud&&(e.target.id==='statusFilter'||e.target.id==='categoryFilter')){statusFilter=$('#statusFilter').value;categoryFilter=$('#categoryFilter').value;render();}});
if(window.supabase){
 client=window.supabase.createClient(config.url,config.key);
 client.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'){recoveryMode=true;setTimeout(()=>startCloud(),0);}else if(event==='SIGNED_OUT'){recoveryReady=false;loading=false;clearWorkspace();}else if(event==='TOKEN_REFRESHED'||event==='SIGNED_IN'){setTimeout(()=>startCloud(),0);}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)startCloud();});
 startCloud();
}else{loading=false;authError=tr('DockFlow could not load. Please refresh the page.');render();}
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

if(typeof setInterval==='function')setInterval(()=>{if(!cloud||document.hidden)return;if(view==='dashboard'&&displayedDashboardDay!==today()&&!$('#modalHost').innerHTML)render();document.querySelectorAll('[data-elapsed-start]').forEach(el=>{el.textContent=durationText(Date.now()-Date.parse(el.dataset.elapsedStart)-Number(el.dataset.pauseSeconds||0)*1000);});},1000);
