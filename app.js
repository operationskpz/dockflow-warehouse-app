'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const config={url:'https://xuejfaaovxlqfckkdjyq.supabase.co',key:'sb_publishable_oDReXHUZkwPWRUue-wxd9A_Ee4rc1gg'};
const appPages={dashboard:'Dashboard',tasks:'Tasks',repeated:'Repeated Tasks',operations:'Operations',team:'Team',reports:'Reports',settings:'Settings'};
function pageFromLocation(){if(typeof location==='undefined')return 'dashboard';const page=new URL(location.href).searchParams.get('page');return Object.hasOwn(appPages,page)?page:'dashboard';}
const pageLink=page=>'?page='+encodeURIComponent(Object.hasOwn(appPages,page)?page:'dashboard');
function setNavigationEnabled(enabled){document.querySelectorAll('.nav').forEach(n=>{n.disabled=!enabled;n.setAttribute('aria-disabled',String(!enabled));n.tabIndex=enabled?0:-1;});}
function syncNavigation(){document.title='DockFlow | '+tr(appPages[view]);document.querySelectorAll('.nav').forEach(n=>{n.classList.toggle('active',n.dataset.view===view);if(n.dataset.view===view)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});}
function navigateTo(page){if(!Object.hasOwn(appPages,page))return;const changed=page!==view;if(changed&&typeof history!=='undefined')history.pushState({page},'',pageLink(page));view=page;closeModal();render();}
let sessionRestore=null,connectionWarning='';
function withTimeout(promise,milliseconds=15000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Object.assign(Error(tr('Connection timed out. Please try again.')),{code:'CONNECTION_TIMEOUT'})),milliseconds);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});}
async function boundedFetch(input,init={},milliseconds=15000){const controller=new AbortController(),signal=init.signal,onAbort=()=>controller.abort();if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',onAbort,{once:true});const timer=setTimeout(()=>controller.abort(),milliseconds);try{return await fetch(input,{...init,signal:controller.signal});}finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}}
function connectionNotice(){const notice=$('#notice');notice.classList.toggle('hidden',!connectionWarning);if(connectionWarning)notice.innerHTML=`${esc(connectionWarning)} <button class="btn secondary" id="retryConnection" type="button">${tr('Retry connection')}</button>`;}
function accessFailure(error){return ['WAREHOUSE_ACCESS_DENIED','42501','PGRST301','PGRST302','PGRST303','bad_jwt','session_not_found','refresh_token_not_found','refresh_token_already_used'].includes(error?.code)||error?.status===401||error?.status===403;}
let client=null,user=null,cloud=false,view=pageFromLocation(),search='',statusFilter='all',categoryFilter='all',db={employees:[],tasks:[],repeated:[]},epoch=0,authError='',loading=true,recoveryMode=typeof location!=='undefined'&&new URL(location.href).searchParams.get('reset')==='1',recoveryReady=false;
let memberRole='employee';
const cats=['Receiving','Shipping','FBA','Inventory','General'],statuses=['To Do','In Progress','Blocked','Done'];
const uid=()=>crypto.randomUUID(),who=id=>db.employees.find(e=>e.id===id)?.name||tr('Unassigned');
const dateKey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today=()=>dateKey(new Date());
const tomorrow=()=>{const d=new Date();d.setDate(d.getDate()+1);return dateKey(d);};
let displayedDashboardDay=today();
let lastTaskSync=0,backgroundTaskSync=false;
const fmt=d=>d?new Date(d+'T12:00:00').toLocaleDateString(language==='es'?'es':'en',{month:'short',day:'numeric'}):tr('No deadline');
const overdue=t=>t.due&&t.due<today()&&t.status!=='Done',count=s=>db.tasks.filter(t=>t.status===s).length,pct=(a,b)=>b?Math.round(a/b*100):0;
const options=(arr,v)=>arr.map(x=>`<option value="${esc(x)}" ${x===v?'selected':''}>${esc(tr(x))}</option>`).join('');
const assignedIds=t=>Array.isArray(t.assignees)?[...new Set(t.assignees.filter(Boolean))]:(t.assignee?[t.assignee]:[]);
const assignedNames=t=>assignedIds(t).map(who).join(', ')||tr('Unassigned');
const isAssigned=(t,id)=>assignedIds(t).includes(id);
const workerChoices=t=>db.employees.length?`<div class="worker-picker">`+db.employees.map(e=>`<label class="worker-option"><input type="checkbox" name="assignees" value="${esc(e.id)}" ${isAssigned(t,e.id)?'checked':''}><span class="picker-avatar" aria-hidden="true">${esc(String(e.name).trim().slice(0,1).toUpperCase())}</span><span>${esc(e.name)}</span></label>`).join('')+`</div><p class="muted picker-help">${tr("Select one or more workers. Leave all unchecked for unassigned.")}</p>`:`<p class="muted">${tr("Add workers in Team first, then select them here.")}</p>`;
const durationText=milliseconds=>{const seconds=Math.max(0,Math.floor(milliseconds/1000)),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),sec=seconds%60;return (h?h+' h ':'')+(m||h?m+' min ':'')+sec+' s';};
const taskTimestamp=value=>value?new Date(value).toLocaleString(language==='es'?'es':'en',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}):'—';
const taskElapsed=(t,now=Date.now())=>Math.max(0,(t.finished_at?Date.parse(t.finished_at):t.paused_at?Date.parse(t.paused_at):now)-Date.parse(t.started_at)-Number(t.total_pause_seconds||0)*1000);
function readEstimatedHours(value){if(value===null||value===undefined||String(value).trim()==='')return null;const hours=Number(value),minutes=Math.round(hours*60);if(!Number.isFinite(hours)||hours<0.01||hours>8760||minutes<1||minutes>525600)throw Error(tr('Enter estimated hours between 0.01 and 8760.'));return minutes;}
function estimateInput(value){const hours=value?Number((Number(value)/60).toFixed(4)):'';return `<div class="field"><label for="estimatedHours">${tr('Estimated time (hours)')}</label><input id="estimatedHours" name="estimated_hours" type="number" inputmode="decimal" min="0.01" max="8760" step="any" placeholder="${tr('e.g. 1.5')}" value="${esc(hours)}"><p class="muted">${tr('Optional. Example: 0.5 = 30 minutes. Rounded to the nearest minute.')}</p><p class="muted">${tr('The countdown stops while the task is paused.')}</p></div>`;}
function estimateState(t,now=Date.now()){
 const budget=Number(t.estimated_minutes)*60000;if(!Number.isFinite(budget)||budget<=0)return null;
 if(!t.started_at)return {label:'Estimate',milliseconds:budget,tone:'estimate-planned'};
 const remaining=budget-taskElapsed(t,now);
 if(remaining<0)return {label:'Over estimate',milliseconds:-remaining,tone:'estimate-over'};
 return {label:t.finished_at?'Under estimate':'Remaining',milliseconds:remaining,tone:t.finished_at?'estimate-done':'estimate-running'};
}
function taskEstimateHtml(t){const state=estimateState(t);if(!state)return '';const live=!!t.started_at&&!t.finished_at&&!t.paused_at;return `<div class="task-estimate ${state.tone}" ${live?`data-estimate-id="${esc(t.id)}"`:''}><span data-remaining-label>${tr(state.label)}</span><strong data-remaining-value>${durationText(state.milliseconds)}</strong></div>`;}
function updateEstimateDisplays(){const lookup=new Map(db.tasks.map(t=>[t.id,t]));document.querySelectorAll('[data-estimate-id]').forEach(el=>{const t=lookup.get(el.dataset.estimateId);if(!t)return;const state=estimateState(t);if(!state)return;el.className='task-estimate '+state.tone;el.querySelector('[data-remaining-label]').textContent=tr(state.label);el.querySelector('[data-remaining-value]').textContent=durationText(state.milliseconds);});}
function carryoverBadge(t){return t.original_due&&Number(t.carryover_count)>0?`<span class="pill carried">${tr('Carried over')}</span>`:'';}
function originalDueHtml(t){if(!t.original_due||!Number(t.carryover_count))return '';const original=new Date(t.original_due+'T12:00:00').toLocaleDateString(language==='es'?'es':'en',{year:'numeric',month:'short',day:'numeric'});return `<div class="muted" style="margin-top:6px">${tr('Original due date')}: ${esc(original)}</div>`;}
function taskTiming(t,showEstimate=true){
 if(!t.started_at)return `${showEstimate?taskEstimateHtml(t):''}${originalDueHtml(t)}<div class="muted" style="margin-top:10px">${tr('Time not recorded')}</div>`;
 return `${showEstimate?taskEstimateHtml(t):''}${originalDueHtml(t)}<div class="muted" style="margin-top:10px;line-height:1.7"><div>${tr('Started')}: ${esc(taskTimestamp(t.started_at))}</div><div>${tr('Finished')}: ${esc(taskTimestamp(t.finished_at))}</div>${t.paused_at?`<div>${tr('Paused since')}: ${esc(taskTimestamp(t.paused_at))}</div>`:''}<div><strong>${tr(t.finished_at?'Total time':'Time elapsed')}: <span ${!t.finished_at&&!t.paused_at?`data-elapsed-start="${esc(t.started_at)}" data-pause-seconds="${Number(t.total_pause_seconds||0)}"`:''}>${durationText(taskElapsed(t))}</span></strong></div></div>`;
}
function uiIcon(name){const paths={search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',filter:'<path d="M4 6h16M7 12h10M10 18h4"/>',tasks:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M8 10l2 2 5-5M8 16h8"/>',play:'<path d="m8 5 11 7-11 7V5z"/>',pause:'<path d="M8 5v14M16 5v14"/>',check:'<path d="m5 12 4 4L19 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',people:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3"/>',edit:'<path d="m15 4 5 5M4 20l4-1L20 7a3 3 0 0 0-4-4L4 15v5z"/>',box:'<path d="m3 7 9-4 9 4v11l-9 4-9-4V7zm0 0 9 4 9-4M12 11v11"/>'};return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.box}</svg>`;}
function warehouseGraphic(){return `<svg class="warehouse-graphic" viewBox="0 0 260 120" fill="none" aria-hidden="true"><path d="M12 104h236" stroke="#7799cf" stroke-width="2"/><path d="m28 48 78-32 78 32v55H28V48z" fill="#e9f1ff" stroke="#acc5ed" stroke-width="2"/><path d="M55 58h50v45H55zM115 58h43v45h-43z" fill="#c6daf7"/><path d="M60 66h39M60 75h39M60 84h39" stroke="#7b9fce" stroke-width="2"/><path d="M116 76h42M136 58v45" stroke="#7b9fce"/><rect x="165" y="72" width="42" height="31" rx="3" fill="#4b7dd0"/><path d="M185 72v12l-5-3-5 3V72" fill="#a9c8ff"/><rect x="208" y="83" width="29" height="20" rx="2" fill="#7ba2de"/><path d="M30 48h155" stroke="#7b9fce" stroke-width="2"/><circle cx="214" cy="34" r="17" fill="#285cce"/><path d="m207 34 5 5 9-10" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;}
function taskButtons(t){return `<div class="task-controls" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">${t.status!=='Done'&&!t.finished_at?(t.started_at?`${t.paused_at?`<button class="btn secondary" data-resume="${esc(t.id)}">${uiIcon('play')}${tr('Resume task')}</button>`:`<button class="btn secondary" data-pause="${esc(t.id)}">${uiIcon('pause')}${tr('Pause task')}</button>`}<button class="btn" data-finish="${esc(t.id)}">${uiIcon('check')}${tr('Finish task')}</button>`:(assignedIds(t).length?`<button class="btn" data-start="${esc(t.id)}">${uiIcon('play')}${tr('Start task')}</button>`:`<button class="btn" data-assign="${esc(t.id)}">${uiIcon('people')}${tr('Assign to')}</button>`)):''}<button class="btn secondary" data-edit="${esc(t.id)}">${uiIcon('edit')}${tr('Edit')}</button></div>`;}
async function changeTaskTiming(id,action,button){
 if(!cloud)return;const run=epoch;button.disabled=true;
 try{const r=await client.rpc('dockflow_task_action',{task_id:id,action});if(r.error)throw r.error;await loadCloud(run);render();}
 catch(err){if(run===epoch){alert(tr('Could not update task: ')+tr(err.message));button.disabled=false;}}
}
function taskHtml(t){return `<div class="task"><div><h3>${esc(t.title)}</h3><div class="muted">${esc(assignedNames(t))} · ${esc(tr(t.category))} · ${tr("Due")} ${fmt(t.due)}</div><span class="pill ${t.priority==='High'?'high':''}">${esc(tr(t.priority))}</span><span class="pill ${t.paused_at?'paused':t.status==='Done'?'done':t.status==='In Progress'?'progress':''}">${esc(tr(t.paused_at?'Paused':t.status))}</span>${overdue(t)?`<span class="pill overdue">${tr("Overdue")}</span>`:''}${t.attachment?`<div><a class="attach" href="#" data-attachment="${esc(t.id)}">${tr("📎 View attachment")}</a></div>`:''}${t.repeated_rule_id?`<span class="pill">${tr('Repeated')}</span>`:''}${carryoverBadge(t)}${taskTiming(t)}</div>${taskButtons(t)}</div>`}function taskList(items){return items.length?items.map(taskHtml).join(''):`<div class="empty">${tr("No tasks found. Create one to get started.")}</div>`}function workerStyle(name){const colors=[['#285cce','#eaf0ff'],['#4275b5','#edf3fc'],['#5968bd','#eef0fc'],['#316b9e','#eaf3fb'],['#536a9c','#eef2fa'],['#4762ae','#edf0fb']];let hash=0;for(const letter of String(name))hash=(hash*31+letter.charCodeAt(0))|0;const [accent,tint]=colors[Math.abs(hash)%colors.length];return `--worker-accent:${accent};--worker-tint:${tint}`;}
const workerTaskRank=t=>t.status==='Done'?2:t.status==='In Progress'&&!t.paused_at?0:1;
const compareWorkerTasks=(a,b)=>workerTaskRank(a)-workerTaskRank(b)||(a.due||'').localeCompare(b.due||'');
function workerHeading(name,tasks,tag='h2'){
 const initials=String(name).trim().split(/\s+/).slice(0,2).map(word=>word[0]||'').join('').toUpperCase();const completed=tasks.filter(t=>t.status==='Done').length;const estimatedHours=tasks.reduce((total,t)=>{const minutes=Number(t.estimated_minutes);return total+(Number.isFinite(minutes)&&minutes>0?minutes:0);},0)/60;const hoursText=estimatedHours.toLocaleString(language==='es'?'es':'en',{maximumFractionDigits:2});
 return `<div class="worker-heading"><div class="worker-identity"><span class="worker-avatar" aria-hidden="true">${esc(initials)}</span><${tag}>${esc(name)}</${tag}></div><span class="worker-count" title="${tr('tasks')}">${tasks.length}</span></div><div class="worker-hours"><span>${uiIcon('clock')}${tr('Total estimated hours')}</span><strong>${esc(hoursText)} h</strong></div><div class="worker-progress-row"><div class="worker-progress-track" role="progressbar" aria-label="${tr('Completed')}" aria-valuemin="0" aria-valuemax="${tasks.length||1}" aria-valuenow="${completed}"><div class="worker-progress-fill" style="width:${pct(completed,tasks.length)}%"></div></div><span class="worker-progress-label">${completed}/${tasks.length} ${tr('Completed').toLowerCase()}</span></div>`;
}
function workerTaskHtml(t,showDue=false){
 const live=!!t.started_at&&!t.finished_at&&!t.paused_at;
 return `<article draggable="true" data-drag-task="${esc(t.id)}" class="worker-task ${live?'is-running':t.paused_at?'is-paused':''}"><div class="task-category"><button type="button" class="task-drag-handle" data-move-task="${esc(t.id)}" aria-label="${tr('Move task')}" title="${tr('Drag to another worker, or click to choose workers.')}"><span aria-hidden="true">⠿</span></button>${uiIcon('box')}<span>${esc(tr(t.category||'General'))}</span>${live?`<span class="running-dot" aria-label="${tr('In progress')}"></span>`:''}</div><h3>${esc(t.title)}</h3>${showDue?`<div class="muted">${tr('Due')} ${fmt(t.due)}</div>`:''}<div class="worker-task-status"><span class="pill ${t.paused_at?'paused':t.status==='Done'?'done':t.status==='In Progress'?'progress':''}">${esc(tr(t.paused_at?'Paused':t.status))}</span><span class="pill ${t.priority==='High'?'high':''}">${esc(tr(t.priority))}</span>${carryoverBadge(t)}</div>${taskEstimateHtml(t)}${t.started_at?`<div class="muted worker-elapsed">${tr('Working time')}: <strong ${live?`data-elapsed-start="${esc(t.started_at)}" data-pause-seconds="${Number(t.total_pause_seconds||0)}"`:''}>${durationText(taskElapsed(t))}</strong></div>`:''}${taskButtons(t)}<details class="worker-task-details"><summary>${tr('Details')}</summary><p class="muted">${esc(assignedNames(t))} · ${esc(tr(t.category))} · ${tr('Due')} ${fmt(t.due)}</p>${t.description?`<p class="muted" style="white-space:pre-wrap">${esc(t.description)}</p>`:''}${taskTiming(t,false)}${t.attachment?`<a class="attach" href="#" data-attachment="${esc(t.id)}">${tr('📎 View attachment')}</a>`:''}</details></article>`;
}
function todaysTasks(){return db.tasks.filter(t=>t.due===today());}
function dashboard(){
 displayedDashboardDay=today();
 const tasks=todaysTasks(),done=tasks.filter(t=>t.status==='Done'||t.finished_at).length,openTasks=tasks.filter(t=>t.status!=='Done'&&!t.finished_at);
 const cards=db.employees.map(e=>({id:e.id,name:e.name,tasks:openTasks.filter(t=>isAssigned(t,e.id))}));
 const known=new Set(db.employees.map(e=>e.id));const unassigned=openTasks.filter(t=>!assignedIds(t).some(id=>known.has(id)));
 cards.push({id:'',name:tr('Unassigned'),tasks:unassigned});
 const stats=[['Today’s tasks',tasks.length],['In progress',tasks.filter(t=>t.status==='In Progress'&&!t.paused_at).length],['Paused',tasks.filter(t=>t.paused_at&&!t.finished_at).length],['Completed',done]];
 return `<div class="dashboard-banner"><div class="banner-copy"><span class="banner-label">${uiIcon('box')}${tr('Warehouse workspace')}</span><h2>${tr('Tasks due today')}</h2><p>${esc(new Date().toLocaleDateString(language==='es'?'es':'en',{weekday:'long',month:'long',day:'numeric',year:'numeric'}))}</p></div>${warehouseGraphic()}</div><div class="stats dashboard-stats">${stats.map(([label,value],index)=>`<div class="stat"><span class="stat-icon">${uiIcon(['tasks','play','pause','check'][index])}</span><label>${tr(label)}</label><strong>${value}</strong></div>`).join('')}</div><p class="muted">${tr('Shared tasks appear under each assigned worker.')} ${tr('Scroll inside a worker box to see more tasks.')} ${tr('Drag tasks between worker boxes to reassign them.')}</p><div class="worker-board">${cards.map(card=>`<section class="panel worker-card ${!card.tasks.length&&!card.id?'drop-only':''}" data-worker-id="${esc(card.id)}" style="${workerStyle(card.name)}">${workerHeading(card.name,card.tasks)}<div class="worker-task-list" tabindex="0" role="region" aria-label="${esc(card.name)}">${card.tasks.length?[...card.tasks].sort(compareWorkerTasks).map(t=>workerTaskHtml(t)).join(''):`<div class="empty worker-empty">${uiIcon('check')}<span>${tr('No tasks due today.')}</span></div>`}</div></section>`).join('')||`<section class="panel"><div class="empty">${tr('No tasks due today.')}</div></section>`}</div><div style="margin-top:20px"><button class="btn secondary" data-goto="tasks">${tr('View all tasks')}</button></div>`;
}
function filteredTasks(op=false){return db.tasks.filter(t=>(!op||t.category!=='General')&&(statusFilter==='all'||t.status===statusFilter)&&(categoryFilter==='all'||t.category===categoryFilter)&&(t.title+' '+t.description+' '+assignedNames(t)).toLowerCase().includes(search.toLowerCase()));}
function taskDateGroups(items){
 const current=today(),next=tomorrow();
 return [{key:'today',label:'Today',tasks:items.filter(t=>t.due===current)},
 {key:'tomorrow',label:'Tomorrow',tasks:items.filter(t=>t.due===next)},
 {key:'later',label:'Later',tasks:items.filter(t=>t.due&&t.due>next)},
 {key:'earlier',label:'Earlier dates',tasks:items.filter(t=>t.due&&t.due<current)},
 {key:'undated',label:'No due date',tasks:items.filter(t=>!t.due)}].filter(g=>['today','tomorrow','later'].includes(g.key)||g.tasks.length);
}
function tasksByWorker(items){
 const groups=db.employees.map(e=>({id:e.id,name:e.name,tasks:items.filter(t=>isAssigned(t,e.id))})).filter(g=>g.tasks.length);
 const known=new Set(db.employees.map(e=>e.id));const unassigned=items.filter(t=>!assignedIds(t).some(id=>known.has(id)));if(unassigned.length)groups.push({id:'',name:tr('Unassigned'),tasks:unassigned});return groups;
}
function workerDropGroups(items){const groups=tasksByWorker(items),ids=new Set(groups.map(g=>g.id));for(const e of db.employees)if(!ids.has(e.id))groups.push({id:e.id,name:e.name,tasks:[]});if(!ids.has(''))groups.push({id:'',name:tr('Unassigned'),tasks:[]});return groups;}
function groupedTaskList(items){return taskDateGroups(items).map(g=>`<section aria-labelledby="task-date-${g.key}" style="margin-bottom:26px"><h2 id="task-date-${g.key}" style="display:flex;align-items:center;gap:10px;border-bottom:1px solid #e3e9f0;padding-bottom:12px">${tr(g.label)} <span class="pill">${g.tasks.length}</span></h2>${g.tasks.length?`<div class="worker-board all-task-board">${workerDropGroups(g.tasks).map(worker=>`<section class="panel worker-card ${worker.tasks.length?'':'drop-only'}" data-worker-id="${esc(worker.id)}" style="${workerStyle(worker.name)}">${workerHeading(worker.name,worker.tasks,'h3')}<div class="worker-task-list" tabindex="0" role="region" aria-label="${esc(tr(g.label)+' — '+worker.name)}">${[...worker.tasks].sort(compareWorkerTasks).map(t=>workerTaskHtml(t,true)).join('')}</div></section>`).join('')}</div>`:`<div class="empty">${tr('No tasks in this section.')}</div>`}</section>`).join('');}
function taskPage(op=false){if(!op)displayedDashboardDay=today();const items=filteredTasks(op);return `<section class="panel task-workspace"><div class="toolbar task-filters"><div class="task-search-field"><label for="search">${tr('Search tasks or employees')}</label><div class="task-search-control">${uiIcon('search')}<input id="search" type="search" placeholder="${tr('Search tasks or employees')}" value="${esc(search)}"></div></div><div class="task-filter-field"><label for="statusFilter">${uiIcon('filter')}${tr('Status')}</label><select id="statusFilter"><option value="all" ${statusFilter==='all'?'selected':''}>${tr('All statuses')}</option>${options(statuses,statusFilter)}</select></div><div class="task-filter-field"><label for="categoryFilter">${uiIcon('box')}${tr('Operation')}</label><select id="categoryFilter"><option value="all" ${categoryFilter==='all'?'selected':''}>${tr('All operations')}</option>${options(cats,categoryFilter)}</select></div></div><div id="taskResults">${op?taskList(items):groupedTaskList(items)}</div></section>`;}
function teamPage(){return `<section class="panel"><h2>${tr("Employees and teams")}</h2>${db.employees.map(e=>`<div class="employee"><span>${esc(e.name)} <span class="muted">(${db.tasks.filter(t=>isAssigned(t,e.id)&&t.status!=='Done').length} ${tr("open")})</span></span><button class="btn secondary" data-employee="${esc(e.id)}">${tr("Edit")}</button></div>`).join('')}<div style="margin-top:20px"><button class="btn" id="addEmployee">${tr("+ Add employee")}</button></div><p class="muted">${tr("Employees are assignment labels. In shared mode, each person also needs their own login.")}</p></section>`}function reportPage(){return `<div class="grid"><section class="panel"><h2>${tr("Status breakdown")}</h2>${statuses.map(s=>`<div class="reportrow"><span>${tr(s)}</span><strong>${count(s)}</strong></div>`).join('')}<button class="btn secondary" style="margin-top:20px" id="exportCsv">${tr("Export tasks CSV")}</button></section><section class="panel"><h2>${tr("Employee workload")}</h2>${db.employees.map(e=>`<div class="reportrow"><span>${esc(e.name)}</span><strong>${db.tasks.filter(t=>isAssigned(t,e.id)&&t.status!=='Done').length} ${tr("open")}</strong></div>`).join('')}</section></div>`}function settingsPage(){return `<section class="panel" style="max-width:680px"><h2>${tr("Warehouse account")}</h2><p>${tr("Signed in as")} ${esc(user?.email)}</p><p class="muted">${tr("Only approved employees can access this warehouse. Contact your warehouse manager for account access.")}</p><div class="actions" style="justify-content:flex-start"><button class="btn secondary" id="refreshCloud">${tr("Refresh shared data")}</button><button class="btn secondary" id="logout">${tr("Sign out")}</button></div></section>`}
function render(){applyLanguage();syncNavigation();if(recoveryMode){renderPasswordReset();return;}if(!cloud){renderLogin();return;}setNavigationEnabled(true);let titles={dashboard:['Warehouse overview','Today’s tasks'],tasks:['Task management','All tasks'],repeated:['Scheduled work','Repeated Tasks'],operations:['Warehouse workflow','Operations'],team:['People & assignments','Team'],reports:['Insights & activity','Reports'],settings:['Workspace configuration','Settings']};$('#subtitle').textContent=tr(titles[view][0]);$('#pageTitle').textContent=tr(titles[view][1]);$('#content').innerHTML=({dashboard:dashboard,tasks:()=>taskPage(false),operations:()=>taskPage(true),repeated:recurringPage,team:teamPage,reports:reportPage,settings:settingsPage})[view]();$('#modeLabel').textContent=tr('Shared warehouse');connectionNotice();$('#newTask').textContent=tr(view==='repeated'?'+ New repeated task':'+ New task');$('#newTask').classList.toggle('hidden',view==='settings'||(view==='repeated'&&memberRole!=='manager'));}function openModal(title,body,actions=''){ $('#modalHost').innerHTML=`<div class="modalwrap"><div class="modal"><div class="modalhead"><h2>${esc(tr(title))}</h2><button class="btn secondary" id="closeModal">✕</button></div>${body}${actions}</div></div>`}function closeModal(){$('#modalHost').innerHTML=''}function taskModal(id){let t=db.tasks.find(x=>x.id===id)||{title:'',description:'',category:'Receiving',status:'To Do',priority:'Medium',assignee:'',due:view==='dashboard'?today():'',attachment:''};openModal(id?'Edit task':'Create task',`<form id="taskForm"><div class="task-form-intro">${uiIcon('tasks')}<span>${tr('Task details')}</span></div><div class="field"><label for="taskTitle">${tr("Task title *")}</label><input id="taskTitle" name="title" required maxlength="120" value="${esc(t.title)}" placeholder="${tr("e.g. Receive pallet shipment")}"></div><div class="formgrid"><div class="field"><label for="taskCategory">${tr("Operation")}</label><select id="taskCategory" name="category">${options(cats,t.category)}</select></div><div class="field"><label for="taskDue">${tr("Due date")}</label><input id="taskDue" type="date" name="due" value="${esc(t.due)}"></div><div class="field"><label for="taskStatus">${tr("Status")}</label><select id="taskStatus" name="status">${options(statuses,t.status)}</select></div><div class="field"><label for="taskPriority">${tr("Priority")}</label><select id="taskPriority" name="priority">${options(['Low','Medium','High'],t.priority)}</select></div></div><fieldset class="task-worker-section"><legend>${uiIcon('people')}${tr("Assign workers")}</legend>${workerChoices(t)}</fieldset><div class="task-estimate-field">${estimateInput(t.estimated_minutes)}</div><div class="field"><label for="taskNotes">${tr("Instructions / notes")}</label><textarea id="taskNotes" name="description">${esc(t.description)}</textarea></div><div class="field task-upload"><label for="taskFile">${uiIcon('box')}${tr("Photo or attachment (up to 5 MB)")}</label><input id="taskFile" type="file" name="file" accept="image/*,.pdf"><p class="muted">${t.attachment?tr('Existing attachment is kept unless replaced.'):''}</p></div><div class="actions">${id?`<button type="button" class="btn danger" id="deleteTask">${tr("Delete")}</button>`:''}<button type="button" class="btn secondary" id="cancelModal">${tr("Cancel")}</button><button class="btn" type="submit">${uiIcon('check')}${tr("Save task")}</button></div></form>`);$('#taskForm').onsubmit=async e=>{
 e.preventDefault();if(!cloud)return;
 const run=epoch,f=new FormData(e.target),file=f.get('file'),button=e.target.querySelector('[type="submit"]');button.disabled=true;
 let attachment=t.attachment,uploaded='',written=false;
 try{
  const estimated_minutes=readEstimatedHours(f.get('estimated_hours'));
  if(file&&file.size){
   if(file.size>5e6)throw Error(tr('Maximum attachment size is 5 MB'));
   if(!['application/pdf','image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'].includes(file.type))throw Error(tr('Choose a photo or PDF file.'));
   uploaded=`${user.id}/${uid()}/${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
   const r=await client.storage.from('dockflow-attachments').upload(uploaded,file,{contentType:file.type});if(r.error)throw r.error;attachment=uploaded;
  }
  if(run!==epoch)throw Error(tr('Your session changed. Please sign in again.'));
  const obj={id:id||uid(),title:String(f.get('title')).trim(),description:String(f.get('description')),category:f.get('category'),assignee:f.getAll('assignees')[0]||'',assignees:[...new Set(f.getAll('assignees'))],status:f.get('status'),priority:f.get('priority'),estimated_minutes,due:f.get('due'),attachment};
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
function assignmentModal(id){
 const task=db.tasks.find(t=>t.id===id);if(!cloud||!task)return;
 openModal('Assign workers',`<p>${esc(task.title)}</p><form id="assignmentForm"><fieldset style="border:0;padding:0;margin:0"><legend class="muted">${tr('Assign workers')}</legend>${workerChoices(task)}</fieldset><div class="actions"><button type="button" class="btn secondary" id="cancelModal">${tr('Cancel')}</button><button class="btn" type="submit" ${db.employees.length?'':'disabled'}>${tr('Save assignment')}</button></div></form>`);
 $('#assignmentForm').onsubmit=async event=>{
  event.preventDefault();if(!cloud)return;const run=epoch,button=event.target.querySelector('[type="submit"]'),selected=[...new Set(new FormData(event.target).getAll('assignees'))];
  if(!selected.length){alert(tr('Select at least one worker.'));return;}button.disabled=true;
  try{const result=await client.from('dockflow_tasks').update({assignee:selected[0],assignees:selected}).eq('id',id).select('id').single();if(result.error)throw result.error;if(run!==epoch)return;await loadCloud(run);if(run!==epoch)return;closeModal();render();}
  catch(error){if(run===epoch){alert(tr('Could not save task: ')+tr(error.message));button.disabled=false;}}
 };
}
function employeeModal(id){let e=db.employees.find(x=>x.id===id)||{name:''};openModal(id?'Edit employee':'Add employee',`<form id="employeeForm"><div class="field"><label>${tr("Employee / team name")}</label><input name="name" required maxlength="80" value="${esc(e.name)}"></div><div class="actions"><button type="button" class="btn secondary" id="cancelModal">${tr("Cancel")}</button><button class="btn">${tr("Save")}</button></div></form>`);$('#employeeForm').onsubmit=async ev=>{ev.preventDefault();if(!cloud)return;const run=epoch,obj={id:id||uid(),name:ev.target.elements.name.value.trim()};if(!obj.name)return;const button=ev.target.querySelector('button.btn:not([type="button"])');button.disabled=true;try{const r=await client.from('dockflow_employees').upsert(obj).select('id').single();if(r.error)throw r.error;await loadCloud(run);closeModal();render();}catch(err){alert(tr(err.message));button.disabled=false;}};}
function download(name,contents,type){let a=document.createElement('a'),u=URL.createObjectURL(new Blob([contents],{type}));a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000)}function exportCsv(){let fields=['title','category','status','priority','assignee','due','description','attachment','started_at','finished_at','duration_seconds','estimated_hours','original_due','carryover_count','carried_over_at'],rows=[fields.join(','),...db.tasks.map(t=>fields.map(k=>'"'+String(k==='assignee'?assignedNames(t):k==='estimated_hours'?(t.estimated_minutes?Number((t.estimated_minutes/60).toFixed(4)):''):k==='duration_seconds'?(t.started_at&&t.finished_at?Math.floor(taskElapsed(t)/1000):''):t[k]??'').replace(/^[=+@\-\t\r]/,m=>"'"+m).replaceAll('"','""')+'"').join(','))];download('warehouse-tasks.csv',rows.join('\r\n'),'text/csv')}
async function loadCloud(expected=epoch){
 const sessionUser=user;
 if(!sessionUser)throw Error(tr('Please sign in.'));
 const member=await client.from('dockflow_members').select('user_id,role').eq('user_id',sessionUser.id).maybeSingle();
 if(member.error)throw member.error;
 if(!member.data)throw Object.assign(Error(tr('Your account has not been approved for this warehouse. Contact your manager.')),{code:'WAREHOUSE_ACCESS_DENIED'});
 if(expected!==epoch||user?.id!==sessionUser.id)throw Error(tr('Your session changed. Please sign in again.'));
 const rollover=await client.rpc('dockflow_rollover_unfinished_tasks');if(rollover.error)throw rollover.error;
 if(expected!==epoch||user?.id!==sessionUser.id)throw Error(tr('Your session changed. Please sign in again.'));
 const [a,b,c]=await Promise.all([client.from('dockflow_tasks').select('*').order('created_at',{ascending:false}),client.from('dockflow_employees').select('*').order('name'),client.from('dockflow_repeated_tasks').select('*').order('created_at',{ascending:false})]);
 if(a.error||b.error||c.error)throw(a.error||b.error||c.error);
 if(expected!==epoch||user?.id!==sessionUser.id)throw Error(tr('Your session changed. Please sign in again.'));
 memberRole=member.data.role||'employee';db={tasks:a.data,employees:b.data,repeated:c.data};lastTaskSync=Date.now();
}
function clearWorkspace(){dragTaskState=null;touchTaskDrag=null;sessionRestore=null;connectionWarning='';memberRole='employee';epoch++;cloud=false;user=null;db={tasks:[],employees:[],repeated:[]};closeModal();render();}
function startCloud(){if(sessionRestore)return sessionRestore;const restoring=restoreCloud();const tracked=restoring.finally(()=>{if(sessionRestore===tracked)sessionRestore=null;});sessionRestore=tracked;return tracked;}
async function restoreCloud(){
 const run=++epoch;memberRole='employee';cloud=false;user=null;db={tasks:[],employees:[],repeated:[]};recoveryReady=false;loading=true;authError='';connectionWarning='';closeModal();render();
 try{
  const {data,error}=await withTimeout(client.auth.getSession());if(error)throw error;if(run!==epoch)return;
  if(recoveryMode){recoveryReady=Boolean(data.session);user=data.session?.user||null;if(!recoveryReady)authError=tr('This reset link has expired or is invalid. Request a new link.');return;}
  if(data.session){user=data.session.user;await withTimeout(loadCloud(run));if(run!==epoch)return;cloud=true;}
 }catch(err){if(run!==epoch)return;epoch++;user=null;db={tasks:[],employees:[],repeated:[]};authError=tr(err.message);loading=false;render();}
 finally{if(run===epoch){loading=false;render();}}
}
function handleAuthChange(event,session){
 if(event==='SIGNED_OUT'){recoveryReady=false;loading=false;clearWorkspace();return;}
 if(event==='PASSWORD_RECOVERY'){recoveryMode=true;setTimeout(()=>startCloud(),0);return;}
 if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'){
  if(session?.user&&cloud&&user?.id===session.user.id){user=session.user;return;}
  if(session?.user&&user&&user.id!==session.user.id){loading=true;clearWorkspace();}
  setTimeout(()=>{if(!cloud||user?.id!==session?.user?.id)startCloud();},0);
 }
}
function handlePageVisible(){if(document.hidden)return;if(recoveryMode&&recoveryReady)return;if(cloud)return refreshTaskDay(true);if(!loading&&document.activeElement?.matches?.('input,select,textarea'))return;return startCloud();}
function renderLogin(){
 setNavigationEnabled(false);
 $('#newTask').classList.add('hidden');$('#notice').classList.add('hidden');$('#modeLabel').textContent=tr('Employee sign-in');
 $('#subtitle').textContent=tr('Warehouse workspace');$('#pageTitle').textContent=tr('Welcome to DockFlow');
 $('#content').innerHTML=`<section class="panel login"><h2>${tr("Employee sign-in")}</h2><p>${tr("Sign in with the account approved by your warehouse manager.")}</p>${loading?`<p role="status">${tr("Connecting to your warehouse…")}</p>`:`<form id="loginForm"><div class="field"><label for="loginEmail">${tr("Email")}</label><input id="loginEmail" type="email" name="email" autocomplete="username" required></div><div class="field"><label for="loginPassword">${tr("Password")}</label><input id="loginPassword" type="password" name="password" autocomplete="current-password" required></div><button class="btn" type="submit">${tr("Sign in")}</button><button class="btn secondary" type="button" id="forgotPassword" style="margin-left:8px">${tr("Forgot password?")}</button></form>`}<p id="authMsg" role="alert">${esc(authError)}</p>${!loading?`<p class="muted">${tr("Need an account? Contact your warehouse manager.")}</p><button class="btn secondary" id="retryConnection" type="button">${tr('Retry connection')}</button>`:''}</section>`;
 if(!loading){$('#forgotPassword').onclick=()=>showForgotPassword();const retry=$('#retryConnection');if(retry)retry.onclick=()=>startCloud();}
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
 setNavigationEnabled(false);
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
   if(typeof history!=='undefined')history.replaceState(null,'',pageLink(view));
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
 if(e.target.closest('[data-suppress-click]')){e.preventDefault();return;}
 const attachment=e.target.closest('[data-attachment]');if(attachment){e.preventDefault();await openAttachment(attachment.dataset.attachment);return;}
 const link=e.target.closest('a[data-view],a[data-goto]');
 if(link){if(!cloud){e.preventDefault();return;}if(e.defaultPrevented||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||(e.button!==undefined&&e.button!==0))return;e.preventDefault();navigateTo(link.dataset.view||link.dataset.goto);return;}
 const b=e.target.closest('button');if(!b||!cloud)return;
 if(b.dataset.view){navigateTo(b.dataset.view);}
 else if(b.dataset.goto){navigateTo(b.dataset.goto);}
 else if(b.dataset.moveTask)assignmentModal(b.dataset.moveTask);
 else if(b.dataset.assign)assignmentModal(b.dataset.assign);
 else if(b.dataset.start)await changeTaskTiming(b.dataset.start,'start',b);
 else if(b.dataset.pause)await changeTaskTiming(b.dataset.pause,'pause',b);
 else if(b.dataset.resume)await changeTaskTiming(b.dataset.resume,'resume',b);
 else if(b.dataset.finish)await changeTaskTiming(b.dataset.finish,'finish',b);
 else if(b.id==='newTask'){if(view==='repeated')recurringModal();else taskModal();}
 else if(b.dataset.repeatEdit)recurringModal(b.dataset.repeatEdit);
 else if(b.dataset.repeatToggle)await changeRecurring(b.dataset.repeatToggle,'toggle',b);
 else if(b.dataset.repeatDelete)await changeRecurring(b.dataset.repeatDelete,'delete',b);
 else if(b.dataset.edit)taskModal(b.dataset.edit);
 else if(b.dataset.employee)employeeModal(b.dataset.employee);
 else if(b.id==='addEmployee')employeeModal();
 else if(['closeModal','cancelModal'].includes(b.id))closeModal();
 else if(b.id==='exportCsv')exportCsv();
 else if(b.id==='retryConnection')await refreshTaskDay(true);
 else if(b.id==='refreshCloud'){try{await loadCloud();render();}catch(err){authError=tr(err.message);clearWorkspace();}}
 else if(b.id==='logout')await signOut();
});
document.addEventListener('input',e=>{if(cloud&&e.target.id==='search'){search=e.target.value;const op=view==='operations',items=filteredTasks(op);$('#taskResults').innerHTML=op?taskList(items):groupedTaskList(items);}});
document.addEventListener('change',e=>{if(e.target.id==='languageSelect'){setLanguage(e.target.value);render();return;}if(cloud&&(e.target.id==='statusFilter'||e.target.id==='categoryFilter')){statusFilter=$('#statusFilter').value;categoryFilter=$('#categoryFilter').value;render();}});
if(window.supabase){
 client=window.supabase.createClient(config.url,config.key,{global:{fetch:boundedFetch}});
 client.auth.onAuthStateChange(handleAuthChange);
 document.addEventListener('visibilitychange',handlePageVisible);
 startCloud();
}else{loading=false;authError=tr('DockFlow could not load. Please refresh the page.');render();}
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});

async function refreshTaskDay(force=false){
 if(dragTaskState||!cloud||document.hidden||backgroundTaskSync||$('#modalHost').innerHTML||document.activeElement?.matches?.('input,select,textarea'))return;
 const dayChanged=(view==='dashboard'||view==='tasks')&&displayedDashboardDay!==today();if(!force&&!dayChanged&&Date.now()-lastTaskSync<300000)return;
 const run=epoch;backgroundTaskSync=true;
 try{await withTimeout(loadCloud(run));if(run===epoch){connectionWarning='';if(!$('#modalHost').innerHTML&&!document.activeElement?.matches?.('input,select,textarea'))render();else connectionNotice();}}catch(err){if(run===epoch){if(accessFailure(err)){authError=tr(err.message);clearWorkspace();}else{lastTaskSync=Date.now();connectionWarning=tr('Could not refresh the warehouse. Your current page is still open. Retry when connected.');connectionNotice();}}}finally{backgroundTaskSync=false;}
}
if(typeof setInterval==='function')setInterval(()=>{if(!cloud||document.hidden)return;updateEstimateDisplays();refreshTaskDay();document.querySelectorAll('[data-elapsed-start]').forEach(el=>{el.textContent=durationText(Date.now()-Date.parse(el.dataset.elapsedStart)-Number(el.dataset.pauseSeconds||0)*1000);});},1000);

if(typeof window.addEventListener==='function')window.addEventListener('popstate',()=>{view=pageFromLocation();closeModal();render();});

if(typeof window.addEventListener==='function')window.addEventListener('pageshow',event=>{if(event.persisted)handlePageVisible();});

let dragTaskState=null,taskMoveSaving=false,touchTaskDrag=null;
function movedWorkerIds(task,source,target){
 const current=assignedIds(task),known=new Set(db.employees.map(e=>e.id));
 if(target&&!known.has(target))throw Error(tr('Worker is no longer available.'));
 if(source&&!current.includes(source))throw Error(tr('Task assignment changed. Please refresh and try again.'));
 if(source===target)return current;
 const next=source?current.filter(id=>id!==source):current.filter(id=>known.has(id));
 return [...new Set(target?[...next,target]:next)];
}
function finishTaskDrag(){document.querySelectorAll('.drop-target,.task-is-dragging').forEach(el=>el.classList.remove('drop-target','task-is-dragging'));document.body.classList.remove('task-dragging');dragTaskState=null;}
function markTaskDrop(target){document.querySelectorAll('.drop-target').forEach(el=>el.classList.remove('drop-target'));if(target&&dragTaskState&&target.dataset.workerId!==dragTaskState.source){target.dataset.dropMessage=target.dataset.workerId?tr('Assign to')+' '+who(target.dataset.workerId):tr('Unassigned');target.classList.add('drop-target');}}
async function dropWorkerTask(payload,target){
 if(!cloud||taskMoveSaving||payload.source===target)return;
 const task=db.tasks.find(t=>t.id===payload.id);if(!task)return;
 const run=epoch;taskMoveSaving=true;
 try{
  const assignees=movedWorkerIds(task,payload.source,target);
  const result=await client.from('dockflow_tasks').update({assignee:assignees[0]||'',assignees}).eq('id',task.id).select('id').single();if(result.error)throw result.error;
  if(run!==epoch)return;await loadCloud(run);if(run===epoch){closeModal();render();}
 }catch(error){if(run===epoch)alert(tr('Could not move task: ')+tr(error.message));}finally{taskMoveSaving=false;}
}
function confirmTaskDrop(payload,target){
 if(!cloud||taskMoveSaving||payload.source===target)return;
 const task=db.tasks.find(t=>t.id===payload.id);if(!task)return;const run=epoch;
 const destination=target?who(target):tr('Unassigned');
 openModal('Confirm assignment',`<div class="assignment-confirm"><span class="assignment-confirm-icon">${uiIcon('people')}</span><p>${tr('Assign this task to')} <strong>${esc(destination)}</strong>?</p><div class="assignment-confirm-task">${esc(task.title)}</div><p class="muted">${tr('Other assigned workers will stay on this task.')}</p></div><div class="actions"><button type="button" class="btn secondary" id="cancelModal">${tr('Cancel')}</button><button type="button" class="btn" id="confirmTaskMove">${tr('Confirm assignment')}</button></div>`);
 $('#confirmTaskMove').onclick=async event=>{if(run!==epoch||!cloud)return;const button=event.currentTarget;button.disabled=true;await dropWorkerTask(payload,target);if(run===epoch)button.disabled=false;};
}
document.addEventListener('dragstart',event=>{
 const task=event.target.closest('[data-drag-task]'),card=task?.closest('[data-worker-id]');if(!cloud||taskMoveSaving||!task||!card||event.target.closest('a,input,select,textarea,summary,button:not(.task-drag-handle)')){event.preventDefault();return;}
 dragTaskState={id:task.dataset.dragTask,source:card.dataset.workerId};event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',task.dataset.dragTask);task.classList.add('task-is-dragging');document.body.classList.add('task-dragging');
});
document.addEventListener('dragenter',event=>{if(dragTaskState&&cloud&&event.target.closest('[data-worker-id]'))event.preventDefault();});
document.addEventListener('dragover',event=>{if(!dragTaskState||!cloud)return;const card=event.target.closest('[data-worker-id]');markTaskDrop(card);if(card){event.preventDefault();event.dataTransfer.dropEffect='move';}});
document.addEventListener('drop',async event=>{if(!dragTaskState)return;const card=event.target.closest('[data-worker-id]'),payload=dragTaskState;event.preventDefault();finishTaskDrag();if(card)confirmTaskDrop(payload,card.dataset.workerId);});
document.addEventListener('dragend',finishTaskDrag);
document.addEventListener('pointerdown',event=>{
 if(event.pointerType==='mouse'||!cloud||taskMoveSaving)return;const handle=event.target.closest('.task-drag-handle'),task=handle?.closest('[data-drag-task]'),card=task?.closest('[data-worker-id]');if(!task||!card)return;
 touchTaskDrag={pointer:event.pointerId,x:event.clientX,y:event.clientY,task,handle,payload:{id:task.dataset.dragTask,source:card.dataset.workerId},active:false};handle.setPointerCapture(event.pointerId);
});
document.addEventListener('pointermove',event=>{
 const touch=touchTaskDrag;if(!touch||touch.pointer!==event.pointerId)return;
 if(!touch.active&&Math.hypot(event.clientX-touch.x,event.clientY-touch.y)>8){touch.active=true;dragTaskState=touch.payload;document.body.classList.add('task-dragging');touch.task.classList.add('task-is-dragging');}
 if(!touch.active)return;event.preventDefault();const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-worker-id]');markTaskDrop(target);
 if(event.clientY<70)window.scrollBy(0,-18);else if(event.clientY>window.innerHeight-100)window.scrollBy(0,18);
},{passive:false});
document.addEventListener('pointerup',async event=>{
 const touch=touchTaskDrag;if(!touch||touch.pointer!==event.pointerId)return;touchTaskDrag=null;if(!touch.active)return;event.preventDefault();const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-worker-id]');touch.handle.dataset.suppressClick='1';setTimeout(()=>{delete touch.handle.dataset.suppressClick;},100);finishTaskDrag();if(target)confirmTaskDrop(touch.payload,target.dataset.workerId);
});
document.addEventListener('pointercancel',()=>{if(!touchTaskDrag)return;touchTaskDrag=null;finishTaskDrag();});
