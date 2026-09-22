const API="https://ros-material-api.peter-hasselberg.workers.dev";
let data=null,currentView=null;
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function getJson(path){const r=await fetch(API+path);const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{}if(!r.ok)throw new Error(d.error||d.message||t||("HTTP "+r.status));return d}
async function postJson(path,body){const r=await fetch(API+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const t=await r.text();let d={};try{d=t?JSON.parse(t):{}}catch{}if(!r.ok)throw new Error((d.errors||[]).join("\n")||d.error||d.message||t||("HTTP "+r.status));return d}
function boolText(v){return v?"Ja":"Nej"}
const views={
 stations:{title:"Stationer",help:"Stationsnummer och stationsnamn.",columns:["Stationsnummer","Station","Aktiv"],headers:["Stationsnummer","Station","Aktiv"],endpoint:"/stations/import"},
 vehicles:{title:"Fordon",help:"Rakelnummer hör till fordonet.",columns:["Rakelnummer","Registreringsnummer","Fordonstyp","Station","Aktiv"],headers:["Rakelnummer","Registreringsnummer","Fordonstyp","Station","Aktiv"],endpoint:"/vehicles/import"},
 material:{title:"Brandmaterial",help:"Hela listan med individuella Material-ID.",columns:["Material-ID","Material","Kategori","Station","Rakelnummer","Registreringsnummer","Kommentar","Aktiv","Transportstatus","Transport till station"],headers:["Material-ID","Material","Kategori","Station","Rakelnummer","Registreringsnummer","Kommentar","Aktiv","Transportstatus","Transport till station"],endpoint:"/material/import"}
};
function rowsFor(view){
 if(view==="stations")return data.stations.map(x=>({"Stationsnummer":x.stationNumber,"Station":x.name,"Aktiv":boolText(x.active)}));
 if(view==="vehicles")return data.vehicles.map(x=>({"Rakelnummer":x.rakel,"Registreringsnummer":x.registration,"Fordonstyp":x.type,"Station":x.station,"Aktiv":boolText(x.active)}));
 return data.material.map(x=>({"Material-ID":x.materialId,"Material":x.material,"Kategori":x.category,"Station":x.station,"Rakelnummer":x.rakel,"Registreringsnummer":x.registration,"Kommentar":x.comment,"Aktiv":boolText(x.active),"Transportstatus":x.transportStatus,"Transport till station":x.transportDestination}));
}
function render(){
 const cfg=views[currentView],q=$("searchInput").value.trim().toLocaleLowerCase("sv-SE");
 $("listTitle").textContent=cfg.title;$("listHelp").textContent=cfg.help;
 $("tableHead").innerHTML="<tr>"+cfg.headers.map(h=>"<th>"+esc(h)+"</th>").join("")+"</tr>";
 const rows=rowsFor(currentView).filter(r=>!q||Object.values(r).some(v=>String(v).toLocaleLowerCase("sv-SE").includes(q)));
 $("tableBody").innerHTML=rows.map(r=>"<tr>"+cfg.columns.map((c,i)=>{
   let v=esc(r[c]); if(currentView==="material"&&c==="Material-ID"&&r[c])v="<a class='material-link' href='./?material="+encodeURIComponent(r[c])+"'>"+v+"</a>";
   return "<td>"+v+"</td>";
 }).join("")+"</tr>").join("") || "<tr><td colspan='"+cfg.columns.length+"'>Inga poster hittades.</td></tr>";
}
function openView(view){currentView=view;$("listPanel").style.display="block";$("searchInput").value="";$("importMessage").className="message";render();$("listPanel").scrollIntoView({behavior:"smooth",block:"start"})}
function exportExcel(){
 const cfg=views[currentView],rows=rowsFor(currentView),wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows,{header:cfg.columns});
 XLSX.utils.book_append_sheet(wb,ws,cfg.title.slice(0,31));XLSX.writeFile(wb,cfg.title+"_export_"+new Date().toISOString().slice(0,10)+".xlsx");
}
function templateExcel(){
 const cfg=views[currentView];let sample={};
 if(currentView==="stations")sample={"Stationsnummer":"241-3000","Station":"Nyköping","Aktiv":"Ja"};
 if(currentView==="vehicles")sample={"Rakelnummer":"3010","Registreringsnummer":"NTE11B","Fordonstyp":"Släckbil","Station":"Nyköping","Aktiv":"Ja"};
 if(currentView==="material")sample={"Material-ID":"SKRTJ-00001","Material":"Exempel","Kategori":"Verktyg","Station":"Nyköping","Rakelnummer":"","Registreringsnummer":"","Kommentar":"","Aktiv":"Ja","Transportstatus":"Ingen transport","Transport till station":""};
 const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet([sample],{header:cfg.columns});XLSX.utils.book_append_sheet(wb,ws,cfg.title.slice(0,31));XLSX.writeFile(wb,cfg.title+"_importmall.xlsx");
}
async function importFile(file){
 const cfg=views[currentView],buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:"array"}),ws=wb.Sheets[wb.SheetNames[0]],rows=XLSX.utils.sheet_to_json(ws,{defval:"",raw:false}).map((r,i)=>({...r,__row:i+2}));
 if(!rows.length)throw new Error("Excel-filen innehåller inga rader.");
 const ok=confirm("Importera "+rows.length+" rader till "+cfg.title+"?\n\nBefintliga poster uppdateras och nya läggs till. Inga poster raderas.");
 if(!ok)return;
 const msg=$("importMessage");msg.className="message active";msg.textContent="Importerar…";
 const result=await postJson(cfg.endpoint,{rows});
 msg.className="message active ok";msg.textContent="Klart. Nya: "+(result.newCount||0)+" · Uppdaterade: "+(result.updatedCount||0)+(result.createdRakelCount?" · Nya Rakelnummer: "+result.createdRakelCount:"");
 data=await getJson("/register-data");updateCounts();render();
}
function updateCounts(){$("stationCount").textContent=data.stations.length+" poster";$("vehicleCount").textContent=data.vehicles.length+" poster";$("materialCount").textContent=data.material.length+" poster"}
document.querySelectorAll(".register-tile").forEach(b=>b.addEventListener("click",()=>openView(b.dataset.view)));
$("closeList").onclick=()=>{$("listPanel").style.display="none";currentView=null};
$("searchInput").addEventListener("input",render);$("exportBtn").onclick=exportExcel;$("templateBtn").onclick=templateExcel;
$("importBtn").onclick=()=>$("fileInput").click();$("fileInput").addEventListener("change",async e=>{try{if(e.target.files[0])await importFile(e.target.files[0])}catch(err){const m=$("importMessage");m.className="message active error";m.textContent=err.message||err}finally{e.target.value=""}});
(async()=>{try{data=await getJson("/register-data");updateCounts();$("registerLoading").style.display="none";$("registerContent").style.display="block"}catch(err){$("registerLoading").style.display="none";$("registerError").className="message active error";$("registerError").textContent="Kunde inte hämta register: "+(err.message||err)}})();
