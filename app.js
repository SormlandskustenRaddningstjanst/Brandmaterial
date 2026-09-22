const BASEROW_API = "https://api.baserow.io/api";

const TABLES = {
  material: 1207230,
  events: 1208780,
  stations: 1208490,
  vehicles: 1208456,
  rakel: 1210178,
  stockLevels: 1212508,
  vehicleRequirements: 1212522,
  orders: 1212642,
  vehicleCategories: 1214956,
  consumables: 1215172,
  consumableEvents: 1215199,
  consumableOrders: 1215368,
};

const ALLOWED_ORIGIN = "https://sormlandskustenraddningstjanst.github.io";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8",
      "Vary": "Origin",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // GET /material/SKRTJ-00003
      if (request.method === "GET" && url.pathname.startsWith("/material/")) {
        const materialId = normalizeMaterialId(
          decodeURIComponent(url.pathname.replace("/material/", ""))
        );

        if (!isValidMaterialId(materialId)) {
          return json({ error: "Ogiltigt Material-ID" }, 400, corsHeaders);
        }

        const material = await findMaterialById(env, materialId);

        if (!material) {
          return json({ error: "Materialet hittades inte" }, 404, corsHeaders);
        }

        return json(material, 200, corsHeaders);
      }

      // GET /consumables
      // Lista aktiva förbrukningsartiklar för register/lageröversikt.
      if (request.method === "GET" && url.pathname === "/consumables") {
        const data = await baserowRequest(
          env,
          `/database/rows/table/${TABLES.consumables}/?user_field_names=true&size=200`,
          { method: "GET" }
        );
        const items = data.results
          .filter(row => row["Aktiv"] === true)
          .map(consumableFromRow)
          .map(stripSupplierUnlessNykoping)
          .sort((a,b) => String(a.article).localeCompare(String(b.article), "sv"));
        return json({ items }, 200, corsHeaders);
      }

      // POST /consumable
      // Skapar en ny förbrukningsartikel och genererar nästa lediga FORB-xxx.
      if (request.method === "POST" && url.pathname === "/consumable") {
        if (!isAllowedBrowserOrigin(request)) return json({ error:"Otillåten origin" }, 403, corsHeaders);
        const body = await readJson(request);
        const article = String(body?.article || "").trim();
        const category = String(body?.category || "").trim();
        const stationId = Number(body?.stationId);
        const balance = Number(body?.balance ?? 0);
        const reorderAt = Number(body?.reorderAt ?? 0);
        const target = Number(body?.target ?? 0);
        const unit = String(body?.unit || "st").trim();
        const supplier = String(body?.supplier || "").trim();
        const supplierArticleNumber = String(body?.supplierArticleNumber || "").trim();
        const orderUrl = String(body?.orderUrl || "").trim();
        const contactPerson = String(body?.contactPerson || "").trim();
        const phone = String(body?.phone || "").trim();
        const email = String(body?.email || "").trim();
        const customerNumber = String(body?.customerNumber || "").trim();
        const agreementNumber = String(body?.agreementNumber || "").trim();
        const packageSize = Number(body?.packageSize ?? 0);
        const minimumOrderQuantity = Number(body?.minimumOrderQuantity ?? 0);
        const orderComment = String(body?.orderComment || "").trim();
        const usageArea = String(body?.usageArea || "").trim();
        const comment = String(body?.comment || "").trim();

        if (!article) return json({error:"Artikel måste anges"},400,corsHeaders);
        if (!category) return json({error:"Kategori måste anges"},400,corsHeaders);
        if (!isPositiveInteger(stationId)) return json({error:"Ogiltigt station-ID"},400,corsHeaders);
        if (!unit) return json({error:"Enhet måste anges"},400,corsHeaders);
        if (![balance,reorderAt,target].every(Number.isInteger) || balance < 0 || reorderAt < 0 || target < 0) return json({error:"Saldo och lagernivåer måste vara heltal 0 eller högre"},400,corsHeaders);
        if (target < reorderAt) return json({error:"Önskat lager måste vara lika med eller högre än Beställ vid"},400,corsHeaders);
        if (orderUrl && !/^https?:\/\//i.test(orderUrl)) return json({error:"Beställningslänk måste börja med http:// eller https://"},400,corsHeaders);
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({error:"Ogiltig e-postadress"},400,corsHeaders);
        if (![packageSize,minimumOrderQuantity].every(Number.isInteger) || packageSize < 0 || minimumOrderQuantity < 0) return json({error:"Förpackningsstorlek och minsta beställningsantal måste vara heltal 0 eller högre"},400,corsHeaders);

        const [station, current] = await Promise.all([
          getRow(env, TABLES.stations, stationId),
          baserowRequest(env, `/database/rows/table/${TABLES.consumables}/?user_field_names=true&size=200`, {method:"GET"})
        ]);
        if (!station) return json({error:"Stationen hittades inte"},404,corsHeaders);
        if (station["Aktiv"] !== true) return json({error:"Stationen är inte aktiv"},409,corsHeaders);
        const isNykopingStation = normalizeSwedishName(station["Station"] || station["Station-ID"]) === "nyköping";
        if (!isNykopingStation) return json({error:"Nya förbrukningsartiklar kan endast läggas upp i Nyköping"},403,corsHeaders);

        const used = new Set(current.results.map(r => normalizeConsumableId(r["Artikel-ID"])).map(id => { const m=/^FORB-(\\d{3,5})$/.exec(id); return m ? Number(m[1]) : null; }).filter(Number.isInteger));
        let next=1; while(used.has(next)) next++;
        if(next>99999) return json({error:"Inga fler Artikel-ID kan skapas"},409,corsHeaders);
        const articleId=`FORB-${String(next).padStart(3,"0")}`;

        const created = await baserowRequest(env, `/database/rows/table/${TABLES.consumables}/?user_field_names=true`, {
          method:"POST",
          body:{
            "Artikel-ID":articleId,"Artikel":article,"Kategori":category,"Station":[stationId],"Saldo":balance,
            "Beställ vid":reorderAt,"Önskat lager":target,"Enhet":unit,"Leverantör":isNykopingStation?supplier:"",
            "Artikelnummer":isNykopingStation?supplierArticleNumber:"","Beställningslänk":isNykopingStation?orderUrl:"",
            "Kontaktperson":isNykopingStation?contactPerson:"","Telefon":isNykopingStation?phone:"","E-post":isNykopingStation?email:"","Kundnummer":isNykopingStation?customerNumber:"",
            "Avtalsnummer":isNykopingStation?agreementNumber:"","Förpackningsstorlek":packageSize,"Minsta beställningsantal":minimumOrderQuantity,
            "Beställningskommentar":isNykopingStation?orderComment:"","Användningsområde":usageArea,"Kommentar":comment,"Beställningsbar":false,"Aktiv":true
          }
        });
        return json({success:true,articleId,item:consumableFromRow(created)},201,corsHeaders);
      }

      // GET /consumable/FORB-001
      // QR-uppslag av en enskild förbrukningsartikel.
      if (request.method === "GET" && url.pathname.startsWith("/consumable/")) {
        const articleId = normalizeConsumableId(
          decodeURIComponent(url.pathname.replace("/consumable/", ""))
        );
        if (!isValidConsumableId(articleId)) {
          return json({ error: "Ogiltigt Artikel-ID" }, 400, corsHeaders);
        }
        const row = await findConsumableById(env, articleId);
        if (!row) return json({ error: "Förbrukningsartikeln hittades inte" }, 404, corsHeaders);
        if (row["Aktiv"] !== true) return json({ error: "Förbrukningsartikeln är inte aktiv" }, 409, corsHeaders);
        return json(stripSupplierUnlessNykoping(consumableFromRow(row)), 200, corsHeaders);
      }

      // POST /consumable/adjust
      // Body: { articleId:"FORB-001", change:-10, comment:"" }
      // Uppdaterar saldo och sparar samtidigt en händelse.
      if (request.method === "POST" && url.pathname === "/consumable/adjust") {
        if (!isAllowedBrowserOrigin(request)) {
          return json({ error: "Otillåten origin" }, 403, corsHeaders);
        }
        const body = await readJson(request);
        const articleId = normalizeConsumableId(body?.articleId);
        const change = Number(body?.change);
        const comment = String(body?.comment || "").trim();

        if (!isValidConsumableId(articleId)) {
          return json({ error: "Ogiltigt Artikel-ID" }, 400, corsHeaders);
        }
        if (!Number.isInteger(change) || change === 0) {
          return json({ error: "Förändring måste vara ett heltal och får inte vara 0" }, 400, corsHeaders);
        }
        if (Math.abs(change) > 10000) {
          return json({ error: "Förändringen är orimligt stor" }, 400, corsHeaders);
        }

        const row = await findConsumableById(env, articleId);
        if (!row) return json({ error: "Förbrukningsartikeln hittades inte" }, 404, corsHeaders);
        if (row["Aktiv"] !== true) return json({ error: "Förbrukningsartikeln är inte aktiv" }, 409, corsHeaders);

        const before = integerOrZero(row["Saldo"]);
        const after = before + change;
        if (after < 0) {
          return json({ error: `Lagret kan inte bli negativt. Aktuellt saldo är ${before}.` }, 409, corsHeaders);
        }

        const updated = await baserowRequest(
          env,
          `/database/rows/table/${TABLES.consumables}/${row.id}/?user_field_names=true`,
          { method:"PATCH", body:{ "Saldo": after } }
        );

        const eventType = change < 0 ? "Uttag" : "Påfyllning";
        let event;
        try {
          event = await baserowRequest(
            env,
            `/database/rows/table/${TABLES.consumableEvents}/?user_field_names=true`,
            {
              method:"POST",
              body:{
                "Händelse": `${articleId} ${change > 0 ? "+" : ""}${change}`,
                "Artikel": [row.id],
                "Förändring": change,
                "Saldo före": before,
                "Saldo efter": after,
                "Typ": eventType,
                "Kommentar": comment
              }
            }
          );
        } catch (eventError) {
          try {
            await baserowRequest(
              env,
              `/database/rows/table/${TABLES.consumables}/${row.id}/?user_field_names=true`,
              { method:"PATCH", body:{ "Saldo": before } }
            );
          } catch (rollbackError) {
            console.error("Rollback för förbrukningssaldo misslyckades:", rollbackError);
            throw new Error(`Händelsen kunde inte sparas och saldot kunde inte återställas. Kontrollera ${articleId} manuellt i Baserow.`);
          }
          throw new Error(`Händelsen kunde inte sparas. Saldot återställdes. ${eventError.message}`);
        }

        const item = consumableFromRow(updated);
        return json({
          success:true,
          action:"consumable-adjust",
          articleId,
          change,
          before,
          after,
          eventId:event.id,
          orderNeeded:item.orderNeeded,
          orderQuantity:item.orderQuantity,
          item
        }, 200, corsHeaders);
      }

      // GET /stations
      if (request.method === "GET" && url.pathname === "/stations") {
        const data = await baserowRequest(
          env,
          `/database/rows/table/${TABLES.stations}/?user_field_names=true&size=200`,
          { method: "GET" }
        );
        return json(data.results, 200, corsHeaders);
      }

      // GET /vehicles
      if (request.method === "GET" && url.pathname === "/vehicles") {
        const data = await baserowRequest(
          env,
          `/database/rows/table/${TABLES.vehicles}/?user_field_names=true&size=200`,
          { method: "GET" }
        );
        return json(data.results, 200, corsHeaders);
      }

      // POST /consumable/orderable
      // Nyköpings styrning av vilka stationsartiklar som får beställas internt.
      if (request.method === "POST" && url.pathname === "/consumable/orderable") {
        if (!isAllowedBrowserOrigin(request)) return json({error:"Otillåten origin"},403,corsHeaders);
        const body=await readJson(request), articleId=normalizeConsumableId(body?.articleId), orderable=body?.orderable===true;
        if(!isValidConsumableId(articleId)) return json({error:"Ogiltigt Artikel-ID"},400,corsHeaders);
        const row=await findConsumableById(env,articleId);
        if(!row) return json({error:"Artikeln hittades inte"},404,corsHeaders);
        const stationName=Array.isArray(row["Station"])&&row["Station"][0]?.value?String(row["Station"][0].value):"";
        if(normalizeSwedishName(stationName)!=="nyköping") return json({error:"Beställningsbar styrs på Nyköpings huvudartikel"},409,corsHeaders);
        await baserowRequest(env,`/database/rows/table/${TABLES.consumables}/${row.id}/?user_field_names=true`,{method:"PATCH",body:{"Beställningsbar":orderable}});
        return json({success:true,articleId,orderable},200,corsHeaders);
      }

      // GET /consumable-levels
      // Nyköping styr önskat/max antal per station för beställningsbara förbrukningsartiklar.
      // Lagras i Lagernivåer med Material = FORB:<Artikel-ID> för att hållas skilt från Brandmaterial.
      if (request.method === "GET" && url.pathname === "/consumable-levels") {
        const [levelData, consumableData] = await Promise.all([
          baserowRequest(env, `/database/rows/table/${TABLES.stockLevels}/?user_field_names=true&size=200`, {method:"GET"}),
          baserowRequest(env, `/database/rows/table/${TABLES.consumables}/?user_field_names=true&size=200`, {method:"GET"})
        ]);
        const catalog = consumableData.results
          .filter(r => r["Aktiv"] === true && r["Beställningsbar"] === true && normalizeSwedishName(Array.isArray(r["Station"]) && r["Station"][0]?.value ? r["Station"][0].value : "") === "nyköping")
          .map(r => ({articleId:normalizeConsumableId(r["Artikel-ID"]), article:String(r["Artikel"]||""), category:String(r["Kategori"]||""), unit:String(r["Enhet"]||"st")}))
          .filter(x => isValidConsumableId(x.articleId));
        const levels = levelData.results
          .filter(r => r["Aktiv"] === true && /^FORB:FORB-\d{3,5}$/i.test(String(r["Material"]||"").trim()))
          .map(r => ({rowId:r.id, stationId:linkedIds(r["Station"])[0]||null, articleId:normalizeConsumableId(String(r["Material"]||"").replace(/^FORB:/i,"")), target:Math.max(0,integerOrZero(r["Max antal"]))}));
        return json({catalog,levels},200,corsHeaders);
      }

      // POST /consumable-level/upsert
      // Sätter hur många av en artikel en viss station maximalt/önskat ska ha.
      if (request.method === "POST" && url.pathname === "/consumable-level/upsert") {
        if (!isAllowedBrowserOrigin(request)) return json({error:"Otillåten origin"},403,corsHeaders);
        const body=await readJson(request), stationId=Number(body?.stationId), articleId=normalizeConsumableId(body?.articleId), active=body?.active!==false, target=Number(body?.target);
        if(!isPositiveInteger(stationId)||!isValidConsumableId(articleId)) return json({error:"Station och giltigt Artikel-ID krävs."},400,corsHeaders);
        if(active&&(!Number.isInteger(target)||target<1)) return json({error:"Önskat antal måste vara ett heltal minst 1."},400,corsHeaders);
        const station=await getRow(env,TABLES.stations,stationId);
        if(!station||station["Aktiv"]!==true) return json({error:"Stationen hittades inte eller är inte aktiv."},404,corsHeaders);
        if(normalizeSwedishName(station["Station"]||station["Station-ID"])==="nyköping") return json({error:"Nyköpings eget lager styrs på huvudartikeln, inte här."},409,corsHeaders);
        const consumables=await baserowRequest(env,`/database/rows/table/${TABLES.consumables}/?user_field_names=true&size=200`,{method:"GET"});
        const source=consumables.results.find(r=>normalizeConsumableId(r["Artikel-ID"])===articleId && r["Aktiv"]===true);
        const sourceStation=source&&Array.isArray(source["Station"])&&source["Station"][0]?.value?String(source["Station"][0].value):"";
        if(!source||normalizeSwedishName(sourceStation)!=="nyköping"||source["Beställningsbar"]!==true) return json({error:"Artikeln är inte beställningsbar från Nyköping."},409,corsHeaders);
        const materialKey=`FORB:${articleId}`;
        const all=await baserowRequest(env,`/database/rows/table/${TABLES.stockLevels}/?user_field_names=true&size=200`,{method:"GET"});
        const matches=all.results.filter(r=>linkedIds(r["Station"])[0]===stationId && String(r["Material"]||"").trim().toUpperCase()===materialKey.toUpperCase());
        if(matches.length>1) return json({error:"Det finns dubbletter för denna station/artikel i Lagernivåer."},409,corsHeaders);
        if(!active){
          if(!matches.length) return json({success:true,unchanged:true},200,corsHeaders);
          const row=await baserowRequest(env,`/database/rows/table/${TABLES.stockLevels}/${matches[0].id}/?user_field_names=true`,{method:"PATCH",body:{"Aktiv":false}});
          return json({success:true,rowId:row.id,active:false},200,corsHeaders);
        }
        const payload={"Namn":`${articleId} – ${String(station["Station"]||station["Station-ID"]||stationId)}`,"Station":[stationId],"Material":materialKey,"Röd under":1,"Grön från":target,"Max antal":target,"Aktiv":true};
        const row=matches.length
          ? await baserowRequest(env,`/database/rows/table/${TABLES.stockLevels}/${matches[0].id}/?user_field_names=true`,{method:"PATCH",body:payload})
          : await baserowRequest(env,`/database/rows/table/${TABLES.stockLevels}/?user_field_names=true`,{method:"POST",body:payload});
        return json({success:true,rowId:row.id,stationId,articleId,target,active:true},200,corsHeaders);
      }

      // GET /consumable-orders
      // Interna beställningar från stationerna till Nyköpings centrallager.
      if (request.method === "GET" && url.pathname === "/consumable-orders") {
        const [data, consumableData] = await Promise.all([
          baserowRequest(env, `/database/rows/table/${TABLES.consumableOrders}/?user_field_names=true&size=200`, {method:"GET"}),
          baserowRequest(env, `/database/rows/table/${TABLES.consumables}/?user_field_names=true&size=200`, {method:"GET"})
        ]);
        const articleNames = new Map(consumableData.results.map(r => [Number(r.id), String(r["Artikel"] || r["Artikel-ID"] || "")]));
        const orders = data.results.map(consumableOrderFromRow).map(o => ({...o, article:articleNames.get(Number(o.articleRowId)) || o.article})).sort((a,b)=>b.rowId-a.rowId);
        return json({orders},200,corsHeaders);
      }

      // POST /consumable-order
      // Beställning ur Nyköpings katalog. Nyköpings saldo minskas direkt.
      // Body: {articleId:<Nyköpings Artikel-ID>, stationId, quantity, orderedBy}
      if (request.method === "POST" && url.pathname === "/consumable-order") {
        if (!isAllowedBrowserOrigin(request)) return json({error:"Otillåten origin"},403,corsHeaders);
        const body=await readJson(request);
        const sourceArticleId=normalizeConsumableId(body?.articleId);
        const destinationStationId=Number(body?.stationId);
        const quantity=Number(body?.quantity);
        const orderedBy=String(body?.orderedBy||"").trim();
        const comment=String(body?.comment||"").trim();
        if(!isValidConsumableId(sourceArticleId)) return json({error:"Ogiltigt Artikel-ID"},400,corsHeaders);
        if(!isPositiveInteger(destinationStationId)) return json({error:"Ogiltig mottagarstation"},400,corsHeaders);
        if(!Number.isInteger(quantity)||quantity<1) return json({error:"Antal måste vara minst 1"},400,corsHeaders);
        if(!orderedBy) return json({error:"Beställare måste anges"},400,corsHeaders);

        const [all, destinationStation, stationRows] = await Promise.all([
          baserowRequest(env,`/database/rows/table/${TABLES.consumables}/?user_field_names=true&size=200`,{method:"GET"}),
          getRow(env,TABLES.stations,destinationStationId),
          baserowRequest(env,`/database/rows/table/${TABLES.stations}/?user_field_names=true&size=200`,{method:"GET"})
        ]);
        if(!destinationStation||destinationStation["Aktiv"]!==true) return json({error:"Mottagarstationen hittades inte eller är inte aktiv"},404,corsHeaders);
        const destinationName=String(destinationStation["Station"]||destinationStation["Station-ID"]||"").trim();
        if(normalizeSwedishName(destinationName)==="nyköping") return json({error:"Nyköping beställer från leverantör, inte från sig själv"},409,corsHeaders);

        const source=all.results.find(r=>normalizeConsumableId(r["Artikel-ID"])===sourceArticleId);
        if(!source||source["Aktiv"]!==true) return json({error:"Artikeln hittades inte eller är inte aktiv"},404,corsHeaders);
        const sourceStationName=Array.isArray(source["Station"])&&source["Station"][0]?.value?String(source["Station"][0].value):"";
        if(normalizeSwedishName(sourceStationName)!=="nyköping") return json({error:"Beställningen måste utgå från en artikel i Nyköpings huvudlager"},409,corsHeaders);
        if(source["Beställningsbar"]!==true) return json({error:"Nyköping har inte gjort artikeln beställningsbar"},409,corsHeaders);

        const articleName=String(source["Artikel"]||"").trim();
        const destination=all.results.find(r=>r["Aktiv"]===true && linkedIds(r["Station"])[0]===destinationStationId && normalizeSwedishName(r["Artikel"])===normalizeSwedishName(articleName));
        const balance=destination?integerOrZero(destination["Saldo"]):0;
        const levelRows=await baserowRequest(env,`/database/rows/table/${TABLES.stockLevels}/?user_field_names=true&size=200`,{method:"GET"});
        const level=levelRows.results.find(r=>r["Aktiv"]===true && linkedIds(r["Station"])[0]===destinationStationId && String(r["Material"]||"").trim().toUpperCase()===`FORB:${sourceArticleId}`.toUpperCase());
        const target=level?Math.max(0,integerOrZero(level["Max antal"])):0;
        if(target<1) return json({error:"Nyköping har inte ställt in önskat antal för denna artikel på stationen."},409,corsHeaders);
        const maxAllowed=Math.max(0,target-balance);
        if(maxAllowed<1) return json({error:`Stationen har redan nått önskat lager (${target}).`},409,corsHeaders);
        if(quantity>maxAllowed) return json({error:`Du kan högst beställa ${maxAllowed}. Saldo ${balance}, önskat lager ${target}.`},409,corsHeaders);

        const nykBalance=integerOrZero(source["Saldo"]);
        if(quantity>nykBalance) return json({error:`Nyköping har bara ${nykBalance} ${String(source["Enhet"]||"st")} tillgängligt.`},409,corsHeaders);
        const nykStation=stationRows.results.find(r=>normalizeSwedishName(r["Station"]||r["Station-ID"])==="nyköping");
        if(!nykStation) return json({error:"Stationen Nyköping hittades inte"},409,corsHeaders);

        const existing=await baserowRequest(env,`/database/rows/table/${TABLES.consumableOrders}/?user_field_names=true&size=200`,{method:"GET"});
        const used=new Set(existing.results.map(r=>String(r["Beställnings-ID"]||"").match(/^FB-(\d{5})$/i)).filter(Boolean).map(m=>Number(m[1])));
        let next=1; while(used.has(next))next++;
        const orderId=`FB-${String(next).padStart(5,"0")}`;

        const nykAfter=nykBalance-quantity;
        await baserowRequest(env,`/database/rows/table/${TABLES.consumables}/${source.id}/?user_field_names=true`,{method:"PATCH",body:{"Saldo":nykAfter}});
        try {
          await baserowRequest(env,`/database/rows/table/${TABLES.consumableEvents}/?user_field_names=true`,{method:"POST",body:{"Händelse":`${sourceArticleId} -${quantity}`,"Artikel":[source.id],"Förändring":-quantity,"Saldo före":nykBalance,"Saldo efter":nykAfter,"Typ":"Uttag","Kommentar":`${orderId} – reserverat för ${destinationName}`}});
          const created=await baserowRequest(env,`/database/rows/table/${TABLES.consumableOrders}/?user_field_names=true`,{method:"POST",body:{"Beställnings-ID":orderId,"Artikel":[source.id],"Från station":[nykStation.id],"Till station":[destinationStationId],"Antal":quantity,"Beställare":orderedBy,"Status":"Beställd","Kommentar":comment}});
          return json({success:true,orderId,rowId:created.id,status:"Beställd",nykopingBalance:nykAfter,maxAllowed},201,corsHeaders);
        } catch(err) {
          await baserowRequest(env,`/database/rows/table/${TABLES.consumables}/${source.id}/?user_field_names=true`,{method:"PATCH",body:{"Saldo":nykBalance}});
          throw err;
        }
      }

      // POST /consumable-order/status
      // Beställd -> Skickad -> Mottagen. Avbruten återför reserverat antal till Nyköping.
      if (request.method === "POST" && url.pathname === "/consumable-order/status") {
        if (!isAllowedBrowserOrigin(request)) return json({error:"Otillåten origin"},403,corsHeaders);
        const body=await readJson(request), rowId=Number(body?.rowId), wanted=String(body?.status||"").trim();
        if(!isPositiveInteger(rowId)) return json({error:"Ogiltig beställning"},400,corsHeaders);
        if(!["Skickad","Mottagen","Avbruten"].includes(wanted)) return json({error:"Ogiltig status"},400,corsHeaders);
        const order=await getRow(env,TABLES.consumableOrders,rowId);
        if(!order) return json({error:"Beställningen hittades inte"},404,corsHeaders);
        const current=order["Status"]?.value||order["Status"]||"";
        if(current===wanted) return json({success:true,rowId,status:current,unchanged:true},200,corsHeaders);
        const allowed=(current==="Beställd"&&["Skickad","Avbruten"].includes(wanted))||(current==="Skickad"&&["Mottagen","Avbruten"].includes(wanted));
        if(!allowed) return json({error:`Status kan inte ändras från ${current||"okänd"} till ${wanted}.`},409,corsHeaders);
        const quantity=integerOrZero(order["Antal"]), sourceRowId=linkedIds(order["Artikel"])[0], destinationStationId=linkedIds(order["Till station"])[0];
        if(!sourceRowId||!destinationStationId||quantity<1) return json({error:"Beställningen saknar artikel, station eller antal"},409,corsHeaders);
        const source=await getRow(env,TABLES.consumables,sourceRowId);
        if(!source) return json({error:"Beställningens Nyköpingsartikel hittades inte"},409,corsHeaders);

        if(wanted==="Mottagen"){
          const all=await baserowRequest(env,`/database/rows/table/${TABLES.consumables}/?user_field_names=true&size=200`,{method:"GET"});
          const articleName=String(source["Artikel"]||"").trim();
          let destination=all.results.find(r=>r["Aktiv"]===true && linkedIds(r["Station"])[0]===destinationStationId && normalizeSwedishName(r["Artikel"])===normalizeSwedishName(articleName));
          if(!destination){
            const used=new Set(all.results.map(r=>normalizeConsumableId(r["Artikel-ID"])).map(id=>{const m=/^FORB-(\d{3,5})$/.exec(id);return m?Number(m[1]):null}).filter(Number.isInteger));
            let next=1;while(used.has(next))next++;
            if(next>99999) return json({error:"Inga fler Artikel-ID kan skapas"},409,corsHeaders);
            const newId=`FORB-${String(next).padStart(3,"0")}`;
            destination=await baserowRequest(env,`/database/rows/table/${TABLES.consumables}/?user_field_names=true`,{method:"POST",body:{
              "Artikel-ID":newId,"Artikel":articleName,"Kategori":String(source["Kategori"]||""),"Station":[destinationStationId],"Saldo":0,
              "Beställ vid":integerOrZero(source["Beställ vid"]),"Önskat lager":await consumableTargetForStation(env,destinationStationId,normalizeConsumableId(source["Artikel-ID"])),"Enhet":String(source["Enhet"]||"st"),
              "Förpackningsstorlek":0,"Minsta beställningsantal":0,"Användningsområde":String(source["Användningsområde"]||""),
              "Kommentar":"Skapad automatiskt vid mottagen beställning från Nyköping","Beställningsbar":false,"Aktiv":true
            }});
          }
          const before=integerOrZero(destination["Saldo"]), after=before+quantity;
          const target=await consumableTargetForStation(env,destinationStationId,normalizeConsumableId(source["Artikel-ID"]));
          if(target>0&&after>target) return json({error:`Mottagning skulle ge ${after}, över önskat lager ${target}.`},409,corsHeaders);
          await baserowRequest(env,`/database/rows/table/${TABLES.consumables}/${destination.id}/?user_field_names=true`,{method:"PATCH",body:{"Saldo":after}});
          try{await baserowRequest(env,`/database/rows/table/${TABLES.consumableEvents}/?user_field_names=true`,{method:"POST",body:{"Händelse":`${normalizeConsumableId(destination["Artikel-ID"])} +${quantity}`,"Artikel":[destination.id],"Förändring":quantity,"Saldo före":before,"Saldo efter":after,"Typ":"Påfyllning","Kommentar":`${order["Beställnings-ID"]||"Beställning"} mottagen från Nyköping`}})}catch(err){await baserowRequest(env,`/database/rows/table/${TABLES.consumables}/${destination.id}/?user_field_names=true`,{method:"PATCH",body:{"Saldo":before}});throw err;}
        } else if(wanted==="Avbruten"){
          const before=integerOrZero(source["Saldo"]), after=before+quantity;
          await baserowRequest(env,`/database/rows/table/${TABLES.consumables}/${source.id}/?user_field_names=true`,{method:"PATCH",body:{"Saldo":after}});
          try{await baserowRequest(env,`/database/rows/table/${TABLES.consumableEvents}/?user_field_names=true`,{method:"POST",body:{"Händelse":`${normalizeConsumableId(source["Artikel-ID"])} +${quantity}`,"Artikel":[source.id],"Förändring":quantity,"Saldo före":before,"Saldo efter":after,"Typ":"Korrigering","Kommentar":`${order["Beställnings-ID"]||"Beställning"} avbruten – återfört till Nyköping`}})}catch(err){await baserowRequest(env,`/database/rows/table/${TABLES.consumables}/${source.id}/?user_field_names=true`,{method:"PATCH",body:{"Saldo":before}});throw err;}
        }
        const updated=await baserowRequest(env,`/database/rows/table/${TABLES.consumableOrders}/${rowId}/?user_field_names=true`,{method:"PATCH",body:{"Status":wanted}});
        return json({success:true,rowId,status:wanted,orderId:updated["Beställnings-ID"]||""},200,corsHeaders);
      }

      // GET /register-data
      // Grundregister för den separata Register-sidan.
      if (request.method === "GET" && url.pathname === "/register-data") {
        const [stationData, vehicleData, materialData, categoryData, consumableData] = await Promise.all([
          baserowRequest(env, `/database/rows/table/${TABLES.stations}/?user_field_names=true&size=200`, { method:"GET" }),
          baserowRequest(env, `/database/rows/table/${TABLES.vehicles}/?user_field_names=true&size=200`, { method:"GET" }),
          baserowRequest(env, `/database/rows/table/${TABLES.material}/?user_field_names=true&size=200`, { method:"GET" }),
          baserowRequest(env, `/database/rows/table/${TABLES.vehicleCategories}/?user_field_names=true&size=200`, { method:"GET" }),
          baserowRequest(env, `/database/rows/table/${TABLES.consumables}/?user_field_names=true&size=200`, { method:"GET" }),
        ]);

        const stations = stationData.results.map(row => ({
          id: row.id,
          stationNumber: row["Stationsnummer"]?.value || row["Stationsnummer"] || "",
          name: row["Station"] || row["Station-ID"] || "",
          active: row["Aktiv"] === true,
        })).sort((a,b) => String(a.stationNumber).localeCompare(String(b.stationNumber), "sv"));

        const stationNameById = new Map(stations.map(s => [Number(s.id), s.name]));
        const vehicleCategories = categoryData.results.map(row => ({
          id: row.id,
          name: String(row["Kategori"] || "").trim(),
          active: row["Aktiv"] === true,
        })).filter(x => x.name).sort((a,b) => a.name.localeCompare(b.name, "sv"));
        const categoryNameById = new Map(vehicleCategories.map(c => [Number(c.id), c.name]));
        const vehicles = vehicleData.results.map(row => {
          const stationId = linkedIds(row["Station"])[0] || null;
          const rakel = Array.isArray(row["Rakelnummer"]) && row["Rakelnummer"][0]?.value
            ? String(row["Rakelnummer"][0].value) : "";
          return {
            id: row.id,
            rakel,
            registration: row["Registreringsnummer"] || "",
            vehicleId: row["Fordons-ID"] || "",
            categoryId: linkedIds(row["Fordonskategori"])[0] || null,
            type: (() => {
              const categoryId = linkedIds(row["Fordonskategori"])[0] || null;
              if (categoryId) {
                const linkedValue = Array.isArray(row["Fordonskategori"])
                  ? row["Fordonskategori"][0]?.value
                  : row["Fordonskategori"]?.value;
                return categoryNameById.get(Number(categoryId)) || String(linkedValue || "").trim();
              }
              return row["Fordonstyp"]?.value || row["Fordonstyp"] || "";
            })(),
            stationId,
            station: stationId ? (stationNameById.get(Number(stationId)) || "") : "",
            active: row["Aktiv"] === true,
          };
        }).sort((a,b) => String(a.rakel).localeCompare(String(b.rakel), "sv"));

        const vehicleById = new Map(vehicles.map(v => [Number(v.id), v]));
        const material = materialData.results.map(row => {
          const stationId = linkedIds(row["Station"])[0] || null;
          const vehicleId = linkedIds(row["Registreringsnummer"])[0] || null;
          const vehicle = vehicleId ? vehicleById.get(Number(vehicleId)) : null;
          return {
            rowId: row.id,
            materialId: normalizeMaterialId(row["Material-ID"]),
            material: row["Material"] || "",
            category: row["Kategori"]?.value || row["Kategori"] || "",
            station: stationId ? (stationNameById.get(Number(stationId)) || "") : "",
            rakel: Array.isArray(row["Rakelnummer"]) && row["Rakelnummer"][0]?.value ? String(row["Rakelnummer"][0].value) : (vehicle?.rakel || ""),
            registration: vehicle?.registration || "",
            comment: row["Kommentar"] || "",
            active: row["Aktiv"] === true,
            transportStatus: row["Transportstatus"]?.value || row["Transportstatus"] || "",
            transportDestination: Array.isArray(row["Transport till station"]) && row["Transport till station"][0]?.value
              ? String(row["Transport till station"][0].value) : "",
          };
        }).sort((a,b) => String(a.materialId).localeCompare(String(b.materialId), "sv"));

        const consumables = consumableData.results
          .filter(row => row["Aktiv"] === true)
          .map(consumableFromRow)
          .map(stripSupplierUnlessNykoping)
          .sort((a,b) => String(a.article).localeCompare(String(b.article), "sv"));

        return json({ stations, vehicles, material, vehicleCategories, consumables }, 200, corsHeaders);
      }

      // POST /vehicle-categories
      // Skapar en ny fordonskategori. Namn jämförs utan hänsyn till stora/små bokstäver.
      if (request.method === "POST" && url.pathname === "/vehicle-categories") {
        if (!isAllowedBrowserOrigin(request)) return json({error:"Otillåten origin"},403,corsHeaders);
        const body = await readJson(request);
        const name = String(body?.name || "").trim();
        if (!name) return json({error:"Kategorinamn krävs."},400,corsHeaders);
        if (name.length > 100) return json({error:"Kategorinamnet är för långt."},400,corsHeaders);

        const current = await baserowRequest(env, `/database/rows/table/${TABLES.vehicleCategories}/?user_field_names=true&size=200`, {method:"GET"});
        const norm = s => String(s || "").trim().toLocaleLowerCase("sv-SE");
        const existing = current.results.find(r => norm(r["Kategori"]) === norm(name));
        if (existing) {
          if (existing["Aktiv"] !== true) {
            const updated = await baserowRequest(env, `/database/rows/table/${TABLES.vehicleCategories}/${existing.id}/?user_field_names=true`, {method:"PATCH",body:{"Aktiv":true}});
            return json({success:true,created:false,reactivated:true,category:{id:updated.id,name:updated["Kategori"] || name,active:true}},200,corsHeaders);
          }
          return json({success:true,created:false,category:{id:existing.id,name:existing["Kategori"] || name,active:true}},200,corsHeaders);
        }

        const created = await baserowRequest(env, `/database/rows/table/${TABLES.vehicleCategories}/?user_field_names=true`, {
          method:"POST", body:{"Kategori":name,"Aktiv":true}
        });
        return json({success:true,created:true,category:{id:created.id,name:created["Kategori"] || name,active:true}},201,corsHeaders);
      }

      // POST /vehicle/category
      // Tilldelar en kategori till ett befintligt fordon.
      if (request.method === "POST" && url.pathname === "/vehicle/category") {
        if (!isAllowedBrowserOrigin(request)) return json({error:"Otillåten origin"},403,corsHeaders);
        const body = await readJson(request);
        const vehicleId = Number(body?.vehicleId);
        const categoryId = Number(body?.categoryId);
        if (!isPositiveInteger(vehicleId) || !isPositiveInteger(categoryId)) return json({error:"Fordon och kategori krävs."},400,corsHeaders);
        const [vehicle, category] = await Promise.all([
          getRow(env, TABLES.vehicles, vehicleId),
          getRow(env, TABLES.vehicleCategories, categoryId),
        ]);
        if (!vehicle) return json({error:"Fordonet hittades inte."},404,corsHeaders);
        if (!category || category["Aktiv"] !== true) return json({error:"Kategorin finns inte eller är inte aktiv."},409,corsHeaders);
        const updated = await baserowRequest(env, `/database/rows/table/${TABLES.vehicles}/${vehicleId}/?user_field_names=true`, {
          method:"PATCH", body:{"Fordonskategori":[categoryId]}
        });
        return json({success:true,vehicleId,categoryId,row:updated},200,corsHeaders);
      }

      // POST /stations/import
      if (request.method === "POST" && url.pathname === "/stations/import") {
        if (!isAllowedBrowserOrigin(request)) return json({error:"Otillåten origin"},403,corsHeaders);
        const body = await readJson(request);
        const rows = Array.isArray(body?.rows) ? body.rows : [];
        if (!rows.length) return json({error:"Importfilen innehåller inga stationer."},400,corsHeaders);

        const current = await baserowRequest(env, `/database/rows/table/${TABLES.stations}/?user_field_names=true&size=200`, {method:"GET"});
        const byNumber = new Map(), byName = new Map();
        for (const r of current.results) {
          const no = String(r["Stationsnummer"]?.value || r["Stationsnummer"] || "").trim().toUpperCase();
          const name = String(r["Station"] || "").trim().toLocaleLowerCase("sv-SE");
          if (no) byNumber.set(no, r);
          if (name) byName.set(name, r);
        }

        const seen = new Set(), errors = [], prepared = [];
        for (let i=0;i<rows.length;i++) {
          const src = rows[i] || {}, excelRow = Number(src.__row || i+2);
          const stationNumber = String(src["Stationsnummer"] || "").trim();
          const name = String(src["Station"] || "").trim();
          if (!stationNumber) { errors.push(`Rad ${excelRow}: Stationsnummer saknas.`); continue; }
          const key = stationNumber.toUpperCase();
          if (seen.has(key)) { errors.push(`Rad ${excelRow}: Stationsnummer ${stationNumber} förekommer flera gånger.`); continue; }
          seen.add(key);
          let existing = byNumber.get(key) || (name ? byName.get(name.toLocaleLowerCase("sv-SE")) : null) || null;
          if (!existing && !name) { errors.push(`Rad ${excelRow}: ny station kräver Station.`); continue; }
          const patch = {"Stationsnummer": stationNumber};
          if (name) patch["Station"] = name;
          if (src["Aktiv"] !== undefined && String(src["Aktiv"]).trim() !== "") {
            const v=String(src["Aktiv"]).trim().toLowerCase();
            patch["Aktiv"] = src["Aktiv"] === true || ["true","sant","ja","1"].includes(v);
          }
          prepared.push({stationNumber, existing, patch});
        }
        if (errors.length) return json({success:false,errors},400,corsHeaders);

        let newCount=0, updatedCount=0;
        for (const item of prepared) {
          if (item.existing) {
            await baserowRequest(env, `/database/rows/table/${TABLES.stations}/${item.existing.id}/?user_field_names=true`, {method:"PATCH",body:item.patch});
            updatedCount++;
          } else {
            await baserowRequest(env, `/database/rows/table/${TABLES.stations}/?user_field_names=true`, {method:"POST",body:{"Aktiv":true,...item.patch}});
            newCount++;
          }
        }
        return json({success:true,newCount,updatedCount},200,corsHeaders);
      }

      // POST /vehicles/import
      // Batchimport för att hålla nere antalet Cloudflare-subrequests.
      // Saknade fordonskategorier och Rakelnummer skapas först i batch,
      // därefter skapas/uppdateras fordonen i batch.
      if (request.method === "POST" && url.pathname === "/vehicles/import") {
        if (!isAllowedBrowserOrigin(request)) return json({error:"Otillåten origin"},403,corsHeaders);
        const body = await readJson(request);
        const rows = Array.isArray(body?.rows) ? body.rows : [];
        if (!rows.length) return json({error:"Importfilen innehåller inga fordon."},400,corsHeaders);
        if (rows.length > 200) return json({error:"Max 200 fordon per import."},400,corsHeaders);

        const [vehicleData, stationData, rakelData, categoryData] = await Promise.all([
          baserowRequest(env, `/database/rows/table/${TABLES.vehicles}/?user_field_names=true&size=200`, {method:"GET"}),
          baserowRequest(env, `/database/rows/table/${TABLES.stations}/?user_field_names=true&size=200`, {method:"GET"}),
          baserowRequest(env, `/database/rows/table/${TABLES.rakel}/?user_field_names=true&size=200`, {method:"GET"}),
          baserowRequest(env, `/database/rows/table/${TABLES.vehicleCategories}/?user_field_names=true&size=200`, {method:"GET"}),
        ]);

        const vehicleByReg = new Map();
        for (const v of vehicleData.results) {
          const reg=String(v["Registreringsnummer"]||"").trim().toUpperCase();
          if (reg) vehicleByReg.set(reg,v);
        }

        const stationByName = new Map(), stationByNumber = new Map();
        for (const s of stationData.results) {
          const name=String(s["Station"]||"").trim().toLocaleLowerCase("sv-SE");
          const no=String(s["Stationsnummer"]?.value||s["Stationsnummer"]||"").trim().toUpperCase();
          if(name) stationByName.set(name,s);
          if(no) stationByNumber.set(no,s);
        }

        const rakelByValue = new Map();
        for (const r of rakelData.results) {
          const val=String(r["Name"]||r["Rakelnummer"]||r["Rakel"]||"").trim();
          if(val) rakelByValue.set(val,r);
        }

        const categoryByName = new Map();
        for (const c of categoryData.results) {
          const name=String(c["Kategori"]||"").trim();
          if(name) categoryByName.set(name.toLocaleLowerCase("sv-SE"),c);
        }

        const seenReg=new Set(), seenRakel=new Set(), errors=[], prepared=[];
        for(let i=0;i<rows.length;i++){
          const src=rows[i]||{}, excelRow=Number(src.__row||i+2);
          const rakel=String(src["Rakelnummer"]||"").trim();
          const reg=String(src["Registreringsnummer"]||"").trim().toUpperCase();

          if(!rakel) { errors.push(`Rad ${excelRow}: Rakelnummer saknas.`); continue; }
          if(!reg) { errors.push(`Rad ${excelRow}: Registreringsnummer saknas.`); continue; }
          if(seenReg.has(reg)) { errors.push(`Rad ${excelRow}: registreringsnummer ${reg} förekommer flera gånger.`); continue; }
          if(seenRakel.has(rakel)) { errors.push(`Rad ${excelRow}: Rakelnummer ${rakel} förekommer flera gånger.`); continue; }
          seenReg.add(reg); seenRakel.add(rakel);

          let station=null;
          const stationValue=String(src["Station"]||"").trim();
          if(stationValue) {
            station=stationByNumber.get(stationValue.toUpperCase()) ||
                    stationByName.get(stationValue.toLocaleLowerCase("sv-SE")) || null;
            if(!station) errors.push(`Rad ${excelRow}: station "${stationValue}" hittades inte.`);
          }

          const categoryName=String(src["Fordonskategori"]||src["Fordonstyp"]||"").trim();
          prepared.push({
            excelRow,rakel,reg,
            existing:vehicleByReg.get(reg)||null,
            station,
            categoryName,
            src
          });
        }
        if(errors.length) return json({success:false,errors},400,corsHeaders);

        // 1. Skapa saknade kategorier och återaktivera befintliga kategorier som används i importen.
        // Register-sidan visar bara aktiva kategorier, därför måste även äldre/inaktiva poster aktiveras.
        const missingCategoryNames=[];
        const missingCategoryKeys=new Set();
        const categoriesToReactivate=new Map();

        for(const item of prepared){
          if(!item.categoryName) continue;
          const key=item.categoryName.toLocaleLowerCase("sv-SE");
          const existingCategory=categoryByName.get(key);

          if(!existingCategory && !missingCategoryKeys.has(key)){
            missingCategoryKeys.add(key);
            missingCategoryNames.push(item.categoryName);
          } else if(existingCategory && existingCategory["Aktiv"] !== true){
            categoriesToReactivate.set(existingCategory.id, existingCategory);
          }
        }

        let createdCategoryCount=0, reactivatedCategoryCount=0;

        if(missingCategoryNames.length){
          const result=await baserowRequest(
            env,
            `/database/rows/table/${TABLES.vehicleCategories}/batch/?user_field_names=true`,
            {
              method:"POST",
              body:{items:missingCategoryNames.map(name=>({"Kategori":name,"Aktiv":true}))}
            }
          );
          const created=Array.isArray(result?.items)?result.items:[];
          for(const row of created){
            const name=String(row["Kategori"]||"").trim();
            if(name) categoryByName.set(name.toLocaleLowerCase("sv-SE"),row);
          }
          createdCategoryCount=created.length;
        }

        if(categoriesToReactivate.size){
          const result=await baserowRequest(
            env,
            `/database/rows/table/${TABLES.vehicleCategories}/batch/?user_field_names=true`,
            {
              method:"PATCH",
              body:{items:[...categoriesToReactivate.values()].map(row=>({id:row.id,"Aktiv":true}))}
            }
          );
          const updated=Array.isArray(result?.items)?result.items:[];
          for(const row of updated){
            const name=String(row["Kategori"]||"").trim();
            if(name) categoryByName.set(name.toLocaleLowerCase("sv-SE"),row);
          }
          reactivatedCategoryCount=updated.length;
        }

        // 2. Skapa alla saknade Rakelnummer i ETT Baserow-anrop.
        const missingRakelValues=[];
        const missingRakelSet=new Set();
        for(const item of prepared){
          if(!rakelByValue.has(item.rakel) && !missingRakelSet.has(item.rakel)){
            missingRakelSet.add(item.rakel);
            missingRakelValues.push(item.rakel);
          }
        }

        let createdRakelCount=0;
        if(missingRakelValues.length){
          const result=await baserowRequest(
            env,
            `/database/rows/table/${TABLES.rakel}/batch/?user_field_names=true`,
            {
              method:"POST",
              body:{items:missingRakelValues.map(value=>({"Name":value}))}
            }
          );
          const created=Array.isArray(result?.items)?result.items:[];
          for(const row of created){
            const value=String(row["Name"]||row["Rakelnummer"]||row["Rakel"]||"").trim();
            if(value) rakelByValue.set(value,row);
          }
          createdRakelCount=created.length;
        }

        // Säkerhetskontroll innan fordon skrivs.
        const relationErrors=[];
        for(const item of prepared){
          if(!rakelByValue.get(item.rakel)) relationErrors.push(`Rakelnummer ${item.rakel} kunde inte skapas/hittas.`);
          if(item.categoryName && !categoryByName.get(item.categoryName.toLocaleLowerCase("sv-SE"))){
            relationErrors.push(`Fordonskategori "${item.categoryName}" kunde inte skapas/hittas.`);
          }
        }
        if(relationErrors.length) return json({success:false,errors:relationErrors},500,corsHeaders);

        // 3. Bygg fordonsrader och skapa/uppdatera i högst TVÅ Baserow-anrop.
        const createItems=[], updateItems=[];
        for(const item of prepared){
          const rakelRow=rakelByValue.get(item.rakel);
          const category=item.categoryName
            ? categoryByName.get(item.categoryName.toLocaleLowerCase("sv-SE"))
            : null;

          const patch={
            "Registreringsnummer":item.reg,
            "Rakelnummer":[rakelRow.id],
          };
          if(category) patch["Fordonskategori"]=[category.id];
          if(item.station) patch["Station"]=[item.station.id];

          if(item.src["Aktiv"] !== undefined && String(item.src["Aktiv"]).trim() !== ""){
            const v=String(item.src["Aktiv"]).trim().toLowerCase();
            patch["Aktiv"]=item.src["Aktiv"]===true || ["true","sant","ja","1"].includes(v);
          }

          if(item.existing) updateItems.push({id:item.existing.id,...patch});
          else createItems.push({"Aktiv":true,...patch});
        }

        if(updateItems.length){
          await baserowRequest(
            env,
            `/database/rows/table/${TABLES.vehicles}/batch/?user_field_names=true`,
            {method:"PATCH",body:{items:updateItems}}
          );
        }

        if(createItems.length){
          await baserowRequest(
            env,
            `/database/rows/table/${TABLES.vehicles}/batch/?user_field_names=true`,
            {method:"POST",body:{items:createItems}}
          );
        }

        return json({
          success:true,
          newCount:createItems.length,
          updatedCount:updateItems.length,
          createdRakelCount,
          createdCategoryCount,
          reactivatedCategoryCount
        },200,corsHeaders);
      }

      // GET /overview
      // Egen lageroversikt for GitHub-sidan. Baserow visas inte for anvandaren.
      if (request.method === "GET" && url.pathname === "/overview") {
        const [materialData, stationData, vehicleData, stockLevelData, vehicleRequirementData] = await Promise.all([
          baserowRequest(env, `/database/rows/table/${TABLES.material}/?user_field_names=true&size=200`, { method: "GET" }),
          baserowRequest(env, `/database/rows/table/${TABLES.stations}/?user_field_names=true&size=200`, { method: "GET" }),
          baserowRequest(env, `/database/rows/table/${TABLES.vehicles}/?user_field_names=true&size=200`, { method: "GET" }),
          baserowRequest(env, `/database/rows/table/${TABLES.stockLevels}/?user_field_names=true&size=200`, { method: "GET" }),
          baserowRequest(env, `/database/rows/table/${TABLES.vehicleRequirements}/?user_field_names=true&size=200`, { method: "GET" }),
        ]);

        const stations = stationData.results
          .filter((row) => row["Aktiv"] === true)
          .map((row) => ({
            id: row.id,
            name: row["Station"] || row["Station-ID"] || `Station ${row.id}`,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "sv"));

        const vehicles = vehicleData.results
          .filter((row) => row["Aktiv"] === true)
          .map((row) => {
            const stationIds = linkedIds(row["Station"]);
            const rakel = Array.isArray(row["Rakelnummer"]) && row["Rakelnummer"][0]?.value
              ? String(row["Rakelnummer"][0].value) : "";
            return {
              id: row.id,
              stationId: stationIds.length === 1 ? stationIds[0] : null,
              rakel,
              registration: row["Registreringsnummer"] || row["Fordons-ID"] || `Fordon ${row.id}`,
              type: row["Fordonstyp"] || "",
            };
          });

        const material = materialData.results
          .filter((row) => row["Aktiv"] === true)
          .map((row) => {
            const stationIds = linkedIds(row["Station"]);
            const vehicleIds = linkedIds(row["Registreringsnummer"]);
            const rakel = Array.isArray(row["Rakelnummer"]) && row["Rakelnummer"][0]?.value
              ? String(row["Rakelnummer"][0].value) : "";
            return {
              rowId: row.id,
              materialId: normalizeMaterialId(row["Material-ID"]),
              material: row["Material"] || "",
              category: row["Kategori"] && typeof row["Kategori"] === "object"
                ? row["Kategori"].value || "" : row["Kategori"] || "",
              comment: row["Kommentar"] || "",
              storageType: String(row["Transportstatus"]?.value || row["Transportstatus"] || "") === "Under transport"
                ? "Transport"
                : (row["Lagertyp"] || ""),
              stationId: stationIds.length === 1 ? stationIds[0] : null,
              vehicleId: vehicleIds.length === 1 ? vehicleIds[0] : null,
              rakel,
              transportStatus: row["Transportstatus"]?.value || row["Transportstatus"] || "",
              transportDestinationId: linkedIds(row["Transport till station"])[0] || null,
              transportDestination: Array.isArray(row["Transport till station"]) && row["Transport till station"][0]?.value
                ? String(row["Transport till station"][0].value)
                : "",
            };
          });

        const stockLevels = stockLevelData.results
          .filter((row) => row["Aktiv"] === true)
          .map((row) => {
            const stationIds = linkedIds(row["Station"]);
            const materialName = String(row["Material"] || "").trim();
            const redBelow = numberOrNull(row["Röd under"]);
            const greenFrom = numberOrNull(row["Grön från"]);
            const max = numberOrNull(row["Max antal"]);
            const stationId = stationIds.length === 1 ? stationIds[0] : null;
            const actual = material.filter((x) =>
              x.storageType === "Stationslager" &&
              x.stationId === stationId &&
              sameMaterialName(x.material, materialName)
            ).length;

            return {
              id: row.id,
              name: row["Namn"] || "",
              stationId,
              material: materialName,
              redBelow,
              greenFrom,
              max,
              actual,
              status: stationStockStatus(actual, redBelow, greenFrom, max),
            };
          });

        const vehicleRequirements = vehicleRequirementData.results
          .filter((row) => row["Aktiv"] === true)
          .map((row) => {
            const vehicleIds = linkedIds(row["Fordon"]);
            const vehicleId = vehicleIds.length === 1 ? vehicleIds[0] : null;
            const materialName = String(row["Material"] || "").trim();
            const required = numberOrNull(row["Kravantal"]);
            const actual = material.filter((x) =>
              x.storageType === "Fordon" &&
              x.vehicleId === vehicleId &&
              sameMaterialName(x.material, materialName)
            ).length;

            return {
              id: row.id,
              name: row["Namn"] || "",
              vehicleId,
              material: materialName,
              required,
              actual,
              status: required !== null && actual === required ? "green" : "red",
            };
          });

        return json({
          stations,
          vehicles,
          material,
          stockLevels,
          vehicleRequirements,
          totals: {
            material: material.length,
            stationStorage: material.filter((x) => x.storageType === "Stationslager").length,
            vehicles: material.filter((x) => x.storageType === "Fordon").length,
            missingPlacement: material.filter((x) => x.storageType !== "Stationslager" && x.storageType !== "Fordon").length,
          },
        }, 200, corsHeaders);
      }

      // POST /material
      // Skapar nytt aktivt brandmaterial direkt i ett stationslager.
      // Material-ID skapas på serversidan som nästa lediga SKRTJ-xxxxx.
      if (request.method === "POST" && url.pathname === "/material") {
        if (!isAllowedBrowserOrigin(request)) {
          return json({ error: "Otillåten origin" }, 403, corsHeaders);
        }

        const body = await readJson(request);
        const materialName = String(body?.material || "").trim();
        const comment = String(body?.comment || "").trim();
        const stationId = Number(body?.stationId);
        const category = body?.category;

        if (!materialName) {
          return json({ error: "Material måste anges" }, 400, corsHeaders);
        }

        if (!isPositiveInteger(stationId)) {
          return json({ error: "Ogiltigt station-ID" }, 400, corsHeaders);
        }

        if (
          category === undefined ||
          category === null ||
          (typeof category === "string" && !category.trim())
        ) {
          return json({ error: "Kategori måste anges" }, 400, corsHeaders);
        }

        const station = await getRow(env, TABLES.stations, stationId);
        if (!station) {
          return json({ error: "Stationen hittades inte" }, 404, corsHeaders);
        }
        if (station["Aktiv"] !== true) {
          return json({ error: "Stationen är inte aktiv" }, 409, corsHeaders);
        }

        const materialData = await baserowRequest(
          env,
          `/database/rows/table/${TABLES.material}/?user_field_names=true&size=200`,
          { method: "GET" }
        );

        const usedNumbers = new Set(
          materialData.results
            .map((row) => normalizeMaterialId(row["Material-ID"]))
            .map((id) => {
              const match = /^SKRTJ-(\d{5})$/.exec(id);
              return match ? Number(match[1]) : null;
            })
            .filter((n) => Number.isInteger(n))
        );

        let nextNumber = 1;
        while (usedNumbers.has(nextNumber)) nextNumber += 1;

        if (nextNumber > 99999) {
          return json({ error: "Inga fler Material-ID kan skapas" }, 409, corsHeaders);
        }

        const materialId = `SKRTJ-${String(nextNumber).padStart(5, "0")}`;
        const stationName =
          station["Station"] || station["Station-ID"] || `Station ${stationId}`;

        const createBody = {
          "Material-ID": materialId,
          "Material": materialName,
          "Kommentar": comment,
          "Aktiv": true,
          "Station": [stationId],
          "Rakelnummer": [],
          "Registreringsnummer": [],
        };

        // Kategori kan skickas som Baserow-option-id eller som ett textvärde.
        createBody["Kategori"] =
          typeof category === "number" ? category : String(category).trim();

        const created = await baserowRequest(
          env,
          `/database/rows/table/${TABLES.material}/?user_field_names=true`,
          {
            method: "POST",
            body: createBody,
          }
        );

        return json(
          {
            success: true,
            action: "create-material",
            materialId,
            materialRowId: created.id,
            stationId,
            station: stationName,
            message: `${materialId} har skapats och lagts i ${stationName}s stationslager.`,
            material: created,
          },
          201,
          corsHeaders
        );
      }

      // POST /checkin
      if (request.method === "POST" && url.pathname === "/checkin") {
        if (!isAllowedBrowserOrigin(request)) {
          return json({ error: "Otillåten origin" }, 403, corsHeaders);
        }

        const body = await readJson(request);
        const materialId = normalizeMaterialId(body?.materialId);
        const stationId = Number(body?.stationId);

        if (!isValidMaterialId(materialId)) {
          return json({ error: "Ogiltigt Material-ID" }, 400, corsHeaders);
        }

        if (!isPositiveInteger(stationId)) {
          return json({ error: "Ogiltigt station-ID" }, 400, corsHeaders);
        }

        const material = await findMaterialById(env, materialId);
        if (!material) {
          return json({ error: "Materialet hittades inte" }, 404, corsHeaders);
        }
        if (material["Aktiv"] !== true) {
          return json({ error: "Materialet är inte aktivt" }, 409, corsHeaders);
        }

        const station = await getRow(env, TABLES.stations, stationId);
        if (!station) {
          return json({ error: "Stationen hittades inte" }, 404, corsHeaders);
        }
        if (station["Aktiv"] !== true) {
          return json({ error: "Stationen är inte aktiv" }, 409, corsHeaders);
        }

        const stationName =
          station["Station"] || station["Station-ID"] || `Station ${stationId}`;

        const previousPlacement = placementFromMaterial(material);

        const updatedMaterial = await updateMaterialPlacement(
          env,
          material.id,
          {
            Station: [stationId],
            Rakelnummer: [],
            Registreringsnummer: [],
            Transportstatus: "Ingen transport",
            "Transport till station": [],
          }
        );

        let event;
        try {
          event = await createEvent(env, {
            Material: [material.id],
            "Händelsetyp": "Incheckning",
            Station: [stationId],
            Fordon: [],
            Kommentar: `QR-incheckning till ${stationName}`,
            Status: "Godkänd",
          });
        } catch (eventError) {
          await rollbackPlacementOrThrow(
            env,
            material.id,
            previousPlacement,
            materialId,
            eventError
          );
        }

        return json(
          {
            success: true,
            action: "checkin",
            materialId,
            materialRowId: material.id,
            stationId,
            station: stationName,
            eventId: event.id,
            message: `${materialId} är incheckat på ${stationName}.`,
            material: updatedMaterial,
          },
          200,
          corsHeaders
        );
      }

      // POST /checkout
      // Body:
      // {
      //   "materialId": "SKRTJ-00003",
      //   "vehicleId": 1
      // }
      if (request.method === "POST" && url.pathname === "/checkout") {
        if (!isAllowedBrowserOrigin(request)) {
          return json({ error: "Otillåten origin" }, 403, corsHeaders);
        }

        const body = await readJson(request);
        const materialId = normalizeMaterialId(body?.materialId);
        const vehicleId = Number(body?.vehicleId);

        if (!isValidMaterialId(materialId)) {
          return json({ error: "Ogiltigt Material-ID" }, 400, corsHeaders);
        }

        if (!isPositiveInteger(vehicleId)) {
          return json({ error: "Ogiltigt fordons-ID" }, 400, corsHeaders);
        }

        const material = await findMaterialById(env, materialId);
        if (!material) {
          return json({ error: "Materialet hittades inte" }, 404, corsHeaders);
        }
        if (material["Aktiv"] !== true) {
          return json({ error: "Materialet är inte aktivt" }, 409, corsHeaders);
        }

        // Verksamhetsregel:
        // Material måste först ligga i ett stationslager.
        const materialStationIds = linkedIds(material["Station"]);
        const materialRakelIds = linkedIds(material["Rakelnummer"]);
        const materialVehicleIds = linkedIds(material["Registreringsnummer"]);

        if (
          material["Lagertyp"] !== "Stationslager" ||
          materialStationIds.length !== 1 ||
          materialRakelIds.length !== 0 ||
          materialVehicleIds.length !== 0
        ) {
          return json(
            {
              error: "Materialet måste vara incheckat på exakt ett stationslager före utcheckning",
            },
            409,
            corsHeaders
          );
        }

        const stationId = materialStationIds[0];

        const vehicle = await getRow(env, TABLES.vehicles, vehicleId);
        if (!vehicle) {
          return json({ error: "Fordonet hittades inte" }, 404, corsHeaders);
        }
        if (vehicle["Aktiv"] !== true) {
          return json({ error: "Fordonet är inte aktivt" }, 409, corsHeaders);
        }

        // Fordonet måste tillhöra samma station som materialet.
        const vehicleStationIds = linkedIds(vehicle["Station"]);
        if (
          vehicleStationIds.length !== 1 ||
          vehicleStationIds[0] !== stationId
        ) {
          return json(
            {
              error: "Fordonet tillhör inte samma station som materialet",
            },
            409,
            corsHeaders
          );
        }

        // Fordonet måste ha exakt ett Rakelnummer.
        const rakelIds = linkedIds(vehicle["Rakelnummer"]);
        if (rakelIds.length !== 1) {
          return json(
            { error: "Fordonet saknar ett entydigt Rakelnummer" },
            409,
            corsHeaders
          );
        }

        const rakelId = rakelIds[0];
        const rakelValue =
          Array.isArray(vehicle["Rakelnummer"]) &&
          vehicle["Rakelnummer"][0]?.value
            ? String(vehicle["Rakelnummer"][0].value)
            : "";

        // Extra kontroll: Rakel-raden ska finnas och vara den vi förväntar oss.
        const rakelRow = await getRow(env, TABLES.rakel, rakelId);
        if (!rakelRow) {
          return json(
            { error: "Fordonets Rakelnummer hittades inte i Rakelnummer-tabellen" },
            409,
            corsHeaders
          );
        }

        if (
          rakelValue &&
          String(rakelRow["Name"] ?? "").trim() !== rakelValue.trim()
        ) {
          return json(
            { error: "Fordonets Rakelkoppling stämmer inte med Rakelnummer-tabellen" },
            409,
            corsHeaders
          );
        }

        const station = await getRow(env, TABLES.stations, stationId);
        const stationName =
          station?.["Station"] ||
          station?.["Station-ID"] ||
          `Station ${stationId}`;

        const registration =
          vehicle["Registreringsnummer"] ||
          vehicle["Fordons-ID"] ||
          `Fordon ${vehicleId}`;

        const vehicleLabel = [rakelValue, registration]
          .filter(Boolean)
          .join(" – ");

        const previousPlacement = placementFromMaterial(material);

        // Registreringsnummer i Brandmaterial länkar till Fordon-tabellen,
        // därför används vehicleId här.
        const updatedMaterial = await updateMaterialPlacement(
          env,
          material.id,
          {
            Station: [],
            Rakelnummer: [rakelId],
            Registreringsnummer: [vehicleId],
            Transportstatus: "Ingen transport",
            "Transport till station": [],
          }
        );

        let event;
        try {
          event = await createEvent(env, {
            Material: [material.id],
            "Händelsetyp": "Utcheckning",
            Station: [stationId],
            Fordon: [vehicleId],
            Kommentar: `QR-utcheckning till ${vehicleLabel}`,
            Status: "Godkänd",
          });
        } catch (eventError) {
          await rollbackPlacementOrThrow(
            env,
            material.id,
            previousPlacement,
            materialId,
            eventError
          );
        }

        return json(
          {
            success: true,
            action: "checkout",
            materialId,
            materialRowId: material.id,
            stationId,
            station: stationName,
            vehicleId,
            vehicle: registration,
            rakel: rakelValue,
            eventId: event.id,
            message: `${materialId} är utcheckat till ${vehicleLabel}.`,
            material: updatedMaterial,
          },
          200,
          corsHeaders
        );
      }

      // POST /transport
      // Markerar ett material som under transport till en vald station.
      // Materialet tas bort från nuvarande stations-/fordonsplacering tills det checkas in.
      if (request.method === "POST" && url.pathname === "/transport") {
        if (!isAllowedBrowserOrigin(request)) {
          return json({ error: "Otillåten origin" }, 403, corsHeaders);
        }

        const body = await readJson(request);
        const materialId = normalizeMaterialId(body?.materialId);
        const destinationStationId = Number(body?.stationId);

        if (!isValidMaterialId(materialId)) {
          return json({ error: "Ogiltigt Material-ID" }, 400, corsHeaders);
        }
        if (!isPositiveInteger(destinationStationId)) {
          return json({ error: "Ogiltigt destinations-ID" }, 400, corsHeaders);
        }

        const material = await findMaterialById(env, materialId);
        if (!material) {
          return json({ error: "Materialet hittades inte" }, 404, corsHeaders);
        }
        if (material["Aktiv"] !== true) {
          return json({ error: "Materialet är inte aktivt" }, 409, corsHeaders);
        }

        const destination = await getRow(env, TABLES.stations, destinationStationId);
        if (!destination) {
          return json({ error: "Destinationsstationen hittades inte" }, 404, corsHeaders);
        }
        if (destination["Aktiv"] !== true) {
          return json({ error: "Destinationsstationen är inte aktiv" }, 409, corsHeaders);
        }

        const previousPlacement = placementFromMaterial(material);
        const sourceStationIds = linkedIds(material["Station"]);
        const sourceVehicleIds = linkedIds(material["Registreringsnummer"]);
        const sourceStationId = sourceStationIds.length === 1 ? sourceStationIds[0] : null;
        const sourceVehicleId = sourceVehicleIds.length === 1 ? sourceVehicleIds[0] : null;

        if (String(material["Transportstatus"]?.value || material["Transportstatus"] || "") === "Under transport") {
          return json({ error: "Materialet är redan markerat som under transport" }, 409, corsHeaders);
        }

        if (sourceStationId === destinationStationId && !sourceVehicleId) {
          return json({ error: "Materialet finns redan i destinationsstationens stationslager" }, 409, corsHeaders);
        }

        const destinationName =
          destination["Station"] || destination["Station-ID"] || `Station ${destinationStationId}`;

        let sourceLabel = "okänd placering";
        if (sourceVehicleId) {
          const vehicle = await getRow(env, TABLES.vehicles, sourceVehicleId);
          const rakel =
            Array.isArray(vehicle?.["Rakelnummer"]) && vehicle["Rakelnummer"][0]?.value
              ? String(vehicle["Rakelnummer"][0].value)
              : "";
          const registration =
            vehicle?.["Registreringsnummer"] || vehicle?.["Fordons-ID"] || `Fordon ${sourceVehicleId}`;
          sourceLabel = [rakel, registration].filter(Boolean).join(" – ");
        } else if (sourceStationId) {
          const sourceStation = await getRow(env, TABLES.stations, sourceStationId);
          sourceLabel =
            sourceStation?.["Station"] || sourceStation?.["Station-ID"] || `Station ${sourceStationId}`;
        }

        const updatedMaterial = await updateMaterialPlacement(
          env,
          material.id,
          {
            Station: [],
            Rakelnummer: [],
            Registreringsnummer: [],
            Transportstatus: "Under transport",
            "Transport till station": [destinationStationId],
          }
        );

        let event;
        try {
          event = await createEvent(env, {
            Material: [material.id],
            "Händelsetyp": "Transport",
            Station: [destinationStationId],
            Fordon: sourceVehicleId ? [sourceVehicleId] : [],
            Kommentar: `Transport från ${sourceLabel} till ${destinationName}`,
            Status: "Godkänd",
          });
        } catch (eventError) {
          try {
            await updateMaterialPlacement(env, material.id, {
              ...previousPlacement,
              Transportstatus: material["Transportstatus"]?.value || material["Transportstatus"] || "Ingen transport",
              "Transport till station": linkedIds(material["Transport till station"]),
            });
          } catch (rollbackError) {
            console.error("Rollback misslyckades:", rollbackError);
            throw new Error(`Transporthändelsen kunde inte skapas och återställningen misslyckades. Kontrollera ${materialId} manuellt i Baserow.`);
          }
          throw new Error(`Transporthändelsen kunde inte skapas. Materialets tidigare placering återställdes. ${eventError.message}`);
        }

        return json({
          success: true,
          action: "transport",
          materialId,
          materialRowId: material.id,
          destinationStationId,
          destinationStation: destinationName,
          eventId: event.id,
          message: `${materialId} är markerat för transport till ${destinationName}.`,
          material: updatedMaterial,
        }, 200, corsHeaders);
      }

      // POST /stock-level/upsert
      // Skapar eller uppdaterar stationens plan för en unik materialtyp.
      if (request.method === "POST" && url.pathname === "/stock-level/upsert") {
        if (!isAllowedBrowserOrigin(request)) return json({ error:"Otillåten origin" }, 403, corsHeaders);
        const body = await readJson(request);
        const stationId = Number(body?.stationId);
        const material = String(body?.material || "").trim();
        const stocked = body?.stocked !== false;
        const redMax = Number(body?.redMax);
        const noYellow = body?.noYellow === true;
        const yellowMax = noYellow ? null : Number(body?.yellowMax);
        const greenMax = Number(body?.greenMax);

        if (!Number.isInteger(stationId) || stationId < 1 || !material) return json({ error:"Station och material krävs." }, 400, corsHeaders);

        const all = await baserowRequest(env, `/database/rows/table/${TABLES.stockLevels}/?user_field_names=true&size=200`, {method:"GET"});
        const norm = s => String(s || "").trim().toLocaleLowerCase("sv-SE");
        const matches = all.results.filter(r =>
          Array.isArray(r["Station"]) && Number(r["Station"][0]?.id ?? r["Station"][0]?.value?.id ?? r["Station"][0]) === stationId &&
          norm(r["Material"]) === norm(material)
        );
        if (matches.length > 1) return json({ error:"Det finns dubbletter i Lagernivåer för denna station/material. Rätta dem först." }, 409, corsHeaders);

        if (!stocked) {
          if (!matches.length) return json({success:true, unchanged:true}, 200, corsHeaders);
          const updated = await baserowRequest(env,
            `/database/rows/table/${TABLES.stockLevels}/${matches[0].id}/?user_field_names=true`,
            {method:"PATCH", body:{"Aktiv":false}});
          return json({success:true,row:updated},200,corsHeaders);
        }

        if (!Number.isInteger(redMax) || redMax < 0 || !Number.isInteger(greenMax) || greenMax < 1) {
          return json({error:"Röd och Grön/Max måste vara heltal. Röd får vara 0 och Grön/Max minst 1."},400,corsHeaders);
        }
        if (noYellow) {
          if (greenMax < redMax + 1) {
            return json({error:"Grön/Max måste vara högre än den röda nivån."},400,corsHeaders);
          }
        } else if (!Number.isInteger(yellowMax) || !(redMax < yellowMax && yellowMax < greenMax)) {
          return json({error:"Med gul nivå måste nivåerna följa Röd < Gul < Grön/Max."},400,corsHeaders);
        }
        const payload = {
          "Namn": `${material} – station ${stationId}`,
          "Station": [stationId],
          "Material": material,
          "Röd under": redMax + 1,
          "Grön från": noYellow ? redMax + 1 : yellowMax + 1,
          "Max antal": greenMax,
          "Aktiv": true
        };
        const row = matches.length
          ? await baserowRequest(env, `/database/rows/table/${TABLES.stockLevels}/${matches[0].id}/?user_field_names=true`, {method:"PATCH",body:payload})
          : await baserowRequest(env, `/database/rows/table/${TABLES.stockLevels}/?user_field_names=true`, {method:"POST",body:payload});
        return json({success:true,row},200,corsHeaders);
      }

      // POST /vehicle-requirement/upsert
      // Skapar eller uppdaterar fordonets exakta gröna nivå för en unik materialtyp.
      if (request.method === "POST" && url.pathname === "/vehicle-requirement/upsert") {
        if (!isAllowedBrowserOrigin(request)) return json({ error:"Otillåten origin" }, 403, corsHeaders);
        const body = await readJson(request);
        const vehicleId = Number(body?.vehicleId);
        const material = String(body?.material || "").trim();
        const stocked = body?.stocked !== false;
        const required = Number(body?.required);
        if (!Number.isInteger(vehicleId) || vehicleId < 1 || !material) return json({error:"Fordon och material krävs."},400,corsHeaders);

        const all = await baserowRequest(env, `/database/rows/table/${TABLES.vehicleRequirements}/?user_field_names=true&size=200`, {method:"GET"});
        const norm = s => String(s || "").trim().toLocaleLowerCase("sv-SE");
        const matches = all.results.filter(r =>
          Array.isArray(r["Fordon"]) && Number(r["Fordon"][0]?.id ?? r["Fordon"][0]?.value?.id ?? r["Fordon"][0]) === vehicleId &&
          norm(r["Material"]) === norm(material)
        );
        if (matches.length > 1) return json({error:"Det finns dubbletter i Materialkrav fordon för detta fordon/material. Rätta dem först."},409,corsHeaders);

        if (!stocked) {
          if (!matches.length) return json({success:true,unchanged:true},200,corsHeaders);
          const updated = await baserowRequest(env,
            `/database/rows/table/${TABLES.vehicleRequirements}/${matches[0].id}/?user_field_names=true`,
            {method:"PATCH",body:{"Aktiv":false}});
          return json({success:true,row:updated},200,corsHeaders);
        }
        if (!Number.isInteger(required) || required < 0) return json({error:"Grön nivå måste vara ett heltal 0 eller högre."},400,corsHeaders);
        const payload = {
          "Namn": `${material} – fordon ${vehicleId}`,
          "Fordon": [vehicleId],
          "Material": material,
          "Kravantal": required,
          "Aktiv": true
        };
        const row = matches.length
          ? await baserowRequest(env, `/database/rows/table/${TABLES.vehicleRequirements}/${matches[0].id}/?user_field_names=true`, {method:"PATCH",body:payload})
          : await baserowRequest(env, `/database/rows/table/${TABLES.vehicleRequirements}/?user_field_names=true`, {method:"POST",body:payload});
        return json({success:true,row},200,corsHeaders);
      }

      // POST /stock-level
      // Redigerar en befintlig stations lagernivå.
      if (request.method === "POST" && url.pathname === "/stock-level") {
        if (!isAllowedBrowserOrigin(request)) {
          return json({ error: "Otillåten origin" }, 403, corsHeaders);
        }
        const body = await readJson(request);
        const id = Number(body?.id);
        const redMax = Number(body?.redMax);
        const yellowMax = Number(body?.yellowMax);
        const greenMax = Number(body?.greenMax);

        if (!isPositiveInteger(id)) return json({ error: "Ogiltig lagernivå." }, 400, corsHeaders);
        if (![redMax, yellowMax, greenMax].every(Number.isInteger) || redMax < 0 || yellowMax < 0 || greenMax < 0) {
          return json({ error: "Nivåerna måste vara heltal 0 eller högre." }, 400, corsHeaders);
        }
        if (!(redMax < yellowMax && yellowMax < greenMax)) {
          return json({ error: "Nivåerna måste följa Röd < Gul < Grön/Max." }, 400, corsHeaders);
        }

        const existing = await getRow(env, TABLES.stockLevels, id);
        if (!existing) return json({ error: "Lagernivån hittades inte." }, 404, corsHeaders);

        const updated = await baserowRequest(
          env,
          `/database/rows/table/${TABLES.stockLevels}/${id}/?user_field_names=true`,
          {
            method: "PATCH",
            body: {
              "Röd under": redMax + 1,
              "Grön från": yellowMax + 1,
              "Max antal": greenMax,
            }
          }
        );
        return json({ success:true, row:updated }, 200, corsHeaders);
      }

      // POST /vehicle-requirement
      // Fordon är grönt endast vid exakt angivet antal för materialet.
      if (request.method === "POST" && url.pathname === "/vehicle-requirement") {
        if (!isAllowedBrowserOrigin(request)) {
          return json({ error: "Otillåten origin" }, 403, corsHeaders);
        }
        const body = await readJson(request);
        const id = Number(body?.id);
        const required = Number(body?.required);

        if (!isPositiveInteger(id)) return json({ error: "Ogiltigt fordonskrav." }, 400, corsHeaders);
        if (!Number.isInteger(required) || required < 0) {
          return json({ error: "Grön nivå måste vara ett heltal 0 eller högre." }, 400, corsHeaders);
        }

        const existing = await getRow(env, TABLES.vehicleRequirements, id);
        if (!existing) return json({ error: "Fordonskravet hittades inte." }, 404, corsHeaders);

        const updated = await baserowRequest(
          env,
          `/database/rows/table/${TABLES.vehicleRequirements}/${id}/?user_field_names=true`,
          { method:"PATCH", body:{ "Kravantal": required } }
        );
        return json({ success:true, row:updated }, 200, corsHeaders);
      }

      // POST /material/import
      // Excel-filen läses i webbläsaren och skickas hit som rader.
      // Material-ID är unik nyckel: befintliga poster uppdateras, nya skapas.
      if (request.method === "POST" && url.pathname === "/material/import") {
        if (!isAllowedBrowserOrigin(request)) {
          return json({ error: "Otillåten origin" }, 403, corsHeaders);
        }

        const body = await readJson(request);
        const rows = Array.isArray(body?.rows) ? body.rows : [];
        if (!rows.length) return json({ error: "Importfilen innehåller inga materialrader." }, 400, corsHeaders);
        if (rows.length > 500) return json({ error: "Max 500 rader per import." }, 400, corsHeaders);

        const [materialData, stationData, vehicleData, rakelData] = await Promise.all([
          baserowRequest(env, `/database/rows/table/${TABLES.material}/?user_field_names=true&size=200`, { method:"GET" }),
          baserowRequest(env, `/database/rows/table/${TABLES.stations}/?user_field_names=true&size=200`, { method:"GET" }),
          baserowRequest(env, `/database/rows/table/${TABLES.vehicles}/?user_field_names=true&size=200`, { method:"GET" }),
          baserowRequest(env, `/database/rows/table/${TABLES.rakel}/?user_field_names=true&size=200`, { method:"GET" }),
        ]);

        const existingById = new Map();
        const duplicateExisting = new Set();
        for (const row of materialData.results) {
          const id = normalizeMaterialId(row["Material-ID"]);
          if (!id) continue;
          if (existingById.has(id)) duplicateExisting.add(id);
          else existingById.set(id, row);
        }

        const stationByName = new Map();
        for (const s of stationData.results) {
          const name = String(s["Station"] || s["Station-ID"] || "").trim().toLocaleLowerCase("sv-SE");
          if (name) stationByName.set(name, s);
        }
        const vehicleByReg = new Map();
        for (const v of vehicleData.results) {
          const reg = String(v["Registreringsnummer"] || "").trim().toUpperCase();
          if (reg) vehicleByReg.set(reg, v);
        }
        const rakelByValue = new Map();
        for (const r of rakelData.results) {
          const val = String(r["Name"] || r["Rakelnummer"] || r["Rakel"] || "").trim();
          if (val) rakelByValue.set(val, r);
        }

        const seen = new Set();
        const errors = [];
        const prepared = [];

        for (let i = 0; i < rows.length; i++) {
          const source = rows[i] || {};
          const excelRow = Number(source.__row || i + 2);
          const materialId = normalizeMaterialId(source["Material-ID"]);

          if (!isValidMaterialId(materialId)) {
            errors.push(`Rad ${excelRow}: Material-ID måste vara SKRTJ-xxxxx.`);
            continue;
          }
          if (seen.has(materialId)) {
            errors.push(`Rad ${excelRow}: ${materialId} förekommer flera gånger i Excel-filen.`);
            continue;
          }
          seen.add(materialId);
          if (duplicateExisting.has(materialId)) {
            errors.push(`Rad ${excelRow}: ${materialId} finns redan som dubblett i Baserow och måste rättas manuellt.`);
            continue;
          }

          const existing = existingById.get(materialId) || null;
          const patch = {};
          const has = (key) => source[key] !== undefined && source[key] !== null && String(source[key]).trim() !== "";

          if (has("Material")) patch["Material"] = String(source["Material"]).trim();
          if (has("Kategori")) patch["Kategori"] = String(source["Kategori"]).trim();
          if (has("Kommentar")) patch["Kommentar"] = String(source["Kommentar"]).trim();
          if (has("Aktiv")) {
            const v = String(source["Aktiv"]).trim().toLowerCase();
            patch["Aktiv"] = source["Aktiv"] === true || ["true","sant","ja","1"].includes(v);
          }
          if (has("Transportstatus")) {
            const ts = String(source["Transportstatus"]).trim();
            if (!["Ingen transport","Under transport"].includes(ts)) {
              errors.push(`Rad ${excelRow}: ogiltig Transportstatus "${ts}".`);
            } else patch["Transportstatus"] = ts;
          }

          let stationId = null, vehicleId = null, rakelId = null, transportStationId = null;
          if (has("Station")) {
            const station = stationByName.get(String(source["Station"]).trim().toLocaleLowerCase("sv-SE"));
            if (!station) errors.push(`Rad ${excelRow}: station "${source["Station"]}" hittades inte.`);
            else stationId = station.id;
          }
          if (has("Registreringsnummer")) {
            const vehicle = vehicleByReg.get(String(source["Registreringsnummer"]).trim().toUpperCase());
            if (!vehicle) errors.push(`Rad ${excelRow}: registreringsnummer "${source["Registreringsnummer"]}" hittades inte.`);
            else vehicleId = vehicle.id;
          }
          if (has("Rakelnummer")) {
            const rakel = rakelByValue.get(String(source["Rakelnummer"]).trim());
            if (!rakel) errors.push(`Rad ${excelRow}: Rakelnummer "${source["Rakelnummer"]}" hittades inte.`);
            else rakelId = rakel.id;
          }
          if (has("Transport till station")) {
            const station = stationByName.get(String(source["Transport till station"]).trim().toLocaleLowerCase("sv-SE"));
            if (!station) errors.push(`Rad ${excelRow}: transportstation "${source["Transport till station"]}" hittades inte.`);
            else transportStationId = station.id;
          }

          // Placering ändras bara om någon placeringskolumn faktiskt är ifylld.
          if (stationId) {
            patch["Station"] = [stationId];
            patch["Registreringsnummer"] = [];
            patch["Rakelnummer"] = [];
            patch["Transportstatus"] = "Ingen transport";
            patch["Transport till station"] = [];
          } else if (vehicleId || rakelId) {
            if (!(vehicleId && rakelId)) {
              errors.push(`Rad ${excelRow}: fordon kräver både Registreringsnummer och Rakelnummer.`);
            } else {
              patch["Station"] = [];
              patch["Registreringsnummer"] = [vehicleId];
              patch["Rakelnummer"] = [rakelId];
              patch["Transportstatus"] = "Ingen transport";
              patch["Transport till station"] = [];
            }
          } else if (patch["Transportstatus"] === "Under transport") {
            if (!transportStationId) errors.push(`Rad ${excelRow}: Under transport kräver "Transport till station".`);
            else {
              patch["Station"] = [];
              patch["Registreringsnummer"] = [];
              patch["Rakelnummer"] = [];
              patch["Transport till station"] = [transportStationId];
            }
          }

          if (!existing && !patch["Material"]) errors.push(`Rad ${excelRow}: nytt material kräver Material.`);
          if (!existing && !patch["Kategori"]) errors.push(`Rad ${excelRow}: nytt material kräver Kategori.`);

          prepared.push({ excelRow, materialId, existing, patch });
        }

        if (errors.length) {
          return json({ success:false, imported:false, errors, newCount:0, updatedCount:0 }, 400, corsHeaders);
        }

        let newCount = 0, updatedCount = 0, unchangedCount = 0;
        const results = [];

        for (const item of prepared) {
          if (item.existing) {
            if (!Object.keys(item.patch).length) {
              unchangedCount++;
              results.push({ materialId:item.materialId, action:"unchanged" });
              continue;
            }
            await baserowRequest(
              env,
              `/database/rows/table/${TABLES.material}/${item.existing.id}/?user_field_names=true`,
              { method:"PATCH", body:item.patch }
            );
            updatedCount++;
            results.push({ materialId:item.materialId, action:"updated" });
          } else {
            await baserowRequest(
              env,
              `/database/rows/table/${TABLES.material}/?user_field_names=true`,
              {
                method:"POST",
                body:{
                  "Material-ID": item.materialId,
                  "Aktiv": item.patch["Aktiv"] ?? true,
                  ...item.patch,
                }
              }
            );
            newCount++;
            results.push({ materialId:item.materialId, action:"created" });
          }
        }

        return json({
          success:true,
          imported:true,
          newCount,
          updatedCount,
          unchangedCount,
          results
        }, 200, corsHeaders);
      }

      // GET /exercise-rules – Nyköpings styrning av vad som får beställas till övning.
      if (request.method === "GET" && url.pathname === "/exercise-rules") {
        const [levels, materialData] = await Promise.all([
          baserowRequest(env, `/database/rows/table/${TABLES.stockLevels}/?user_field_names=true&size=200`, {method:"GET"}),
          baserowRequest(env, `/database/rows/table/${TABLES.material}/?user_field_names=true&size=200`, {method:"GET"})
        ]);
        const materials=[...new Set(materialData.results.map(r=>String(r["Material"]||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"sv"));
        const rules=levels.results.filter(r=>String(r["Namn"]||"").startsWith("ÖVNING – ")).map(r=>({
          id:r.id,
          material:String(r["Material"]||"").replace(/^ÖVNING:/,""),
          active:r["Aktiv"]===true,
          maxQuantity:Number(r["Max antal"]||0)
        }));
        return json({materials,rules},200,corsHeaders);
      }

      // POST /exercise-rule/upsert – endast administrationsvyn använder denna.
      if (request.method === "POST" && url.pathname === "/exercise-rule/upsert") {
        if (!isAllowedBrowserOrigin(request)) return json({error:"Otillåten origin"},403,corsHeaders);
        const body=await readJson(request);
        const material=String(body?.material||"").trim();
        const active=body?.active===true;
        const maxQuantity=Number(body?.maxQuantity);
        if(!material) return json({error:"Material måste anges."},400,corsHeaders);
        if(active&&(!Number.isInteger(maxQuantity)||maxQuantity<1)) return json({error:"Max antal måste vara minst 1."},400,corsHeaders);
        const [levels,stations]=await Promise.all([
          baserowRequest(env,`/database/rows/table/${TABLES.stockLevels}/?user_field_names=true&size=200`,{method:"GET"}),
          baserowRequest(env,`/database/rows/table/${TABLES.stations}/?user_field_names=true&size=200`,{method:"GET"})
        ]);
        const nyk=stations.results.find(r=>String(r["Station"]||r["Station-ID"]||"").trim().toLocaleLowerCase("sv-SE")==="nyköping");
        if(!nyk) return json({error:"Stationen Nyköping hittades inte."},409,corsHeaders);
        const name=`ÖVNING – ${material}`;
        const existing=levels.results.find(r=>String(r["Namn"]||"")===name);
        const payload={"Namn":name,"Station":[nyk.id],"Material":`ÖVNING:${material}`,"Röd under":0,"Grön från":0,"Max antal":active?maxQuantity:0,"Aktiv":active};
        const saved=existing
          ? await baserowRequest(env,`/database/rows/table/${TABLES.stockLevels}/${existing.id}/?user_field_names=true`,{method:"PATCH",body:payload})
          : await baserowRequest(env,`/database/rows/table/${TABLES.stockLevels}/?user_field_names=true`,{method:"POST",body:payload});
        return json({success:true,id:saved.id,material,active,maxQuantity:active?maxQuantity:0},200,corsHeaders);
      }

      // GET /orders – lagerbeställningar samt grupperade övningsbeställningar.
      if (request.method === "GET" && url.pathname === "/orders") {
        const data=await baserowRequest(env,`/database/rows/table/${TABLES.orders}/?user_field_names=true&size=200`,{method:"GET"});
        const normal=[]; const exerciseMap=new Map();
        for(const row of data.results){
          const type=row["Beställningstyp"]?.value||row["Beställningstyp"]||"";
          const common={id:row.id,orderId:row["Beställnings-ID"]||"",type,stationId:linkedIds(row["Beställande station"])[0]||null,station:Array.isArray(row["Beställande station"])&&row["Beställande station"][0]?.value?String(row["Beställande station"][0].value):"",comment:row["Kommentar"]||"",status:row["Status"]?.value||row["Status"]||"",created:row["Skapad"]||"",exerciseDate:row["Övningsdatum"]||"",orderedBy:row["Beställare"]||""};
          if(type!=="Övning") normal.push({...common,material:row["Material"]||"",quantity:Number(row["Antal"]||0)});
          else{
            const key=common.orderId||`ROW-${row.id}`;
            if(!exerciseMap.has(key)) exerciseMap.set(key,{...common,lines:[]});
            exerciseMap.get(key).lines.push({material:row["Material"]||"",quantity:Number(row["Antal"]||0)});
          }
        }
        const orders=[...normal,...exerciseMap.values()].sort((a,b)=>Number(b.id)-Number(a.id));
        return json({orders},200,corsHeaders);
      }

      // POST /orders – Lager behåller en rad. Övning kan innehålla flera materialrader.
      if (request.method === "POST" && url.pathname === "/orders") {
        if (!isAllowedBrowserOrigin(request)) return json({error:"Otillåten origin"},403,corsHeaders);
        const body=await readJson(request); const type=String(body?.type||"").trim(); const stationId=Number(body?.stationId); const comment=String(body?.comment||"").trim();
        if(!["Lager","Övning"].includes(type)) return json({error:"Beställningstyp måste vara Lager eller Övning."},400,corsHeaders);
        if(!isPositiveInteger(stationId)) return json({error:"Beställande station måste anges."},400,corsHeaders);
        const station=await getRow(env,TABLES.stations,stationId); if(!station||station["Aktiv"]!==true) return json({error:"Beställande station finns inte eller är inte aktiv."},409,corsHeaders);
        const existing=await baserowRequest(env,`/database/rows/table/${TABLES.orders}/?user_field_names=true&size=200`,{method:"GET"});
        const used=new Set(existing.results.map(r=>String(r["Beställnings-ID"]||"").match(/^BEST-(\d{5})$/i)).filter(Boolean).map(m=>Number(m[1]))); let next=1; while(used.has(next))next++; const orderId=`BEST-${String(next).padStart(5,"0")}`;
        if(type==="Lager"){
          const materialName=String(body?.material||"").trim(); const quantity=Number(body?.quantity);
          if(!materialName||!Number.isInteger(quantity)||quantity<1) return json({error:"Material och antal måste anges."},400,corsHeaders);
          const created=await baserowRequest(env,`/database/rows/table/${TABLES.orders}/?user_field_names=true`,{method:"POST",body:{"Beställnings-ID":orderId,"Beställningstyp":"Lager","Material":materialName,"Antal":quantity,"Beställande station":[stationId],"Kommentar":comment,"Status":"Beställd"}});
          return json({success:true,orderId,rowId:created.id,type,status:"Beställd"},201,corsHeaders);
        }
        const exerciseDate=String(body?.exerciseDate||"").trim(); const orderedBy=String(body?.orderedBy||"").trim(); const lines=Array.isArray(body?.lines)?body.lines:[];
        if(!/^\d{4}-\d{2}-\d{2}$/.test(exerciseDate)) return json({error:"Övningsdatum måste anges."},400,corsHeaders);
        if(!orderedBy) return json({error:"Beställare måste anges."},400,corsHeaders);
        if(!lines.length) return json({error:"Lägg till minst en materialtyp."},400,corsHeaders);
        const levels=await baserowRequest(env,`/database/rows/table/${TABLES.stockLevels}/?user_field_names=true&size=200`,{method:"GET"});
        const rules=new Map(levels.results.filter(r=>String(r["Namn"]||"").startsWith("ÖVNING – ")&&r["Aktiv"]===true).map(r=>[String(r["Material"]||"").replace(/^ÖVNING:/,"").trim().toLocaleLowerCase("sv-SE"),Number(r["Max antal"]||0)]));
        const seen=new Set(); const clean=[];
        for(const x of lines){const material=String(x?.material||"").trim(); const quantity=Number(x?.quantity); const k=material.toLocaleLowerCase("sv-SE"); if(!material||seen.has(k)) return json({error:"Varje materialtyp får bara finnas en gång."},400,corsHeaders); seen.add(k); const max=rules.get(k); if(!max) return json({error:`${material} är inte beställningsbar för övning.`},409,corsHeaders); if(!Number.isInteger(quantity)||quantity<1||quantity>max) return json({error:`${material}: antal måste vara 1–${max}.`},409,corsHeaders); clean.push({material,quantity});}
        const items=clean.map(x=>({"Beställnings-ID":orderId,"Beställningstyp":"Övning","Material":x.material,"Antal":x.quantity,"Beställande station":[stationId],"Beställare":orderedBy,"Övningsdatum":exerciseDate,"Kommentar":comment,"Status":"Beställd"}));
        const created=await baserowRequest(env,`/database/rows/table/${TABLES.orders}/batch/?user_field_names=true`,{method:"POST",body:{items}});
        return json({success:true,orderId,rowIds:(created.items||[]).map(x=>x.id),type:"Övning",exerciseDate,orderedBy,lines:clean,status:"Beställd"},201,corsHeaders);
      }

      // POST /orders/status – Övning: Beställd → Packad → Skickad. Hela ordern uppdateras samtidigt.
      if (request.method === "POST" && url.pathname === "/orders/status") {
        if (!isAllowedBrowserOrigin(request)) return json({error:"Otillåten origin"},403,corsHeaders);
        const body=await readJson(request); const rowId=Number(body?.rowId); const orderId=String(body?.orderId||"").trim(); const status=String(body?.status||"").trim();
        const all=await baserowRequest(env,`/database/rows/table/${TABLES.orders}/?user_field_names=true&size=200`,{method:"GET"});
        let rows=orderId?all.results.filter(r=>String(r["Beställnings-ID"]||"")===orderId):all.results.filter(r=>r.id===rowId);
        if(!rows.length) return json({error:"Beställningen hittades inte."},404,corsHeaders);
        const type=rows[0]["Beställningstyp"]?.value||rows[0]["Beställningstyp"]||"";
        if(type==="Övning"){
          const current=rows[0]["Status"]?.value||rows[0]["Status"]||"Beställd"; const allowed={"Beställd":"Packad","Packad":"Skickad"};
          if(status!==allowed[current]) return json({error:`Nästa status efter ${current} är ${allowed[current]||"ingen"}.`},409,corsHeaders);
          const items=rows.map(r=>({id:r.id,"Status":status})); await baserowRequest(env,`/database/rows/table/${TABLES.orders}/batch/?user_field_names=true`,{method:"PATCH",body:{items}});
          return json({success:true,orderId:rows[0]["Beställnings-ID"]||orderId,status},200,corsHeaders);
        }
        if(!["Beställd","Mottagen","Klar","Avbruten"].includes(status)) return json({error:"Ogiltig status."},400,corsHeaders);
        if(!isPositiveInteger(rowId)) return json({error:"Ogiltigt beställnings-ID."},400,corsHeaders);
        const updated=await baserowRequest(env,`/database/rows/table/${TABLES.orders}/${rowId}/?user_field_names=true`,{method:"PATCH",body:{"Status":status}});
        return json({success:true,rowId,status,orderId:updated["Beställnings-ID"]||""},200,corsHeaders);
      }

      // Hälsokontroll
      if (request.method === "GET" && url.pathname === "/") {
        return json(
          {
            status: "ok",
            service: "Rökskydd Material API",
            mode: "material-plan-optional-yellow-enabled",
          },
          200,
          corsHeaders
        );
      }

      return json({ error: "Endpoint finns inte" }, 404, corsHeaders);
    } catch (error) {
      console.error("WORKER_ERROR", error?.message || error);
      return json(
        {
          error: error?.message || "API-fel",
          baserowStatus: error?.baserowStatus || null,
          baserowBody: error?.baserowBody || null
        },
        error?.status && error.status >= 400 && error.status < 600 ? error.status : 500,
        corsHeaders
      );
    }
  },
};

function normalizeMaterialId(value) {
  return String(value ?? "").trim().toUpperCase();
}

function isValidMaterialId(value) {
  return /^SKRTJ-\d{5}$/.test(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sameMaterialName(a, b) {
  return String(a || "").trim().toLocaleLowerCase("sv-SE") ===
    String(b || "").trim().toLocaleLowerCase("sv-SE");
}

function stationStockStatus(actual, redBelow, greenFrom, max) {
  if (redBelow !== null && actual < redBelow) return "red";
  if (greenFrom !== null && actual < greenFrom) return "yellow";
  if (max !== null && actual > max) return "yellow";
  return "green";
}

function isAllowedBrowserOrigin(request) {
  return request.headers.get("Origin") === ALLOWED_ORIGIN;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    const error = new Error("Ogiltig JSON");
    error.status = 400;
    throw error;
  }
}

function linkedIds(value) {
  // Baserow kan returnera länkfält som objekt, id:n eller ett enskilt värde.
  // Normalisera alla varianter så Register-sidan alltid får rätt linked row-id.
  const values = Array.isArray(value)
    ? value
    : (value === null || value === undefined || value === "" ? [] : [value]);

  return values
    .map((item) => {
      if (item && typeof item === "object") {
        return Number(item.id ?? item.value?.id ?? item.row_id ?? item.rowId);
      }
      return Number(item);
    })
    .filter((id) => isPositiveInteger(id));
}

function placementFromMaterial(material) {
  return {
    Station: linkedIds(material["Station"]),
    Rakelnummer: linkedIds(material["Rakelnummer"]),
    Registreringsnummer: linkedIds(material["Registreringsnummer"]),
  };
}

async function findMaterialById(env, materialId) {
  const data = await baserowRequest(
    env,
    `/database/rows/table/${TABLES.material}/?user_field_names=true&size=200`,
    { method: "GET" }
  );

  return data.results.find(
    (row) => normalizeMaterialId(row["Material-ID"]) === materialId
  );
}

async function getRow(env, tableId, rowId) {
  try {
    return await baserowRequest(
      env,
      `/database/rows/table/${tableId}/${rowId}/?user_field_names=true`,
      { method: "GET" }
    );
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function updateMaterialPlacement(env, materialRowId, placement) {
  return baserowRequest(
    env,
    `/database/rows/table/${TABLES.material}/${materialRowId}/?user_field_names=true`,
    {
      method: "PATCH",
      body: placement,
    }
  );
}

async function createEvent(env, body) {
  return baserowRequest(
    env,
    `/database/rows/table/${TABLES.events}/?user_field_names=true`,
    {
      method: "POST",
      body,
    }
  );
}

async function rollbackPlacementOrThrow(
  env,
  materialRowId,
  previousPlacement,
  materialId,
  originalError
) {
  try {
    await updateMaterialPlacement(env, materialRowId, previousPlacement);
  } catch (rollbackError) {
    console.error("Rollback misslyckades:", rollbackError);
    throw new Error(
      `Händelsen kunde inte skapas och återställningen misslyckades. Kontrollera ${materialId} manuellt i Baserow. Ursprungligt fel: ${originalError.message}`
    );
  }

  throw new Error(
    `Händelsen kunde inte skapas. Materialets tidigare placering återställdes. ${originalError.message}`
  );
}

function normalizeConsumableId(value) {
  return String(value || "").trim().toUpperCase();
}

function isValidConsumableId(value) {
  return /^FORB-\d{3,5}$/.test(normalizeConsumableId(value));
}

async function consumableTargetForStation(env, stationId, articleId) {
  const data=await baserowRequest(env,`/database/rows/table/${TABLES.stockLevels}/?user_field_names=true&size=200`,{method:"GET"});
  const key=`FORB:${normalizeConsumableId(articleId)}`.toUpperCase();
  const row=data.results.find(r=>r["Aktiv"]===true && linkedIds(r["Station"])[0]===Number(stationId) && String(r["Material"]||"").trim().toUpperCase()===key);
  return row?Math.max(0,integerOrZero(row["Max antal"])):0;
}

function integerOrZero(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : 0;
}

function consumableFromRow(row) {
  const balance = integerOrZero(row["Saldo"]);
  const reorderAt = Number.isFinite(Number(row["Beställ vid"])) ? Number(row["Beställ vid"]) : null;
  const target = Number.isFinite(Number(row["Önskat lager"])) ? Number(row["Önskat lager"]) : null;
  const stationIds = linkedIds(row["Station"]);
  const stationName = Array.isArray(row["Station"]) && row["Station"][0]?.value
    ? String(row["Station"][0].value) : "";
  const packageSize = Math.max(0, integerOrZero(row["Förpackningsstorlek"]));
  const minimumOrderQuantity = Math.max(0, integerOrZero(row["Minsta beställningsantal"]));
  const orderNeeded = reorderAt !== null && balance <= reorderAt;
  let orderQuantity = 0;
  if (orderNeeded && target !== null) {
    const shortage = Math.max(0, target - balance);
    const nykoping = normalizeSwedishName(stationName) === "nyköping";
    if (nykoping) {
      const required = Math.max(shortage, minimumOrderQuantity);
      orderQuantity = packageSize > 0 ? Math.ceil(required / packageSize) * packageSize : required;
    } else {
      orderQuantity = shortage;
    }
  }
  return {
    rowId: row.id,
    articleId: normalizeConsumableId(row["Artikel-ID"]),
    article: String(row["Artikel"] || ""),
    category: String(row["Kategori"] || ""),
    stationId: stationIds.length === 1 ? stationIds[0] : null,
    station: stationName,
    balance,
    reorderAt,
    target,
    unit: String(row["Enhet"] || "st"),
    supplier: String(row["Leverantör"] || ""),
    supplierArticleNumber: String(row["Artikelnummer"] || ""),
    orderUrl: String(row["Beställningslänk"] || ""),
    contactPerson: String(row["Kontaktperson"] || ""),
    phone: String(row["Telefon"] || ""),
    email: String(row["E-post"] || ""),
    customerNumber: String(row["Kundnummer"] || ""),
    agreementNumber: String(row["Avtalsnummer"] || ""),
    packageSize,
    minimumOrderQuantity,
    orderComment: String(row["Beställningskommentar"] || ""),
    usageArea: String(row["Användningsområde"] || ""),
    comment: String(row["Kommentar"] || ""),
    active: row["Aktiv"] === true,
    orderable: row["Beställningsbar"] === true,
    orderNeeded,
    orderQuantity
  };
}

function consumableOrderFromRow(row) {
  const article = Array.isArray(row["Artikel"]) && row["Artikel"][0] ? row["Artikel"][0] : null;
  const from = Array.isArray(row["Från station"]) && row["Från station"][0] ? row["Från station"][0] : null;
  const to = Array.isArray(row["Till station"]) && row["Till station"][0] ? row["Till station"][0] : null;
  return {
    rowId: row.id,
    orderId: String(row["Beställnings-ID"] || ""),
    articleRowId: article?.id || null,
    article: article?.value || "",
    fromStationId: from?.id || null,
    fromStation: from?.value || "",
    toStationId: to?.id || null,
    toStation: to?.value || "",
    quantity: integerOrZero(row["Antal"]),
    orderedBy: String(row["Beställare"] || ""),
    status: row["Status"]?.value || row["Status"] || "",
    created: row["Skapad"] || "",
    comment: String(row["Kommentar"] || "")
  };
}

function normalizeSwedishName(value) {
  return String(value || "").trim().toLocaleLowerCase("sv-SE");
}

function stripSupplierUnlessNykoping(item) {
  if (normalizeSwedishName(item?.station) === "nyköping") return item;
  const copy = {...item};
  ["supplier","supplierArticleNumber","orderUrl","contactPerson","phone","email","customerNumber","agreementNumber","orderComment"].forEach(key => { copy[key] = ""; });
  return copy;
}

async function findConsumableById(env, articleId) {
  const wanted = normalizeConsumableId(articleId);
  const data = await baserowRequest(
    env,
    `/database/rows/table/${TABLES.consumables}/?user_field_names=true&size=200`,
    { method:"GET" }
  );
  return data.results.find(row => normalizeConsumableId(row["Artikel-ID"]) === wanted) || null;
}

const BASEROW_GET_CACHE_TTL_MS = 3000;
const baserowGetCache = new Map();
const baserowGetInflight = new Map();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clearBaserowReadCache() {
  baserowGetCache.clear();
  baserowGetInflight.clear();
}

async function baserowRequest(env, path, options = {}) {
  if (!env.BASEROW_TOKEN) {
    throw new Error("BASEROW_TOKEN saknas i Cloudflare");
  }

  const method = String(options.method || "GET").toUpperCase();
  const isGet = method === "GET";
  const cacheKey = isGet ? path : null;

  // Kort cache minskar dubbla Baserow-läsningar när Lageröversikten laddar flera
  // delar samtidigt. Skrivningar cachas aldrig.
  if (isGet) {
    const cached = baserowGetCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    if (cached) baserowGetCache.delete(cacheKey);

    // Om samma GET redan pågår återanvänds samma Promise i stället för ett nytt
    // Baserow-anrop.
    const inflight = baserowGetInflight.get(cacheKey);
    if (inflight) return inflight;
  } else {
    // Efter en skrivning ska nästa läsning alltid hämta färska saldon/statusar.
    clearBaserowReadCache();
  }

  const run = async () => {
    const headers = { Authorization: `Token ${env.BASEROW_TOKEN}` };
    const fetchOptions = { method, headers };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(options.body);
    }

    const maxAttempts = 4;
    let lastStatus = 0;
    let lastText = "";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await fetch(BASEROW_API + path, fetchOptions);
      const text = await response.text();
      lastStatus = response.status;
      lastText = text;

      if (response.ok) {
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch {
          throw new Error("Baserow gav ett ogiltigt JSON-svar");
        }
      }

      if (response.status === 429 && attempt < maxAttempts) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, 10000)
          : Math.min(500 * (2 ** (attempt - 1)), 4000);
        console.log("BASEROW_THROTTLED_RETRY", JSON.stringify({path, method, attempt, waitMs}));
        await sleep(waitMs);
        continue;
      }

      const error = new Error(`Baserow svarade ${response.status}: ${text || response.statusText}`);
      error.status = response.status;
      error.baserowStatus = response.status;
      error.baserowBody = text || response.statusText || "";
      console.log("BASEROW_ERROR", JSON.stringify({status:response.status, body:error.baserowBody, path, method}));
      throw error;
    }

    const error = new Error(`Baserow svarade ${lastStatus}: ${lastText || "Request was throttled."}`);
    error.status = lastStatus || 429;
    throw error;
  };

  if (!isGet) return run();

  const promise = run();
  baserowGetInflight.set(cacheKey, promise);
  try {
    const value = await promise;
    baserowGetCache.set(cacheKey, {value, expiresAt: Date.now() + BASEROW_GET_CACHE_TTL_MS});
    return value;
  } finally {
    baserowGetInflight.delete(cacheKey);
  }
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers,
  });
}
