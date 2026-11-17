/* Shared date picker. Date inputs retain ISO values and native form validation. */
(()=>{
 const parse=value=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return null;const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d,12);return date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d?date:null;};
 const iso=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
 let field=null,panel=null,month=null;
 const allowed=value=>(!field.min||value>=field.min)&&(!field.max||value<=field.max);
 function close(focus=false){const old=field;panel?.remove();panel=null;field=null;if(old)old.setAttribute('aria-expanded','false');if(focus&&old?.isConnected)old.focus();}
 function position(){if(!panel||!field)return;const r=field.getBoundingClientRect(),width=Math.min(310,window.innerWidth-24);panel.style.width=width+'px';panel.style.left=Math.max(12,Math.min(r.left,window.innerWidth-width-12))+'px';const height=panel.offsetHeight;panel.style.top=Math.max(12,r.bottom+8+height<=window.innerHeight-12?r.bottom+8:r.top-height-8)+'px';}
 function choose(value){if(value&&!allowed(value))return;const target=field;target.value=value;target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('change',{bubbles:true}));close(true);}
 function render(focusValue){
  const locale=language==='es'?'es':'en',y=month.getFullYear(),m=month.getMonth(),first=new Date(y,m,1,12),count=new Date(y,m+1,0,12).getDate(),todayValue=iso(new Date()),selected=field.value;
  const weekdays=Array.from({length:7},(_,i)=>new Date(2026,10,1+i,12).toLocaleDateString(locale,{weekday:'short'}));
  panel.innerHTML=`<div class="calendar-head"><button type="button" class="calendar-nav" data-month="-1" aria-label="${esc(tr('Previous month'))}">‹</button><strong id="calendarMonth" aria-live="polite">${esc(first.toLocaleDateString(locale,{month:'long',year:'numeric'}))}</strong><button type="button" class="calendar-nav" data-month="1" aria-label="${esc(tr('Next month'))}">›</button><button type="button" class="calendar-nav" data-calendar-close aria-label="${esc(tr('Close'))}">×</button></div><div class="calendar-weekdays" aria-hidden="true">${weekdays.map(day=>`<span>${esc(day)}</span>`).join('')}</div><div class="calendar-days">${'<span></span>'.repeat(first.getDay())}${Array.from({length:count},(_,i)=>{const date=new Date(y,m,i+1,12),value=iso(date);return `<button type="button" data-date="${value}" class="calendar-day ${value===selected?'selected':''} ${value===todayValue?'today':''}" ${allowed(value)?'':'disabled'} ${value===todayValue?'aria-current="date"':''} aria-pressed="${value===selected}" aria-label="${esc(date.toLocaleDateString(locale,{weekday:'long',year:'numeric',month:'long',day:'numeric'}))}">${i+1}</button>`;}).join('')}</div><div class="calendar-footer"><button type="button" data-calendar-clear>${tr('Clear')}</button><button type="button" data-date="${todayValue}" ${allowed(todayValue)?'':'disabled'}>${tr('Today')}</button></div>`;
  position();if(focusValue){const target=panel.querySelector(`[data-date="${focusValue}"]:not(:disabled)`);(target||panel.querySelector('.calendar-day:not(:disabled)')||panel.querySelector('button')).focus();}
 }
 function open(input){if(input.disabled||input.readOnly)return;if(field===input)return;close();field=input;let chosen=parse(input.value)||new Date();if(input.min&&iso(chosen)<input.min)chosen=parse(input.min)||chosen;if(input.max&&iso(chosen)>input.max)chosen=parse(input.max)||chosen;month=new Date(chosen.getFullYear(),chosen.getMonth(),1,12);panel=document.createElement('div');panel.className='date-popover';panel.setAttribute('role','dialog');panel.setAttribute('aria-label',tr('Choose a date'));input.setAttribute('aria-expanded','true');document.body.append(panel);render(iso(chosen));}
 document.addEventListener('click',event=>{
  const dateInput=event.target.closest('input[type="date"]');if(dateInput){event.preventDefault();open(dateInput);return;}
  if(!panel)return;if(!panel.contains(event.target)){close();return;}
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.hasAttribute('data-date'))choose(button.dataset.date);
  else if(button.hasAttribute('data-calendar-clear'))choose('');
  else if(button.hasAttribute('data-calendar-close'))close(true);
  else if(button.dataset.month){month=new Date(month.getFullYear(),month.getMonth()+Number(button.dataset.month),1,12);render();panel.querySelector(`[data-month="${button.dataset.month}"]`).focus();}
 });
 document.addEventListener('keydown',event=>{
  if(!panel){if(event.target.matches('input[type="date"]')&&(event.key==='Enter'||event.key==='ArrowDown'&&event.altKey)){event.preventDefault();open(event.target);}return;}
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
  if(!panel.contains(event.target))return;
  if(event.key==='Tab'){const buttons=[...panel.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&event.target===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&event.target===last){event.preventDefault();first.focus();}return;}
  const value=event.target.dataset.date,date=parse(value),steps={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};
  if(date&&event.key in steps){event.preventDefault();date.setDate(date.getDate()+steps[event.key]);if(!allowed(iso(date)))return;month=new Date(date.getFullYear(),date.getMonth(),1,12);render(iso(date));}
 });
 window.addEventListener('resize',position);
 new MutationObserver(()=>{if(field&&!field.isConnected)close();document.querySelectorAll('input[type="date"]:not([data-calendar-ready])').forEach(input=>{input.dataset.calendarReady='1';input.setAttribute('aria-haspopup','dialog');input.setAttribute('aria-expanded','false');});}).observe(document.body,{childList:true,subtree:true});
})();
