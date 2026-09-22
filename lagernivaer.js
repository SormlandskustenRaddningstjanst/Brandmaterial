const API="https://ros-material-api.peter-hasselberg.workers.dev";
const $=id=>document.getElementById(id);
let data=null, mode="stations";

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function apiGet(path){const r=await fetch(API+path);let j;try{j=await r.json()}catch{throw new Error("API:t gav ett ogiltigt svar.")}if(!r.ok)throw new Error(j.error||j.message||"API-fel");return j;}
async function apiPost(path,body){const r=await fetch(API+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});let j;try{j=await r.json()}catch{throw new Error("API:t gav ett ogiltigt svar.")}if(!r.ok)throw new Error(j.error||j.message||"API-fel");return j;}
function key(v){return String(v||"").trim().toLocaleLowerCase("sv-SE");}
function materialTypes(){const m=new Map();for(const x of(data.material||[])){const name=String(x.material||"").trim();if(name&&!m.has(key(name)))m.set(key(name),{material:name,category:x.category||""});}return [...m.values()].sort((a,b)=>a.material.localeCompare(b.material,"sv"));}

function targets(){
 if(mode==="stations") return [...(data.stations||[])].sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"sv")).map(x=>({id:x.id,label:x.name||("Station "+x.id)}));
 return [...(data.vehicles||[])].sort((a,b)=>String(a.rakel||"").localeCompare(String(b.rakel||""),"sv")).map(x=>({id:x.id,label:[x.rakel,x.registration].filter(Boolean).join(" – ")||("Fordon "+x.id)}));
}
function setMode(next){
 mode=next;$("stationsTab").classList.toggle("active",mode==="stations");$("vehiclesTab").classList.toggle("active",mode==="vehicles");
 $("selectorLabel").textContent=mode==="stations"?"Välj station":"Välj fordon";
 const list=targets();$("targetSelect").innerHTML=list.map(x=>`<option value="${x.id}">${esc(x.label)}</option>`).join("");
 render();
}
function render(){
 const id=Number($("targetSelect").value), target=targets().find(x=>Number(x.id)===id);
 if(!target){$("planTitle").textContent="–";$("planList").innerHTML='<div class="empty">Inget att visa.</div>';return;}
 $("planTitle").textContent=target.label;
 if(mode==="stations") renderStation(id); else renderVehicle(id);
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
function renderVehicle(vehicleId){
 $("planHelp").textContent="Välj vilka material som ska finnas på fordonet och ange exakt antal.";
 $("legend").textContent="Grön = exakt kravantal. Alla andra antal visas rött.";
 const types=materialTypes(), reqs=data.vehicleRequirements||[], actual=data.material||[];
 $("planList").innerHTML=types.map(t=>{
  const req=reqs.find(x=>Number(x.vehicleId)===vehicleId&&key(x.material)===key(t.material));
  const count=actual.filter(m=>Number(m.vehicleId)===vehicleId&&key(m.material)===key(t.material)).length;
  return `<div class="plan-row vehicle" data-material="${esc(t.material)}">
   <div class="plan-name"><strong>${esc(t.material)}</strong><span>${esc(t.category||"")} · Finns nu: ${count}</span></div>
   <label class="check"><input class="stocked" type="checkbox" ${req?"checked":""}> Ska finnas</label>
   <label>🟢 Exakt antal<input class="required" type="number" min="0" value="${esc(req?.required??0)}"></label>
   <button class="plan-save" type="button">SPARA</button></div>`;
 }).join("")||'<div class="empty">Inga materialtyper finns i Brandmaterial.</div>';
 document.querySelectorAll(".plan-row").forEach(row=>{
  const stocked=row.querySelector(".stocked"), input=row.querySelector(".required"), btn=row.querySelector(".plan-save");
  const sync=()=>input.disabled=!stocked.checked;stocked.addEventListener("change",sync);sync();
  btn.addEventListener("click",async()=>{btn.disabled=true;btn.textContent="SPARAR…";try{
   await apiPost("/vehicle-requirement/upsert",{vehicleId,material:row.dataset.material,stocked:stocked.checked,required:Number(input.value)});
   data=await apiGet("/overview");btn.classList.add("saved");btn.textContent="SPARAT ✓";setTimeout(()=>render(),500);
  }catch(e){alert(e.message||e);btn.disabled=false;btn.textContent="SPARA";}});
 });
}
$("stationsTab").addEventListener("click",()=>setMode("stations"));
$("vehiclesTab").addEventListener("click",()=>setMode("vehicles"));
$("targetSelect").addEventListener("change",render);
(async()=>{try{data=await apiGet("/overview");$("loading").style.display="none";$("content").style.display="block";setMode("stations");}catch(e){$("loading").style.display="none";$("error").textContent=e.message;$("error").classList.add("active");}})();
