const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function workspace(){
 const elements=new Map();
 const element=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',disabled:false,classList:{add(){},toggle(){}},querySelector(){return element('button')}});return elements.get(key)};
 const context=vm.createContext({document:{querySelector:element,querySelectorAll:()=>[],addEventListener(){}},window:{},navigator:{},crypto:require('node:crypto').webcrypto,console,setTimeout,alert(){},FormData:class{constructor(target){this.values=target.values;}get(key){return this.values[key];}}});
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
