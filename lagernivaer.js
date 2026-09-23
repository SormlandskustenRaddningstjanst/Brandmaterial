const API="https://ros-material-api.peter-hasselberg.workers.dev";
const $=id=>document.getElementById(id);
let data=null, consumableLevelsData={catalog:[],levels:[]}, exerciseRulesData={materials:[],rules:[]}, mode="stations";
const STATION_STORAGE_KEY="skrtj-selected-stations-v1";

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function apiGet(path){const r=await fetch(API+path);let j;try{j=await r.json()}catch{throw new Error("API:t gav ett ogiltigt svar.")}if(!r.ok)throw new Error(j.error||j.message||"API-fel");return j;}
async function apiPost(path,body){const r=await fetch(API+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});let j;try{j=await r.json()}catch{throw new Error("API:t gav ett ogiltigt svar.")}if(!r.ok)throw new Error(j.error||j.message||"API-fel");return j;}
function key(v){return String(v||"").trim().toLocaleLowerCase("sv-SE");}
function isOperationalMaterial(x){return key(x?.usage||"Brandmaterial")!==key("Övningsmaterial");}
function materialTypes(){const m=new Map();for(const x of(data.material||[])){const name=String(x.material||"").trim();if(name&&!m.has(key(name)))m.set(key(name),{material:name,category:x.category||""});}return [...m.values()].sort((a,b)=>a.material.localeCompare(b.material,"sv"));}
function selectedStationIds(){try{const p=JSON.parse(localStorage.getItem(STATION_STORAGE_KEY));if(p&&p.all===true)return(data.stations||[]).map(s=>Number(s.id));if(p&&Array.isArray(p.ids)&&p.ids.length)return p.ids.map(Number).filter(Number.isInteger);}catch{}return(data.stations||[]).map(s=>Number(s.id));}
function myStations(){const ids=new Set(selectedStationIds());return(data.stations||[]).filter(s=>ids.has(Number(s.id))).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"sv"));}
function myVehicles(){const ids=new Set(selectedStationIds());return(data.vehicles||[]).filter(v=>ids.has(Number(v.stationId))).sort((a,b)=>String(a.rakel||"").localeCompare(String(b.rakel||""),"sv"));}

