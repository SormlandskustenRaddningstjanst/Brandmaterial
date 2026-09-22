const API="https://ros-material-api.peter-hasselberg.workers.dev";
const $=id=>document.getElementById(id);
let data=null;
const STATION_STORAGE_KEY="skrtj-selected-stations-v1";

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function apiGet(path){const r=await fetch(API+path);let j;try{j=await r.json()}catch{throw new Error("API:t gav ett ogiltigt svar.")}if(!r.ok)throw new Error(j.error||j.message||"API-fel");return j;}
async function apiPost(path,body){const r=await fetch(API+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});let j;try{j=await r.json()}catch{throw new Error("API:t gav ett ogiltigt svar.")}if(!r.ok)throw new Error(j.error||j.message||"API-fel");return j;}
function key(v){return String(v||"").trim().toLocaleLowerCase("sv-SE");}
function materialTypes(){const m=new Map();for(const x of(data.material||[])){const name=String(x.material||"").trim();if(name&&!m.has(key(name)))m.set(key(name),{material:name,category:x.category||""});}return [...m.values()].sort((a,b)=>a.material.localeCompare(b.material,"sv"));}

function selectedStationIds(){
  try{
    const parsed=JSON.parse(localStorage.getItem(STATION_STORAGE_KEY));
    if(parsed&&parsed.all===true) return (data.stations||[]).map(s=>Number(s.id));
    if(parsed&&Array.isArray(parsed.ids)&&parsed.ids.length) return parsed.ids.map(Number).filter(Number.isInteger);
  }catch{}
  return (data.stations||[]).map(s=>Number(s.id));
}
function myStations(){
  const ids=new Set(selectedStationIds());
  return (data.stations||[]).filter(s=>ids.has(Number(s.id))).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"sv"));
}
function renderStationSelector(){
  const stations=myStations();
  $("targetSelect").innerHTML=stations.map(x=>`<option value="${x.id}">${esc(x.name||("Station "+x.id))}</option>`).join("");
  if(!stations.length){
    $("planTitle").textContent="Ingen station vald";
    $("planHelp").textContent="Välj Mina stationer på Lageröversikten först.";
    $("planList").innerHTML='<div class="empty">Du har ingen vald station.</div>';
    return;
  }
  render();
}
function render(){
  const stationId=Number($("targetSelect").value);
  const station=myStations().find(x=>Number(x.id)===stationId);
  if(!station){
    $("planTitle").textContent="Ingen station vald";
    $("planList").innerHTML='<div class="empty">Välj station under Mina stationer på Lageröversikten.</div>';
    return;
  }
  $("planTitle").textContent=station.name||("Station "+station.id);
  renderStation(stationId);
}
function renderStation(stationId){
 $("planHelp").textContent="Välj vilka material som ska finnas och ange nivåerna.";
 $("legend").textContent="Röd → Gul → Grön. Gul nivå kan väljas bort.";
 const types=materialTypes(), levels=data.stockLevels||[], actual=data.material||[];
 $("planList").innerHTML=types.map(t=>{
   const level=levels.find(x=>Number(x.stationId)===stationId&&key(x.material)===key(t.material));
   const count=actual.filter(m=>Number(m.stationId)===stationId&&key(m.material)===key(t.material)&&m.transportStatus!=="Under transport").length;
   const active=!!level, redMax=level?.redBelow!=null?Math.max(0,Number(level.redBelow)-1):0;
   const noYellow=active&&Number(level?.greenFrom)===Number(level?.redBelow);
   const yellowMax=level?.greenFrom!=null?Math.max(redMax,Number(level.greenFrom)-1):Math.max(1,redMax+1);
   const greenMax=level?.max!=null?Number(level.max):Math.max(2,yellowMax+1);
   return `<div class="plan-row" data-material="${esc(t.material)}">
    <div class="plan-name"><strong>${esc(t.material)}</strong><span>${esc(t.category||"")} · Finns nu: ${count}</span></div>
    <label class="check"><input class="stocked" type="checkbox" ${active?"checked":""}> Ska finnas</label>
    <label>🔴 t.o.m.<input class="red" type="number" min="0" value="${redMax}"></label>
    <label>🟡 t.o.m.<input class="yellow" type="number" min="0" value="${yellowMax}"><span class="no-yellow"><input class="noYellow" type="checkbox" ${noYellow?"checked":""}> Ingen gul</span></label>
    <label>🟢 MAX<input class="green" type="number" min="0" value="${greenMax}"></label>
    <button class="plan-save" type="button">SPARA</button></div>`;
 }).join("")||'<div class="empty">Inga materialtyper finns i Brandmaterial.</div>';
 bindStation(stationId);
}
function bindStation(stationId){
 document.querySelectorAll(".plan-row").forEach(row=>{
  const stocked=row.querySelector(".stocked"), red=row.querySelector(".red"), yellow=row.querySelector(".yellow"), green=row.querySelector(".green"), noYellow=row.querySelector(".noYellow"), btn=row.querySelector(".plan-save");
  const sync=()=>{[red,yellow,green,noYellow].forEach(x=>x.disabled=!stocked.checked);yellow.disabled=!stocked.checked||noYellow.checked;};stocked.addEventListener("change",sync);noYellow.addEventListener("change",sync);sync();
  btn.addEventListener("click",async()=>{btn.disabled=true;btn.textContent="SPARAR…";try{
    await apiPost("/stock-level/upsert",{stationId,material:row.dataset.material,stocked:stocked.checked,redMax:Number(red.value),noYellow:noYellow.checked,yellowMax:Number(yellow.value),greenMax:Number(green.value)});
    data=await apiGet("/overview");btn.classList.add("saved");btn.textContent="SPARAT ✓";setTimeout(()=>render(),500);
   }catch(e){alert(e.message||e);btn.disabled=false;btn.textContent="SPARA";}
  });
 });
}
$("targetSelect").addEventListener("change",render);
(async()=>{try{
  data=await apiGet("/overview");
  $("loading").style.display="none";
  $("content").style.display="block";
  renderStationSelector();
}catch(e){
  $("loading").style.display="none";
  $("error").textContent=e.message;
  $("error").classList.add("active");
}})();
