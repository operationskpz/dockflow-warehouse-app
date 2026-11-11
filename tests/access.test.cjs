const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function workspace(){
 const elements=new Map();
 const element=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',disabled:false,classList:{add(){},toggle(){}},querySelector(){return element('button')}});return elements.get(key)};
 const context=vm.createContext({document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},window:{},navigator:{},crypto:require('node:crypto').webcrypto,console,setTimeout,alert(){},FormData:class{constructor(target){this.values=target.values;}get(key){return this.values[key];}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../i18n.js'),'utf8'),context);
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
 const w=workspace();configure(w,true);await w.run('startCloud()');assert.equal(w.run('cloud'),true);assert.equal(w.run('db.tasks[0].id'),'task-a');assert.match(w.elements.get('#content').innerHTML,/Warehouse task/);
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