function setMode(next){
 mode=next; closeEditModal();
 ["stations","vehicles","consumables","exercise"].forEach(x=>$(x+"Tab").classList.toggle("active",mode===x));
 const items=mode==="stations"?myStations().map(x=>({id:x.id,label:x.name||("Station "+x.id)})):mode==="vehicles"?myVehicles().map(x=>({id:x.id,label:[x.rakel,x.registration].filter(Boolean).join(" – ")||("Fordon "+x.id)})):mode==="consumables"?(data.stations||[]).filter(x=>key(x.name)!=="nyköping").sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"sv")).map(x=>({id:x.id,label:x.name||("Station "+x.id)})):[{id:1,label:"Övningssortiment"}];
 $("selectorCard").style.display=(mode==="stations"||mode==="exercise")?"none":"grid";
 $("selectorLabel").textContent=mode==="vehicles"?"Fordon på min station":"Station som Nyköping försörjer";
 $("targetSelect").innerHTML=items.map(x=>`<option value="${x.id}">${esc(x.label)}</option>`).join("");
 if(!items.length){$("planTitle").textContent="Inget att visa";$("planHelp").textContent="Välj Mina stationer på Lageröversikten först.";$("planList").innerHTML='<div class="empty">Inga valbara poster för din station.</div>';return;}
 render();
}
function render(){
 const id=Number($("targetSelect").value);
 if(mode==="stations"){const station=myStations()[0];if(!station){$("planList").innerHTML='<div class="empty">Välj Min station på Lageröversikten först.</div>';return;}$("planTitle").textContent=station.name||("Station "+station.id);renderStation(Number(station.id));}
 else if(mode==="vehicles"){const vehicle=myVehicles().find(x=>Number(x.id)===id);if(!vehicle){$("planList").innerHTML='<div class="empty">Fordonet tillhör inte din valda station.</div>';return;}$("planTitle").textContent=[vehicle.rakel,vehicle.registration].filter(Boolean).join(" – ")||("Fordon "+vehicle.id);renderVehicle(id);}
 else if(mode==="consumables"){const station=(data.stations||[]).find(x=>Number(x.id)===id);if(!station){$("planList").innerHTML='<div class="empty">Välj en station.</div>';return;}$("planTitle").textContent="Förbrukningsartiklar – "+station.name;renderConsumables(id);}
 else{$("planTitle").textContent="Övningssortiment";renderExerciseRules();}
}
function clickableRow(title,meta,status,attrs=""){
 return `<div class="level-row" role="button" tabindex="0" ${attrs}><span class="level-main"><strong>${esc(title)}</strong><small>${esc(meta||"")}</small></span><span class="level-status">${status}</span><span class="level-arrow" aria-hidden="true">›</span></div>`;
}
function renderStation(stationId){
 $("planHelp").textContent="Klicka på ett material för att redigera lagernivåerna.";$("legend").textContent="Röd → Gul → Grön. Gul nivå kan väljas bort.";
 const types=materialTypes(),levels=data.stockLevels||[],actual=(data.material||[]).filter(isOperationalMaterial);
 $("planList").innerHTML=types.map(t=>{const level=levels.find(x=>Number(x.stationId)===stationId&&key(x.material)===key(t.material));const count=actual.filter(m=>Number(m.stationId)===stationId&&key(m.material)===key(t.material)&&m.transportStatus!=="Under transport").length;let status='<span class="pill off">Ska inte finnas</span>';if(level){const red=Math.max(0,Number(level.redBelow)-1),noYellow=Number(level.greenFrom)===Number(level.redBelow),yellow=Math.max(red,Number(level.greenFrom)-1),max=Number(level.max);status=`<span class="pill">🔴 0–${red}</span>${noYellow?'':`<span class="pill">🟡 ${red+1}–${yellow}</span>`}<span class="pill">🟢 ${Number(level.greenFrom)}–${max}</span>`;}return clickableRow(t.material,`${t.category||""}${t.category?' · ':''}Finns nu: ${count}`,status,`data-action="station" data-id="${stationId}" data-material="${esc(t.material)}"`);}).join("")||'<div class="empty">Inga materialtyper finns i Brandmaterial.</div>';
 bindRowClicks();
}
function renderVehicle(vehicleId){
 $("planHelp").textContent="Klicka på ett material för att redigera kravantalet.";$("legend").textContent="Grön = exakt kravantal. Alla andra antal visas rött.";
 const types=materialTypes(),reqs=data.vehicleRequirements||[],actual=(data.material||[]).filter(isOperationalMaterial);
 $("planList").innerHTML=types.map(t=>{const req=reqs.find(x=>Number(x.vehicleId)===vehicleId&&key(x.material)===key(t.material));const count=actual.filter(m=>Number(m.vehicleId)===vehicleId&&key(m.material)===key(t.material)).length;const status=req?`<span class="pill green">🟢 Exakt ${Number(req.required)}</span>`:'<span class="pill off">Ska inte finnas</span>';return clickableRow(t.material,`${t.category||""}${t.category?' · ':''}Finns nu: ${count}`,status,`data-action="vehicle" data-id="${vehicleId}" data-material="${esc(t.material)}"`);}).join("")||'<div class="empty">Inga materialtyper finns i Brandmaterial.</div>';
 bindRowClicks();
}
function renderConsumables(stationId){
 $("planHelp").textContent="Klicka på en artikel för att redigera önskat/max antal.";$("legend").textContent="Beställningen kan aldrig fylla stationen över detta antal.";
 const catalog=consumableLevelsData.catalog||[],levels=consumableLevelsData.levels||[];
 $("planList").innerHTML=catalog.map(a=>{const level=levels.find(x=>Number(x.stationId)===stationId&&key(x.articleId)===key(a.articleId));const status=level?`<span class="pill green">🟢 Max ${Number(level.target||0)}</span>`:'<span class="pill off">Ska inte finnas</span>';return clickableRow(a.article,`${a.articleId} · ${a.category||""} · ${a.unit||"st"}`,status,`data-action="consumable" data-id="${stationId}" data-article-id="${esc(a.articleId)}"`);}).join("")||'<div class="empty">Nyköping har inga artiklar markerade Beställningsbar = JA.</div>';
 bindRowClicks();
}
function renderExerciseRules(){
 $("planHelp").textContent="Klicka på ett material för att redigera övningsinställningen.";$("legend").textContent="Ej beställningsbar = kan inte beställas till övning.";
 const rules=exerciseRulesData.rules||[];
 $("planList").innerHTML=(exerciseRulesData.materials||[]).map(material=>{const r=rules.find(x=>key(x.material)===key(material));const status=r?.active?`<span class="pill green">Beställningsbar · max ${Number(r.maxQuantity||1)}</span>`:'<span class="pill off">Ej beställningsbar</span>';return clickableRow(material,"Övningsbeställning",status,`data-action="exercise" data-material="${esc(material)}"`);}).join("")||'<div class="empty">Inga materialtyper hittades.</div>';
 bindRowClicks();
}
function bindRowClicks(){document.querySelectorAll(".level-row").forEach(row=>{row.addEventListener("click",()=>openEditModal(row));row.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openEditModal(row);}});});}

