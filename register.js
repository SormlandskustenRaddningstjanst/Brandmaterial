const API="https://ros-material-api.peter-hasselberg.workers.dev";
let data=null,currentView=null;
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function getJson(path){const r=await fetch(API+path);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{}if(!r.ok)throw new Error(d.error||d.message||t||("HTTP "+r.status));return d}
async function postJson(path,body){const r=await fetch(API+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{}if(!r.ok)throw new Error((d.errors||[]).join("\n")||d.error||d.message||t||("HTTP "+r.status));return d}
function boolText(v){return v?"Ja":"Nej"}
const views={
 stations:{title:"Stationer",help:"Stationsnummer och stationsnamn.",columns:["Stationsnummer","Station","Aktiv"],headers:["Stationsnummer","Station","Aktiv"],endpoint:"/stations/import"},
 vehicles:{title:"Fordon",help:"Rakelnummer hör till fordonet. Fordonskategori hanteras här i registret.",columns:["Rakelnummer","Registreringsnummer","Fordonskategori","Station","Aktiv"],headers:["Rakelnummer","Registreringsnummer","Fordonskategori","Station","Aktiv"],endpoint:"/vehicles/import"},
 material:{title:"Brandmaterial",help:"Hela listan med individuella Material-ID.",columns:["Material-ID","Material","Kategori","Station","Rakelnummer","Registreringsnummer","Kommentar","Aktiv","Transportstatus","Transport till station"],headers:["Material-ID","Material","Kategori","Station","Rakelnummer","Registreringsnummer","Kommentar","Aktiv","Transportstatus","Transport till station"],endpoint:"/material/import"},
 consumables:{title:"Förbrukningsartiklar",help:"Saldo, beställningsnivå och leverantör per station. Artikel-ID används i hyllans QR-kod.",columns:["Artikel-ID","Artikel","Kategori","Användningsområde","Station","Saldo","Enhet","Beställ vid","Önskat lager","Förpackningsstorlek","Minsta beställningsantal","Leverantör","Kontaktperson","Telefon","E-post","Kundnummer","Avtalsnummer","Artikelnummer","Beställningslänk","Beställningskommentar","Kommentar","Aktiv"],headers:["Artikel-ID","Artikel","Kategori","Användningsområde","Station","Saldo","Enhet","Beställ vid","Önskat lager","Förpackningsstorlek","Minsta beställningsantal","Leverantör","Kontaktperson","Telefon","E-post","Kundnummer","Avtalsnummer","Artikelnummer","Beställningslänk","Beställningskommentar","Kommentar","Aktiv"],endpoint:null}
};
function rowsFor(view){
 if(view==="stations")return data.stations.map(x=>({"Stationsnummer":x.stationNumber,"Station":x.name,"Aktiv":boolText(x.active)}));
 if(view==="vehicles")return data.vehicles.map(x=>({"Rakelnummer":x.rakel,"Registreringsnummer":x.registration,"Fordonskategori":x.type,"Station":x.station,"Aktiv":boolText(x.active),"__id":x.id,"__categoryId":x.categoryId}));
 if(view==="material")return data.material.map(x=>({"Material-ID":x.materialId,"Material":x.material,"Kategori":x.category,"Station":x.station,"Rakelnummer":x.rakel,"Registreringsnummer":x.registration,"Kommentar":x.comment,"Aktiv":boolText(x.active),"Transportstatus":x.transportStatus,"Transport till station":x.transportDestination}));
 return (data.consumables||[]).map(x=>({"Artikel-ID":x.articleId,"Artikel":x.article,"Kategori":x.category,"Station":x.station,"Saldo":x.balance,"Beställ vid":x.reorderAt??"","Önskat lager":x.target??"","Enhet":x.unit,"Leverantör":x.supplier,"Artikelnummer":x.supplierArticleNumber,"Kontaktperson":x.contactPerson,"Telefon":x.phone,"E-post":x.email,"Kundnummer":x.customerNumber,"Avtalsnummer":x.agreementNumber,"Förpackningsstorlek":x.packageSize??"","Minsta beställningsantal":x.minimumOrderQuantity??"","Beställningslänk":x.orderUrl,"Beställningskommentar":x.orderComment,"Användningsområde":x.usageArea,"Kommentar":x.comment,"Aktiv":boolText(x.active)}));
}
function render(){
 const cfg=views[currentView],q=$("searchInput").value.trim().toLocaleLowerCase("sv-SE");
 $("listTitle").textContent=cfg.title;$("listHelp").textContent=cfg.help;
 $("tableHead").innerHTML="<tr>"+cfg.headers.map(h=>"<th>"+esc(h)+"</th>").join("")+"</tr>";
 const rows=rowsFor(currentView).filter(r=>!q||Object.values(r).some(v=>String(v).toLocaleLowerCase("sv-SE").includes(q)));
 $("tableBody").innerHTML=rows.map(r=>"<tr>"+cfg.columns.map((c,i)=>{
   let v=esc(r[c]);
   if(currentView==="material"&&c==="Material-ID"&&r[c])v="<a class='material-link' href='./?material="+encodeURIComponent(r[c])+"'>"+v+"</a>";
   if(currentView==="consumables"&&c==="Artikel-ID"&&r[c])v="<a class='material-link' href='./?forbrukning="+encodeURIComponent(r[c])+"'>"+v+"</a>";
   if(currentView==="consumables"&&c==="Beställningslänk"&&/^https?:\/\//i.test(String(r[c]||"")))v="<a class='material-link' href='"+esc(r[c])+"' target='_blank' rel='noopener'>Öppna</a>";
   if(currentView==="vehicles"&&c==="Fordonskategori"){
     const options=(data.vehicleCategories||[]).map(x=>"<option value='"+x.id+"' "+(Number(x.id)===Number(r.__categoryId)?"selected":"")+">"+esc(x.name)+"</option>").join("");
     v="<select class='vehicle-category-select' data-vehicle-id='"+r.__id+"'><option value=''>— Välj kategori —</option>"+options+"</select>";
   }
   return "<td>"+v+"</td>";
 }).join("")+"</tr>").join("") || "<tr><td colspan='"+cfg.columns.length+"'>Inga poster hittades.</td></tr>";
}
function openView(view){currentView=view;$("listPanel").style.display="block";$("searchInput").value="";$("importMessage").className="message";$("newCategoryBtn").style.display=view==="vehicles"?"inline-block":"none";$("newMaterialBtn").style.display=view==="material"?"inline-block":"none";$("newConsumableBtn").style.display=view==="consumables"?"inline-block":"none";$("importBtn").style.display=view==="consumables"?"none":"inline-block";$("templateBtn").style.display=view==="consumables"?"none":"inline-block";$("categoryPanel").style.display="none";$("newMaterialPanel").style.display="none";$("newConsumablePanel").style.display="none";render();$("listPanel").scrollIntoView({behavior:"smooth",block:"start"})}
function renderCategoryList(){
 const list=(data.vehicleCategories||[]);
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
 if(currentView==="material")sample={"Material-ID":"SKRTJ-00001","Material":"Exempel","Kategori":"Verktyg","Station":"Nyköping","Rakelnummer":"","Registreringsnummer":"","Kommentar":"","Aktiv":"Ja","Transportstatus":"Ingen transport","Transport till station":""};
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
$("closeList").onclick=()=>{$("listPanel").style.display="none";currentView=null};
$("searchInput").addEventListener("input",render);$("exportBtn").onclick=exportExcel;$("templateBtn").onclick=templateExcel;
$("importBtn").onclick=()=>$("fileInput").click();$("fileInput").addEventListener("change",async e=>{try{if(e.target.files[0])await importFile(e.target.files[0])}catch(err){const message=err.message||String(err);const m=$("importMessage");m.className="message active error";m.textContent=message;showImportOverlay("error","Importen misslyckades",message)}finally{e.target.value=""}});
$("importOverlayClose").onclick=hideImportOverlay;
$("newCategoryBtn").onclick=()=>{$("categoryPanel").style.display="block";$("categoryMessage").className="message";renderCategoryList();$("newCategoryName").focus()};
$("cancelCategoryBtn").onclick=()=>{$("categoryPanel").style.display="none"};
$("saveCategoryBtn").onclick=createCategory;
$("newCategoryName").addEventListener("keydown",e=>{if(e.key==="Enter")createCategory()});
$("tableBody").addEventListener("change",e=>{if(e.target.classList.contains("vehicle-category-select"))setVehicleCategory(e.target.dataset.vehicleId,e.target.value,e.target)});
(async()=>{try{const [registerData,consumableData]=await Promise.all([getJson("/register-data"),getJson("/consumables")]);data={...registerData,consumables:consumableData.items||[]};updateCounts();$("registerLoading").style.display="none";$("registerContent").style.display="block"}catch(err){$("registerLoading").style.display="none";$("registerError").className="message active error";$("registerError").textContent="Kunde inte hämta register: "+(err.message||err)}})();

$("newMaterialBtn").addEventListener("click",openNewMaterial);
$("cancelMaterialBtn").addEventListener("click",closeNewMaterial);
$("saveMaterialBtn").addEventListener("click",createMaterial);



function isNykopingStationId(stationId){
 const station=(data?.stations||[]).find(s=>Number(s.id)===Number(stationId));
 return String(station?.name||"").trim().toLocaleLowerCase("sv-SE")==="nyköping";
}
function syncConsumableSupplierFields(){
 const show=isNykopingStationId(Number($("newConsumableStation")?.value));
 ["newConsumableSupplier","newConsumableContact","newConsumablePhone","newConsumableEmail","newConsumableCustomerNo","newConsumableAgreementNo","newConsumableSupplierNo","newConsumableOrderUrl","newConsumableOrderComment"].forEach(id=>{
  const node=$(id), label=node?.closest("label"); if(label) label.style.display=show?"":"none";
 });
 const note=$("newConsumableSupplierNote"); if(note) note.remove();
 if(!show && $("newConsumableStation")){
  const n=document.createElement("div"); n.id="newConsumableSupplierNote"; n.className="muted full-width"; n.textContent="Leverantörsuppgifter hanteras endast av Nyköping.";
  $("newConsumableStation").closest("label")?.insertAdjacentElement("afterend",n);
 }
}
function openNewConsumable(){
 const panel=$("newConsumablePanel"),station=$("newConsumableStation");
 station.innerHTML=(data.stations||[]).filter(x=>x.active).map(x=>"<option value='"+x.id+"'>"+esc(x.name)+"</option>").join("");
 const cats=[...new Set((data.consumables||[]).map(x=>String(x.category||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"sv"));
 $("consumableCategorySuggestions").innerHTML=cats.map(x=>"<option value='"+esc(x)+"'></option>").join("");
 $("newConsumableMessage").className="message";panel.style.display="block";syncConsumableSupplierFields();panel.scrollIntoView({behavior:"smooth",block:"nearest"});$("newConsumableName").focus();
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
$("newConsumableStation")?.addEventListener("change",syncConsumableSupplierFields);
$("cancelConsumableBtn").addEventListener("click",closeNewConsumable);
$("saveConsumableBtn").addEventListener("click",createConsumable);
