const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function workspace(extra={}){
 const elements=new Map(),listeners=new Map(),windowListeners=new Map();
 const element=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',disabled:false,classList:{add(){},toggle(){}},querySelector(){return element('button')}});return elements.get(key)};
 const context=vm.createContext({document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(type,fn)=>listeners.set(type,fn)},window:{addEventListener:(type,fn)=>windowListeners.set(type,fn)},navigator:{},crypto:require('node:crypto').webcrypto,console,setTimeout,clearTimeout,AbortController,alert(){},FormData:class{constructor(target){this.values=target.values;}get(key){return this.values[key];}getAll(key){const v=this.values[key];return Array.isArray(v)?v:v?[v]:[];}}});
 Object.assign(context,extra);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../i18n.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../recurring.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../task-updates.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),context);
 return {context,elements,listeners,windowListeners,run:s=>vm.runInContext(s,context)};
}
function configure(w,approved){
 w.context.approved=approved;
 w.run(`client={rpc:async()=>({data:0,error:null}),auth:{getSession:async()=>({data:{session:{user:{id:'employee-a',email:'a@example.com'}}}})},from:table=>{let q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:approved?{user_id:'employee-a'}:null,error:null}),order:async()=>({data:table==='dockflow_tasks'?[{id:'task-a',title:'Warehouse task'}]:[],error:null})};return q;}}`);
}
test('signed-out page shows login and no warehouse records',()=>{
 const w=workspace();assert.equal(w.run('cloud'),false);assert.equal(w.run('db.tasks.length'),0);assert.match(w.elements.get('#content').innerHTML,/Employee sign-in/);assert.doesNotMatch(w.elements.get('#content').innerHTML,/Check inbound pallets/);
});
test('authenticated account without membership is denied',async()=>{
 const w=workspace();configure(w,false);await w.run('startCloud()');assert.equal(w.run('cloud'),false);assert.equal(w.run('user'),null);assert.equal(w.run('db.tasks.length'),0);assert.match(w.elements.get('#content').innerHTML,/not been approved/);
});
test('approved employee receives shared tasks',async()=>{
 const w=workspace();configure(w,true);w.run("view='tasks'");await w.run('startCloud()');assert.equal(w.run('cloud'),true);assert.equal(w.run('db.tasks[0].id'),'task-a');assert.match(w.elements.get('#content').innerHTML,/Warehouse task/);
});
test('clearing a session removes all tasks and open dialogs',async()=>{
 const w=workspace();configure(w,true);await w.run('startCloud()');w.run("openModal('Test','secret');clearWorkspace()");assert.equal(w.run('cloud'),false);assert.equal(w.run('db.tasks.length'),0);assert.equal(w.elements.get('#modalHost').innerHTML,'');assert.doesNotMatch(w.elements.get('#content').innerHTML,/Warehouse task/);
});
test('a failed refresh clears previously loaded records',async()=>{
 const w=workspace();configure(w,true);await w.run('startCloud()');w.run("client.auth.getSession=async()=>{throw Error('Connection failed')}");await w.run('startCloud()');assert.equal(w.run('cloud'),false);assert.equal(w.run('db.tasks.length'),0);assert.match(w.elements.get('#content').innerHTML,/Connection failed/);
});
test('a load completing after sign-out cannot restore warehouse records',async()=>{
 const w=workspace();configure(w,true);await w.run('startCloud()');w.run("client.from=table=>{let q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{user_id:'employee-a'}}),order:()=>new Promise(resolve=>{pending.push(resolve)})};return q};pending=[]");
 const pending=w.run('loadCloud()');await new Promise(resolve=>setImmediate(resolve));w.run("clearWorkspace();pending.forEach(resolve=>resolve({data:[{id:'stale'}]}))");await assert.rejects(pending,/session changed/);assert.equal(w.run('db.tasks.length'),0);
});
test('published code contains no signup, local task persistence, or privileged key',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');assert.doesNotMatch(source,/\.signUp\(|localStorage|service_role|sb_secret_/);assert.match(source,/createSignedUrl\(task.attachment,60\)/);
});
test('password recovery checks the session without loading warehouse data',async()=>{
 const w=workspace();configure(w,true);w.run("recoveryMode=true;client.from=()=>{throw Error('Warehouse must not load during password reset')}");await w.run('startCloud()');assert.equal(w.run('recoveryReady'),true);assert.equal(w.run('cloud'),false);assert.equal(w.run('db.tasks.length'),0);assert.match(w.elements.get('#content').innerHTML,/Save new password/);
});
test('expired recovery link cannot show the password update form',async()=>{
 const w=workspace();configure(w,true);w.run("recoveryMode=true;client.auth.getSession=async()=>({data:{session:null}})");await w.run('startCloud()');assert.equal(w.run('recoveryReady'),false);assert.match(w.elements.get('#content').innerHTML,/expired or is invalid/);assert.doesNotMatch(w.elements.get('#content').innerHTML,/id="passwordForm"/);
});
test('reset request uses the configured app redirect and a generic confirmation',async()=>{
 const w=workspace();configure(w,true);w.run("client.auth.resetPasswordForEmail=async(email,options)=>{resetRequest={email,options};return {error:null}};showForgotPassword()");
 await w.elements.get('#forgotForm').onsubmit({preventDefault(){},target:{values:{email:' worker@example.com '},querySelector(){return {disabled:false}}}});
 assert.equal(w.run('resetRequest.email'),'worker@example.com');assert.equal(w.run('resetRequest.options.redirectTo'),'https://operationskpz.github.io/dockflow-warehouse-app/?reset=1');assert.match(w.elements.get('#resetMsg').textContent,/If this email has an account/);
});
test('password mismatch does not call the password API',async()=>{
 const w=workspace();configure(w,true);w.run("recoveryMode=true;updateCalls=0;client.auth.updateUser=async()=>{updateCalls++;return {error:null}}");await w.run('startCloud()');
 await w.elements.get('#passwordForm').onsubmit({preventDefault(){},target:{values:{password:'correct-horse-123',confirm:'different-horse-123'}}});
 assert.equal(w.run('updateCalls'),0);assert.match(w.elements.get('#passwordMsg').textContent,/do not match/);
});
test('successful reset clears the password form, signs out sessions, and shows sign-in',async()=>{
 const w=workspace();configure(w,true);w.run("recoveryMode=true;client.auth.updateUser=async()=>({error:null});client.auth.signOut=async(options)=>{logoutScope=options.scope;return {error:null}}");await w.run('startCloud()');let cleared=false;
 await w.elements.get('#passwordForm').onsubmit({preventDefault(){},target:{values:{password:'correct-horse-123',confirm:'correct-horse-123'},querySelector(){return {disabled:false}},reset(){cleared=true;}}});
 assert.equal(cleared,true);assert.equal(w.run('logoutScope'),'global');assert.equal(w.run('recoveryMode'),false);assert.equal(w.run('cloud'),false);assert.equal(w.run('db.tasks.length'),0);assert.match(w.elements.get('#content').innerHTML,/Password saved/);
});
test('a task can list both workers and appears in both workloads',()=>{
 const w=workspace();w.run("db.employees=[{id:'a',name:'Alice'},{id:'b',name:'Bob'}];db.tasks=[{id:'shared',title:'Shared work',assignee:'a',assignees:['a','b'],status:'To Do'}]");
 assert.equal(w.run('assignedNames(db.tasks[0])'),'Alice, Bob');assert.equal(w.run("isAssigned(db.tasks[0],'b')"),true);assert.match(w.run('taskHtml(db.tasks[0])'),/Alice, Bob/);assert.equal((w.run('teamPage()').match(/\(1 open\)/g)||[]).length,2);
 assert.match(w.run('workerChoices(db.tasks[0])'),/value="a" checked/);assert.match(w.run('workerChoices(db.tasks[0])'),/value="b" checked/);
});
test('legacy assignments are retained and clearing workers means unassigned',()=>{
 const w=workspace();w.run("db.employees=[{id:'a',name:'Alice'}]");assert.equal(w.run("assignedNames({assignee:'a'})"),'Alice');assert.equal(w.run("assignedNames({assignee:'a',assignees:[]})"),'Unassigned');
});
test('Spanish translates task controls and statuses while preserving entered content',()=>{
 const w=workspace();w.run("setLanguage('es');db.employees=[{id:'a',name:'Oscar'}];db.tasks=[{id:'t',title:'Receiving',category:'Receiving',priority:'High',status:'In Progress',assignees:['a'],due:''}]");
 const html=w.run('taskHtml(db.tasks[0])');assert.match(html,/<h3>Receiving<\/h3>/);assert.match(html,/Oscar/);assert.match(html,/Recepción/);assert.match(html,/En curso/);assert.match(html,/Editar/);
 assert.match(w.run("options(statuses,'In Progress')"),/value="In Progress" selected>En curso/);assert.equal(w.run('db.tasks[0].status'),'In Progress');w.run("setLanguage('en')");assert.match(w.run('taskHtml(db.tasks[0])'),/Edit/);
});
test('language choice is stored and restored on reload',()=>{
 const storage=new Map();const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};const document={documentElement:{},querySelectorAll:()=>[],querySelector:()=>null};const code=fs.readFileSync(path.join(__dirname,'../i18n.js'),'utf8');
 const first=vm.createContext({localStorage,document});vm.runInContext(code,first);vm.runInContext("setLanguage('es')",first);assert.equal(document.documentElement.lang,'es');
 const next=vm.createContext({localStorage,document});vm.runInContext(code,next);assert.equal(vm.runInContext("tr('Settings')",next),'Configuración');
});
test('task cards offer one-click start, then finish, then fixed elapsed timing',()=>{
 const w=workspace();assert.match(w.run("taskButtons({id:'t',status:'To Do',assignees:['worker']})"),/data-start="t"/);assert.doesNotMatch(w.run("taskButtons({id:'t',status:'To Do',assignees:['worker']})"),/data-finish/);
 assert.match(w.run("taskButtons({id:'t',status:'In Progress',started_at:'2026-11-11T10:00:00Z'})"),/data-finish="t"/);
 const finished=w.run("taskTiming({started_at:'2026-11-11T10:00:00Z',finished_at:'2026-11-11T11:02:03Z'})");assert.match(finished,/1 h 2 min 3 s/);assert.match(finished,/Started/);assert.match(finished,/Finished/);assert.doesNotMatch(finished,/data-elapsed-start/);assert.doesNotMatch(w.run("taskButtons({id:'t',status:'Done',finished_at:'2026-11-11T11:00:00Z'})"),/data-start|data-finish/);
});
test('missing historical times are explicit and timing controls translate to Spanish',()=>{
 const w=workspace();assert.match(w.run("taskTiming({status:'In Progress'})"),/Time not recorded/);w.run("setLanguage('es')");assert.match(w.run("taskButtons({id:'t',status:'To Do',assignees:['worker']})"),/Iniciar tarea/);assert.match(w.run("taskButtons({id:'t',started_at:'2026-11-11T10:00:00Z'})"),/Finalizar tarea/);
});
test('paused timers freeze and exclude all completed pauses',()=>{
 const w=workspace();assert.equal(w.run("taskElapsed({started_at:'2026-11-11T10:00:00Z',paused_at:'2026-11-11T10:10:00Z',total_pause_seconds:120},Date.parse('2026-11-11T11:00:00Z'))"),480000);
 const html=w.run("taskTiming({started_at:'2026-11-11T10:00:00Z',paused_at:'2026-11-11T10:10:00Z',total_pause_seconds:120})");assert.match(html,/8 min 0 s/);assert.match(html,/Paused since/);assert.doesNotMatch(html,/data-elapsed-start/);
 assert.equal(w.run("taskElapsed({started_at:'2026-11-11T10:00:00Z',finished_at:'2026-11-11T11:00:00Z',total_pause_seconds:900})"),2700000);
});
test('pause and resume controls follow shared task state in both languages',()=>{
 const w=workspace();assert.match(w.run("taskButtons({id:'t',started_at:'2026-11-11T10:00:00Z'})"),/data-pause="t"/);const paused=w.run("taskButtons({id:'t',started_at:'2026-11-11T10:00:00Z',paused_at:'2026-11-11T10:10:00Z'})");assert.match(paused,/data-resume="t"/);assert.match(paused,/data-finish="t"/);assert.doesNotMatch(paused,/data-pause=/);w.run("setLanguage('es')");assert.match(w.run("taskButtons({id:'t',started_at:'2026-11-11T10:00:00Z',paused_at:'2026-11-11T10:10:00Z'})"),/Reanudar tarea/);
});
test('dashboard shows today only and repeats shared tasks in each worker box',()=>{
 const w=workspace();w.run("db.employees=[{id:'a',name:'Alice'},{id:'b',name:'Bob'},{id:'c',name:'Carlos'}];db.tasks=[{id:'shared',title:'Shared today',due:today(),assignees:['a','b'],status:'In Progress'},{id:'unassigned',title:'Unassigned today',due:today(),status:'To Do'},{id:'past',title:'Old task',due:'2000-01-01'},{id:'future',title:'Future task',due:'2099-01-01'},{id:'none',title:'No date task',due:''}]");
 const html=w.run('dashboard()');assert.equal((html.match(/<h3>Shared today<\/h3>/g)||[]).length,2);assert.equal((html.match(/<h3>Unassigned today<\/h3>/g)||[]).length,1);assert.doesNotMatch(html,/Old task|Future task|No date task/);assert.match(html,/>Alice<\/h2>/);assert.match(html,/>Bob<\/h2>/);assert.match(html,/>Carlos<\/h2>/);assert.match(html,/No tasks due today/);assert.match(html,/Today’s tasks<\/label><strong>2<\/strong>/);assert.equal(w.run('db.tasks.length'),5);assert.match(w.run('taskPage()'),/Old task/);
});
test('today dashboard labels translate and an empty day stays useful',()=>{
 const w=workspace();w.run("setLanguage('es');db.employees=[{id:'a',name:'Oscar'}];db.tasks=[]");const html=w.run('dashboard()');assert.match(html,/Tareas de hoy/);assert.match(html,/Oscar/);assert.match(html,/No hay tareas para hoy/);
});
test('All Tasks groups every due date once without hiding older or undated tasks',()=>{
 const w=workspace();w.run("db.tasks=[{id:'a',title:'Today job',due:today(),status:'To Do'},{id:'b',title:'Tomorrow job',due:tomorrow(),status:'To Do'},{id:'c',title:'Later job',due:'2099-01-01',status:'To Do'},{id:'d',title:'Earlier done',due:'2000-01-01',status:'Done'},{id:'e',title:'No date',due:''}]");
 assert.equal(w.run('taskDateGroups(db.tasks).map(g=>g.key).join(",")'),'today,tomorrow,later,earlier,undated');assert.equal(w.run('taskDateGroups(db.tasks).flatMap(g=>g.tasks).length'),5);assert.equal(w.run('new Set(taskDateGroups(db.tasks).flatMap(g=>g.tasks.map(t=>t.id))).size'),5);const html=w.run('taskPage()');for(const title of ['Today job','Tomorrow job','Later job','Earlier done','No date'])assert.match(html,new RegExp('<h3>'+title+'</h3>'));
});
test('date sections respect search and status filters, with Spanish headings',()=>{
 const w=workspace();w.run("db.tasks=[{id:'a',title:'Pack cartons',category:'Shipping',due:today(),status:'To Do'},{id:'b',title:'Pack pallets',category:'Shipping',due:tomorrow(),status:'Done'}];search='Pack';statusFilter='To Do';categoryFilter='Shipping';setLanguage('es')");const html=w.run('taskPage()');assert.match(html,/Pack cartons/);assert.doesNotMatch(html,/Pack pallets/);assert.match(html,/Hoy/);assert.match(html,/Mañana/);assert.match(html,/Más adelante/);assert.match(html,/No hay tareas en esta sección/);
});
test('tomorrow uses the next local calendar date across year boundaries',()=>{
 const w=workspace();const fixed=new Date(2026,11,31,23,30);w.context.Date=class extends Date{constructor(...args){super(...(args.length?args:[fixed.getTime()]));}};assert.equal(w.run('today()'),'2026-12-31');assert.equal(w.run('tomorrow()'),'2027-01-01');
});
test('repeated schedules are readable by employees but only managers get controls',()=>{
 const w=workspace();w.run("db.repeated=[{id:'r',title:'Daily cleanup',frequency:'daily',starts_on:'2026-11-11',next_run_date:'2026-11-12',time_zone:'America/New_York',enabled:true,assignees:[]}];memberRole='employee'");let html=w.run('recurringPage()');assert.match(html,/Daily cleanup/);assert.doesNotMatch(html,/data-repeat-edit/);w.run("memberRole='manager'");html=w.run('recurringPage()');assert.match(html,/data-repeat-edit="r"/);assert.match(html,/Pause schedule/);assert.match(html,/Next task date/);
});
test('manager saves recurrence dates and both assignees, then requests immediate generation',async()=>{
 const w=workspace();w.run("cloud=true;memberRole='manager';loadCloud=async()=>{};client={from:table=>({upsert:obj=>{savedRule={table,obj};return {select:()=>({single:async()=>({data:{id:obj.id},error:null})})}}}),rpc:async name=>{generatedFunction=name;return {data:0,error:null}}};recurringModal()");
 await w.elements.get('#recurringForm').onsubmit({preventDefault(){},target:{values:{title:'Daily packing',description:'Keep original notes',estimated_hours:'1.5',frequency:'weekly',starts_on:'2026-12-01',ends_on:'2026-12-31',time_zone:'America/New_York',category:'Shipping',priority:'High',assignees:['a','b','a']},querySelector(){return {disabled:false}}}});
 assert.equal(w.run('savedRule.table'),'dockflow_repeated_tasks');assert.equal(w.run('savedRule.obj.starts_on'),'2026-12-01');assert.equal(w.run('savedRule.obj.frequency'),'weekly');assert.equal(w.run('savedRule.obj.assignees.join(",")'),'a,b');assert.equal(w.run('generatedFunction'),'dockflow_generate_repeated_tasks');assert.equal(w.run('savedRule.obj.description'),'Keep original notes');assert.equal(w.run('savedRule.obj.estimated_minutes'),90);
});
test('invalid repeat date range is not submitted, and employee cannot open schedule editor',async()=>{
 const w=workspace();w.run("cloud=true;memberRole='employee';recurringModal()");assert.equal(w.elements.get('#modalHost'),undefined);w.run("memberRole='manager';saveCalls=0;client={from:()=>{saveCalls++;}};recurringModal()");await w.elements.get('#recurringForm').onsubmit({preventDefault(){},target:{values:{title:'Task',description:'',frequency:'daily',starts_on:'2026-12-02',ends_on:'2026-12-01',time_zone:'America/New_York',category:'General',priority:'Medium'},querySelector(){return {disabled:false}}}});assert.equal(w.run('saveCalls'),0);
});
test('repeated-task section supports Spanish and clears schedules at sign-out',()=>{
 const w=workspace();w.run("setLanguage('es');db.repeated=[]");assert.match(w.run('recurringPage()'),/Todavía no hay tareas repetidas/);w.run("memberRole='manager';db.repeated=[{id:'r'}];clearWorkspace()");assert.equal(w.run('memberRole'),'employee');assert.equal(w.run('db.repeated.length'),0);
});
test('compact worker task keeps timing, notes, attachment and actions accessible',()=>{
 const w=workspace();w.run("db.employees=[{id:'a',name:'Alice'}]");const html=w.run("workerTaskHtml({id:'t',title:'Pack cartons',description:'Private notes',assignees:['a'],status:'In Progress',priority:'High',started_at:'2026-11-11T10:00:00Z',attachment:'a/file.pdf'})");assert.match(html,/Pack cartons/);assert.match(html,/data-pause="t"/);assert.match(html,/data-finish="t"/);assert.match(html,/data-edit="t"/);assert.match(html,/data-elapsed-start/);assert.match(html,/<details class="worker-task-details">/);assert.match(html,/Private notes/);assert.match(html,/data-attachment="t"/);
});
test('All Tasks groups workers inside each date section and preserves shared and unassigned work',()=>{
 const w=workspace();w.run("db.employees=[{id:'a',name:'Alice'},{id:'b',name:'Bob'},{id:'c',name:'Carlos'}];db.tasks=[{id:'s',title:'Shared today',due:today(),assignees:['a','b'],status:'To Do'},{id:'t',title:'Alice tomorrow',due:tomorrow(),assignees:['a'],status:'To Do'},{id:'u',title:'Unassigned later',due:'2099-01-01',status:'To Do'}]");
 assert.equal(w.run('tasksByWorker(todaysTasks()).map(w=>w.name).join(",")'),'Alice,Bob');const html=w.run('taskPage()');assert.equal((html.match(/<h3>Shared today<\/h3>/g)||[]).length,2);assert.equal((html.match(/<h3>Alice tomorrow<\/h3>/g)||[]).length,1);assert.match(html,/Unassigned later/);assert.match(html,/Unassigned/);assert.match(html,/worker-card drop-only[^>]*data-worker-id="c"/);assert.match(html,/id="task-date-today"/);assert.match(html,/id="task-date-tomorrow"/);assert.match(html,/data-start="s"/);
});
test('worker grouping follows active task filters and shows due dates on compact cards',()=>{
 const w=workspace();w.run("db.employees=[{id:'a',name:'Alice'},{id:'b',name:'Bob'}];db.tasks=[{id:'a',title:'Active job',due:today(),assignees:['a'],status:'In Progress'},{id:'b',title:'Finished job',due:today(),assignees:['b'],status:'Done'}];statusFilter='In Progress'");const html=w.run('taskPage()');assert.match(html,/Alice/);assert.doesNotMatch(html,/Finished job/);assert.match(html,/worker-card drop-only[^>]*data-worker-id="b"/);assert.match(html,/Due /);assert.match(html,/Active job/);
});
test('worker design shows correct completion and escapes worker names',()=>{
 const w=workspace();const html=w.run("workerHeading('Oscar Smith',[{status:'Done'},{status:'To Do'},{status:'Done'}])");assert.match(html,/OS<\/span>/);assert.match(html,/2\/3 completed/);assert.match(html,/aria-valuenow="2"/);assert.match(html,/aria-valuemax="3"/);assert.match(html,/width:67%/);assert.doesNotMatch(w.run("workerHeading('<img src=x>',[])"),/<img/);
});
test('remaining estimate subtracts working time and completed pauses',()=>{
 const w=workspace();const s=w.run("estimateState({estimated_minutes:30,started_at:'2026-11-11T10:00:00Z',total_pause_seconds:300},Date.parse('2026-11-11T10:15:00Z'))");assert.equal(s.label,'Remaining');assert.equal(s.milliseconds,20*60000);assert.equal(s.tone,'estimate-running');
});
test('paused estimate remains fixed even when the app is reopened much later',()=>{
 const w=workspace();w.run("pausedTask={estimated_minutes:30,started_at:'2026-11-11T10:00:00Z',paused_at:'2026-11-11T10:10:00Z',total_pause_seconds:120}");assert.equal(w.run("estimateState(pausedTask,Date.parse('2026-11-11T11:00:00Z')).milliseconds"),22*60000);assert.equal(w.run("estimateState(pausedTask,Date.parse('2026-11-12T11:00:00Z')).milliseconds"),22*60000);assert.doesNotMatch(w.run('taskEstimateHtml(pausedTask)'),/data-estimate-id/);
});
test('countdown shows over-estimate time and freezes when finished',()=>{
 const w=workspace();const over=w.run("estimateState({estimated_minutes:5,started_at:'2026-11-11T10:00:00Z'},Date.parse('2026-11-11T10:08:00Z'))");assert.equal(over.label,'Over estimate');assert.equal(over.milliseconds,3*60000);assert.equal(over.tone,'estimate-over');w.run("finishedTask={id:'t',estimated_minutes:10,started_at:'2026-11-11T10:00:00Z',finished_at:'2026-11-11T10:08:00Z'}");const finished=w.run("estimateState(finishedTask,Date.parse('2026-12-01T10:00:00Z'))");assert.equal(finished.label,'Under estimate');assert.equal(finished.milliseconds,2*60000);assert.doesNotMatch(w.run('taskEstimateHtml(finishedTask)'),/data-estimate-id/);
});
test('hour estimates are optional, convert fractions, and reject invalid values',()=>{
 const w=workspace();assert.equal(w.run("readEstimatedHours('')"),null);assert.equal(w.run('readEstimatedHours(undefined)'),null);assert.equal(w.run("readEstimatedHours('0.75')"),45);for(const value of [0,-1,0.001,8761,'invalid'])assert.throws(()=>w.run('readEstimatedHours('+JSON.stringify(value)+')'),/estimated hours/);assert.equal(w.run('taskEstimateHtml({})'),'');
});
test('task save persists estimated minutes and displays the field',async()=>{
 const w=workspace();w.run("cloud=true;loadCloud=async()=>{};client={from:()=>({upsert:obj=>{savedTask=obj;return {select:()=>({single:async()=>({data:{id:obj.id},error:null})})}}})};taskModal()");assert.match(w.elements.get('#modalHost').innerHTML,/Estimated time \(hours\)/);await w.elements.get('#taskForm').onsubmit({preventDefault(){},target:{values:{title:'Packing',description:'',category:'Shipping',priority:'Medium',status:'To Do',due:'2026-11-11',assignees:['a'],estimated_hours:'0.75'},querySelector(){return {disabled:false}}}});assert.equal(w.run('savedTask.estimated_minutes'),45);
});
test('live estimate refresh updates every shared copy and supports Spanish',()=>{
 const w=workspace();const label={},value={};const first={dataset:{estimateId:'t'},querySelector:s=>s==='[data-remaining-label]'?label:value};const label2={},value2={};const second={dataset:{estimateId:'t'},querySelector:s=>s==='[data-remaining-label]'?label2:value2};w.context.document.querySelectorAll=()=>[first,second];w.run("setLanguage('es');db.tasks=[{id:'t',estimated_minutes:1,started_at:new Date(Date.now()-120000).toISOString()}];updateEstimateDisplays()");assert.equal(label.textContent,'Tiempo excedido');assert.equal(label2.textContent,'Tiempo excedido');assert.equal(value.textContent,value2.textContent);assert.equal(first.className,'task-estimate estimate-over');
});
test('hour inputs preserve existing estimates and accept quarter-hour durations',()=>{
 const w=workspace();assert.match(w.run('estimateInput(90)'),/value="1.5"/);assert.equal(w.run("readEstimatedHours('1.5')"),90);assert.equal(w.run("readEstimatedHours('0.5')"),30);assert.equal(w.run("readEstimatedHours('2.25')"),135);assert.match(w.run('estimateInput(1)'),/value="0.0167"/);assert.equal(w.run("readEstimatedHours('0.0167')"),1);
});
test('CSV exports estimated hours rather than minute values',()=>{
 const w=workspace();w.run("db.tasks=[{id:'t',title:'Packing',estimated_minutes:90}];download=(name,text)=>{csvExport=text};exportCsv()");const csv=w.run('csvExport');assert.match(csv.split('\r\n')[0],/estimated_hours/);assert.doesNotMatch(csv.split('\r\n')[0],/estimated_minutes/);assert.equal(csv.split('\r\n')[1].split(',')[csv.split('\r\n')[0].split(',').indexOf('estimated_hours')],'"1.5"');
});
test('approved account refresh requests carryover before loading tasks',async()=>{
 const w=workspace();configure(w,true);w.run("rolloverCalls=0;client.rpc=async(name)=>{if(name==='dockflow_rollover_unfinished_tasks')rolloverCalls++;return {data:0,error:null}}");await w.run('startCloud()');assert.equal(w.run('rolloverCalls'),1);assert.equal(w.run('cloud'),true);
});
test('unapproved accounts never request task carryover',async()=>{
 const w=workspace();configure(w,false);w.run("rolloverCalls=0;client.rpc=async()=>{rolloverCalls++;return {data:0,error:null}}");await w.run('startCloud()');assert.equal(w.run('rolloverCalls'),0);assert.equal(w.run('cloud'),false);
});
test('daily refresh waits for editing to finish and refreshes only once',async()=>{
 const w=workspace();w.run("cloud=true;view='dashboard';displayedDashboardDay='2000-01-01';syncCalls=0;loadCloud=async()=>{syncCalls++;lastTaskSync=Date.now()};$('#modalHost').innerHTML='<form>Unsaved work</form>'");await w.run('refreshTaskDay()');assert.equal(w.run('syncCalls'),0);w.run("$('#modalHost').innerHTML=''");w.context.document.activeElement={matches:()=>true};await w.run('refreshTaskDay()');assert.equal(w.run('syncCalls'),0);w.context.document.activeElement=null;await w.run('refreshTaskDay()');await w.run('refreshTaskDay()');assert.equal(w.run('syncCalls'),1);assert.equal(w.run('displayedDashboardDay'),w.run('today()'));
});
test('carried-over task cards show their original due date in both languages',()=>{
 const w=workspace();w.run("carried={id:'t',title:'Unfinished work',status:'To Do',priority:'Medium',due:today(),original_due:'2026-11-10',carryover_count:1}");const html=w.run('workerTaskHtml(carried)');assert.match(html,/Carried over/);assert.match(html,/Original due date/);assert.match(html,/2026/);w.run("setLanguage('es')");assert.match(w.run('workerTaskHtml(carried)'),/Trasladada de otro día/);assert.equal(w.run("carryoverBadge({})"),'');
});
function routedWorkspace(href){
 const location=new URL(href),entries=[href];let position=0;
 const history={pushState(data,title,url){location.href=new URL(url,location.href).href;entries.splice(position+1);entries.push(location.href);position++;},replaceState(data,title,url){location.href=new URL(url,location.href).href;entries[position]=location.href;}};
 const w=workspace({URL,location,history});return {...w,location,entries,back(){if(position>0){position--;location.href=entries[position];w.windowListeners.get('popstate')();}},forward(){if(position<entries.length-1){position++;location.href=entries[position];w.windowListeners.get('popstate')();}}};
}
test('all seven page links restore their target while keeping signed-out data protected',()=>{
 for(const page of ['dashboard','tasks','repeated','operations','team','reports','settings']){const w=routedWorkspace('https://operationskpz.github.io/dockflow-warehouse-app/?page='+page);assert.equal(w.run('view'),page);assert.match(w.elements.get('#content').innerHTML,/Employee sign-in/);assert.equal(w.run('db.tasks.length'),0);assert.equal(w.run('pageLink(view)'),'?page='+page);}
 const invalid=routedWorkspace('https://operationskpz.github.io/dockflow-warehouse-app/?page=__proto__');assert.equal(invalid.run('view'),'dashboard');
});
test('page navigation supports Back Forward refresh and no duplicate history entries',()=>{
 const w=routedWorkspace('https://operationskpz.github.io/dockflow-warehouse-app/?page=tasks');w.run("navigateTo('reports')");assert.equal(w.location.search,'?page=reports');w.run("navigateTo('reports')");assert.equal(w.entries.length,2);w.back();assert.equal(w.run('view'),'tasks');w.forward();assert.equal(w.run('view'),'reports');const reload=routedWorkspace(w.location.href);assert.equal(reload.run('view'),'reports');
});
test('Ctrl-click remains a native new-tab link and normal clicks navigate in the app',async()=>{
 const w=routedWorkspace('https://operationskpz.github.io/dockflow-warehouse-app/?page=dashboard');w.run('cloud=true;render=()=>{}');let prevented=false;const link={dataset:{view:'team'}},target={closest:s=>s==='a[data-view],a[data-goto]'?link:null};await w.listeners.get('click')({target,ctrlKey:true,button:0,preventDefault(){prevented=true;}});assert.equal(prevented,false);assert.equal(w.entries.length,1);await w.listeners.get('click')({target,ctrlKey:false,button:0,preventDefault(){prevented=true;}});assert.equal(prevented,true);assert.equal(w.run('view'),'team');assert.equal(w.location.search,'?page=team');
});
test('page routing does not consume password recovery tokens or reset parameters',()=>{
 const href='https://operationskpz.github.io/dockflow-warehouse-app/?page=settings&reset=1#type=recovery&access_token=private-example';const w=routedWorkspace(href);assert.equal(w.run('view'),'settings');assert.equal(w.run('recoveryMode'),true);assert.equal(w.location.href,href);assert.match(w.elements.get('#content').innerHTML,/Reset your password/);assert.equal(w.run('db.tasks.length'),0);
});
test('offline bookmarked page navigation falls back to the cached app shell',async()=>{
 const handlers=new Map();let response;
 const context=vm.createContext({self:{addEventListener:(type,fn)=>handlers.set(type,fn)},URL,location:{origin:'https://operationskpz.github.io'},fetch:async()=>{throw Error('offline')},caches:{match:async path=>path==='./index.html'?'cached-shell':undefined}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),context);handlers.get('fetch')({request:{method:'GET',mode:'navigate',url:'https://operationskpz.github.io/dockflow-warehouse-app/?page=reports'},respondWith:p=>{response=p}});assert.equal(await response,'cached-shell');
});
test('returning to a signed-in tab refreshes quietly without clearing the page or form',async()=>{
 const w=workspace();configure(w,true);w.run("view='tasks'");await w.run('startCloud()');const html=w.elements.get('#content').innerHTML;w.run("sessionReads=0;client.auth.getSession=async()=>{sessionReads++;throw Error('Should not restart sign-in')};loadCloud=()=>new Promise(resolve=>{finishResume=resolve})");const pending=w.run('handlePageVisible()');assert.equal(w.run('cloud'),true);assert.equal(w.run('loading'),false);assert.equal(w.elements.get('#content').innerHTML,html);assert.equal(w.run('sessionReads'),0);w.run("$('#modalHost').innerHTML='<form>Unsubmitted changes</form>';finishResume()");await pending;assert.match(w.elements.get('#modalHost').innerHTML,/Unsubmitted changes/);assert.equal(w.elements.get('#content').innerHTML,html);
});
test('same-user auth refresh events retain the current page and unsaved work',async()=>{
 const w=workspace();configure(w,true);await w.run('startCloud()');w.run("$('#modalHost').innerHTML='<form>Unsaved</form>';handleAuthChange('SIGNED_IN',{user:{id:'employee-a',email:'a@example.com'}});handleAuthChange('TOKEN_REFRESHED',{user:{id:'employee-a',email:'a@example.com'}})");assert.equal(w.run('cloud'),true);assert.equal(w.run('loading'),false);assert.equal(w.run('db.tasks.length'),1);assert.match(w.elements.get('#modalHost').innerHTML,/Unsaved/);
});
test('overlapping initial session restores share one attempt',async()=>{
 const w=workspace();configure(w,true);w.run("sessionReads=0;client.auth.getSession=()=>{sessionReads++;return new Promise(resolve=>{resolveRestore=resolve})}");const first=w.run('startCloud()'),second=w.run('startCloud()');assert.equal(first,second);assert.equal(w.run('sessionReads'),1);w.run("resolveRestore({data:{session:{user:{id:'employee-a',email:'a@example.com'}}}})");await first;assert.equal(w.run('cloud'),true);assert.equal(w.run('loading'),false);
});
test('initial connection timeout ends the loading screen and ignores a late session',async()=>{
 const w=workspace();configure(w,true);w.run("const normalTimeout=withTimeout;withTimeout=p=>normalTimeout(p,1);client.auth.getSession=()=>new Promise(resolve=>{lateSession=resolve})");await w.run('startCloud()');assert.equal(w.run('loading'),false);assert.equal(w.run('cloud'),false);assert.match(w.elements.get('#content').innerHTML,/Connection timed out/);assert.match(w.elements.get('#content').innerHTML,/Retry connection/);w.run("lateSession({data:{session:{user:{id:'employee-a'}}}})");await new Promise(resolve=>setImmediate(resolve));assert.equal(w.run('db.tasks.length'),0);
});
test('background connection failure preserves the workspace and offers a successful retry',async()=>{
 const w=workspace();configure(w,true);w.run("view='tasks'");await w.run('startCloud()');const html=w.elements.get('#content').innerHTML;w.run("loadCloud=async()=>{throw Error('offline')}");await w.run('handlePageVisible()');assert.equal(w.run('cloud'),true);assert.equal(w.run('db.tasks.length'),1);assert.equal(w.elements.get('#content').innerHTML,html);assert.match(w.elements.get('#notice').innerHTML,/Retry connection/);w.run('loadCloud=async()=>{}');await w.run('refreshTaskDay(true)');assert.equal(w.run('connectionWarning'),'');assert.equal(w.run('cloud'),true);
});
test('loss of warehouse access still clears private data during a background refresh',async()=>{
 const w=workspace();configure(w,true);await w.run('startCloud()');w.run("loadCloud=async()=>{throw Object.assign(Error('Access revoked'),{code:'WAREHOUSE_ACCESS_DENIED'})}");await w.run('handlePageVisible()');assert.equal(w.run('cloud'),false);assert.equal(w.run('db.tasks.length'),0);assert.match(w.elements.get('#content').innerHTML,/Access revoked/);
});
test('network timeout aborts the underlying request instead of retaining its auth lock',async()=>{
 const w=workspace({fetch:(input,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('request aborted')),{once:true}))});await assert.rejects(w.run("boundedFetch('https://example.invalid',{},1)"),/request aborted/);
});
test('returning to a login or password reset form preserves input without another restore',()=>{
 const w=workspace();configure(w,true);w.run("sessionReads=0;client.auth.getSession=async()=>{sessionReads++;return {data:{session:null}}};loading=false");w.context.document.activeElement={matches:()=>true};w.run('handlePageVisible()');assert.equal(w.run('sessionReads'),0);w.context.document.activeElement=null;w.run('recoveryMode=true;recoveryReady=true;handlePageVisible()');assert.equal(w.run('sessionReads'),0);
});
test('bundled Supabase SDK routes its data requests through the configured fetch adapter',async()=>{
 let calls=0;const c=vm.createContext({URL,Headers,Request,Response,AbortController,TextEncoder,TextDecoder,WebSocket,console,setTimeout,clearTimeout,setInterval,clearInterval,crypto:require('node:crypto').webcrypto});vm.runInContext(fs.readFileSync(path.join(__dirname,'../vendor/supabase-2.119.0.js'),'utf8'),c);const client=c.supabase.createClient('https://example.supabase.co','public-test-key',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async()=>{calls++;return new Response('[]',{status:200,headers:{'Content-Type':'application/json'}})}}});const result=await client.from('probe').select('*');assert.equal(result.error,null);assert.equal(calls,1);
});

