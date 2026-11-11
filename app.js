'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const config={url:'https://xuejfaaovxlqfckkdjyq.supabase.co',key:'sb_publishable_oDReXHUZkwPWRUue-wxd9A_Ee4rc1gg'};
let client=null,user=null,cloud=false,view='dashboard',search='',statusFilter='all',categoryFilter='all',db={employees:[],tasks:[]},epoch=0,authError='',loading=true;
const cats=['Receiving','Shipping','FBA','Inventory','General'],statuses=['To Do','In Progress','Blocked','Done'];
const uid=()=>crypto.randomUUID(),who=id=>db.employees.find(e=>e.id===id)?.name||'Unassigned';
const today=()=>new Date().toLocaleDateString('en-CA');
const fmt=d=>d?new Date(d+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric'}):'No deadline';
const overdue=t=>t.due&&t.due<today()&&t.status!=='Done',count=s=>db.tasks.filter(t=>t.status===s).length,pct=(a,b)=>b?Math.round(a/b*100):0;
const options=(arr,v)=>arr.map(x=>`<option value="${esc(x)}" ${x===v?'selected':''}>${esc(x)}</option>`).join('');
const employees=v=>`<option value="">Unassigned</option>`+db.employees.map(e=>`<option value="${esc(e.id)}" ${e.id===v?'selected':''}>${esc(e.name)}</option>`).join('');
function taskHtml(t){return `<div class="task"><div><h3>${esc(t.title)}</h3><div class="muted">${esc(who(t.assignee))} · ${esc(t.category)} · Due ${fmt(t.due)}</div><span class="pill ${t.priority==='High'?'high':''}">${esc(t.priority)}</span><span class="pill ${t.status==='Done'?'done':t.status==='In Progress'?'progress':''}">${esc(t.status)}</span>${overdue(t)?'<span class="pill overdue">Overdue</span>':''}${t.attachment?`<div><a class="attach" href="#" data-attachment="${esc(t.id)}">📎 View attachment</a></div>`:''}</div><button class="btn secondary" data-edit="${esc(t.id)}">Edit</button></div>`}function taskList(items){return items.length?items.map(taskHtml).join(''):'<div class="empty">No tasks found. Create one to get started.</div>'}function dashboard(){let done=count('Done'),all=db.tasks.length;return `<div class="stats">${[['Total tasks',all,'All warehouse work'],['In progress',count('In Progress'),'Currently active'],['Completed',done,pct(done,all)+'% completion'],['Overdue',db.tasks.filter(overdue).length,'Need attention']].map(([a,b,c])=>`<div class="stat"><label>${a}</label><strong>${b}</strong><small>${c}</small></div>`).join('')}</div><div class="grid"><section class="panel"><h2>Recent tasks</h2>${taskList([...db.tasks].sort((a,b)=>(a.status==='Done')-(b.status==='Done')).slice(0,6))}<button class="btn secondary" data-goto="tasks">View all tasks</button></section><section class="panel"><h2>Work by operation</h2>${cats.map(c=>{let n=db.tasks.filter(t=>t.category===c).length;return `<div class="barline"><div class="barlabel"><span>${c}</span><b>${n}</b></div><div class="track"><div class="fill" style="width:${pct(n,all)}%"></div></div></div>`}).join('')}<h2 style="margin-top:28px">Task completion</h2><strong style="font-size:30px">${pct(done,all)}%</strong><div class="track"><div class="fill" style="width:${pct(done,all)}%"></div></div></section></div>`}function taskPage(op=false){let items=db.tasks.filter(t=>(!op||t.category!=='General')&&(statusFilter==='all'||t.status===statusFilter)&&(categoryFilter==='all'||t.category===categoryFilter)&&(t.title+' '+t.description+' '+who(t.assignee)).toLowerCase().includes(search.toLowerCase()));return `<section class="panel"><div class="toolbar"><input id="search" placeholder="Search tasks or employees" value="${esc(search)}"><select id="statusFilter"><option value="all">All statuses</option>${options(statuses,statusFilter)}</select><select id="categoryFilter"><option value="all">All operations</option>${options(cats,categoryFilter)}</select></div><div id="taskResults">${taskList(items)}</div></section>`}function teamPage(){return `<section class="panel"><h2>Employees and teams</h2>${db.employees.map(e=>`<div class="employee"><span>${esc(e.name)} <span class="muted">(${db.tasks.filter(t=>t.assignee===e.id&&t.status!=='Done').length} open)</span></span><button class="btn secondary" data-employee="${esc(e.id)}">Edit</button></div>`).join('')}<div style="margin-top:20px"><button class="btn" id="addEmployee">+ Add employee</button></div><p class="muted">Employees are assignment labels. In shared mode, each person also needs their own login.</p></section>`}function reportPage(){return `<div class="grid"><section class="panel"><h2>Status breakdown</h2>${statuses.map(s=>`<div class="reportrow"><span>${s}</span><strong>${count(s)}</strong></div>`).join('')}<button class="btn secondary" style="margin-top:20px" id="exportCsv">Export tasks CSV</button></section><section class="panel"><h2>Employee workload</h2>${db.employees.map(e=>`<div class="reportrow"><span>${esc(e.name)}</span><strong>${db.tasks.filter(t=>t.assignee===e.id&&t.status!=='Done').length} open</strong></div>`).join('')}</section></div>`}function settingsPage(){return `<section class="panel" style="max-width:680px"><h2>Warehouse account</h2><p>Signed in as ${esc(user?.email)}</p><p class="muted">Only approved employees can access this warehouse. Contact your warehouse manager for account access.</p><div class="actions" style="justify-content:flex-start"><button class="btn secondary" id="refreshCloud">Refresh shared data</button><button class="btn secondary" id="logout">Sign out</button></div></section>`}
function render(){if(!cloud){renderLogin();return;}document.querySelectorAll('.nav').forEach(n=>{n.disabled=false;n.classList.toggle('active',n.dataset.view===view)});let titles={dashboard:['Warehouse overview','Good morning, team'],tasks:['Task management','All tasks'],operations:['Warehouse workflow','Operations'],team:['People & assignments','Team'],reports:['Insights & activity','Reports'],settings:['Workspace configuration','Settings']};$('#subtitle').textContent=titles[view][0];$('#pageTitle').textContent=titles[view][1];$('#content').innerHTML=({dashboard:dashboard,tasks:()=>taskPage(false),operations:()=>taskPage(true),team:teamPage,reports:reportPage,settings:settingsPage})[view]();$('#modeLabel').textContent='Shared warehouse';$('#notice').classList.toggle('hidden',cloud);$('#newTask').classList.toggle('hidden',view==='settings');}function openModal(title,body,actions=''){ $('#modalHost').innerHTML=`<div class="modalwrap"><div class="modal"><div class="modalhead"><h2>${esc(title)}</h2><button class="btn secondary" id="closeModal">✕</button></div>${body}${actions}</div></div>`}function closeModal(){$('#modalHost').innerHTML=''}function taskModal(id){let t=db.tasks.find(x=>x.id===id)||{title:'',description:'',category:'Receiving',status:'To Do',priority:'Medium',assignee:'',due:'',attachment:''};openModal(id?'Edit task':'Create task',`<form id="taskForm"><div class="field"><label>Task title *</label><input name="title" required maxlength="120" value="${esc(t.title)}" placeholder="e.g. Receive pallet shipment"></div><div class="formgrid"><div class="field"><label>Operation</label><select name="category">${options(cats,t.category)}</select></div><div class="field"><label>Assign to</label><select name="assignee">${employees(t.assignee)}</select></div><div class="field"><label>Status</label><select name="status">${options(statuses,t.status)}</select></div><div class="field"><label>Priority</label><select name="priority">${options(['Low','Medium','High'],t.priority)}</select></div><div class="field"><label>Due date</label><input type="date" name="due" value="${esc(t.due)}"></div></div><div class="field"><label>Instructions / notes</label><textarea name="description">${esc(t.description)}</textarea></div><div class="field"><label>Photo or attachment (up to 5 MB)</label><input type="file" name="file" accept="image/*,.pdf"><p class="muted">${t.attachment?'Existing attachment is kept unless replaced.':''} Cloud uploads require storage setup.</p></div><div class="actions">${id?'<button type="button" class="btn danger" id="deleteTask">Delete</button>':''}<button type="button" class="btn secondary" id="cancelModal">Cancel</button><button class="btn" type="submit">Save task</button></div></form>`);$('#taskForm').onsubmit=async e=>{
 e.preventDefault();if(!cloud)return;
 const run=epoch,f=new FormData(e.target),file=f.get('file'),button=e.target.querySelector('[type="submit"]');button.disabled=true;
 let attachment=t.attachment,uploaded='',written=false;
 try{
  if(file&&file.size){
   if(file.size>5e6)throw Error('Maximum attachment size is 5 MB');
   if(!['application/pdf','image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'].includes(file.type))throw Error('Choose a photo or PDF file.');
   uploaded=`${user.id}/${uid()}/${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
   const r=await client.storage.from('dockflow-attachments').upload(uploaded,file,{contentType:file.type});if(r.error)throw r.error;attachment=uploaded;
  }
  if(run!==epoch)throw Error('Your session changed. Please sign in again.');
  const obj={id:id||uid(),title:String(f.get('title')).trim(),description:String(f.get('description')),category:f.get('category'),assignee:f.get('assignee'),status:f.get('status'),priority:f.get('priority'),due:f.get('due'),attachment};
  if(!obj.title)throw Error('Enter a task title.');
  const r=await client.from('dockflow_tasks').upsert(obj).select('id').single();if(r.error)throw r.error;written=true;
  if(uploaded&&t.attachment)await client.storage.from('dockflow-attachments').remove([t.attachment]);
  await loadCloud(run);closeModal();render();
 }catch(err){if(uploaded&&!written)await client.storage.from('dockflow-attachments').remove([uploaded]);alert('Could not save task: '+err.message);button.disabled=false;}
};
if(id)$('#deleteTask').onclick=async()=>{
 if(!cloud||!confirm('Delete this task?'))return;const run=epoch;
 try{const r=await client.from('dockflow_tasks').delete().eq('id',id).select('id');if(r.error)throw r.error;if(!r.data.length)throw Error('Task was already removed or access changed.');if(t.attachment)await client.storage.from('dockflow-attachments').remove([t.attachment]);await loadCloud(run);closeModal();render();}catch(err){alert(err.message);}
};}
function employeeModal(id){let e=db.employees.find(x=>x.id===id)||{name:''};openModal(id?'Edit employee':'Add employee',`<form id="employeeForm"><div class="field"><label>Employee / team name</label><input name="name" required maxlength="80" value="${esc(e.name)}"></div><div class="actions"><button type="button" class="btn secondary" id="cancelModal">Cancel</button><button class="btn">Save</button></div></form>`);$('#employeeForm').onsubmit=async ev=>{ev.preventDefault();if(!cloud)return;const run=epoch,obj={id:id||uid(),name:ev.target.elements.name.value.trim()};if(!obj.name)return;const button=ev.target.querySelector('button.btn:not([type="button"])');button.disabled=true;try{const r=await client.from('dockflow_employees').upsert(obj).select('id').single();if(r.error)throw r.error;await loadCloud(run);closeModal();render();}catch(err){alert(err.message);button.disabled=false;}};}
function download(name,contents,type){let a=document.createElement('a'),u=URL.createObjectURL(new Blob([contents],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)}function exportCsv(){let fields=['title','category','status','priority','assignee','due','description','attachment'],rows=[fields.join(','),...db.tasks.map(t=>fields.map(k=>'"'+String(k==='assignee'?who(t[k]):t[k]??'').replace(/^[=+@\-\t\r]/,m=>"'"+m).replaceAll('"','""')+'"').join(','))];download('warehouse-tasks.csv',rows.join('\r\n'),'text/csv')}
async function loadCloud(expected=epoch){
 const sessionUser=user;
 if(!sessionUser)throw Error('Please sign in.');
 const member=await client.from('dockflow_members').select('user_id').eq('user_id',sessionUser.id).maybeSingle();
 if(member.error)throw member.error;
 if(!member.data)throw Error('Your account has not been approved for this warehouse. Contact your manager.');
 const [a,b]=await Promise.all([client.from('dockflow_tasks').select('*').order('created_at',{ascending:false}),client.from('dockflow_employees').select('*').order('name')]);
 if(a.error||b.error)throw(a.error||b.error);
 if(expected!==epoch||user?.id!==sessionUser.id)throw Error('Your session changed. Please sign in again.');
 db={tasks:a.data,employees:b.data};
}
function clearWorkspace(){epoch++;cloud=false;user=null;db={tasks:[],employees:[]};closeModal();render();}
async function startCloud(){
 const run=++epoch;cloud=false;user=null;db={tasks:[],employees:[]};loading=true;authError='';closeModal();render();
 try{
  const {data,error}=await client.auth.getSession();if(error)throw error;if(run!==epoch)return;
  if(data.session){user=data.session.user;await loadCloud(run);if(run!==epoch)return;cloud=true;}
 }catch(err){if(run!==epoch)return;user=null;db={tasks:[],employees:[]};authError=err.message;}
 finally{if(run===epoch){loading=false;render();}}
}
function renderLogin(){
 document.querySelectorAll('.nav').forEach(n=>n.disabled=true);
 $('#newTask').classList.add('hidden');$('#notice').classList.add('hidden');$('#modeLabel').textContent='Employee sign-in';
 $('#subtitle').textContent='Warehouse workspace';$('#pageTitle').textContent='Welcome to DockFlow';
 $('#content').innerHTML=`<section class="panel login"><h2>Employee sign-in</h2><p>Sign in with the account approved by your warehouse manager.</p>${loading?'<p role="status">Connecting to your warehouse…</p>':`<form id="loginForm"><div class="field"><label for="loginEmail">Email</label><input id="loginEmail" type="email" name="email" autocomplete="username" required></div><div class="field"><label for="loginPassword">Password</label><input id="loginPassword" type="password" name="password" autocomplete="current-password" required></div><button class="btn" type="submit">Sign in</button></form>`}<p id="authMsg" role="alert">${esc(authError)}</p>${!loading?'<p class="muted">Need an account or password reset? Contact your warehouse manager.</p>':''}</section>`;
 if(!loading)$('#loginForm').onsubmit=async e=>{
  e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;$('#authMsg').textContent='Signing in…';
  const f=new FormData(e.target);
  try{const r=await client.auth.signInWithPassword({email:String(f.get('email')).trim(),password:f.get('password')});if(r.error)throw r.error;await startCloud();}
  catch(err){const msg=$('#authMsg');if(msg)msg.textContent=err.message;button.disabled=false;}
 };
}
async function signOut(){
 clearWorkspace();loading=true;render();
 const {error}=await client.auth.signOut({scope:'local'});
 loading=false;authError=error?'Could not finish sign-out. Retry when your connection returns.':'';render();
}
async function openAttachment(id){
 const task=db.tasks.find(t=>t.id===id);if(!cloud||!task?.attachment)return;
 const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;
 const run=epoch;
 try{const r=await client.storage.from('dockflow-attachments').createSignedUrl(task.attachment,60);if(r.error)throw r.error;if(run!==epoch){tab?.close();return;}if(tab)tab.location.replace(r.data.signedUrl);else alert('Allow pop-ups for DockFlow to view attachments.');}
 catch(err){tab?.close();alert('Could not open attachment: '+err.message);}
}
document.addEventListener('click',async e=>{
 const attachment=e.target.closest('[data-attachment]');if(attachment){e.preventDefault();await openAttachment(attachment.dataset.attachment);return;}
 const b=e.target.closest('button');if(!b||!cloud)return;
 if(b.dataset.view){view=b.dataset.view;render();}
 else if(b.dataset.goto){view=b.dataset.goto;render();}
 else if(b.id==='newTask')taskModal();
 else if(b.dataset.edit)taskModal(b.dataset.edit);
 else if(b.dataset.employee)employeeModal(b.dataset.employee);
 else if(b.id==='addEmployee')employeeModal();
 else if(['closeModal','cancelModal'].includes(b.id))closeModal();
 else if(b.id==='exportCsv')exportCsv();
 else if(b.id==='refreshCloud'){try{await loadCloud();render();}catch(err){authError=err.message;clearWorkspace();}}
 else if(b.id==='logout')await signOut();
});
document.addEventListener('input',e=>{if(cloud&&e.target.id==='search'){search=e.target.value;$('#taskResults').innerHTML=taskList(db.tasks.filter(t=>(view!=='operations'||t.category!=='General')&&(statusFilter==='all'||t.status===statusFilter)&&(categoryFilter==='all'||t.category===categoryFilter)&&(t.title+' '+t.description+' '+who(t.assignee)).toLowerCase().includes(search.toLowerCase())));}});
document.addEventListener('change',e=>{if(cloud&&(e.target.id==='statusFilter'||e.target.id==='categoryFilter')){statusFilter=$('#statusFilter').value;categoryFilter=$('#categoryFilter').value;render();}});
if(window.supabase){
 client=window.supabase.createClient(config.url,config.key);
 client.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){loading=false;clearWorkspace();}else if(event==='TOKEN_REFRESHED'||event==='SIGNED_IN'){setTimeout(()=>startCloud(),0);}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)startCloud();});
 startCloud();
}else{loading=false;authError='DockFlow could not load. Please refresh the page.';render();}
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
