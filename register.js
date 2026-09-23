const API="https://ros-material-api.peter-hasselberg.workers.dev";
let data=null,currentView=null;
let draft=new Map();
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function getJson(path){const r=await fetch(API+path);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{}if(!r.ok)throw new Error(d.error||d.message||t||("HTTP "+r.status));return d}
async function postJson(path,body){const r=await fetch(API+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{}if(!r.ok)throw new Error((d.errors||[]).join("\n")||d.error||d.message||t||("HTTP "+r.status));return d}
function boolText(v){return v?"Ja":"Nej"}
const views={
 stations:{title:"Stationer",help:"Listan är alltid redigerbar. Stationsnummer är låst.",columns:["Stationsnummer","Station","Aktiv"],headers:["Stationsnummer","Station","Aktiv"],endpoint:"/stations/import",key:"Stationsnummer",editable:["Station","Aktiv"]},
 vehicles:{title:"Fordon",help:"Listan är alltid redigerbar. Registreringsnummer är låst.",columns:["Rakelnummer","Registreringsnummer","Fordonskategori","Station","Aktiv"],headers:["Rakelnummer","Registreringsnummer","Fordonskategori","Station","Aktiv"],endpoint:"/vehicles/import",key:"Registreringsnummer",editable:["Rakelnummer","Fordonskategori","Station","Aktiv"]},
 material:{title:"Brandmaterial",help:"Listan är alltid redigerbar. Material-ID och placering ändras inte här.",columns:["Material-ID","Material","Kategori","Användning","Station","Rakelnummer","Registreringsnummer","Kommentar","Aktiv","Transportstatus","Transport till station"],headers:["Material-ID","Material","Kategori","Användning","Station","Rakelnummer","Registreringsnummer","Kommentar","Aktiv","Transportstatus","Transport till station"],endpoint:"/material/bulk-update",key:"Material-ID",editable:["Material","Kategori","Användning","Kommentar","Aktiv"]},
 consumables:{title:"Förbrukningsartiklar",help:"Listan är alltid redigerbar. Artikel-ID, station och saldo är låsta; saldo ändras via lagerhändelser/QR.",columns:["Artikel-ID","Artikel","Kategori","Station","Saldo","Beställ vid","Önskat lager","Enhet","Leverantör","Artikelnummer","Kontaktperson","Telefon","E-post","Kundnummer","Avtalsnummer","Förpackningsstorlek","Minsta beställningsantal","Beställningslänk","Beställningskommentar","Användningsområde","Kommentar","Aktiv"],headers:["Artikel-ID","Artikel","Kategori","Station","Saldo","Beställ vid","Önskat lager","Enhet","Leverantör","Artikelnummer","Kontaktperson","Telefon","E-post","Kundnummer","Avtalsnummer","Förpackningsstorlek","Minsta beställningsantal","Beställningslänk","Beställningskommentar","Användningsområde","Kommentar","Aktiv"],endpoint:"/consumable/bulk-update",key:"Artikel-ID",editable:["Artikel","Kategori","Beställ vid","Önskat lager","Enhet","Leverantör","Artikelnummer","Kontaktperson","Telefon","E-post","Kundnummer","Avtalsnummer","Förpackningsstorlek","Minsta beställningsantal","Beställningslänk","Beställningskommentar","Användningsområde","Kommentar","Aktiv"]}
};
function rowsFor(view){
 if(view==="stations")return data.stations.map(x=>({"Stationsnummer":x.stationNumber,"Station":x.name,"Aktiv":boolText(x.active),__id:x.id}));
 if(view==="vehicles")return data.vehicles.map(x=>({"Rakelnummer":x.rakel,"Registreringsnummer":x.registration,"Fordonskategori":x.type,"Station":x.station,"Aktiv":boolText(x.active),__id:x.id,__categoryId:x.categoryId}));
 if(view==="material")return data.material.map(x=>({"Material-ID":x.materialId,"Material":x.material,"Kategori":x.category,"Användning":x.usage||"Brandmaterial","Station":x.station,"Rakelnummer":x.rakel,"Registreringsnummer":x.registration,"Kommentar":x.comment,"Aktiv":boolText(x.active),"Transportstatus":x.transportStatus,"Transport till station":x.transportDestination,__rowId:x.rowId}));
 return (data.consumables||[]).map(x=>({"Artikel-ID":x.articleId,"Artikel":x.article,"Kategori":x.category,"Station":x.station,"Saldo":x.balance,"Beställ vid":x.reorderAt??"","Önskat lager":x.target??"","Enhet":x.unit,"Leverantör":x.supplier,"Artikelnummer":x.supplierArticleNumber,"Kontaktperson":x.contactPerson,"Telefon":x.phone,"E-post":x.email,"Kundnummer":x.customerNumber,"Avtalsnummer":x.agreementNumber,"Förpackningsstorlek":x.packageSize??"","Minsta beställningsantal":x.minimumOrderQuantity??"","Beställningslänk":x.orderUrl,"Beställningskommentar":x.orderComment,"Användningsområde":x.usageArea,"Kommentar":x.comment,"Aktiv":boolText(x.active),__rowId:x.rowId}));
}
function rowKey(r){return String(r[views[currentView].key]||"")}
let editState=null;
function ensureEditModal(){
 if($("registerEditModal"))return;
 const style=document.createElement("style");
 style.textContent=`
 #registerEditModal{position:fixed;inset:0;background:rgba(0,0,0,.48);z-index:9999;display:none;align-items:center;justify-content:center;padding:16px}
 #registerEditModal.active{display:flex}
 #registerEditModal .register-edit-card{background:#fff;width:min(720px,100%);max-height:90vh;overflow:auto;border-radius:12px;padding:20px;box-shadow:0 16px 50px rgba(0,0,0,.28)}
 #registerEditModal .register-edit-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
 #registerEditModal label{display:flex;flex-direction:column;gap:5px;font-weight:600}
 #registerEditModal input,#registerEditModal select,#registerEditModal textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid #bbb;border-radius:6px;font:inherit}
 #registerEditModal textarea{min-height:90px;resize:vertical}
 #registerEditModal .register-edit-readonly{background:#f3f3f3}
 #registerEditModal .register-edit-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}
 #registerEditModal .register-edit-message{margin-top:10px}
 #tableBody tr[data-row-key]{cursor:pointer}
 #tableBody tr[data-row-key]:hover{background:rgba(0,0,0,.035)}
 @media(max-width:650px){#registerEditModal .register-edit-grid{grid-template-columns:1fr}}
 `;
 document.head.appendChild(style);
 const modal=document.createElement("div");
 modal.id="registerEditModal";
 modal.setAttribute("aria-hidden","true");
 modal.innerHTML=`<div class="register-edit-card" role="dialog" aria-modal="true" aria-labelledby="registerEditTitle"><h2 id="registerEditTitle">Redigera</h2><p id="registerEditSubtitle" class="muted"></p><div id="registerEditFields" class="register-edit-grid"></div><div id="registerEditMessage" class="message register-edit-message"></div><div class="register-edit-actions"><button id="registerEditSave" class="green" type="button">SPARA</button><button id="registerEditCancel" class="secondary" type="button">AVBRYT</button></div></div>`;
 document.body.appendChild(modal);
 $("registerEditSave").onclick=saveEditModal;
 $("registerEditCancel").onclick=closeEditModal;
 modal.addEventListener("click",e=>{if(e.target===modal)closeEditModal()});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&editState)closeEditModal()});
}
function editFieldHtml(c,r){
 const val=r[c]??"";
 if(c==="Aktiv")return `<label>${esc(c)}<select data-edit-field="${esc(c)}"><option value="Ja" ${String(val)==="Ja"?"selected":""}>Ja</option><option value="Nej" ${String(val)!=="Ja"?"selected":""}>Nej</option></select></label>`;
 if(currentView==="material"&&c==="Användning")return `<label>${esc(c)}<select data-edit-field="${esc(c)}">${["Brandmaterial","Övningsmaterial","Båda"].map(x=>`<option ${x===val?"selected":""}>${x}</option>`).join("")}</select></label>`;
 if(currentView==="vehicles"&&c==="Fordonskategori")return `<label>${esc(c)}<select data-edit-field="${esc(c)}"><option value="">— Välj kategori —</option>${(data.vehicleCategories||[]).map(x=>`<option value="${esc(x.name)}" ${x.name===val?"selected":""}>${esc(x.name)}</option>`).join("")}</select></label>`;
 if(currentView==="vehicles"&&c==="Station")return `<label>${esc(c)}<select data-edit-field="${esc(c)}"><option value="">— Välj station —</option>${(data.stations||[]).filter(x=>x.active).map(x=>`<option value="${esc(x.name)}" ${x.name===val?"selected":""}>${esc(x.name)}</option>`).join("")}</select></label>`;
 const type=["Beställ vid","Önskat lager","Förpackningsstorlek","Minsta beställningsantal"].includes(c)?"number":"text";
 const textarea=["Kommentar","Beställningskommentar","Användningsområde"].includes(c);
 return `<label>${esc(c)}${textarea?`<textarea data-edit-field="${esc(c)}">${esc(val)}</textarea>`:`<input type="${type}" data-edit-field="${esc(c)}" value="${esc(val)}">`}</label>`;
}
function openEditModal(key){
 ensureEditModal();
 const r=rowsFor(currentView).find(x=>rowKey(x)===key);if(!r)return;
 editState={view:currentView,key,source:r};
 const cfg=views[currentView];
 $("registerEditTitle").textContent="Redigera "+cfg.title.replace(/er$/i,"");
 $("registerEditSubtitle").textContent=key;
 let html="";
 cfg.columns.forEach(c=>{if(cfg.editable.includes(c))html+=editFieldHtml(c,r);else html+=`<label>${esc(c)}<input class="register-edit-readonly" value="${esc(r[c]??"")}" readonly></label>`});
 $("registerEditFields").innerHTML=html;
 $("registerEditMessage").className="message register-edit-message";$("registerEditMessage").textContent="";
 $("registerEditModal").classList.add("active");$("registerEditModal").setAttribute("aria-hidden","false");document.body.classList.add("modal-open");
}
function closeEditModal(){if(!editState)return;editState=null;$("registerEditModal").classList.remove("active");$("registerEditModal").setAttribute("aria-hidden","true");document.body.classList.remove("modal-open")}
function modalValues(){const d={...editState.source};document.querySelectorAll("#registerEditFields [data-edit-field]").forEach(input=>d[input.dataset.editField]=input.value);return d}
async function saveEditModal(){
 if(!editState)return;const state=editState,d=modalValues(),s=state.source,m=$("registerEditMessage"),save=$("registerEditSave"),cancel=$("registerEditCancel");
 const changed=views[state.view].editable.some(c=>String(d[c]??"")!==String(s[c]??""));if(!changed){closeEditModal();return}
 save.disabled=cancel.disabled=true;m.className="message active";m.textContent="Sparar…";
 try{
  if(state.view==="stations")await postJson("/stations/import",{rows:[{"Stationsnummer":s["Stationsnummer"],"Station":d["Station"],"Aktiv":d["Aktiv"]}]});
  else if(state.view==="vehicles")await postJson("/vehicles/import",{rows:[{"Registreringsnummer":s["Registreringsnummer"],"Rakelnummer":d["Rakelnummer"],"Fordonskategori":d["Fordonskategori"],"Station":d["Station"],"Aktiv":d["Aktiv"]}]});
  else if(state.view==="material"){
    // Användning sparas via den dedikerade endpointen för individuellt SKRTJ-ID.
    // Övriga grunduppgifter sparas därefter separat.
    if(String(d["Användning"]||"Brandmaterial")!==String(s["Användning"]||"Brandmaterial")){
      await postJson("/material/usage",{materialId:s["Material-ID"],usage:d["Användning"]||"Brandmaterial"});
    }
    await postJson("/material/bulk-update",{rows:[{materialId:s["Material-ID"],material:d["Material"],category:d["Kategori"],comment:d["Kommentar"],active:d["Aktiv"]==="Ja"}]});
   }
  else if(state.view==="consumables")await postJson("/consumable/bulk-update",{rows:[{articleId:s["Artikel-ID"],article:d["Artikel"],category:d["Kategori"],reorderAt:d["Beställ vid"],target:d["Önskat lager"],unit:d["Enhet"],supplier:d["Leverantör"],supplierArticleNumber:d["Artikelnummer"],contactPerson:d["Kontaktperson"],phone:d["Telefon"],email:d["E-post"],customerNumber:d["Kundnummer"],agreementNumber:d["Avtalsnummer"],packageSize:d["Förpackningsstorlek"],minimumOrderQuantity:d["Minsta beställningsantal"],orderUrl:d["Beställningslänk"],orderComment:d["Beställningskommentar"],usageArea:d["Användningsområde"],comment:d["Kommentar"],active:d["Aktiv"]==="Ja"}]});
  await refreshAll();closeEditModal();render();
 }catch(err){m.className="message active error";m.textContent="Kunde inte spara: "+(err.message||err)}finally{save.disabled=cancel.disabled=false}
}
function render(){
 const cfg=views[currentView],q=$("searchInput").value.trim().toLocaleLowerCase("sv-SE");
 $("listTitle").textContent=cfg.title;$("listHelp").textContent="Klicka på en rad för att redigera. SPARA verkställer ändringen, AVBRYT lämnar posten oförändrad.";
 $("tableHead").innerHTML="<tr>"+cfg.headers.map(h=>"<th>"+esc(h)+"</th>").join("")+"</tr>";
 const rows=rowsFor(currentView).filter(r=>!q||Object.values(r).some(v=>String(v).toLocaleLowerCase("sv-SE").includes(q)));
 $("tableBody").innerHTML=rows.map(r=>{const k=rowKey(r);return `<tr data-row-key="${esc(k)}" tabindex="0">`+cfg.columns.map(c=>{let v=esc(r[c]);if(currentView==="material"&&c==="Material-ID"&&r[c])v=`<a class="material-link register-qr-link" href="./?material=${encodeURIComponent(r[c])}" title="Öppna QR-vy">${v}</a>`;if(currentView==="consumables"&&c==="Artikel-ID"&&r[c])v=`<a class="material-link register-qr-link" href="./?forbrukning=${encodeURIComponent(r[c])}" title="Öppna QR-vy">${v}</a>`;if(currentView==="consumables"&&c==="Beställningslänk"&&/^https?:\/\//i.test(String(r[c]||"")))v=`<a class="material-link register-external-link" href="${esc(r[c])}" target="_blank" rel="noopener">Öppna</a>`;return `<td>${v}</td>`}).join("")+"</tr>"}).join("")||`<tr><td colspan="${cfg.columns.length}">Inga poster hittades.</td></tr>`;
}
function closeCurrentView(){closeEditModal();$("listPanel").style.display="none";currentView=null}
function cancelCurrentView(){closeCurrentView()}
async function refreshAll(){const [registerData,consumableData]=await Promise.all([getJson("/register-data"),getJson("/consumables")]);data={...registerData,consumables:consumableData.items||[]};updateCounts()}
function openView(view){closeEditModal();currentView=view;$("listPanel").style.display="block";$("searchInput").value="";$("importMessage").className="message";$("newCategoryBtn").style.display=view==="vehicles"?"inline-block":"none";$("newMaterialBtn").style.display=view==="material"?"inline-block":"none";$("newConsumableBtn").style.display=view==="consumables"?"inline-block":"none";$("importBtn").style.display=view==="consumables"?"none":"inline-block";$("templateBtn").style.display=view==="consumables"?"none":"inline-block";$("categoryPanel").style.display="none";$("newMaterialPanel").style.display="none";$("newConsumablePanel").style.display="none";render();$("listPanel").scrollIntoView({behavior:"smooth",block:"start"})}
function renderCategoryList(){const list=(data.vehicleCategories||[]);$("categoryList").innerHTML=list.length?"<strong>Befintliga kategorier:</strong> "+list.map(x=>"<span>"+esc(x.name)+"</span>").join(""):"Inga kategorier skapade ännu."}
async function createCategory(){const name=$("newCategoryName").value.trim(),m=$("categoryMessage");if(!name){m.className="message active error";m.textContent="Ange ett kategorinamn.";return}m.className="message active";m.textContent="Skapar…";try{const result=await postJson("/vehicle-categories",{name});const reg=await getJson("/register-data");data={...reg,consumables:data.consumables||[]};updateCounts();renderCategoryList();render();$("newCategoryName").value="";m.className="message active ok";m.textContent=result.created?"Kategorin skapades.":"Kategorin finns redan och är tillgänglig."}catch(err){m.className="message active error";m.textContent=err.message||err}}
function openNewMaterial(){
 const panel=$("newMaterialPanel"),station=$("newMaterialStation");
 station.innerHTML=(data.stations||[]).filter(x=>x.active).map(x=>"<option value='"+x.id+"'>"+esc(x.name)+"</option>").join("");
 const cats=[...new Set((data.material||[]).map(x=>String(x.category||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"sv"));
 $("materialCategorySuggestions").innerHTML=cats.map(x=>"<option value='"+esc(x)+"'></option>").join("");
 $("newMaterialMessage").className="message";
 panel.style.display="block";
 panel.scrollIntoView({behavior:"smooth",block:"nearest"});
 $("newMaterialName").focus();
}
function closeNewMaterial(){$("newMaterialPanel").style.display="none"}
async function createMaterial(){
 const material=$("newMaterialName").value.trim(),category=$("newMaterialCategory").value.trim(),stationId=Number($("newMaterialStation").value),comment=$("newMaterialComment").value.trim(),m=$("newMaterialMessage"),btn=$("saveMaterialBtn");
 if(!material){m.className="message active error";m.textContent="Ange material.";return}
 if(!category){m.className="message active error";m.textContent="Ange kategori.";return}
 if(!Number.isInteger(stationId)||stationId<1){m.className="message active error";m.textContent="Välj station.";return}
 const station=(data.stations||[]).find(x=>Number(x.id)===stationId);
 if(!confirm("Skapa nytt brandmaterial och placera det i "+(station?.name||"vald station")+"?"))return;
 btn.disabled=true;m.className="message active";m.textContent="Skapar…";
 try{
   const result=await postJson("/material",{material,category,stationId,comment});
   data=await getJson("/register-data");updateCounts();render();
   $("newMaterialName").value="";$("newMaterialCategory").value="";$("newMaterialComment").value="";
   m.className="message active ok";m.textContent="✓ "+result.materialId+" har skapats och lagts i "+(station?.name||"vald station")+".";
 }catch(err){m.className="message active error";m.textContent=err.message||err}
 finally{btn.disabled=false}
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
function updateCounts(){$("stationCount").textContent=data.stations.length+" poster";$("vehicleCount").textContent=data.vehicles.length+" poster";$("materialCount").textContent=data.material.length+" poster";$("consumableCount").textContent=(data.consumables||[]).length+" poster"}
document.querySelectorAll(".register-tile").forEach(b=>b.addEventListener("click",()=>openView(b.dataset.view)));
$("closeList").onclick=cancelCurrentView;
$("searchInput").addEventListener("input",()=>{syncDraftFromTable();render()});$("exportBtn").onclick=exportExcel;$("templateBtn").onclick=templateExcel;
$("importBtn").onclick=()=>$("fileInput").click();$("fileInput").addEventListener("change",async e=>{try{if(e.target.files[0])await importFile(e.target.files[0])}catch(err){const message=err.message||String(err);const m=$("importMessage");m.className="message active error";m.textContent=message;showImportOverlay("error","Importen misslyckades",message)}finally{e.target.value=""}});
$("importOverlayClose").onclick=hideImportOverlay;
$("newCategoryBtn").onclick=()=>{$("categoryPanel").style.display="block";$("categoryMessage").className="message";renderCategoryList();$("newCategoryName").focus()};
$("cancelCategoryBtn").onclick=()=>{$("categoryPanel").style.display="none"};
$("saveCategoryBtn").onclick=createCategory;
$("newCategoryName").addEventListener("keydown",e=>{if(e.key==="Enter")createCategory()});
$("tableBody").addEventListener("click",e=>{const link=e.target.closest("a");if(link)return;const tr=e.target.closest("tr[data-row-key]");if(tr)openEditModal(tr.dataset.rowKey)});
$("tableBody").addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.matches("tr[data-row-key]")){e.preventDefault();openEditModal(e.target.dataset.rowKey)}});
(async()=>{try{await refreshAll();$("registerLoading").style.display="none";$("registerContent").style.display="block"}catch(err){$("registerLoading").style.display="none";$("registerError").className="message active error";$("registerError").textContent="Kunde inte hämta register: "+(err.message||err)}})();

$("newMaterialBtn").addEventListener("click",openNewMaterial);
$("cancelMaterialBtn").addEventListener("click",closeNewMaterial);
$("saveMaterialBtn").addEventListener("click",createMaterial);


function openNewConsumable(){
 const panel=$("newConsumablePanel"),station=$("newConsumableStation");
 station.innerHTML=(data.stations||[]).filter(x=>x.active).map(x=>"<option value='"+x.id+"'>"+esc(x.name)+"</option>").join("");
 const cats=[...new Set((data.consumables||[]).map(x=>String(x.category||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"sv"));
 $("consumableCategorySuggestions").innerHTML=cats.map(x=>"<option value='"+esc(x)+"'></option>").join("");
 $("newConsumableMessage").className="message";panel.style.display="block";panel.scrollIntoView({behavior:"smooth",block:"nearest"});$("newConsumableName").focus();
}
function closeNewConsumable(){$("newConsumablePanel").style.display="none"}
async function refreshConsumables(){const d=await getJson("/consumables");data.consumables=d.items||[];updateCounts();render()}
async function createConsumable(){
 const article=$("newConsumableName").value.trim(),category=$("newConsumableCategory").value.trim(),stationId=Number($("newConsumableStation").value),unit=$("newConsumableUnit").value.trim(),balance=Number($("newConsumableBalance").value),reorderAt=Number($("newConsumableReorder").value),target=Number($("newConsumableTarget").value),supplier=$("newConsumableSupplier").value.trim(),supplierArticleNumber=$("newConsumableSupplierNo").value.trim(),orderUrl=$("newConsumableOrderUrl").value.trim(),contactPerson=$("newConsumableContact").value.trim(),phone=$("newConsumablePhone").value.trim(),email=$("newConsumableEmail").value.trim(),customerNumber=$("newConsumableCustomerNo").value.trim(),agreementNumber=$("newConsumableAgreementNo").value.trim(),packageSize=Number($("newConsumablePackageSize").value),minimumOrderQuantity=Number($("newConsumableMinOrder").value),orderComment=$("newConsumableOrderComment").value.trim(),usageArea=$("newConsumableUsageArea").value.trim(),comment=$("newConsumableComment").value.trim(),m=$("newConsumableMessage"),btn=$("saveConsumableBtn");
 if(!article){m.className="message active error";m.textContent="Ange artikel.";return}
 if(!category){m.className="message active error";m.textContent="Ange kategori.";return}
 if(!Number.isInteger(stationId)||stationId<1){m.className="message active error";m.textContent="Välj station.";return}
 if(!unit){m.className="message active error";m.textContent="Ange enhet.";return}
 if(![balance,reorderAt,target].every(Number.isInteger)||balance<0||reorderAt<0||target<0){m.className="message active error";m.textContent="Saldo och lagernivåer måste vara heltal 0 eller högre.";return}
 if(target<reorderAt){m.className="message active error";m.textContent="Önskat lager måste vara lika med eller högre än Beställ vid.";return}
 if(orderUrl&&!/^https?:\/\//i.test(orderUrl)){m.className="message active error";m.textContent="Beställningslänken måste börja med http:// eller https://";return}
 const station=(data.stations||[]).find(x=>Number(x.id)===stationId);
 if(!confirm("Skapa "+article+" för "+(station?.name||"vald station")+"?"))return;
 btn.disabled=true;m.className="message active";m.textContent="Skapar…";
 try{
  const result=await postJson("/consumable",{article,category,stationId,balance,reorderAt,target,unit,supplier,supplierArticleNumber,orderUrl,contactPerson,phone,email,customerNumber,agreementNumber,packageSize,minimumOrderQuantity,orderComment,usageArea,comment});
  await refreshConsumables();
  m.className="message active ok";m.innerHTML="✓ "+esc(result.articleId)+" har skapats. <a class='material-link' href='./?forbrukning="+encodeURIComponent(result.articleId)+"'>Öppna QR-vyn</a>";
  ["newConsumableName","newConsumableCategory","newConsumableSupplier","newConsumableSupplierNo","newConsumableOrderUrl","newConsumableContact","newConsumablePhone","newConsumableEmail","newConsumableCustomerNo","newConsumableAgreementNo","newConsumableOrderComment","newConsumableUsageArea","newConsumableComment"].forEach(id=>$(id).value="");
  $("newConsumableUnit").value="st";$("newConsumableBalance").value="0";$("newConsumableReorder").value="0";$("newConsumableTarget").value="0";$("newConsumablePackageSize").value="0";$("newConsumableMinOrder").value="0";
 }catch(err){m.className="message active error";m.textContent=err.message||err}finally{btn.disabled=false}
}
$("newConsumableBtn").addEventListener("click",openNewConsumable);
$("cancelConsumableBtn").addEventListener("click",closeNewConsumable);
$("saveConsumableBtn").addEventListener("click",createConsumable);