function openEditModal(row){
 const action=row.dataset.action, material=row.dataset.material||"", id=Number(row.dataset.id||0), articleId=row.dataset.articleId||"";
 $("editMessage").className="message";$("editMessage").textContent="";$("editFields").innerHTML="";$("editSave").disabled=false;$("editSave").textContent="SPARA";
 let save;
 if(action==="station"){
  const level=(data.stockLevels||[]).find(x=>Number(x.stationId)===id&&key(x.material)===key(material));const active=!!level,redMax=level?.redBelow!=null?Math.max(0,Number(level.redBelow)-1):0,noYellow=active&&Number(level?.greenFrom)===Number(level?.redBelow),yellowMax=level?.greenFrom!=null?Math.max(redMax,Number(level.greenFrom)-1):Math.max(1,redMax+1),greenMax=level?.max!=null?Number(level.max):Math.max(2,yellowMax+1);
  $("editTitle").textContent=material;$("editSubtitle").textContent="Lagernivå – station";
  $("editFields").innerHTML=`<label class="modal-check"><input id="editActive" type="checkbox" ${active?'checked':''}> Ska finnas på stationen</label><div class="edit-grid"><label>🔴 Röd t.o.m.<input id="editRed" type="number" min="0" value="${redMax}"></label><label>🟡 Gul t.o.m.<input id="editYellow" type="number" min="0" value="${yellowMax}"><span class="modal-check small"><input id="editNoYellow" type="checkbox" ${noYellow?'checked':''}> Ingen gul nivå</span></label><label>🟢 Max antal<input id="editGreen" type="number" min="0" value="${greenMax}"></label></div>`;
  const sync=()=>{["editRed","editGreen","editNoYellow"].forEach(x=>$(x).disabled=!$("editActive").checked);$("editYellow").disabled=!$("editActive").checked||$("editNoYellow").checked;};$("editActive").addEventListener("change",sync);$("editNoYellow").addEventListener("change",sync);sync();
  save=async()=>{await apiPost("/stock-level/upsert",{stationId:id,material,stocked:$("editActive").checked,redMax:Number($("editRed").value),noYellow:$("editNoYellow").checked,yellowMax:Number($("editYellow").value),greenMax:Number($("editGreen").value)});data=await apiGet("/overview");};
 }else if(action==="vehicle"){
  const req=(data.vehicleRequirements||[]).find(x=>Number(x.vehicleId)===id&&key(x.material)===key(material));
  $("editTitle").textContent=material;$("editSubtitle").textContent="Materialkrav – fordon";
  $("editFields").innerHTML=`<label class="modal-check"><input id="editActive" type="checkbox" ${req?'checked':''}> Ska finnas på fordonet</label><label>🟢 Exakt antal<input id="editRequired" type="number" min="0" value="${esc(req?.required??0)}"></label>`;
  const sync=()=>$("editRequired").disabled=!$("editActive").checked;$("editActive").addEventListener("change",sync);sync();
  save=async()=>{if(!myVehicles().some(v=>Number(v.id)===id))throw new Error("Fordonet tillhör inte din valda station.");await apiPost("/vehicle-requirement/upsert",{vehicleId:id,material,stocked:$("editActive").checked,required:Number($("editRequired").value)});data=await apiGet("/overview");};
 }else if(action==="consumable"){
  const level=(consumableLevelsData.levels||[]).find(x=>Number(x.stationId)===id&&key(x.articleId)===key(articleId));const article=(consumableLevelsData.catalog||[]).find(x=>key(x.articleId)===key(articleId));
  $("editTitle").textContent=article?.article||articleId;$("editSubtitle").textContent=`${articleId} · Förbrukningsartikel`;
  $("editFields").innerHTML=`<label class="modal-check"><input id="editActive" type="checkbox" ${level?'checked':''}> Ska finnas på stationen</label><label>🟢 Önskat / max antal<input id="editRequired" type="number" min="1" step="1" value="${level?Number(level.target||1):1}"></label>`;
  const sync=()=>$("editRequired").disabled=!$("editActive").checked;$("editActive").addEventListener("change",sync);sync();
  save=async()=>{await apiPost("/consumable-level/upsert",{stationId:id,articleId,active:$("editActive").checked,target:Number($("editRequired").value)});consumableLevelsData=await apiGet("/consumable-levels");};
 }else{
  const r=(exerciseRulesData.rules||[]).find(x=>key(x.material)===key(material));
  $("editTitle").textContent=material;$("editSubtitle").textContent="Övningsbeställning";
  $("editFields").innerHTML=`<label class="modal-check"><input id="editActive" type="checkbox" ${r?.active?'checked':''}> Beställningsbar</label><label>Max antal per beställning<input id="editRequired" type="number" min="1" step="1" value="${Number(r?.maxQuantity||1)}"></label>`;
  const sync=()=>$("editRequired").disabled=!$("editActive").checked;$("editActive").addEventListener("change",sync);sync();
  save=async()=>{await apiPost("/exercise-rule/upsert",{material,active:$("editActive").checked,maxQuantity:Number($("editRequired").value)});exerciseRulesData=await apiGet("/exercise-rules");};
 }
 $("editSave").onclick=async()=>{const btn=$("editSave");btn.disabled=true;btn.textContent="SPARAR…";try{await save();closeEditModal();render();}catch(e){$("editMessage").textContent=e.message||e;$("editMessage").className="message error active";btn.disabled=false;btn.textContent="SPARA";}};
 $("editModal").classList.remove("hidden");document.body.classList.add("modal-open");
}
function closeEditModal(){$("editModal")?.classList.add("hidden");document.body.classList.remove("modal-open");}

$("editCancel").addEventListener("click",closeEditModal);
$("editClose").addEventListener("click",closeEditModal);
$("editModal").addEventListener("click",e=>{if(e.target===$("editModal"))closeEditModal();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("editModal").classList.contains("hidden"))closeEditModal();});
$("stationsTab").addEventListener("click",()=>setMode("stations"));
$("vehiclesTab").addEventListener("click",()=>setMode("vehicles"));
$("consumablesTab").addEventListener("click",()=>setMode("consumables"));
$("exerciseTab").addEventListener("click",()=>setMode("exercise"));
$("targetSelect").addEventListener("change",render);
(async()=>{try{[data,consumableLevelsData,exerciseRulesData]=await Promise.all([apiGet("/overview"),apiGet("/consumable-levels"),apiGet("/exercise-rules")]);$("loading").style.display="none";$("content").style.display="block";setMode("stations");}catch(e){$("loading").style.display="none";$("error").textContent=e.message;$("error").classList.add("active");}})();