test('unassigned tasks offer assignment instead of start, including Spanish',()=>{
 const w=workspace();const html=w.run("taskButtons({id:'t',status:'To Do',assignees:[]})");assert.match(html,/data-assign="t"/);assert.doesNotMatch(html,/data-start=/);assert.match(w.run("taskButtons({id:'t',status:'To Do',assignee:'legacy'})"),/data-start="t"/);w.run("setLanguage('es')");assert.match(w.run("taskButtons({id:'t',status:'To Do'})"),/Asignar a/);
});
test('assignment picker shows only workers and saves only assignment fields',async()=>{
 const w=workspace();w.run("cloud=true;db.tasks=[{id:'t',title:'Packing',description:'Keep me',status:'To Do'}];db.employees=[{id:'a',name:'Oscar'},{id:'b',name:'Nelly'}];loadCloud=async()=>{};client={from:table=>{assignmentTable=table;return {update:obj=>{assignmentPatch=obj;return {eq:(key,id)=>{assignmentFilter=[key,id];return {select:()=>({single:async()=>({data:{id},error:null})})}}}}}}};assignmentModal('t')");
 const html=w.elements.get('#modalHost').innerHTML;assert.match(html,/Oscar/);assert.match(html,/Nelly/);assert.match(html,/Save assignment/);assert.doesNotMatch(html,/name="title"|name="due"|name="description"|name="file"/);
 await w.elements.get('#assignmentForm').onsubmit({preventDefault(){},target:{values:{assignees:['a','b','a']},querySelector(){return {disabled:false}}}});
 assert.equal(w.run('assignmentTable'),'dockflow_tasks');assert.equal(w.run('JSON.stringify(assignmentPatch)'),JSON.stringify({assignee:'a',assignees:['a','b']}));assert.equal(w.run('JSON.stringify(assignmentFilter)'),JSON.stringify(['id','t']));assert.equal(w.elements.get('#modalHost')?.innerHTML||'','');
});
test('finished tasks disappear from dashboard boxes but remain in All Tasks',()=>{
 const w=workspace();w.run("db.employees=[{id:'a',name:'Oscar'}];db.tasks=[{id:'open',title:'Still working',due:today(),status:'In Progress',assignees:['a'],estimated_minutes:60},{id:'done',title:'Finished assigned',due:today(),status:'Done',assignees:['a'],estimated_minutes:120},{id:'unassigned',title:'Finished unassigned',due:today(),status:'Done',assignees:[]},{id:'timestamp',title:'Finished timestamp',due:today(),status:'In Progress',finished_at:new Date().toISOString(),assignees:['a']}]");
 const html=w.run('dashboard()');assert.match(html,/Still working/);assert.doesNotMatch(html,/Finished assigned|Finished unassigned|Finished timestamp/);assert.match(html,/Completed<\/label><strong>3<\/strong>/);assert.match(html,/1 h<\/strong>/);assert.equal(w.run('db.tasks.length'),4);const all=w.run('taskPage()');assert.match(all,/Finished assigned/);assert.match(all,/Finished unassigned/);
});
test('drag reassignment assigns unassigned tasks and preserves other shared workers',()=>{
 const w=workspace();w.run("db.employees=[{id:'a',name:'Alice'},{id:'b',name:'Bob'},{id:'c',name:'Carlos'}]");assert.equal(w.run("JSON.stringify(movedWorkerIds({assignees:[]},'','b'))"),'["b"]');assert.equal(w.run("JSON.stringify(movedWorkerIds({assignees:['a','c']},'a','b'))"),'["c","b"]');assert.equal(w.run("JSON.stringify(movedWorkerIds({assignees:['a','b']},'a','b'))"),'["b"]');assert.equal(w.run("JSON.stringify(movedWorkerIds({assignee:'a'},'a',''))"),'[]');assert.throws(()=>w.run("movedWorkerIds({assignees:['b']},'a','c')"),/assignment changed/);assert.throws(()=>w.run("movedWorkerIds({assignees:[]},'','missing')"),/no longer available/);
});
test('task drops save only worker assignments for the selected task',async()=>{
 const w=workspace();w.run("cloud=true;db.employees=[{id:'a'},{id:'b'},{id:'c'}];db.tasks=[{id:'t',assignees:['a','c'],title:'Keep title'}];loadCloud=async()=>{};client={from:table=>{moveTable=table;return {update:obj=>{movePatch=obj;return {eq:(key,id)=>{moveId=id;return {select:()=>({single:async()=>({data:{id},error:null})})}}}}}}};");await w.run("dropWorkerTask({id:'t',source:'a'},'b')");assert.equal(w.run('moveTable'),'dockflow_tasks');assert.equal(w.run('moveId'),'t');assert.equal(w.run('JSON.stringify(movePatch)'),'{"assignee":"c","assignees":["c","b"]}');assert.equal(w.run('taskMoveSaving'),false);
});
test('native drag survives the browser pointercancel event',()=>{
 const w=workspace();w.run("dragTaskState={id:'t',source:''};touchTaskDrag=null");w.listeners.get('pointercancel')({});assert.equal(w.run('dragTaskState.id'),'t');
});
test('dropping asks for confirmation and only saves after confirmation',async()=>{
 const w=workspace();w.run("cloud=true;db.employees=[{id:'b',name:'Bob'}];db.tasks=[{id:'t',title:'Packing',assignees:[]}];moveCalls=0;dropWorkerTask=async(payload,target)=>{moveCalls++;savedDestination=target};confirmTaskDrop({id:'t',source:''},'b')");assert.match(w.elements.get('#modalHost').innerHTML,/Assign this task to.*Bob/);assert.equal(w.run('moveCalls'),0);const button={disabled:false};await w.elements.get('#confirmTaskMove').onclick({currentTarget:button});assert.equal(w.run('moveCalls'),1);assert.equal(w.run('savedDestination'),'b');assert.equal(button.disabled,false);
});
test('add mode keeps original workers and avoids duplicate assignments',()=>{
 const w=workspace();w.run("db.employees=[{id:'a'},{id:'b'},{id:'c'}]");assert.equal(w.run("JSON.stringify(movedWorkerIds({assignees:['a','c']},'a','b','add'))"),'["a","c","b"]');assert.equal(w.run("JSON.stringify(movedWorkerIds({assignees:['a','b']},'a','b','add'))"),'["a","b"]');assert.equal(w.run("JSON.stringify(movedWorkerIds({assignees:['a','c']},'a','b','move'))"),'["c","b"]');
});
test('worker-to-worker popup offers add and move without saving until selected',async()=>{
 const w=workspace();w.run("cloud=true;db.employees=[{id:'a',name:'Alice'},{id:'b',name:'Bob'}];db.tasks=[{id:'t',title:'Packing',assignees:['a']}];moveCalls=0;dropWorkerTask=async(payload,target,mode)=>{moveCalls++;chosenMode=mode};confirmTaskDrop({id:'t',source:'a'},'b')");const html=w.elements.get('#modalHost').innerHTML;assert.match(html,/Add this worker/);assert.match(html,/Move to this worker/);assert.match(html,/Keep assigned to.*Alice.*and add.*Bob/);assert.match(html,/Remove from.*Alice.*and assign to.*Bob/);assert.equal(w.run('moveCalls'),0);await w.elements.get('#confirmTaskAdd').onclick({currentTarget:{disabled:false}});assert.equal(w.run('chosenMode'),'add');await w.elements.get('#confirmTaskMove').onclick({currentTarget:{disabled:false}});assert.equal(w.run('chosenMode'),'move');
});
test('worker order is independent and active tasks stay pinned above saved order',()=>{
 const w=workspace();w.run("ordered=[{id:'a',status:'To Do',worker_order:{oscar:2,nelly:1}},{id:'b',status:'To Do',worker_order:{oscar:1,nelly:2}},{id:'active',status:'In Progress',worker_order:{oscar:99,nelly:99}}]");assert.equal(w.run("[...ordered].sort((a,b)=>compareWorkerTasks(a,b,'oscar')).map(t=>t.id).join(',')"),'active,b,a');assert.equal(w.run("[...ordered].sort((a,b)=>compareWorkerTasks(a,b,'nelly')).map(t=>t.id).join(',')"),'active,a,b');
});
test('manual reordering clamps waiting tasks below active tasks and preserves completed-last',()=>{
 const w=workspace();w.run("items=[{id:'active',status:'In Progress'},{id:'a',status:'To Do'},{id:'b',status:'To Do'},{id:'done',status:'Done'}]");assert.equal(w.run("planTaskOrder(items,'b','a').join(',')"),'active,b,a,done');assert.equal(w.run("planTaskOrder(items,'b','active').join(',')"),'active,b,a,done');assert.equal(w.run("planTaskOrder(items,'active','done',true).join(',')"),'active,a,b,done');assert.equal(w.run("items.map(t=>t.id).join(',')"),'active,a,b,done');
});
test('saving worker order uses a single shared RPC with worker key and IDs',async()=>{
 const w=workspace();w.run("cloud=true;loadCloud=async()=>{};client={rpc:async(name,args)=>{orderRpc=name;orderArgs=args;return {data:2,error:null}}}");await w.run("saveTaskOrder(['b','a'],'oscar')");assert.equal(w.run('orderRpc'),'dockflow_reorder_tasks');assert.equal(w.run('JSON.stringify(orderArgs)'),'{"ordered_task_ids":["b","a"],"worker_key":"oscar"}');assert.equal(w.run('taskMoveSaving'),false);
});
test('task updates validate text and photo limits without changing instructions',()=>{
 const w=workspace();assert.equal(w.run("validateTaskUpdate(' Progress ',null)"),'Progress');assert.throws(()=>w.run("validateTaskUpdate(' ',null)"),/Write an update/);assert.throws(()=>w.run("validateTaskUpdate('x'.repeat(4001),null)"),/4000/);assert.throws(()=>w.run("validateTaskUpdate('',{size:5000001,type:'image/png'})"),/5 MB/);assert.throws(()=>w.run("validateTaskUpdate('',{size:20,type:'text/html'})"),/JPG/);assert.equal(w.run("validateTaskUpdate('',{size:20,type:'image/png'})"),'');
});
test('comment text, author and photo IDs are escaped instead of rendered as HTML',()=>{
 const w=workspace();const html=w.run("taskUpdateHtml({id:'evil\"',author_name:'<img src=x>',body:'<script>alert(1)</script>',photo_path:'private/file',created_at:'2026-11-17T15:00:00Z'})");assert.doesNotMatch(html,/<img|<script/);assert.match(html,/&lt;script&gt;/);assert.match(html,/View photo/);assert.doesNotMatch(html,/private\/file/);
});
test('posting a comment inserts only update fields and trusts server attribution',async()=>{
 const w=workspace();w.run("cloud=true;user={id:'a'};thread={id:'t',epoch,updates:[],posting:false};taskUpdateThread=thread;refreshTaskUpdates=async()=>{};client={from:table=>{postedTable=table;return {insert:obj=>{postedUpdate=obj;return {select:()=>({single:async()=>({data:{id:obj.id},error:null})})}}}}}");let reset=false;await w.run('postTaskUpdate')({preventDefault(){},target:{values:{body:'Ready for pickup',photo:null},querySelector:()=>({disabled:false}),reset(){reset=true}}},w.run('thread'));assert.equal(w.run('postedTable'),'dockflow_task_updates');assert.equal(w.run('postedUpdate.task_id'),'t');assert.equal(w.run('postedUpdate.body'),'Ready for pickup');assert.equal(w.run('postedUpdate.photo_path'),null);assert.equal(w.run("'author_id' in postedUpdate||'author_name' in postedUpdate||'created_at' in postedUpdate"),false);assert.equal(reset,true);
});
test('private photo upload is attached to its comment, and failed inserts clean up the upload',async()=>{
 const w=workspace();w.run("cloud=true;user={id:'employee-a'};thread={id:'t',epoch,updates:[],posting:false};taskUpdateThread=thread;client={storage:{from:()=>({upload:async(path,file)=>{uploadedPath=path;return {error:null}},remove:async(paths)=>{removedPaths=paths;return {error:null}}})},from:()=>({insert:()=>({select:()=>({single:async()=>({error:{message:'Database rejected update'}})})})})}");await w.run('postTaskUpdate')({preventDefault(){},target:{values:{body:'Photo update',photo:{size:100,type:'image/png',name:'photo.png'}},querySelector:()=>({disabled:false}),reset(){}}},w.run('thread'));assert.match(w.run('uploadedPath'),/^employee-a\/updates\//);assert.equal(w.run('removedPaths[0]'),w.run('uploadedPath'));assert.match(w.elements.get('#taskUpdatePostError').textContent,/Database rejected/);
});
test('closing or replacing a dialog invalidates any in-flight update read',async()=>{
 const w=workspace();w.run("cloud=true;thread={id:'t',epoch,updates:[],reading:false};taskUpdateThread=thread;client={from:()=>({select(){return this},eq(){return this},order(){return this},limit:()=>new Promise(resolve=>{resolveUpdates=resolve})})}");const pending=w.run('refreshTaskUpdates(thread)');w.run("openModal('Other','Other content');resolveUpdates({data:[{id:'late',body:'Private late comment'}],error:null})");await pending;assert.equal(w.run('taskUpdateThread'),null);assert.doesNotMatch(w.elements.get('#modalHost').innerHTML,/Private late/);
});
test('Help dialog offers camera capture and keeps the selected camera photo ready to post',async()=>{
 const w=workspace();w.run("cloud=true;db.tasks=[{id:'t',title:'Packing'}];refreshTaskUpdates=async()=>{}");await w.run("taskUpdatesModal('t')");const html=w.elements.get('#modalHost').innerHTML;assert.match(html,/>Help<\/h2>/);assert.match(html,/Take a photo/);assert.match(html,/capture="environment"/);assert.match(html,/id="taskUpdatePhoto"/);assert.match(w.run("taskButtons({id:'t',status:'To Do'})"),/Help<\/button>/);w.elements.get('#helpCameraPhoto').onchange({target:{files:[{name:'camera.jpg',type:'image/jpeg',size:100}]}});assert.equal(w.run('taskUpdateThread.photo.name'),'camera.jpg');assert.match(w.elements.get('#helpSelectedPhoto').textContent,/camera.jpg/);w.run('stopTaskUpdates()');
});
test('bulk pause is admin-only and disabled without running tasks',()=>{
 const w=workspace();w.run("cloud=true;view='dashboard';db.tasks=[{id:'t',status:'In Progress',started_at:'2026-11-17T10:00:00Z'}];memberRole='employee'");assert.equal(w.run('bulkPauseControl()'),'');w.run("memberRole='manager'");assert.match(w.run('bulkPauseControl()'),/id="pauseAllTasks"/);assert.doesNotMatch(w.run('bulkPauseControl()'),/disabled/);w.run("db.tasks[0].paused_at='2026-11-17T11:00:00Z'");assert.match(w.run('bulkPauseControl()'),/disabled/);w.run('cloud=false');assert.equal(w.run('bulkPauseControl()'),'');
});
test('admin confirms bulk pause before a single server call',async()=>{
 const w=workspace();w.run("cloud=true;memberRole='manager';db.tasks=[{id:'t',started_at:'2026-11-17T10:00:00Z',status:'In Progress'}];pauseCalls=0;client={rpc:async name=>{pauseCalls++;pauseRpc=name;return {data:1,error:null}}};loadCloud=async()=>{};confirmPauseAllTasks()");assert.match(w.elements.get('#modalHost').innerHTML,/across all workers/);assert.equal(w.run('pauseCalls'),0);await w.elements.get('#confirmPauseAll').onclick({currentTarget:{disabled:false}});assert.equal(w.run('pauseCalls'),1);assert.equal(w.run('pauseRpc'),'dockflow_pause_all_tasks');assert.equal(w.elements.get('#modalHost')?.innerHTML||'','');
});
test('employees cannot open bulk pause confirmation',()=>{
 const w=workspace();w.run("cloud=true;memberRole='employee';db.tasks=[{id:'t',started_at:'2026-11-17T10:00:00Z'}];confirmPauseAllTasks()");assert.equal(w.elements.get('#modalHost')?.innerHTML||'','');
});
test('quantity details accept whole counts and provide pallets, boxes and units',()=>{
 const w=workspace();assert.equal(w.run("readTaskQuantity('5')"),5);assert.equal(w.run("readTaskQuantity('')"),null);for(const value of ['0','-1','1.5','NaN','1000001'])assert.throws(()=>w.run(`readTaskQuantity('${value}')`));const html=w.run("taskQuantityFields({target_quantity:5,quantity_unit:'boxes'})");assert.match(html,/name="target_quantity"/);assert.match(html,/value="boxes" selected/);assert.match(html,/Pallets/);assert.match(html,/Boxes/);assert.match(html,/Units/);
});
test('quantity progress permits one item only on running unfinished tasks',()=>{
 const w=workspace();w.run("q={id:'t',target_quantity:5,completed_quantity:1,quantity_unit:'pallets',started_at:'2026-11-18T12:00:00Z',status:'In Progress'}");let html=w.run('taskQuantityHtml(q)');assert.match(html,/1\/5 pallets completed/);assert.match(html,/data-complete-quantity="t"/);assert.match(html,/\+1 pallet/);w.run("q.paused_at='2026-11-18T13:00:00Z'");assert.doesNotMatch(w.run('taskQuantityHtml(q)'),/data-complete-quantity/);w.run('q.paused_at=null;q.completed_quantity=5');assert.doesNotMatch(w.run('taskQuantityHtml(q)'),/data-complete-quantity/);assert.equal(w.run("taskQuantityHtml({id:'old'})"),'');
});
test('recording quantity uses an atomic increment without marking task finished',async()=>{
 const w=workspace();w.run("cloud=true;loadCloud=async()=>{};client={rpc:async(name,args)=>{quantityRpc=name;quantityArgs=args;return {data:{completed_quantity:1},error:null}}}");await w.run('completeTaskQuantity')('t',{disabled:false});assert.equal(w.run('quantityRpc'),'dockflow_complete_quantity');assert.equal(w.run('JSON.stringify(quantityArgs)'),'{"task_id":"t","amount":1}');
});
test('task form saves quantity details without overwriting shared completion count',async()=>{
 const w=workspace();w.run("cloud=true;loadCloud=async()=>{};client={from:()=>({upsert:obj=>{savedQuantityTask=obj;return {select:()=>({single:async()=>({data:{id:obj.id},error:null})})}}})};taskModal()");await w.elements.get('#taskForm').onsubmit({preventDefault(){},target:{values:{title:'Pick pallets',description:'',category:'Shipping',priority:'Medium',status:'To Do',due:'2026-11-18',assignees:['a'],estimated_hours:'1',target_quantity:'5',quantity_unit:'pallets'},querySelector(){return {disabled:false}}}});assert.equal(w.run('savedQuantityTask.target_quantity'),5);assert.equal(w.run('savedQuantityTask.quantity_unit'),'pallets');assert.equal(w.run("'completed_quantity' in savedQuantityTask"),false);
});
test('mixed quantity lines show pallets and boxes with independent progress buttons',()=>{
 const w=workspace();const html=w.run("taskQuantityHtml({id:'t',target_quantity:3,quantity_unit:'pallets',completed_quantity:1,started_at:'2026-11-18T12:00:00Z',status:'In Progress',quantity_lines:[{id:'box-line',target_quantity:20,quantity_unit:'boxes',completed_quantity:4}]})");assert.match(html,/1\/3 pallets completed/);assert.match(html,/4\/20 boxes completed/);assert.match(html,/data-quantity-line="box-line"/);assert.equal((html.match(/data-complete-quantity="t"/g)||[]).length,2);
});
test('quantity line form supports adding and removing rows without sending completion values',()=>{
 const w=workspace();assert.match(w.run('taskQuantityFields({})'),/Add quantity line/);const html=w.run("extraQuantityFields({id:'line',target_quantity:20,quantity_unit:'boxes',completed_quantity:1})");assert.match(html,/name="quantity_line_amount"/);assert.match(html,/name="quantity_line_unit"/);assert.match(html,/data-remove-quantity-line="line"[^>]*disabled/);assert.doesNotMatch(html,/name="completed_quantity"/);const result=w.run("readExtraQuantities(new FormData({values:{quantity_line_id:['boxes'],quantity_line_amount:['20'],quantity_line_unit:['boxes']}}))");assert.equal(JSON.stringify(result),'[{"id":"boxes","target_quantity":20,"quantity_unit":"boxes"}]');
});
test('extra-line completion calls its own atomic RPC with stable line ID',async()=>{
 const w=workspace();w.run("cloud=true;loadCloud=async()=>{};client={rpc:async(name,args)=>{lineRpc=name;lineArgs=args;return {error:null}}}");await w.run('completeTaskQuantity')('t',{disabled:false,dataset:{quantityLine:'boxes'}});assert.equal(w.run('lineRpc'),'dockflow_complete_quantity_line');assert.equal(w.run('JSON.stringify(lineArgs)'),'{"task_id":"t","line_id":"boxes"}');
});
test('restart appears only inside the admin edit form, never on task cards',()=>{
 const w=workspace();w.run("db.tasks=[{id:'t',title:'Packing',status:'Done',finished_at:'2026-11-18T12:00:00Z'}];memberRole='manager'");assert.doesNotMatch(w.run('taskButtons(db.tasks[0])'),/data-restart-task/);w.run("taskModal('t')");assert.match(w.elements.get('#modalHost').innerHTML,/type="button" class="btn secondary restart-task-button" data-restart-task="t"/);w.run("memberRole='employee';taskModal('t')");assert.doesNotMatch(w.elements.get('#modalHost').innerHTML,/data-restart-task/);w.run("memberRole='manager';taskModal()");assert.doesNotMatch(w.elements.get('#modalHost').innerHTML,/data-restart-task/);
});
test('admin restart requires confirmation and delegates the atomic reset to the server',async()=>{
 const w=workspace();w.run("cloud=true;memberRole='manager';db.tasks=[{id:'t',title:'Packing',status:'Done'}];restartCalls=0;client={rpc:async(name,args)=>{restartCalls++;restartRpc=name;restartArgs=args;return {error:null}}};loadCloud=async()=>{};confirmRestartTask('t')");assert.match(w.elements.get('#modalHost').innerHTML,/quantities to zero/);assert.equal(w.run('restartCalls'),0);await w.elements.get('#confirmRestartTask').onclick({currentTarget:{disabled:false}});assert.equal(w.run('restartRpc'),'dockflow_restart_task');assert.equal(w.run('JSON.stringify(restartArgs)'),'{"task_id":"t"}');assert.equal(w.elements.get('#modalHost').innerHTML,'');
});
test('employees cannot open a restart confirmation',()=>{
 const w=workspace();w.run("cloud=true;memberRole='employee';db.tasks=[{id:'t',title:'Packing'}];confirmRestartTask('t')");assert.equal(w.elements.get('#modalHost')?.innerHTML||'','');
});
