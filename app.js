"use strict";
const REGIONS={"kyiv-region":"Київська область","kyiv":"Київ"};
const DTEK={"kyiv":"https://www.dtek-kem.com.ua/ua/shutdowns","kyiv-region":"https://www.dtek-krem.com.ua/ua/shutdowns"};
const TZ="Europe/Kyiv";
const MON=["січ.","лют.","бер.","квіт.","трав.","черв.","лип.","серп.","вер.","жовт.","лист.","груд."];
const $=id=>document.getElementById(id);
const store={get(k,d){try{const v=localStorage.getItem(k);return v===null?d:v}catch(e){return d}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const IC={
 clock:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
 pin:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
 copy:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
 dl:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14"/></svg>',
 share:'<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11l7.5-4M8.2 13l7.5 4"/></svg>',
 user:'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
 sys:'<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="2.5"/></svg>',
 ok:'<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>',
 cal:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
 search:'<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>'
};

/* ---------- стан ---------- */
let region=store.get("region","kyiv-region");if(!REGIONS[region])region="kyiv-region";
let queue=store.get("queue_"+region,null),DATA=null,WEATHER=null,WXERR=false,WXMSG="",WXAT=0;
let TB_DAY=0,busy=false,lastCheck=+store.get("last_"+region,0),nextAt=0,timer=null,ADDR=null,SIG={},histAll=false;
let LASTOFF=null,SET={rem:+store.get("rem","0"),chg:+store.get("chg","0")};
let SHEET={city:"",street:"",house:"",queue:"",found:null,err:""};

/* ---------- час ---------- */
function kp(d){
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(d).map(x=>[x.type,x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`,h:+p.hour,m:+p.minute,s:+p.second,mo:+p.month-1,day:+p.day,hhmm:`${p.hour}:${p.minute}`,hhmmss:`${p.hour}:${p.minute}:${p.second}`};
}
const kyivNow=()=>kp(new Date());
function addDays(ds,n){const d=new Date(ds+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function weekday(ds){const w=new Date(ds+"T12:00:00Z").getUTCDay();return w===0?7:w}
function tsDate(ts){return new Intl.DateTimeFormat("en-CA",{timeZone:TZ}).format(new Date(ts*1000))}
function dur(min){min=Math.round(min);const h=Math.floor(min/60),m=min%60;return ((h?h+"г ":"")+(m?m+"хв":"")).trim()||"0хв"}
const fmt=i=>String(Math.floor(i/2)).padStart(2,"0")+":"+(i%2?"30":"00");

/* ---------- графік ---------- */
const MAP={yes:["on","on"],no:["off","off"],maybe:["maybe","maybe"],first:["off","on"],second:["on","off"],mfirst:["maybe","on"],msecond:["on","maybe"]};
function dayHours(group,ds){
  const f=DATA.fact&&DATA.fact.data;let raw=null,src="preset";
  if(f&&!Array.isArray(f)){for(const k of Object.keys(f)){if(tsDate(+k)===ds&&f[k][group]){raw=f[k][group];src="fact";break}}}
  if(!raw){const pd=DATA.preset.data[group];raw=pd&&pd[String(weekday(ds))]}
  if(!raw)return null;
  const hours=[];for(let h=1;h<=24;h++)hours.push(MAP[raw[String(h)]]||MAP.yes);
  return {hours,src};
}
function ranges(hours,inc){
  const sl=hours.flat(),out=[];let s=null;inc=inc||["off"];
  sl.forEach((v,i)=>{const off=inc.includes(v);if(off&&s===null)s=i;if(!off&&s!==null){out.push([s,i]);s=null}});
  if(s!==null)out.push([s,48]);return out;
}
const rangeTxt=r=>r.map(([s,e])=>fmt(s)+" - "+(e===48?"24:00":fmt(e))+" <i class=\"rd\">("+dur((e-s)*30)+")</i>").join(" • ");
function offMin(group,ds){const d=dayHours(group,ds);return d?d.hours.flat().filter(v=>v==="off"||(d.src==="preset"&&v==="maybe")).length*30:null}
function slots3(group,now){const out=[];for(const o of [-1,0,1]){const d=dayHours(group,addDays(now.date,o));out.push(...(d?d.hours.flat():Array(48).fill("on")))}return out}
const tlabel=j=>{const day=Math.floor(j/48)-1;return fmt(j%48)+(day>0?" завтра":day<0?" вчора":"")};
function nowStatus(group,now){
  const S=slots3(group,now),cur=48+now.h*2+(now.m>=30?1:0),isOff=S[cur]==="off";
  let s=cur;while(s>0&&(S[s-1]==="off")===isOff)s--;
  let e=cur;while(e<S.length&&(S[e]==="off")===isOff)e++;
  const nowAbs=48*30+now.h*60+now.m,left=e*30-nowAbs;
  return {S,isOff,s,e,left,full:(e-s)*30,open:e>=S.length};
}

/* ---------- погода ---------- */
function wIcon(c,day){if(c===0)return day?"☀️":"🌙";if(c<=2)return day?"🌤️":"☁️";if(c===3)return "☁️";if(c<=48)return "🌫️";if(c<=57)return "🌦️";if(c<=67)return "🌧️";if(c<=77)return "🌨️";if(c<=82)return "🌧️";if(c<=86)return "🌨️";return "⛈️"}
function parseWx(j){const W={},H=j.hourly;H.time.forEach((t,i)=>{const d=t.slice(0,10),h=+t.slice(11,13);(W[d]=W[d]||[])[h]={t:Math.round(H.temperature_2m[i]),i:wIcon(H.weather_code[i],H.is_day[i])}});return W}
async function loadWeather(){
  const url="https://api.open-meteo.com/v1/forecast?latitude=50.45&longitude=30.52&hourly=temperature_2m,weather_code,is_day&timezone=Europe%2FKyiv&forecast_days=3";
  WXERR=false;
  for(let k=0;k<3;k++){
    try{
      const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),10000);
      const r=await fetch(url,{signal:ctl.signal});clearTimeout(tm);
      if(!r.ok)throw new Error(r.status);
      const j=await r.json();WEATHER=parseWx(j);WXAT=Date.now();store.set("wx",JSON.stringify(j));render();return;
    }catch(e){WXMSG=String(e&&e.message||e).slice(0,40);await new Promise(r=>setTimeout(r,1200))}
  }
  try{const c=JSON.parse(store.get("wx","null"));if(c){WEATHER=parseWx(c);render();return}}catch(e){}
  WXERR=true;render();
}

/* ---------- підпис графіка черги (для виявлення змін) ---------- */
function qsig(group){if(!DATA||!group||!DATA.preset.data[group])return null;const now=kyivNow();return JSON.stringify([0,1].map(i=>{const d=dayHours(group,addDays(now.date,i));return d?d.hours.flat().join(""):""}))}
/* ---------- історія оновлень ---------- */
const histKey=()=>"hist_"+region;
function getHist(){try{return JSON.parse(store.get(histKey(),"[]"))||[]}catch(e){return []}}
function addHist(who,ok,msg){const L=getHist();L.unshift({t:Date.now(),who,ok,msg});store.set(histKey(),JSON.stringify(L.slice(0,60)))}
function renderHistory(){
  const L=getHist(),show=histAll?L:L.slice(0,5);
  if(!L.length){$("history").innerHTML="";return}
  $("history").innerHTML=`<div class="hist-h"><h2>Історія оновлень</h2><i></i></div>
  <div class="hist"><div class="hrow head"><span>Час</span><span>Ініціатор</span><span>Статус</span><span>Повідомлення</span></div>
  ${show.map(h=>{const k=kp(new Date(h.t));return `<div class="hrow"><div class="tm"><b>${k.hhmmss}</b><small>${k.day} ${MON[k.mo]}</small></div><div class="who">${h.who==="user"?IC.user+" Користувач":IC.sys+" Система"}</div><div class="st ${h.ok?"ok":"err"}">${h.ok?IC.ok+" успішно":"✕ помилка"}</div><div class="ms">${esc(h.msg)}</div></div>`}).join("")}
  ${L.length>5?`<button class="more" data-hist="1">${histAll?"Згорнути":"Показати всі ("+L.length+")"}</button>`:""}</div>`;
}

/* ---------- оновлення даних ---------- */
async function refresh(who){
  if(busy)return;busy=true;
  $("refresh").classList.add("spin");$("refresh").disabled=true;$("refreshTxt").textContent="Оновлюю…";
  let ok=true,msg="";
  try{
    let j,emb=false;
    try{let r=await fetch(`data/${region}.json?`+Date.now(),{cache:"no-store"});if(!r.ok)r=await fetch(`${region}.json?`+Date.now(),{cache:"no-store"});if(!r.ok)throw new Error("HTTP "+r.status);j=await r.json()}
    catch(e){if(typeof EMBEDDED!=="undefined"&&EMBEDDED[region]){j=EMBEDDED[region];emb=true}else throw e}
    const oldQ=DATA?qsig(queue):null;
    const sig=(j.meta&&j.meta.contentHash)||(j.lastUpdated+"|"+JSON.stringify(j.fact||"").length+"|"+(j.preset&&Object.keys(j.preset.data||{}).length));
    const first=!(region in SIG),changed=!first&&SIG[region]!==sig;
    SIG[region]=sig;DATA=j;const newQ=qsig(queue);const qChanged=oldQ!==null&&newQ!==null&&oldQ!==newQ;
    msg=first?"Графік завантажено":qChanged?`Графік черги ${queue.replace("GPV","")} змінився`:changed?"Знайдено оновлення графіка (ваша черга без змін)":"Перевірку завершено — змін не виявлено";
    if(qChanged){const body=dayText(0)+"\n"+dayText(1);toast("Графік змінився");if(SET.chg&&"Notification" in window&&Notification.permission==="granted")notify("🔄 Графік змінився",body,"chg")}
    if(emb)msg+=" (вбудована копія)";
  }catch(e){ok=false;msg="Не вдалося отримати дані: "+String(e&&e.message||e).slice(0,60)}
  lastCheck=Date.now();store.set("last_"+region,lastCheck);
  addHist(who,ok,msg);
  busy=false;$("refresh").classList.remove("spin");$("refreshTxt").textContent="Оновити";setTimeout(()=>{$("refresh").disabled=false},who==="user"?8000:0);
  if(!DATA){$("qhead").textContent="Не вдалося завантажити дані";return}
  render();
  if(Date.now()-WXAT>30*60000)loadWeather();
  schedule();
  if(who==="user")toast(ok?"Оновлено":"Помилка оновлення");
}
function schedule(){clearTimeout(timer);const ms=(15+Math.random()*5)*60000;nextAt=Date.now()+ms;timer=setTimeout(()=>refresh("system"),ms)}
function renderUpd(){
  if(!lastCheck){$("updInfo").textContent="";return}
  const a=kp(new Date(lastCheck)).hhmm,b=nextAt?kp(new Date(nextAt)).hhmm:"";
  $("updInfo").textContent=`Оновлено о ${a} · автооновлення кожні 15–20 хв${b?" · наступне близько "+b:""}`;
}

/* ---------- відображення ---------- */
function renderTop(group,now){
  const ds=addDays(now.date,TB_DAY),m=offMin(group,ds),label=TB_DAY?"Завтра":"Сьогодні",dm=ds.slice(8)+"."+ds.slice(5,7);
  let inner;
  if(m===null)inner=`<div class="mb"><small><span>${label} · ${dm}</span><b>даних немає</b></small></div>`;
  else{const pct=Math.round((1440-m)/1440*100);
    inner=`<div class="mb"><small><span><b class="dayl">${label}</b> · ${dm} ${mood(pct)}</span><b>${m?(dayHours(group,ds).src==="preset"?"можливо без світла ":"без світла ")+dur(m):"без відключень"}</b></small><div class="bt"><div class="bb"><div class="f" style="width:${pct}%"></div><div class="r"></div><em>${pct}% зі світлом</em></div><div class="nub"></div></div></div>`}
  $("topbar").innerHTML=`<div class="tb-in">${inner}</div>`;
}

const mood=p=>p>=85?"😄":p>=65?"🙂":p>=45?"😐":p>=25?"😟":"😱";
function pickDay(){
  const t=$("tomorrow");if(!t||!DATA)return;
  const d=t.getBoundingClientRect().top<window.innerHeight*0.6?1:0;
  if(d!==TB_DAY){TB_DAY=d;renderTop(queue,kyivNow())}
}
function dayTitle(isToday,ds){return isToday?"Графік на сьогодні":"Графік на завтра"}
function renderDay(el,isToday,ds,group,now){
  const d=dayHours(group,ds);
  if(!d){el.innerHTML=`<div class="chead"><span class="ico">${IC.clock}</span><h2>${dayTitle(isToday)}</h2></div><div class="sumbar ok">Даних немає</div>`;return}
  const pre=d.src==="preset",r=ranges(d.hours,pre?["off","maybe"]:["off"]),total=r.reduce((a,[s,e])=>a+(e-s)*30,0);
  const sum=total?`<div class="sumbar r">⏱ <span>${pre?"МОЖЛИВО БЕЗ СВІТЛА":"БЕЗ СВІТЛА"}</span> <b>${dur(total)}</b> • ${rangeTxt(r)}</div>`:`<div class="sumbar ok">✓ Відключень не заплановано</div>`;
  const wk=WEATHER&&WEATHER[ds];
  const cells=d.hours.map((h,i)=>{
    const w=wk&&wk[i]?`<span class="wi">${wk[i].i}</span>${wk[i].t}°`:"";
    const isNow=isToday&&i===now.h;
    const dot=isNow?`<span class="nowdot" style="left:${Math.min(88,Math.max(12,now.m/60*100)).toFixed(0)}%"></span>`:"";
    return `<div class="cell${isNow?" now":""}"><div class="w">${w}</div><div class="bar"><i class="${h[0]}"></i><i class="${h[1]}"></i>${dot}</div><div class="t">${String(i).padStart(2,"0")}:00</div></div>`}).join("");
  const upd=lastCheck?`<span class="upd-pill">ОНОВЛЕНО: ${kp(new Date(lastCheck)).hhmm}</span>`:"";
  const wx=(!WEATHER&&WXERR)?`<button class="wxbtn" data-wx="1">⟳ погода: ${esc(WXMSG||"помилка")}</button>`:"";
  el.innerHTML=`<div class="chead"><span class="ico">${IC.clock}</span><h2>${dayTitle(isToday)}${d.src==="preset"?"<small>типовий графік</small>":""}</h2>${upd}</div>
  <div class="crow"><span class="chip g">• світло</span><span class="chip r">• відключення</span><span class="sp"></span>${wx}<button class="ib" data-copy="${isToday?0:1}" aria-label="Копіювати">${IC.copy}</button><button class="ib" data-dl="${isToday?0:1}" aria-label="Завантажити">${IC.dl}</button></div>
  ${sum}<div class="grid">${cells}</div>`;
}
function cdTxt(sec){sec=Math.max(0,sec);const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return (h?h+" год ":"")+(h||m?String(m).padStart(h?2:1,"0")+" хв ":"")+String(s).padStart(2,"0")+" с"}
function renderQHead(group,now){
  const st=nowStatus(group,now);let cls="g",title,line="",end=0;
  const endMs=()=>Date.now()+(st.left*60-now.s)*1000;
  if(st.open){cls=st.isOff?"r":"g";title=st.isOff?"За графіком зараз світла немає":"За графіком зараз світло є"}
  else if(st.isOff){cls="r";title="За графіком зараз світла немає";line=`Увімкнення о <b>${tlabel(st.e)}</b> `;end=endMs();
    var sub=`Це відключення: ${tlabel(st.s)} – ${tlabel(st.e)} (усього ${dur(st.full)})`}
  else{
    let ns=st.e,ne=st.e;while(ne<st.S.length&&st.S[ne]==="off")ne++;title="За графіком зараз світло є";
    if(ne>ns&&ne<st.S.length){line=`Вимкнення о <b>${tlabel(ns)}</b> `;end=endMs();var sub=`Наступне відключення ${dur((ne-ns)*30)}: ${tlabel(ns)} – ${tlabel(ne)}`}
    else line="Відключень далі не заплановано";
  }
  $("qhead").innerHTML=`<div class="qrow"><h3>Черга ${group.replace("GPV","")}</h3><button class="share ic" data-share="1" aria-label="Поділитись">${IC.share}</button></div>
  <div class="stcard ${cls}"><div class="sth"><i></i>${title}</div><div class="stl">${line}${end?`<span class="cd" data-end="${end}">через ${cdTxt(Math.round((end-Date.now())/1000))}</span>`:""}</div>${typeof sub!=="undefined"&&sub?`<div class="qsub">${sub}</div>`:""}</div>`;
}
function tickCd(){document.querySelectorAll(".cd[data-end]").forEach(e=>{const s=Math.round((+e.dataset.end-Date.now())/1000);if(s<=0&&!e.dataset.done){e.dataset.done=1;if(DATA)render();return}e.textContent="через "+cdTxt(s)})}
setInterval(tickCd,1000);
/* екстрені відключення (необов'язковий data/alerts.json) */
let ALERTS={};
async function loadAlerts(){try{const r=await fetch("alerts.json?"+Date.now(),{cache:"no-store"}).then(r=>r.ok?r:fetch("data/alerts.json?"+Date.now(),{cache:"no-store"}));if(r.ok){ALERTS=await r.json();renderAlerts()}}catch(e){}}
function renderAlerts(){const L=(ALERTS&&ALERTS[region])||[];$("alerts").innerHTML=L.map(x=>`<div class="alert"><span class="ai">⚠</span><div><b>${esc(x.text||"")}</b><small>${esc(x.source||"")}${x.time?", "+esc(x.time):""}</small></div></div>`).join("")}
function renderStats(group,now){
  const d=dayHours(group,now.date);if(!d){$("stats").innerHTML="";return}
  const H=d.hours.flat(),nowMin=now.h*60+now.m;
  let offAll=0,offPast=0;H.forEach((v,i)=>{if(v==="off"){offAll+=30;offPast+=Math.max(0,Math.min(30,nowMin-i*30))}});
  const onAll=1440-offAll,onPast=Math.max(0,nowMin-offPast),offLeft=offAll-offPast,onLeft=onAll-onPast;
  const tl=H.map((v,i)=>`<i class="${v}${(i+1)*30<=nowMin?" past":""}"></i>`).join("")+`<span class="nowm" style="left:${nowMin/1440*100}%"></span>`;
  $("stats").innerHTML=`<div class="chead"><span class="ico">${IC.clock}</span><h2>Світло за добу</h2><span class="upd-pill">СЬОГОДНІ</span></div>
    <div class="kpis"><div class="kpi g"><small>Світло було</small><b>${dur(onPast)}</b></div><div class="kpi r"><small>Без світла було</small><b>${dur(offPast)}</b></div>
  <div class="kpi g"><small>Світло ще буде</small><b>${dur(onLeft)}</b></div><div class="kpi r"><small>Без світла ще буде</small><b>${dur(offLeft)}</b></div></div>
  <div class="sumbar ${offAll?"r":"ok"}" style="margin:12px 0 0">${offAll?`За добу без світла: <b>${dur(offAll)}</b> із 24г`:"✓ Сьогодні відключень не заплановано"}</div>`;
}
function renderStrip(groups,now){
  $("qstrip").innerHTML=groups.map(g=>{
    const off=(dayHours(g,now.date)||{hours:[]}).hours[now.h]?.[now.m>=30?1:0]==="off";
    return `<button data-q="${g}" class="${g===queue?"act":""}"><small>Черга <span class="dot ${off?"off":""}"></span></small><b>${g.replace("GPV","")}</b></button>`}).join("");
  const sel=$("qstrip").querySelector(".act");if(sel){const s=$("qstrip");s.scrollLeft=sel.offsetLeft-(s.clientWidth-sel.clientWidth)/2}
}
function getAddrs(){try{return JSON.parse(store.get("addrs","[]"))||[]}catch(e){return []}}
function setAddrs(a){store.set("addrs",JSON.stringify(a))}
const addrText=a=>[a.city,a.street,a.house?"буд. "+a.house:""].filter(Boolean).join(", ");
function renderAddrCard(){
  const act=getAddrs().find(a=>a.region===region&&a.queue===queue&&a.active)||getAddrs().find(a=>a.region===region&&a.active);
  $("addrCard").innerHTML=`<div class="ac-top"><span class="ico">${IC.pin}</span><div class="tx"><b>Пошук черги за адресою</b><small>Не знаєте свою чергу? Знайдіть її за адресою.</small></div><button data-sheet="1">Відкрити</button></div>
  ${act?`<div class="ac-addr">${esc(addrText(act))}<br><span class="qchip">Черга ${act.queue.replace("GPV","")}</span></div>`:""}
  ${(()=>{const L=getAddrs().filter(a=>a.region===region);return L.length>1||(L.length===1&&!act)?`<div class="achips">${L.map(a=>`<button data-au="${a.id}" class="${a.active?"act":""}">${esc(a.label||a.street||a.city)} · ${a.queue.replace("GPV","")}</button>`).join("")}</div>`:""})()}`;
}
function render(){
  if(!DATA)return;
  const groups=Object.keys(DATA.preset.data).sort((a,b)=>parseFloat(a.slice(3))-parseFloat(b.slice(3)));
  if(!queue||!groups.includes(queue))queue=groups[0];
  const now=kyivNow();
  $("regionName").textContent=REGIONS[region];
  $("regions").innerHTML=Object.entries(REGIONS).map(([k,v])=>`<button data-r="${k}" class="${k===region?"act":""}">${v}</button>`).join("");
  renderUpd();renderAlerts();renderFollow();renderTop(queue,now);renderAddrCard();renderStrip(groups,now);renderQHead(queue,now);
  renderDay($("today"),true,now.date,queue,now);
  renderDay($("tomorrow"),false,addDays(now.date,1),queue,now);
  renderStats(queue,now);renderSettings();renderHistory();flipCheck(queue,now);
  $("demoNote").hidden=!DATA.demo;
  $("foot").innerHTML=`Дані з офіційних сайтів постачальників. Графіки оновлюються автоматично.<br>Джерело: <a href="${DTEK[region]}" target="_blank" rel="noopener">сайт ДТЕК</a> · <a href="https://github.com/Baskerville42/outage-data-ua" target="_blank" rel="noopener">outage-data-ua</a><br>Погода: Open-Meteo`;
  if(!$("sheet").hidden)renderSheet(true);
}


/* ---------- календар (.ics) ---------- */
function kyivToUtc(ds,min){
  const [y,m,d]=ds.split("-").map(Number);let t=Date.UTC(y,m-1,d,0,min);
  for(let k=0;k<2;k++){const p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));
    const asUtc=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);t+=Date.UTC(y,m-1,d,0,min)-asUtc}
  return new Date(t);
}
const icsT=dt=>dt.toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"");
function exportICS(){
  const now=kyivNow(),q=queue.replace("GPV",""),ev=[];
  for(let i=0;i<7;i++){const ds=addDays(now.date,i),d=dayHours(queue,ds);if(!d)continue;
    ranges(d.hours).forEach(([s,e])=>{ev.push(["BEGIN:VEVENT",`UID:${ds}-${s}-${q}@svitlo`,`DTSTAMP:${icsT(new Date())}`,`DTSTART:${icsT(kyivToUtc(ds,s*30))}`,`DTEND:${icsT(kyivToUtc(ds,e*30))}`,`SUMMARY:Відключення світла (черга ${q})`,`DESCRIPTION:${d.src==="preset"?"Типовий графік, може змінитись":"За даними оператора"}`,"BEGIN:VALARM","TRIGGER:-PT30M","ACTION:DISPLAY","DESCRIPTION:Відключення світла через 30 хв","END:VALARM","END:VEVENT"].join("\r\n"))})}
  if(!ev.length){toast("Відключень немає");return}
  const txt=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//svitlo//UA","CALSCALE:GREGORIAN",...ev,"END:VCALENDAR"].join("\r\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([txt],{type:"text/calendar"}));a.download=`svitlo-${q}.ics`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
  toast(`У календар: ${ev.length} подій`);
}
/* ---------- нагадування ---------- */
function renderFollow(){
  const on=!!(SET.chg||SET.rem);
  $("follow").className="follow"+(on?" on":"");
  $("follow").innerHTML=`<div class="ft"><span class="ico">🔔</span><div><b>Слідкуйте за змінами графіка без перевірок</b><small>Додаток сам перевіряє оновлення й сповістить, коли графік вашої черги зміниться, та нагадає перед відключенням.</small></div></div>
  <button class="fbtn" data-follow="1">${on?"✓ Сповіщення увімкнено · вимкнути":"Отримувати сповіщення →"}</button>`;
}
async function toggleFollow(){
  const on=!!(SET.chg||SET.rem);
  if(on){SET.chg=0;SET.rem=0;store.set("chg","0");store.set("rem","0");toast("Сповіщення вимкнено");renderFollow();renderSettings();return}
  if(!("Notification" in window)){toast("Браузер не підтримує сповіщень");return}
  let p=Notification.permission;if(p==="default")p=await Notification.requestPermission();
  if(p!=="granted"){toast("Дозвольте сповіщення в браузері");return}
  SET.chg=1;SET.rem=SET.rem||30;store.set("chg","1");store.set("rem",String(SET.rem));
  toast("Сповіщення увімкнено");renderFollow();renderSettings();checkReminders(true);
}
function renderSettings(){
  const perm=("Notification" in window)?Notification.permission:"unsupported";
  const opts=[[0,"Вимкнено"],[30,"За 30 хв"],[15,"За 15 хв"]];
  $("settings").innerHTML=`<div class="chead"><span class="ico">🔔</span><h2>Нагадування<small>про відключення, поки сайт відкритий або встановлений</small></h2></div>
  <div class="mini-seg full">${opts.map(([v,t])=>`<button data-rem="${v}" class="${SET.rem===v?"act":""}">${t}</button>`).join("")}</div>
  ${perm==="denied"?`<div class="warn" style="margin-top:10px">Сповіщення заблоковані в налаштуваннях браузера для цього сайту.</div>`:perm==="unsupported"?`<div class="warn" style="margin-top:10px">Цей браузер не підтримує сповіщень.</div>`:""}
  <div class="help">Нагадування працюють на https-сторінці (GitHub Pages). Коли додаток повністю закритий, сповіщення не приходять.</div>`;
}
async function setReminder(v){
  if(v>0){
    if(!("Notification" in window)){toast("Браузер не підтримує сповіщень");return}
    let p=Notification.permission;if(p==="default")p=await Notification.requestPermission();
    if(p!=="granted"){toast("Дозвольте сповіщення");SET.rem=0;store.set("rem","0");renderSettings();return}
  }
  SET.rem=v;store.set("rem",String(v));renderSettings();renderFollow();toast(v?`Нагадаю за ${v} хв до відключення`:"Нагадування вимкнено");
  if(v)checkReminders(true);
}
async function notify(title,body,tag){
  try{const reg=navigator.serviceWorker&&await navigator.serviceWorker.getRegistration();
    if(reg&&reg.showNotification){await reg.showNotification(title,{body,tag,icon:"icon.svg",badge:"icon.svg",vibrate:[200,100,200]});return}}catch(e){}
  try{new Notification(title,{body,tag})}catch(e){}
}
function checkReminders(force){
  if(!DATA||!SET.rem||!("Notification" in window)||Notification.permission!=="granted")return;
  const now=kyivNow(),st=nowStatus(queue,now);
  if(st.isOff||st.open)return;
  let ne=st.e;while(ne<st.S.length&&st.S[ne]==="off")ne++;
  if(ne===st.e)return;
  if(st.left<=SET.rem&&st.left>0){
    const key=`n_${region}_${queue}_${now.date}_${st.e}`;
    if(store.get(key,"")&&!force)return;
    store.set(key,"1");
    notify(`⚡ Через ${dur(st.left)} відключення`,`Черга ${queue.replace("GPV","")}: ${tlabel(st.e)} – ${tlabel(ne)} (${dur((ne-st.e)*30)}). Час зарядити телефон 🔋`,key);
  }
}
/* ---------- анімація «ввімкнулось / вимкнулось» ---------- */
function starHTML(){let L="";for(let z=-4;z<=4;z++){L+=`<i style="transform:translateZ(${z}px);filter:brightness(${(0.62+0.38*(z+4)/8).toFixed(2)})"></i>`}return `<div class="stage"><div class="star">${L}</div></div>`}
function flipCheck(group,now){
  const st=nowStatus(group,now);
  if(LASTOFF!==null&&LASTOFF!==st.isOff){
    const f=$("flash");f.className="";void f.offsetWidth;
    f.innerHTML=starHTML()+`<span class="cap">${st.isOff?"Світло зникло":"Світло з’явилось"}</span>`;
    f.className="show "+(st.isOff?"off":"on");
    clearTimeout(flipCheck.t);flipCheck.t=setTimeout(()=>f.className="",3200);
    if(SET.rem&&"Notification" in window&&Notification.permission==="granted")notify(st.isOff?"🌑 Світло вимкнулось":"💡 Світло з’явилось!",`Черга ${group.replace("GPV","")}`,"flip");
  }
  LASTOFF=st.isOff;
}

/* ---------- копіювати / завантажити / поділитись ---------- */
function dayText(which){
  const now=kyivNow(),ds=addDays(now.date,which),d=dayHours(queue,ds);if(!d)return "";
  const r=ranges(d.hours),tot=r.reduce((a,[s,e])=>a+(e-s)*30,0);
  return `Черга ${queue.replace("GPV","")} · ${REGIONS[region]} · ${which?"завтра":"сьогодні"} ${ds.slice(8)}.${ds.slice(5,7)}\n`+(tot?`Без світла ${dur(tot)}: ${rangeTxt(r)}`:"Відключень не заплановано");
}
async function copyText(t){
  try{await navigator.clipboard.writeText(t);return true}catch(e){}
  try{const a=document.createElement("textarea");a.value=t;a.style.position="fixed";a.style.opacity="0";document.body.appendChild(a);a.select();const ok=document.execCommand("copy");a.remove();return ok}catch(e){return false}
}
function drawCanvas(which){
  const now=kyivNow(),ds=addDays(now.date,which),d=dayHours(queue,ds);if(!d)return null;
  const W=720,pad=28,cw=(W-pad*2-3*10)/4,ch=46,rowH=ch+34,H=pad*2+96+6*rowH;
  const c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d");
  g.fillStyle="#111113";g.fillRect(0,0,W,H);g.fillStyle="#e8e8ec";g.font="700 26px system-ui,sans-serif";
  g.fillText(`Черга ${queue.replace("GPV","")} · ${REGIONS[region]}`,pad,pad+26);
  g.fillStyle="#8e8e99";g.font="18px system-ui,sans-serif";g.fillText(`${which?"Завтра":"Сьогодні"} ${ds.slice(8)}.${ds.slice(5,7)}`,pad,pad+56);
  const r=ranges(d.hours),tot=r.reduce((a,[s,e])=>a+(e-s)*30,0);
  g.fillStyle=tot?"#fca5a5":"#86efac";g.font="600 18px system-ui,sans-serif";g.fillText(tot?`Без світла ${dur(tot)}: ${rangeTxt(r)}`:"Відключень не заплановано",pad,pad+86);
  const col={on:"#1f6128",off:"#9b1c1c",maybe:"#b45309"};
  d.hours.forEach((h,i)=>{const x=pad+(i%4)*(cw+10),y=pad+110+Math.floor(i/4)*rowH;
    g.fillStyle=col[h[0]];g.beginPath();g.roundRect(x,y,cw/2,ch,[8,0,0,8]);g.fill();
    g.fillStyle=col[h[1]];g.beginPath();g.roundRect(x+cw/2,y,cw/2,ch,[0,8,8,0]);g.fill();
    g.fillStyle="#8e8e99";g.font="15px system-ui,sans-serif";g.textAlign="center";g.fillText(String(i).padStart(2,"0")+":00",x+cw/2,y+ch+20);g.textAlign="left"});
  return c;
}
function downloadDay(which){
  const c=drawCanvas(which);if(!c){toast("Немає даних");return}
  c.toBlob(b=>{const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`svitlo-${queue.replace("GPV","")}-${which?"zavtra":"sohodni"}.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast("Зображення збережено")});
}
async function shareQueue(){
  const t=dayText(0)+"\n\n"+dayText(1);
  if(navigator.share){try{await navigator.share({title:"Графік відключень",text:t});return}catch(e){if(e&&e.name==="AbortError")return}}
  toast(await copyText(t)?"Скопійовано":"Не вдалося скопіювати");
}
let toastT;function toast(t){const el=$("toast");el.textContent=t;el.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>el.classList.remove("show"),1800)}

/* ---------- пошук адреси ---------- */
async function loadAddrIndex(){
  if(ADDR!==null)return;
  try{const r=await fetch("data/addresses.json?"+Date.now());if(!r.ok)throw 0;ADDR=await r.json()}catch(e){ADDR={}}
}
const idx=()=>ADDR&&ADDR[region]||null;
function groupsList(){return DATA?Object.keys(DATA.preset.data).sort((a,b)=>parseFloat(a.slice(3))-parseFloat(b.slice(3))):[]}
function sugList(kind){
  const I=idx();if(!I)return [];
  let list=[];
  if(kind==="city")list=Object.keys(I);
  else if(kind==="street"&&I[SHEET.city])list=Object.keys(I[SHEET.city]);
  else if(kind==="house"&&I[SHEET.city]&&I[SHEET.city][SHEET.street])list=Object.keys(I[SHEET.city][SHEET.street]);
  const q=(SHEET[kind]||"").trim().toLowerCase();
  return list.filter(x=>!q||x.toLowerCase().includes(q)).slice(0,8);
}
function renderSheet(keep){
  const sh=$("sheet"),I=idx(),manual=!I;
  const act=document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.f;
  const fld=(kind,label,ph,dis)=>`<div class="fld"><label>${label}</label><input data-f="${kind}" value="${esc(SHEET[kind])}" placeholder="${dis?esc(dis):ph}" ${dis?"disabled":""} autocomplete="off" ${kind==="house"?'inputmode="text"':""}><div class="sug" data-sug="${kind}" hidden></div></div>`;
  const cityOk=manual?!!SHEET.city.trim():!!(I[SHEET.city]),streetOk=manual?!!SHEET.street.trim():!!(cityOk&&I[SHEET.city][SHEET.street]);
  const saved=getAddrs().filter(a=>a.region===region);
  const ready=manual?(SHEET.city.trim()&&SHEET.street.trim()&&SHEET.house.trim()&&SHEET.queue):(SHEET.city&&SHEET.street&&SHEET.house);
  sh.innerHTML=`<div class="panel" role="dialog" aria-label="Пошук черги за адресою"><h4><span>Пошук черги за адресою</span><button data-close="1" aria-label="Закрити">✕</button></h4>
  <div class="fld"><label>Назва (необов’язково)</label><input data-f="label" value="${esc(SHEET.label||"")}" placeholder="Дім, Робота, Батьки…" maxlength="20" autocomplete="off"></div>
  ${fld("city","Населений пункт","Почніть вводити",null)}
  ${fld("street","Вулиця","Почніть вводити",cityOk?null:"Спочатку оберіть населений пункт")}
  ${fld("house","Будинок","Напр. 16-А",streetOk?null:"Спочатку оберіть вулицю")}
  ${manual?`<div class="fld"><label>Черга (з сайту оператора)</label><select data-f="queue"><option value="">Оберіть чергу</option>${groupsList().map(g=>`<option value="${g}" ${SHEET.queue===g?"selected":""}>${g.replace("GPV","")}</option>`).join("")}</select></div>`:""}
  <button class="find ${ready?"ready":""}" data-find="1">${IC.search} ${manual?"Зберегти адресу":"Знайти чергу"}</button>
  ${SHEET.err?`<div class="warn">${esc(SHEET.err)}</div>`:""}
  ${SHEET.found?`<div class="found"><b>Знайдено адресу</b>${esc(addrText(SHEET.found))}<br><span class="qchip">Черга ${SHEET.found.queue.replace("GPV","")}</span></div>`:""}
  <div class="warn">${manual?`Автоматична база адрес ще не підключена. Дізнайтеся свою чергу на <a href="${DTEK[region]}" target="_blank" rel="noopener">сайті оператора</a> і збережіть її тут — далі додаток сам відкриватиметься на вашій черзі.`:"Дані для пошуку адреси беруться з офіційного сайту оператора. Якщо вашої адреси немає у списку, зверніться до свого постачальника/оператора."}</div>
  ${saved.length?`<div class="saved"><h5>Збережені адреси</h5>${saved.map((a,i)=>`<div class="it"><div class="nm">${a.label?`<b>${esc(a.label)}</b> · `:""}${esc(addrText(a))}<small>Черга ${a.queue.replace("GPV","")}${a.active?" · активна":""}</small></div><button data-au="${a.id}">Показати</button><button class="x" data-ad="${a.id}" aria-label="Видалити">✕</button></div>`).join("")}</div>`:""}
  </div>`;
  if(act&&keep){const el=sh.querySelector(`[data-f="${act}"]`);if(el&&!el.disabled){el.focus();const v=el.value;if(el.setSelectionRange){try{el.setSelectionRange(v.length,v.length)}catch(e){}}}}
}
function showSug(kind){
  const box=$("sheet").querySelector(`[data-sug="${kind}"]`);if(!box)return;
  const L=sugList(kind);
  if(!L.length||(L.length===1&&L[0]===SHEET[kind])){box.hidden=true;return}
  box.innerHTML=L.map(x=>`<div data-pick="${kind}" data-v="${esc(x)}">${esc(x)}</div>`).join("");box.hidden=false;
}
async function openSheet(){
  await loadAddrIndex();
  const cur=getAddrs().find(a=>a.region===region&&a.active);
  SHEET={city:"",street:"",house:"",label:"",queue:queue||"",found:null,err:""};
  $("sheet").hidden=false;document.body.style.overflow="hidden";renderSheet(false);const pn=$("sheet").querySelector(".panel");if(pn)pn.classList.add("enter");
}
function closeSheet(){$("sheet").hidden=true;document.body.style.overflow=""}
function saveAddr(a){
  const L=getAddrs().map(x=>x.region===a.region?{...x,active:false}:x);
  const dup=L.find(x=>x.region===a.region&&addrText(x)===addrText(a));
  if(dup){dup.queue=a.queue;dup.active=true}else L.push({...a,id:Date.now().toString(36),active:true});
  setAddrs(L);
}
function findQueue(){
  SHEET.err="";SHEET.found=null;
  const I=idx(),c=SHEET.city.trim(),s=SHEET.street.trim(),h=SHEET.house.trim();
  if(!c||!s||!h){SHEET.err="Заповніть населений пункт, вулицю і будинок.";renderSheet(true);return}
  let g;
  if(I){
    g=I[c]&&I[c][s]&&I[c][s][h];
    if(!g){SHEET.err="Адресу не знайдено у списку. Зверніться до свого постачальника/оператора.";renderSheet(true);return}
    if(!/^GPV/.test(g))g="GPV"+g;
  }else{
    if(!SHEET.queue){SHEET.err="Оберіть чергу: її можна дізнатися на сайті оператора.";renderSheet(true);return}
    g=SHEET.queue;
  }
  if(DATA&&!DATA.preset.data[g]){SHEET.err="Для черги "+g.replace("GPV","")+" немає графіка в цьому регіоні.";renderSheet(true);return}
  const a={region,city:c,street:s,house:h,queue:g,label:(SHEET.label||"").trim()};
  saveAddr(a);SHEET.found=a;queue=g;store.set("queue_"+region,queue);
  render();renderSheet(false);
  toast("Черга "+g.replace("GPV","")+" — графік оновлено");
}

/* ---------- події ---------- */
document.addEventListener("click",e=>{
  const t=e.target;
  const r=t.closest("[data-r]"),q=t.closest("[data-q]");
  if(r&&r.dataset.r!==region){region=r.dataset.r;store.set("region",region);queue=store.get("queue_"+region,null);DATA=null;lastCheck=+store.get("last_"+region,0);ADDR=ADDR;histAll=false;refresh("user");return}
  if(q){queue=q.dataset.q;store.set("queue_"+region,queue);render();return}
  if(t.closest("[data-wx]")){WXERR=false;render();loadWeather();return}
  if(t.closest("[data-hist]")){histAll=!histAll;renderHistory();return}
  const cp=t.closest("[data-copy]");if(cp){copyText(dayText(+cp.dataset.copy)).then(ok=>toast(ok?"Скопійовано":"Не вдалося скопіювати"));return}
  const dl=t.closest("[data-dl]");if(dl){downloadDay(+dl.dataset.dl);return}
  if(t.closest("[data-share]")){shareQueue();return}
  if(t.closest("[data-follow]")){toggleFollow();return}
  if(t.closest("#totop")){window.scrollTo({top:0,behavior:"smooth"});return}
  const rm=t.closest("[data-rem]");if(rm){setReminder(+rm.dataset.rem);return}
  if(t.closest("[data-sheet]")){openSheet();return}
  if(t.closest("[data-close]")||t.id==="sheet"){closeSheet();return}
  const pk=t.closest("[data-pick]");
  if(pk){const k=pk.dataset.pick;SHEET[k]=pk.dataset.v;if(k==="city"){SHEET.street="";SHEET.house=""}if(k==="street")SHEET.house="";SHEET.err="";SHEET.found=null;renderSheet(false);const nx={city:"street",street:"house"}[k];if(nx){const el=$("sheet").querySelector(`[data-f="${nx}"]`);if(el){el.focus();showSug(nx)}}return}
  if(t.closest("[data-find]")){findQueue();return}
  const au=t.closest("[data-au]");
  if(au){const L=getAddrs(),a=L.find(x=>x.id===au.dataset.au);if(a){L.forEach(x=>{if(x.region===a.region)x.active=x.id===a.id});setAddrs(L);queue=a.queue;store.set("queue_"+region,queue);render();closeSheet();window.scrollTo({top:0})}return}
  const ad=t.closest("[data-ad]");
  if(ad){setAddrs(getAddrs().filter(x=>x.id!==ad.dataset.ad));render();renderSheet(false);return}
  if(!t.closest(".fld"))$("sheet").querySelectorAll(".sug").forEach(b=>b.hidden=true);
});
document.addEventListener("input",e=>{
  const f=e.target.dataset&&e.target.dataset.f;if(!f)return;
  if(f==="queue"){SHEET.queue=e.target.value;renderSheet(true);return}
  if(f==="label"){SHEET.label=e.target.value;return}
  SHEET[f]=e.target.value;SHEET.err="";SHEET.found=null;
  if(f==="city"){const I=idx();if(!I||!I[SHEET.city]){SHEET.street="";SHEET.house=""}}
  if(f==="street"){const I=idx();if(!I||!(I[SHEET.city]&&I[SHEET.city][SHEET.street]))SHEET.house=""}
  const I=idx();
  if(I){const keep=e.target.selectionStart;renderSheet(true);showSug(f)}else{ /* ручний режим: без перерисовки, щоб не збивати введення */
    const ready=SHEET.city.trim()&&SHEET.street.trim()&&SHEET.house.trim()&&SHEET.queue;
    const b=$("sheet").querySelector("[data-find]");if(b)b.classList.toggle("ready",!!ready);
    const st=$("sheet").querySelector('[data-f="street"]'),hs=$("sheet").querySelector('[data-f="house"]');
    if(st){st.disabled=!SHEET.city.trim();st.placeholder=st.disabled?"Спочатку оберіть населений пункт":"Почніть вводити"}
    if(hs){hs.disabled=!SHEET.street.trim();hs.placeholder=hs.disabled?"Спочатку оберіть вулицю":"Напр. 16-А"}
  }
});
document.addEventListener("focusin",e=>{const f=e.target.dataset&&e.target.dataset.f;if(f&&f!=="queue"&&idx())showSug(f)});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("sheet").hidden)closeSheet()});
$("refresh").onclick=()=>refresh("user");
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&DATA&&Date.now()-lastCheck>20*60000)refresh("system")});

function syncScroll(){pickDay();$("totop").hidden=window.scrollY<500}
addEventListener("scroll",syncScroll,{passive:true});
setInterval(()=>{if(DATA){render();checkReminders()}},30000);
refresh("system");loadWeather();loadAlerts();
if("serviceWorker" in navigator&&/^https?:/.test(location.protocol)){navigator.serviceWorker.register("sw.js").catch(()=>{})}
