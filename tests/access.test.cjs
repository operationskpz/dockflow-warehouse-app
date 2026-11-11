const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function workspace(){
 const elements=new Map();
 const element=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',disabled:false,classList:{add(){},toggle(){}},querySelector(){return element('button')}});return elements.get(key)};
 const context=vm.createContext({document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},window:{},navigator:{},crypto:require('node:crypto').webcrypto,console,setTimeout,alert(){},FormData:class{constructor(target){this.values=target.values;}get(key){return this.values[key];}getAll(key){const v=this.values[key];return Array.isArray(v)?v:v?[v]:[];}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../i18n.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../recurring.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),context);
 return {context,elements,run:s=>vm.runInContext(s,context)};
}
function configure(w,approved){
 w.context.approved=approved;
 w.run(`client={auth:{getSession:async()=>({data:{session:{user:{id:'employee-a',email:'a@example.com'}}}})},from:table=>{let q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:approved?{user_id:'employee-a'}:null,error:null}),order:async()=>({data:table==='dockflow_tasks'?[{id:'task-a',title:'Warehouse task'}]:[],error:null})};return q;}}`);
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
 const w=workspace();assert.match(w.run("taskButtons({id:'t',status:'To Do'})"),/data-start="t"/);assert.doesNotMatch(w.run("taskButtons({id:'t',status:'To Do'})"),/data-finish/);
 assert.match(w.run("taskButtons({id:'t',status:'In Progress',started_at:'2026-11-11T10:00:00Z'})"),/data-finish="t"/);
 const finished=w.run("taskTiming({started_at:'2026-11-11T10:00:00Z',finished_at:'2026-11-11T11:02:03Z'})");assert.match(finished,/1 h 2 min 3 s/);assert.match(finished,/Started/);assert.match(finished,/Finished/);assert.doesNotMatch(finished,/data-elapsed-start/);assert.doesNotMatch(w.run("taskButtons({id:'t',status:'Done',finished_at:'2026-11-11T11:00:00Z'})"),/data-start|data-finish/);
});
test('missing historical times are explicit and timing controls translate to Spanish',()=>{
 const w=workspace();assert.match(w.run("taskTiming({status:'In Progress'})"),/Time not recorded/);w.run("setLanguage('es')");assert.match(w.run("taskButtons({id:'t',status:'To Do'})"),/Iniciar tarea/);assert.match(w.run("taskButtons({id:'t',started_at:'2026-11-11T10:00:00Z'})"),/Finalizar tarea/);
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
 await w.elements.get('#recurringForm').onsubmit({preventDefault(){},target:{values:{title:'Daily packing',description:'Keep original notes',frequency:'weekly',starts_on:'2026-12-01',ends_on:'2026-12-31',time_zone:'America/New_York',category:'Shipping',priority:'High',assignees:['a','b','a']},querySelector(){return {disabled:false}}}});
 assert.equal(w.run('savedRule.table'),'dockflow_repeated_tasks');assert.equal(w.run('savedRule.obj.starts_on'),'2026-12-01');assert.equal(w.run('savedRule.obj.frequency'),'weekly');assert.equal(w.run('savedRule.obj.assignees.join(",")'),'a,b');assert.equal(w.run('generatedFunction'),'dockflow_generate_repeated_tasks');assert.equal(w.run('savedRule.obj.description'),'Keep original notes');
});
test('invalid repeat date range is not submitted, and employee cannot open schedule editor',async()=>{
 const w=workspace();w.run("cloud=true;memberRole='employee';recurringModal()");assert.equal(w.elements.get('#modalHost'),undefined);w.run("memberRole='manager';saveCalls=0;client={from:()=>{saveCalls++;}};recurringModal()");await w.elements.get('#recurringForm').onsubmit({preventDefault(){},target:{values:{title:'Task',description:'',frequency:'daily',starts_on:'2026-12-02',ends_on:'2026-12-01',time_zone:'America/New_York',category:'General',priority:'Medium'},querySelector(){return {disabled:false}}}});assert.equal(w.run('saveCalls'),0);
});
test('repeated-task section supports Spanish and clears schedules at sign-out',()=>{
 const w=workspace();w.run("setLanguage('es');db.repeated=[]");assert.match(w.run('recurringPage()'),/Todavía no hay tareas repetidas/);w.run("memberRole='manager';db.repeated=[{id:'r'}];clearWorkspace()");assert.equal(w.run('memberRole'),'employee');assert.equal(w.run('db.repeated.length'),0);
});
