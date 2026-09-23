const API="https://ros-material-api.peter-hasselberg.workers.dev";
let data=null,currentView=null;
let materialEditMode=false;
let materialDraft=new Map();
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function getJson(path){const r=await fetch(API+path);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{}if(!r.ok)throw new Error(d.error||d.message||t||("HTTP "+r.status));return d}
async function postJson(path,body){const r=await fetch(API+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{}if(!r.ok)throw new Error((d.errors||[]).join("\n")||d.error||d.message||t||("HTTP "+r.status));return d}
function boolText(v){return v?"Ja":"Nej"}
const views={
 stations:{title:"Stationer",help:"Stationsnummer och stationsnamn.",columns:["Stationsnummer","Station","Aktiv"],headers:["Stationsnummer","Station","Aktiv"],endpoint:"/stations/import"},
 vehicles:{title:"Fordon",help:"Rakelnummer hör till fordonet. Fordonskategori hanteras här i registret.",columns:["Rakelnummer","Registreringsnummer","Fordonskategori","Station","Aktiv"],headers:["Rakelnummer","Registreringsnummer","Fordonskategori","Station","Aktiv"],endpoint:"/vehicles/import"},
 material:{title:"Brandmaterial",help:"Hela listan med individuella Material-ID.",columns:["Material-ID","Material","Kategori","Användning","Station","Rakelnummer","Registreringsnummer","Kommentar","Aktiv","Transportstatus","Transport till station"],headers:["Material-ID","Material","Kategori","Användning","Station","Rakelnummer","Registreringsnummer","Kommentar","Aktiv","Transportstatus","Transport till station"],endpoint:"/material/import"}
};
function rowsFor(view){
 if(view==="stations")return data.stations.map(x=>({"Stationsnummer":x.stationNumber,"Station":x.name,"Aktiv":boolText(x.active)}));
 if(view==="vehicles")return data.vehicles.map(x=>({"Rakelnummer":x.rakel,"Registreringsnummer":x.registration,"Fordonskategori":x.type,"Station":x.station,"Aktiv":boolText(x.active),"__id":x.id,"__categoryId":x.categoryId}));
 return data.material.map(x=>({"Material-ID":x.materialId,"Material":x.material,"Kategori":x.category,"Användning":x.usage||"Brandmaterial","Station":x.station,"Rakelnummer":x.rakel,"Registreringsnummer":x.registration,"Kommentar":x.comment,"Aktiv":boolText(x.active),"Transportstatus":x.transportStatus,"Transport till station":x.transportDestination,"__rowId":x.rowId}));
}
function ensureMaterialEditControls(){
 let top=$("materialEditTop"),bottom=$("materialEditBottom");
 if(!top){
   top=document.createElement("div");top.id="materialEditTop";top.className="material-edit-actions";
   const search=$("searchInput").closest("label");search.parentNode.insertBefore(top,search);
 }
 if(!bottom){
   bottom=document.createElement("div");bottom.id="materialEditBottom";bottom.className="material-edit-actions";
   const wrap=$("tableBody").closest(".table-wrap");wrap.parentNode.insertBefore(bottom,wrap.nextSibling);
 }
 const html=materialEditMode
   ? '<button class="material-save">SPARA ÄNDRINGAR</button><button class="secondary material-cancel">AVBRYT</button><span class="muted material-edit-status"></span>'
   : '<button class="material-edit">REDIGERA</button>';
 top.innerHTML=html;bottom.innerHTML=html;
 [top,bottom].forEach(box=>{
   box.querySelector(".material-edit")?.addEventListener("click",startMaterialEdit);
   box.querySelector(".material-save")?.addEventListener("click",saveMaterialEdits);
   box.querySelector(".material-cancel")?.addEventListener("click",cancelMaterialEdit);
 });
 top.style.display=currentView==="material"?"flex":"none";
 bottom.style.display=currentView==="material"?"flex":"none";
}
function materialDraftRow(materialId){
 if(materialDraft.has(materialId))return materialDraft.get(materialId);
 const src=data.material.find(x=>x.materialId===materialId);
 const d={material:src?.material||"",category:src?.category||"",usage:src?.usage||"Brandmaterial",comment:src?.comment||"",active:src?.active===true};
 materialDraft.set(materialId,d);return d;
}
function startMaterialEdit(){materialEditMode=true;materialDraft.clear();render();}
function cancelMaterialEdit(){if(materialDraft.size&&!confirm("Avbryt och kasta osparade ändringar?"))return;materialEditMode=false;materialDraft.clear();render();}
function syncMaterialDraftFromTable(){
 document.querySelectorAll("#tableBody tr[data-material-id]").forEach(tr=>{
   const id=tr.dataset.materialId,d=materialDraftRow(id);
   tr.querySelectorAll("[data-field]").forEach(input=>{const f=input.dataset.field;d[f]=input.type==="checkbox"?input.checked:input.value;});
 });
}
async function saveMaterialEdits(){
 syncMaterialDraftFromTable();
 const changed=[];
 for(const [materialId,d] of materialDraft){
   const src=data.material.find(x=>x.materialId===materialId);if(!src)continue;
   if(d.material!==(src.material||"")||d.category!==(src.category||"")||d.usage!==(src.usage||"Brandmaterial")||d.comment!==(src.comment||"")||d.active!==(src.active===true)) changed.push({materialId,...d});
 }
 if(!changed.length){materialEditMode=false;materialDraft.clear();render();return;}
 document.querySelectorAll(".material-save,.material-cancel").forEach(b=>b.disabled=true);
 document.querySelectorAll(".material-edit-status").forEach(x=>x.textContent="Sparar "+changed.length+" ändrade rader…");
 try{
   const result=await postJson("/material/bulk-update",{rows:changed});
   data=await getJson("/register-data");materialEditMode=false;materialDraft.clear();updateCounts();render();
   const m=$("importMessage");m.className="message active ok";m.textContent="✓ "+(result.updatedCount||changed.length)+" Brandmaterial-rader sparades.";
 }catch(err){alert("Kunde inte spara Brandmaterial: "+(err.message||err));document.querySelectorAll(".material-save,.material-cancel").forEach(b=>b.disabled=false);document.querySelectorAll(".material-edit-status").forEach(x=>x.textContent="Sparningen misslyckades.");}
}
function render(){
 const cfg=views[currentView],q=$("searchInput").value.trim().toLocaleLowerCase("sv-SE");
 $("listTitle").textContent=cfg.title;$("listHelp").textContent=cfg.help;
 $("tableHead").innerHTML="<tr>"+cfg.headers.map(h=>"<th>"+esc(h)+"</th>").join("")+"</tr>";
 const rows=rowsFor(currentView).filter(r=>!q||Object.values(r).some(v=>String(v).toLocaleLowerCase("sv-SE").includes(q)));
 $("tableBody").innerHTML=rows.map(r=>{
   const materialId=r["Material-ID"]||"";
   return "<tr"+(currentView==="material"?" data-material-id='"+esc(materialId)+"'":"")+">"+cfg.columns.map(c=>{
     let v=esc(r[c]);
     if(currentView==="material"&&materialEditMode){
       const d=materialDraftRow(materialId);
       if(c==="Material-ID")v="<strong>"+esc(materialId)+"</strong>";
       else if(c==="Material")v="<input class='material-edit-input' data-field='material' value='"+esc(d.material)+"'>";
       else if(c==="Kategori")v="<input class='material-edit-input' data-field='category' value='"+esc(d.category)+"'>";
       else if(c==="Användning")v="<select class='material-edit-input' data-field='usage'>"+["Brandmaterial","Övningsmaterial","Båda"].map(x=>"<option "+(x===d.usage?"selected":"")+">"+x+"</option>").join("")+"</select>";
       else if(c==="Kommentar")v="<input class='material-edit-input' data-field='comment' value='"+esc(d.comment)+"'>";
       else if(c==="Aktiv")v="<input type='checkbox' data-field='active' "+(d.active?"checked":"")+">";
     } else if(currentView==="material"&&c==="Material-ID"&&r[c])v="<a class='material-link' href='./?material="+encodeURIComponent(r[c])+"'>"+v+"</a>";
     if(currentView==="vehicles"&&c==="Fordonskategori"){
       const options=(data.vehicleCategories||[]).filter(x=>x.active).map(x=>"<option value='"+x.id+"' "+(Number(x.id)===Number(r.__categoryId)?"selected":"")+">"+esc(x.name)+"</option>").join("");
       v="<select class='vehicle-category-select' data-vehicle-id='"+r.__id+"'><option value=''>— Välj kategori —</option>"+options+"</select>";
     }
     return "<td>"+v+"</td>";
   }).join("")+"</tr>";
 }).join("") || "<tr><td colspan='"+cfg.columns.length+"'>Inga poster hittades.</td></tr>";
 ensureMaterialEditControls();
}

function openView(view){currentView=view;$("listPanel").style.display="block";$("searchInput").value="";$("importMessage").className="message";$("newCategoryBtn").style.display=view==="vehicles"?"inline-block":"none";$("categoryPanel").style.display="none";render();$("listPanel").scrollIntoView({behavior:"smooth",block:"start"})}
function renderCategoryList(){
 const list=(data.vehicleCategories||[]).filter(x=>x.active);
 $("categoryList").innerHTML=list.length?"<strong>Befintliga kategorier:</strong> "+list.map(x=>"<span>"+esc(x.name)+"</span>").join(""):"Inga kategorier skapade ännu.";
}
async function createCategory(){
 const name=$("newCategoryName").value.trim(),m=$("categoryMessage");
 if(!name){m.className="message active error";m.textContent="Ange ett kategorinamn.";return}
 m.className="message active";m.textContent="Skapar…";
 try{
   const result=await postJson("/vehicle-categories",{name});
   data=await getJson("/register-data");updateCounts();renderCategoryList();render();
   $("newCategoryName").value="";
   m.className="message active ok";m.textContent=result.created?"Kategorin skapades.":"Kategorin finns redan och är tillgänglig.";
 }catch(err){m.className="message active error";m.textContent=err.message||err}
}
async function setVehicleCategory(vehicleId,categoryId,select){
 if(!categoryId)return;
 select.disabled=true;
 try{await postJson("/vehicle/category",{vehicleId:Number(vehicleId),categoryId:Number(categoryId)});data=await getJson("/register-data");render()}
 catch(err){alert("Kunde inte spara fordonskategori: "+(err.message||err));data=await getJson("/register-data");render()}
 finally{select.disabled=false}
}
function exportExcel(){
 const cfg=views[currentView],rows=rowsFor(currentView),wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows,{header:cfg.columns});
 XLSX.utils.book_append_sheet(wb,ws,cfg.title.slice(0,31));XLSX.writeFile(wb,cfg.title+"_export_"+new Date().toISOString().slice(0,10)+".xlsx");
}
function templateExcel(){
 const cfg=views[currentView];let sample={};
 if(currentView==="stations")sample={"Stationsnummer":"241-3000","Station":"Nyköping","Aktiv":"Ja"};
 if(currentView==="vehicles")sample={"Rakelnummer":"3010","Registreringsnummer":"NTE11B","Fordonskategori":"Släckbil","Station":"Nyköping","Aktiv":"Ja"};
 if(currentView==="material")sample={"Material-ID":"SKRTJ-00001","Material":"Exempel","Kategori":"Verktyg","Användning":"Brandmaterial","Station":"Nyköping","Rakelnummer":"","Registreringsnummer":"","Kommentar":"","Aktiv":"Ja","Transportstatus":"Ingen transport","Transport till station":""};
 const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet([sample],{header:cfg.columns});XLSX.utils.book_append_sheet(wb,ws,cfg.title.slice(0,31));XLSX.writeFile(wb,cfg.title+"_importmall.xlsx");
}
function showImportOverlay(state,title,text){
 const overlay=$("importOverlay"),modal=overlay.querySelector(".import-modal"),spinner=$("importSpinner"),close=$("importOverlayClose");
 modal.classList.remove("success","error-state");
 if(state==="success")modal.classList.add("success");
 if(state==="error")modal.classList.add("error-state");
 $("importOverlayTitle").textContent=title;
 $("importOverlayText").textContent=text;
 spinner.style.display=state==="loading"?"block":"none";
 close.style.display=state==="loading"?"none":"inline-block";
 overlay.classList.add("active");overlay.setAttribute("aria-hidden","false");
}
function hideImportOverlay(){
 $("importOverlay").classList.remove("active");$("importOverlay").setAttribute("aria-hidden","true");
}
async function importFile(file){
 const cfg=views[currentView],buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:"array"}),ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{defval:"",raw:false}).map((r,i)=>({...r,__row:i+2}));
 if(!rows.length)throw new Error("Excel-filen innehåller inga rader.");
 const ok=confirm("Importera "+rows.length+" rader till "+cfg.title+"?\n\nBefintliga poster uppdateras och nya läggs till. Inga poster raderas.");
 if(!ok)return;
 showImportOverlay("loading","Uppdatering pågår…",cfg.title+" uppdateras.\nStäng inte sidan.");
 const msg=$("importMessage");msg.className="message active";msg.textContent="Importerar…";
 const result=await postJson(cfg.endpoint,{rows});
 msg.className="message active ok";
 let parts=["Import klar ✓","Nya: "+(result.newCount||0),"Uppdaterade: "+(result.updatedCount||0)];
 if(result.createdRakelCount)parts.push("Nya Rakelnummer: "+result.createdRakelCount);
 if(result.createdCategoryCount)parts.push("Nya fordonskategorier: "+result.createdCategoryCount);
 msg.textContent=parts.join(" · ");
 data=await getJson("/register-data");updateCounts();render();
 showImportOverlay("success","Import klar ✓",parts.slice(1).join(" · "));
}
function updateCounts(){$("stationCount").textContent=data.stations.length+" poster";$("vehicleCount").textContent=data.vehicles.length+" poster";$("materialCount").textContent=data.material.length+" poster"}
document.querySelectorAll(".register-tile").forEach(b=>b.addEventListener("click",()=>openView(b.dataset.view)));
$("closeList").onclick=()=>{$("listPanel").style.display="none";currentView=null};
$("searchInput").addEventListener("input",()=>{if(materialEditMode)syncMaterialDraftFromTable();render()});$("exportBtn").onclick=exportExcel;$("templateBtn").onclick=templateExcel;
$("importBtn").onclick=()=>$("fileInput").click();$("fileInput").addEventListener("change",async e=>{try{if(e.target.files[0])await importFile(e.target.files[0])}catch(err){const message=err.message||String(err);const m=$("importMessage");m.className="message active error";m.textContent=message;showImportOverlay("error","Importen misslyckades",message)}finally{e.target.value=""}});
$("importOverlayClose").onclick=hideImportOverlay;
$("newCategoryBtn").onclick=()=>{$("categoryPanel").style.display="block";$("categoryMessage").className="message";renderCategoryList();$("newCategoryName").focus()};
$("cancelCategoryBtn").onclick=()=>{$("categoryPanel").style.display="none"};
$("saveCategoryBtn").onclick=createCategory;
$("newCategoryName").addEventListener("keydown",e=>{if(e.key==="Enter")createCategory()});
$("tableBody").addEventListener("change",e=>{if(e.target.classList.contains("vehicle-category-select"))setVehicleCategory(e.target.dataset.vehicleId,e.target.value,e.target)});
(async()=>{try{data=await getJson("/register-data");updateCounts();$("registerLoading").style.display="none";$("registerContent").style.display="block"}catch(err){$("registerLoading").style.display="none";$("registerError").className="message active error";$("registerError").textContent="Kunde inte hämta register: "+(err.message||err)}})();
