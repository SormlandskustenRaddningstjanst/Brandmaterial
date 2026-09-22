const API = "https://ros-material-api.peter-hasselberg.workers.dev";

const params = new URLSearchParams(location.search);
const material = (params.get("material") || "").trim().toUpperCase();
const consumable = (params.get("forbrukning") || "").trim().toUpperCase();

const el = id => document.getElementById(id);

if (consumable) {
  document.body.classList.add("qr-mode", "consumable-mode");
  el("headerText").textContent = "Förbrukningsartikel";
  startConsumableMode();
} else if (material) {
  document.body.classList.add("qr-mode");
  el("headerText").textContent = "Skannat material";
  startQrMode();
} else {
  startHome();
}

async function apiGet(path) {
  const response = await fetch(API + path);
  let data;
  try { data = await response.json(); }
  catch { throw new Error("API:t gav ett ogiltigt svar."); }

  if (!response.ok) {
    const extra = data.baserowBody ? "\nBaserow: " + data.baserowBody : "";
    throw new Error((data.error || data.message || "API-fel") + extra);
  }
  return data;
}


async function apiPost(path, body) {
  const response = await fetch(API + path, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(body)
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error("API:t gav ett ogiltigt svar."); }
  if (!response.ok) throw new Error(data.error || data.message || "API-fel");
  return data;
}

async function editStationLevel(level, stationName) {
  const currentRedMax = level.redBelow !== null ? Math.max(0, Number(level.redBelow) - 1) : 0;
  const currentYellowMax = level.greenFrom !== null ? Math.max(currentRedMax + 1, Number(level.greenFrom) - 1) : currentRedMax + 1;
  const currentGreenMax = level.max !== null ? Number(level.max) : currentYellowMax + 1;

  const redText = prompt(
    stationName + " – " + level.material + "\n\n🔴 Röd nivå t.o.m. antal:",
    String(currentRedMax)
  );
  if (redText === null) return;

  const yellowText = prompt(
    "🟡 Gul nivå t.o.m. antal:\n(Gul börjar automatiskt på " + (Number(redText) + 1) + ")",
    String(currentYellowMax)
  );
  if (yellowText === null) return;

  const greenText = prompt(
    "🟢 Grön nivå – högsta antal / MAX:\n(Grön börjar automatiskt på " + (Number(yellowText) + 1) + ")\n\nFör exakt grön nivå anger du samma tal som grön start.",
    String(currentGreenMax)
  );
  if (greenText === null) return;

  const redMax = Number(redText), yellowMax = Number(yellowText), greenMax = Number(greenText);
  if (![redMax,yellowMax,greenMax].every(Number.isInteger) || redMax < 0 || !(redMax < yellowMax && yellowMax < greenMax)) {
    alert("Ogiltiga nivåer.\n\nDe måste vara heltal och följa:\nRöd högsta < Gul högsta < Grön MAX.");
    return;
  }

  try {
    await apiPost("/stock-level", {id:level.id, redMax, yellowMax, greenMax});
    overviewData = await apiGet("/overview");
    renderHome();
  } catch (err) {
    alert("Kunde inte spara stationsnivån:\n" + (err.message || err));
  }
}

async function editVehicleRequirement(requirement, vehicleLabel) {
  const value = prompt(
    vehicleLabel + " – " + requirement.material +
    "\n\n🟢 Ange exakt antal som ska vara GRÖNT:\nAlla andra antal visas rött.",
    String(requirement.required ?? 0)
  );
  if (value === null) return;

  const required = Number(value);
  if (!Number.isInteger(required) || required < 0) {
    alert("Grön nivå måste vara ett heltal 0 eller högre.");
    return;
  }

  try {
    await apiPost("/vehicle-requirement", {id:requirement.id, required});
    overviewData = await apiGet("/overview");
    renderHome();
  } catch (err) {
    alert("Kunde inte spara fordonsnivån:\n" + (err.message || err));
  }
}

let currentConsumable = null;

async function startConsumableMode() {
  document.querySelector(".consumable-qr").style.display = "block";
  if (!/^FORB-\d{3,5}$/.test(consumable)) {
    showConsumableError("Ogiltigt Artikel-ID: " + consumable);
    return;
  }
  try {
    currentConsumable = await apiGet("/consumable/" + encodeURIComponent(consumable));
    renderConsumable();
    el("consumableLoading").style.display = "none";
    el("consumableCard").style.display = "block";
  } catch (err) {
    showConsumableError(err.message);
  }
}

function renderConsumable() {
  const item = currentConsumable;
  if (!item) return;
  el("consumableId").textContent = item.articleId || consumable;
  el("consumableName").textContent = item.article || "Okänd artikel";
  el("consumableStation").textContent = item.station || "Station saknas";
  el("consumableBalance").textContent = item.balance ?? 0;
  el("consumableUnit").textContent = item.unit || "st";
  el("consumableReorderAt").textContent = item.reorderAt == null ? "–" : item.reorderAt + " " + (item.unit || "st");
  el("consumableTarget").textContent = item.target == null ? "–" : item.target + " " + (item.unit || "st");
  const usage = el("consumableUsageArea");
  if (usage) {
    const text = String(item.usageArea || "").trim();
    usage.style.display = text ? "block" : "none";
    usage.innerHTML = text ? "<strong>Användningsområde</strong><br>" + escapeHtml(text).replace(/\n/g, "<br>") : "";
  }
  const warning = el("consumableOrderWarning");
  if (item.orderNeeded) {
    warning.className = "message error active consumable-order-warning";
    warning.innerHTML = "<strong>🔴 BESTÄLL</strong>" + (item.orderQuantity > 0 ? "<br>Beställ " + escapeHtml(item.orderQuantity) + " " + escapeHtml(item.unit || "st") + " för att nå önskat lager." : "");
  } else {
    warning.className = "message consumable-order-warning";
    warning.textContent = "";
  }
}

async function adjustConsumable(change) {
  if (!Number.isInteger(change) || change === 0) return;
  const before = Number(currentConsumable?.balance ?? 0);
  const after = before + change;
  if (after < 0) {
    showConsumableMessage("Lagret kan inte bli negativt. Aktuellt saldo är " + before + ".", true);
    return;
  }
  const sign = change > 0 ? "+" : "";
  if (!confirm("Registrera " + sign + change + " " + (currentConsumable?.unit || "st") + " för " + (currentConsumable?.article || consumable) + "?\n\nSaldo: " + before + " → " + after)) return;
  setConsumableButtonsDisabled(true);
  showConsumableMessage("Sparar " + sign + change + "…", false);
  try {
    const result = await apiPost("/consumable/adjust", {articleId:consumable, change});
    currentConsumable = result.item;
    renderConsumable();
    showConsumableMessage("✓ Registrerat " + sign + change + ". Nytt saldo: " + result.after + " " + (result.item?.unit || "st") + ".", false, true);
    el("consumableCustomChange").value = "";
  } catch (err) {
    showConsumableMessage(err.message || String(err), true);
  } finally {
    setConsumableButtonsDisabled(false);
  }
}

function setConsumableButtonsDisabled(disabled) {
  document.querySelectorAll(".consumable-adjust").forEach(b => b.disabled = disabled);
  el("consumableCustomBtn").disabled = disabled;
}

function showConsumableMessage(message, isError, isSuccess=false) {
  const box = el("consumableMessage");
  box.className = "message active " + (isError ? "error" : (isSuccess ? "success-box" : "info"));
  box.textContent = message;
}

function showConsumableError(message) {
  el("consumableLoading").style.display = "none";
  el("consumableError").textContent = message;
  el("consumableError").classList.add("active");
}

document.querySelectorAll(".consumable-adjust").forEach(button => {
  button.addEventListener("click", () => adjustConsumable(Number(button.dataset.change)));
});
el("consumableCustomBtn")?.addEventListener("click", () => {
  const change = Number(el("consumableCustomChange").value);
  if (!Number.isInteger(change) || change === 0) {
    showConsumableMessage("Ange ett heltal, till exempel -7 eller 20.", true);
    return;
  }
  adjustConsumable(change);
});

async function startQrMode() {
  if (!/^SKRTJ-\d{5}$/.test(material)) {
    showError("Ogiltigt Material-ID: " + material);
    return;
  }

  try {
    const row = await apiGet("/material/" + encodeURIComponent(material));

    el("materialId").textContent = row["Material-ID"] || material;
    el("materialName").textContent = row["Material"] || "Okänt material";

    const stations = Array.isArray(row["Station"]) ? row["Station"] : [];
    const rakel = Array.isArray(row["Rakelnummer"]) ? row["Rakelnummer"] : [];
    const reg = Array.isArray(row["Registreringsnummer"]) ? row["Registreringsnummer"] : [];

    let locationText = "Saknar placering";
    if (rakel.length || reg.length) {
      const r = rakel.map(x => x.value).filter(Boolean).join(", ");
      const n = reg.map(x => x.value).filter(Boolean).join(", ");
      locationText = [r, n].filter(Boolean).join(" – ") || "Fordon";
    } else if (stations.length) {
      locationText = stations.map(x => x.value).join(", ");
    }

    const transportStatus = row["Transportstatus"]?.value || row["Transportstatus"] || "";
    const transportDest = Array.isArray(row["Transport till station"])
      ? row["Transport till station"].map(x => x.value).filter(Boolean).join(", ")
      : "";
    if (transportStatus === "Under transport") {
      locationText = "🚚 Under transport" + (transportDest ? " → " + transportDest : "");
    }
    el("currentLocation").textContent = locationText;
    el("lagerType").textContent = transportStatus === "Under transport" ? "Under transport" : (row["Lagertyp"] || "");
    el("loading").style.display = "none";
    el("materialCard").style.display = "block";
  } catch (err) {
    showError(err.message);
  }
}

function showError(message) {
  el("loading").style.display = "none";
  el("errorMessage").textContent = message;
  el("errorMessage").classList.add("active");
}



async function loadOrders() {
  const stockBox = el("stockOrders");
  const exerciseBox = el("exerciseOrders");
  if (!stockBox || !exerciseBox) return;

  try {
    const data = await apiGet("/orders");
    const active = (data.orders || []).filter(o => !["Klar","Avbruten"].includes(o.status));
    el("countOrders").textContent = active.length;
    renderOrderList(stockBox, active.filter(o => o.type === "Lager"));
    renderOrderList(exerciseBox, active.filter(o => o.type === "Övning"));
  } catch (err) {
    const msg = '<div class="message error active">' + escapeHtml(err.message) + '</div>';
    stockBox.innerHTML = msg;
    exerciseBox.innerHTML = msg;
  }
}

function renderOrderList(box, orders) {
  box.innerHTML = "";
  if (!orders.length) {
    box.innerHTML = '<div class="muted empty">Inga aktiva beställningar.</div>';
    return;
  }

  orders.forEach(order => {
    const row = document.createElement("div");
    row.className = "order-row";
    row.innerHTML =
      "<strong>" + escapeHtml(order.orderId || "Beställning") + " · " +
      escapeHtml(order.quantity) + " st " + escapeHtml(order.material) + "</strong>" +
      "<div class='order-meta'>Från " + escapeHtml(order.station || "okänd station") +
      " · Status: <strong>" + escapeHtml(order.status || "Beställd") + "</strong></div>" +
      (order.comment ? "<div class='order-meta'>" + escapeHtml(order.comment) + "</div>" : "") +
      "<div class='order-status-actions'></div>";

    const actions = row.querySelector(".order-status-actions");
    ["Beställd","Mottagen","Klar","Avbruten"].forEach(status => {
      if (status === order.status) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = status === "Klar" ? "green" : (status === "Avbruten" ? "secondary" : "");
      b.textContent = status;
      b.addEventListener("click", async () => {
        b.disabled = true;
        try {
          const response = await fetch(API + "/orders/status", {
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({rowId:Number(order.id), status})
          });
          let data;
          try { data = await response.json(); } catch { throw new Error("API:t gav ett ogiltigt svar."); }
          if (!response.ok) throw new Error(data.error || data.message || "Status kunde inte ändras.");
          await loadOrders();
        } catch(err) {
          alert("Statusändringen misslyckades: " + err.message);
          b.disabled = false;
        }
      });
      actions.appendChild(b);
    });
    box.appendChild(row);
  });
}

let currentOrderType = "";

function openOrderPanel(type) {
  currentOrderType = type;
  el("orderTitle").textContent = type === "Lager" ? "📦 Beställning lager" : "🎯 Beställning övning";
  el("orderMessage").className = "message";
  el("orderMessage").textContent = "";

  const selected = selectedStationIds();
  const stations = (overviewData?.stations || []).filter(s => selected.includes(Number(s.id)));
  el("orderStation").innerHTML = stations.map(s =>
    '<option value="' + Number(s.id) + '">' + escapeHtml(s.name) + '</option>'
  ).join("");

  const materials = [...new Set((overviewData?.material || [])
    .map(m => String(m.material || "").trim())
    .filter(Boolean))]
    .sort((a,b) => a.localeCompare(b, "sv"));

  el("orderMaterial").innerHTML = materials.map(name =>
    '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>'
  ).join("");

  el("orderQuantity").value = "1";
  el("orderComment").value = "";
  el("orderPanel").classList.add("active");
  el("orderPanel").scrollIntoView({behavior:"smooth", block:"start"});
}

el("orderStockBtn")?.addEventListener("click", () => openOrderPanel("Lager"));
el("orderExerciseBtn")?.addEventListener("click", () => openOrderPanel("Övning"));
el("cancelOrderBtn")?.addEventListener("click", () => el("orderPanel").classList.remove("active"));

el("submitOrderBtn")?.addEventListener("click", async () => {
  const stationId = Number(el("orderStation").value);
  const materialName = el("orderMaterial").value;
  const quantity = Number(el("orderQuantity").value);
  const comment = el("orderComment").value.trim();

  if (!currentOrderType || !stationId || !materialName || !Number.isInteger(quantity) || quantity < 1) {
    el("orderMessage").className = "message error active";
    el("orderMessage").textContent = "Kontrollera station, material och antal.";
    return;
  }

  el("submitOrderBtn").disabled = true;
  el("orderMessage").className = "message info active";
  el("orderMessage").textContent = "Skickar beställningen…";

  try {
    const response = await fetch(API + "/orders", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({
        type: currentOrderType,
        material: materialName,
        quantity,
        stationId,
        comment
      })
    });
    let data;
    try { data = await response.json(); } catch { throw new Error("API:t gav ett ogiltigt svar."); }
    if (!response.ok) throw new Error(data.error || data.message || "Beställningen kunde inte sparas.");

    el("orderMessage").className = "message info active";
    el("orderMessage").innerHTML =
      "<strong>✓ Beställningen är skickad till Nyköping.</strong><br>" +
      escapeHtml(data.orderId || "") + " · " + escapeHtml(currentOrderType) + " · " +
      escapeHtml(quantity) + " st " + escapeHtml(materialName);
    el("orderQuantity").value = "1";
    el("orderComment").value = "";
  } catch (err) {
    el("orderMessage").className = "message error active";
    el("orderMessage").innerHTML = "<strong>Beställningen misslyckades.</strong><br>" + escapeHtml(err.message);
  } finally {
    el("submitOrderBtn").disabled = false;
  }
});

el("checkinBtn").addEventListener("click", async () => {
  el("checkoutPanel").classList.remove("active");
  el("transportPanel").classList.remove("active");
  el("selectionMessage").classList.remove("active");
  el("checkinPanel").classList.add("active");

  if (el("stationsList").dataset.loaded) return;
  el("stationsList").innerHTML = '<div class="loading">Hämtar stationer…</div>';

  try {
    const rows = await apiGet("/stations");
    const active = rows.filter(row => row["Aktiv"] === true);

    el("stationsList").innerHTML = "";
    active.forEach(row => {
      const b = document.createElement("button");
      b.className = "choice";
      b.innerHTML = "<strong>" + escapeHtml(row["Station"] || row["Station-ID"] || "Station") +
                    "</strong>" + (row["Adress"] ? escapeHtml(row["Adress"]) : "");
      b.addEventListener("click", () => selectStation(row));
      el("stationsList").appendChild(b);
    });
    el("stationsList").dataset.loaded = "1";
  } catch (err) {
    el("stationsList").innerHTML = '<div class="message error active">' + escapeHtml(err.message) + "</div>";
  }
});

el("checkoutBtn").addEventListener("click", async () => {
  el("checkinPanel").classList.remove("active");
  el("transportPanel").classList.remove("active");
  el("selectionMessage").classList.remove("active");
  el("checkoutPanel").classList.add("active");

  if (el("vehiclesList").dataset.loaded) return;
  el("vehiclesList").innerHTML = '<div class="loading">Hämtar fordon…</div>';

  try {
    const rows = await apiGet("/vehicles");

    // Hämta materialet på nytt så att vi använder aktuell stationsplacering.
    const currentMaterial = await apiGet("/material/" + encodeURIComponent(material));
    const materialStations = Array.isArray(currentMaterial["Station"])
      ? currentMaterial["Station"].map(x => Number(x.id)).filter(Number.isInteger)
      : [];

    if (currentMaterial["Lagertyp"] !== "Stationslager" || materialStations.length !== 1) {
      throw new Error("Materialet måste vara incheckat på ett stationslager före utcheckning.");
    }

    const currentStationId = materialStations[0];

    const active = rows.filter(row => {
      if (row["Aktiv"] !== true) return false;
      const vehicleStations = Array.isArray(row["Station"])
        ? row["Station"].map(x => Number(x.id)).filter(Number.isInteger)
        : [];
      return vehicleStations.length === 1 && vehicleStations[0] === currentStationId;
    });

    el("vehiclesList").innerHTML = "";

    if (active.length === 0) {
      el("vehiclesList").innerHTML =
        '<div class="message error active">Inga aktiva fordon hittades på materialets station.</div>';
      return;
    }

    active.forEach(row => {
      const rakel = Array.isArray(row["Rakelnummer"])
        ? row["Rakelnummer"].map(x => x.value).filter(Boolean).join(", ")
        : "";
      const reg = row["Registreringsnummer"] || row["Fordons-ID"] || "";
      const type = row["Fordonstyp"]?.value || "";
      const station = Array.isArray(row["Station"])
        ? row["Station"].map(x => x.value).filter(Boolean).join(", ")
        : "";

      const b = document.createElement("button");
      b.className = "choice";
      b.innerHTML =
        "<strong>" + escapeHtml([rakel, reg].filter(Boolean).join(" – ")) + "</strong>" +
        escapeHtml([type, station].filter(Boolean).join(" • "));
      b.addEventListener("click", () => selectVehicle(row, rakel, reg));
      el("vehiclesList").appendChild(b);
    });
    el("vehiclesList").dataset.loaded = "1";
  } catch (err) {
    el("vehiclesList").innerHTML = '<div class="message error active">' + escapeHtml(err.message) + "</div>";
  }
});


el("transportBtn").addEventListener("click", async () => {
  el("checkinPanel").classList.remove("active");
  el("checkoutPanel").classList.remove("active");
  el("selectionMessage").classList.remove("active");
  el("transportPanel").classList.add("active");

  if (el("transportStationsList").dataset.loaded) return;
  el("transportStationsList").innerHTML = '<div class="loading">Hämtar stationer…</div>';

  try {
    const rows = await apiGet("/stations");
    const active = rows.filter(row => row["Aktiv"] === true);
    el("transportStationsList").innerHTML = "";
    active.forEach(row => {
      const b = document.createElement("button");
      b.className = "choice";
      const name = row["Station"] || row["Station-ID"] || "Station";
      b.innerHTML = "<strong>" + escapeHtml(name) + "</strong>" + (row["Adress"] ? escapeHtml(row["Adress"]) : "");
      b.addEventListener("click", () => selectTransportStation(row));
      el("transportStationsList").appendChild(b);
    });
    el("transportStationsList").dataset.loaded = "1";
  } catch (err) {
    el("transportStationsList").innerHTML = '<div class="message error active">' + escapeHtml(err.message) + "</div>";
  }
});

async function selectTransportStation(row) {
  const stationName = row["Station"] || row["Station-ID"] || "vald station";
  if (!confirm("Markera " + material + " för transport till " + stationName + "?")) return;

  el("selectionMessage").className = "message info active";
  el("selectionMessage").innerHTML = "<strong>Sparar…</strong><br>Markerar " + escapeHtml(material) +
    " för transport till " + escapeHtml(stationName) + ".";
  ["checkinBtn","checkoutBtn","transportBtn"].forEach(id => el(id).disabled = true);

  try {
    const response = await fetch(API + "/transport", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({materialId:material, stationId:Number(row.id)})
    });
    let data;
    try { data = await response.json(); } catch { throw new Error("API:t gav ett ogiltigt svar."); }
    if (!response.ok) throw new Error(data.message || data.error || "Transporten kunde inte sparas.");

    el("selectionMessage").className = "message info active";
    el("selectionMessage").innerHTML = "<strong>✓ Transporten är sparad.</strong><br>" +
      escapeHtml(data.message || (material + " är under transport till " + stationName + "."));
    el("currentLocation").textContent = "🚚 Under transport → " + stationName;
    el("lagerType").textContent = "Under transport";
    el("transportPanel").classList.remove("active");
  } catch(err) {
    el("selectionMessage").className = "message error active";
    el("selectionMessage").innerHTML = "<strong>Transporten misslyckades.</strong><br>" + escapeHtml(err.message);
  } finally {
    ["checkinBtn","checkoutBtn","transportBtn"].forEach(id => el(id).disabled = false);
  }
}

async function selectStation(row) {
  const stationName = row["Station"] || row["Station-ID"] || "vald station";

  if (!confirm("Checka in " + material + " på " + stationName + "?")) {
    return;
  }

  el("selectionMessage").className = "message info active";
  el("selectionMessage").innerHTML =
    "<strong>Sparar…</strong><br>Checkar in " +
    escapeHtml(material) + " på " + escapeHtml(stationName) + ".";

  el("checkinBtn").disabled = true;
  el("checkoutBtn").disabled = true;
  el("transportBtn").disabled = true;

  try {
    const response = await fetch(API + "/checkin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        materialId: material,
        stationId: Number(row.id)
      })
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("API:t gav ett ogiltigt svar.");
    }

    if (!response.ok) {
      throw new Error(data.message || data.error || "Incheckningen misslyckades.");
    }

    el("selectionMessage").className = "message info active";
    el("selectionMessage").innerHTML =
      "<strong>✓ Incheckningen är sparad.</strong><br>" +
      escapeHtml(data.message || (material + " är incheckat på " + stationName + "."));

    el("currentLocation").textContent = stationName;
    el("lagerType").textContent = "Stationslager";
    el("checkinPanel").classList.remove("active");
  } catch (err) {
    el("selectionMessage").className = "message error active";
    el("selectionMessage").innerHTML =
      "<strong>Incheckningen misslyckades.</strong><br>" + escapeHtml(err.message);
  } finally {
    el("checkinBtn").disabled = false;
    el("checkoutBtn").disabled = false;
    el("transportBtn").disabled = false;
  }
}

async function selectVehicle(row, rakel, reg) {
  const vehicleLabel = [rakel, reg].filter(Boolean).join(" – ");

  if (!confirm("Checka ut " + material + " till " + vehicleLabel + "?")) {
    return;
  }

  el("selectionMessage").className = "message info active";
  el("selectionMessage").innerHTML =
    "<strong>Sparar…</strong><br>Checkar ut " +
    escapeHtml(material) + " till " + escapeHtml(vehicleLabel) + ".";

  el("checkinBtn").disabled = true;
  el("checkoutBtn").disabled = true;
  el("transportBtn").disabled = true;

  try {
    const response = await fetch(API + "/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        materialId: material,
        vehicleId: Number(row.id)
      })
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("API:t gav ett ogiltigt svar.");
    }

    if (!response.ok) {
      throw new Error(data.message || data.error || "Utcheckningen misslyckades.");
    }

    el("selectionMessage").className = "message info active";
    el("selectionMessage").innerHTML =
      "<strong>✓ Utcheckningen är sparad.</strong><br>" +
      escapeHtml(data.message || (material + " är utcheckat till " + vehicleLabel + "."));

    el("currentLocation").textContent = vehicleLabel;
    el("lagerType").textContent = "Fordon";
    el("checkoutPanel").classList.remove("active");
  } catch (err) {
    el("selectionMessage").className = "message error active";
    el("selectionMessage").innerHTML =
      "<strong>Utcheckningen misslyckades.</strong><br>" + escapeHtml(err.message);
  } finally {
    el("checkinBtn").disabled = false;
    el("checkoutBtn").disabled = false;
    el("transportBtn").disabled = false;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


const STATION_STORAGE_KEY = "skrtj-selected-stations-v1";

const EXCEL_COLUMNS = [
  "Material-ID","Material","Kategori","Station","Rakelnummer",
  "Registreringsnummer","Kommentar","Aktiv","Transportstatus","Transport till station"
];

el("importExcelBtn")?.addEventListener("click", () => {
  if (typeof XLSX === "undefined") {
    alert("Excel-biblioteket kunde inte laddas. Kontrollera internetanslutningen och ladda om sidan.");
    return;
  }
  el("excelFileInput").value = "";
  el("excelFileInput").click();
});

el("excelFileInput")?.addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  const msg = el("excelMessage");
  msg.className = "message info active";
  msg.textContent = "Läser Excel-filen…";

  try {
    const bytes = await file.arrayBuffer();
    const workbook = XLSX.read(bytes, {type:"array"});
    const sheet = workbook.Sheets["Brandmaterial"] || workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("Excel-filen saknar ett kalkylblad.");

    const raw = XLSX.utils.sheet_to_json(sheet, {defval:"", raw:false});
    const rows = raw
      .map((r, i) => ({...r, __row:i + 2}))
      .filter(r => EXCEL_COLUMNS.some(k => String(r[k] ?? "").trim() !== ""));

    if (!rows.length) throw new Error("Inga materialrader hittades.");
    const ids = rows.map(r => String(r["Material-ID"] || "").trim().toUpperCase()).filter(Boolean);
    const duplicates = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    if (duplicates.length) throw new Error("Dubbletter i Excel-filen: " + duplicates.join(", "));

    const existing = new Map((overviewData?.material || []).map(m => [String(m.materialId).toUpperCase(), m]));
    const newCount = ids.filter(id => !existing.has(id)).length;
    const updateCount = ids.filter(id => existing.has(id)).length;

    const ok = confirm(
      "Importkontroll\\n\\n" +
      "Rader: " + rows.length + "\\n" +
      "Nya: " + newCount + "\\n" +
      "Befintliga som uppdateras: " + updateCount + "\\n\\n" +
      "Material som inte finns i Excel-filen lämnas orörda.\\n" +
      "Tomma importfält raderar inte befintliga värden.\\n\\n" +
      "Fortsätt med import?"
    );
    if (!ok) {
      msg.className = "message";
      msg.textContent = "";
      return;
    }

    msg.className = "message info active";
    msg.textContent = "Importerar och kontrollerar mot Baserow…";
    const response = await fetch(API + "/material/import", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({rows})
    });
    let data;
    try { data = await response.json(); } catch { throw new Error("API:t gav ett ogiltigt svar."); }
    if (!response.ok) {
      if (Array.isArray(data.errors)) throw new Error(data.errors.join("\\n"));
      throw new Error(data.error || data.message || "Importen misslyckades.");
    }

    msg.className = "message info active";
    msg.innerHTML = "<strong>✓ Import klar.</strong><br>" +
      escapeHtml(data.newCount) + " nya · " +
      escapeHtml(data.updatedCount) + " uppdaterade · " +
      escapeHtml(data.unchangedCount) + " oförändrade";
    overviewData = await apiGet("/overview");
    renderHome();
  } catch (err) {
    msg.className = "message error active";
    msg.innerHTML = "<strong>Importen stoppades.</strong><br>" +
      escapeHtml(String(err.message || err)).replaceAll("\\n","<br>");
  }
});

el("exportExcelBtn")?.addEventListener("click", async () => {
  const msg = el("excelMessage");
  try {
    if (typeof XLSX === "undefined") throw new Error("Excel-biblioteket kunde inte laddas.");
    msg.className = "message info active";
    msg.textContent = "Skapar Excel-export…";

    // Hämta fulla materialrader så exporten innehåller kommentarer och länknamn.
    const materials = overviewData?.material || [];
    const exportRows = [];
    for (const m of materials) {
      let full = {};
      try { full = await apiGet("/material/" + encodeURIComponent(m.materialId)); } catch {}
      const linkValue = key => Array.isArray(full[key]) && full[key][0]?.value ? full[key][0].value : "";
      exportRows.push({
        "Material-ID": m.materialId || "",
        "Material": m.material || "",
        "Kategori": m.category || "",
        "Station": linkValue("Station"),
        "Rakelnummer": linkValue("Rakelnummer") || m.rakel || "",
        "Registreringsnummer": linkValue("Registreringsnummer"),
        "Kommentar": full["Kommentar"] || m.comment || "",
        "Aktiv": full["Aktiv"] === false ? false : true,
        "Transportstatus": full["Transportstatus"]?.value || full["Transportstatus"] || m.transportStatus || "",
        "Transport till station": linkValue("Transport till station") || m.transportDestination || ""
      });
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows, {header:EXCEL_COLUMNS});
    ws["!cols"] = EXCEL_COLUMNS.map((_,i) => ({wch:[18,24,20,18,16,24,36,12,20,24][i]}));
    XLSX.utils.book_append_sheet(wb, ws, "Brandmaterial");
    const date = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, "Brandmaterial_export_" + date + ".xlsx");
    msg.className = "message info active";
    msg.textContent = "✓ Excel-export skapad.";
  } catch(err) {
    msg.className = "message error active";
    msg.textContent = "Exporten misslyckades: " + (err.message || err);
  }
});

let overviewData = null;

async function startHome() {
  try {
    overviewData = await apiGet("/overview");
    renderStationSettings();
    renderHome();
  } catch (err) {
    el("homeLoading").style.display = "none";
    el("homeError").textContent = err.message;
    el("homeError").classList.add("active");
  }
}

function getSavedStationSelection() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STATION_STORAGE_KEY));
    if (parsed && parsed.all === true) return { all:true, ids:[] };
    if (parsed && Array.isArray(parsed.ids) && parsed.ids.length) {
      return { all:false, ids:parsed.ids.map(Number).filter(Number.isInteger) };
    }
  } catch {}
  return { all:true, ids:[] };
}

function saveStationSelection(selection) {
  localStorage.setItem(STATION_STORAGE_KEY, JSON.stringify(selection));
}

function selectedStationIds() {
  const saved = getSavedStationSelection();
  if (saved.all) return overviewData.stations.map(s => Number(s.id));
  return saved.ids;
}

function renderStationSettings() {
  const saved = getSavedStationSelection();
  el("allStations").checked = saved.all;
  el("stationChecks").innerHTML = "";

  overviewData.stations.forEach(station => {
    const label = document.createElement("label");
    label.className = "check-row";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = station.id;
    input.checked = saved.all || saved.ids.includes(Number(station.id));
    input.disabled = saved.all;
    const span = document.createElement("span");
    span.textContent = station.name;
    label.append(input, span);
    el("stationChecks").appendChild(label);
  });

  updateSelectedLabel();
}

function updateSelectedLabel() {
  const saved = getSavedStationSelection();
  if (saved.all) {
    el("selectedStationsLabel").textContent = "Alla stationer";
    return;
  }
  const names = overviewData.stations
    .filter(s => saved.ids.includes(Number(s.id)))
    .map(s => s.name);
  el("selectedStationsLabel").textContent = names.join(", ") || "Ingen station vald";
}


function uniqueMaterialTypes() {
  const map = new Map();
  for (const m of (overviewData?.material || [])) {
    const name = String(m.material || "").trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase("sv-SE");
    if (!map.has(key)) map.set(key, {material:name, category:m.category || ""});
  }
  return [...map.values()].sort((a,b) => a.material.localeCompare(b.material, "sv"));
}

function openStationMaterialPlan(station) {
  const modal = el("materialPlanModal"), list = el("materialPlanList");
  el("materialPlanTitle").textContent = station.name + " – materialplan";
  el("materialPlanSubtitle").textContent = "Alla unika materialtyper från hela Brandmaterial-listan.";
  const types = uniqueMaterialTypes();
  const levels = overviewData.stockLevels || [];
  const actual = overviewData.material || [];
  list.innerHTML = types.map((t,i) => {
    const level = levels.find(x => Number(x.stationId) === Number(station.id) &&
      String(x.material||"").trim().toLocaleLowerCase("sv-SE") === t.material.toLocaleLowerCase("sv-SE"));
    const count = actual.filter(m => Number(m.stationId) === Number(station.id) &&
      String(m.material||"").trim().toLocaleLowerCase("sv-SE") === t.material.toLocaleLowerCase("sv-SE") &&
      m.transportStatus !== "Under transport").length;
    const active = !!level;
    const redMax = level?.redBelow != null ? Math.max(0, Number(level.redBelow)-1) : 0;
    const greenFrom = level?.greenFrom != null ? Number(level.greenFrom) : 2;
    const noYellow = active ? greenFrom === redMax + 1 : false;
    const yellowMax = noYellow ? redMax : Math.max(redMax+1, greenFrom-1);
    const greenMax = level?.max != null ? Number(level.max) : 2;
    return "<div class='plan-row' data-material='"+escapeHtml(t.material)+"'>" +
      "<div class='plan-name'><strong>"+escapeHtml(t.material)+"</strong><span>"+escapeHtml(t.category||"")+" · Finns nu: "+count+"</span></div>" +
      "<label><input class='plan-stocked' type='checkbox' "+(active?"checked":"")+"> Ska finnas</label>" +
      "<label>🔴 t.o.m.<input class='plan-red' type='number' min='0' value='"+redMax+"'></label>" +
      "<div class='yellow-level'><label>🟡 t.o.m.<input class='plan-yellow' type='number' min='0' value='"+yellowMax+"'></label>" +
      "<label class='no-yellow'><input class='plan-no-yellow' type='checkbox' "+(noYellow?"checked":"")+"> Ingen gul</label></div>" +
      "<label>🟢 MAX<input class='plan-green' type='number' min='1' value='"+greenMax+"'></label>" +
      "<button class='plan-save' type='button'>SPARA</button></div>";
  }).join("") || "<p>Inga materialtyper finns i Brandmaterial ännu.</p>";

  list.querySelectorAll(".plan-row").forEach(row => {
    const checkbox = row.querySelector(".plan-stocked");
    const noYellowBox = row.querySelector(".plan-no-yellow");
    const yellowInput = row.querySelector(".plan-yellow");
    const sync = () => {
      row.querySelector(".plan-red").disabled = !checkbox.checked;
      row.querySelector(".plan-green").disabled = !checkbox.checked;
      noYellowBox.disabled = !checkbox.checked;
      yellowInput.disabled = !checkbox.checked || noYellowBox.checked;
    };
    checkbox.addEventListener("change", sync);
    noYellowBox.addEventListener("change", sync);
    sync();
    row.querySelector(".plan-save").addEventListener("click", async () => {
      const body = {
        stationId:station.id, material:row.dataset.material, stocked:checkbox.checked,
        redMax:Number(row.querySelector(".plan-red").value),
        noYellow:noYellowBox.checked,
        yellowMax:noYellowBox.checked ? null : Number(yellowInput.value),
        greenMax:Number(row.querySelector(".plan-green").value)
      };
      try {
        await apiPost("/stock-level/upsert", body);
        overviewData = await apiGet("/overview");
        openStationMaterialPlan(station);
        renderHome();
      } catch(e) { alert(e.message || e); }
    });
  });
  modal.classList.remove("hidden");
}

function openVehicleMaterialPlan(vehicle, label) {
  const modal = el("materialPlanModal"), list = el("materialPlanList");
  el("materialPlanTitle").textContent = (label || "Fordon") + " – materialplan";
  el("materialPlanSubtitle").textContent = "Grön nivå är exakt antal. Alla andra antal visas rött.";
  const types = uniqueMaterialTypes();
  const reqs = overviewData.vehicleRequirements || [];
  const actual = overviewData.material || [];
  list.innerHTML = types.map(t => {
    const req = reqs.find(x => Number(x.vehicleId) === Number(vehicle.id) &&
      String(x.material||"").trim().toLocaleLowerCase("sv-SE") === t.material.toLocaleLowerCase("sv-SE"));
    const count = actual.filter(m => Number(m.vehicleId) === Number(vehicle.id) &&
      String(m.material||"").trim().toLocaleLowerCase("sv-SE") === t.material.toLocaleLowerCase("sv-SE")).length;
    return "<div class='plan-row vehicle-plan-row' data-material='"+escapeHtml(t.material)+"'>" +
      "<div class='plan-name'><strong>"+escapeHtml(t.material)+"</strong><span>"+escapeHtml(t.category||"")+" · Finns nu: "+count+"</span></div>" +
      "<label><input class='plan-stocked' type='checkbox' "+(req?"checked":"")+"> Ska finnas</label>" +
      "<label>🟢 Exakt antal<input class='plan-required' type='number' min='0' value='"+escapeHtml(req?.required ?? 0)+"'></label>" +
      "<button class='plan-save' type='button'>SPARA</button></div>";
  }).join("");
  list.querySelectorAll(".plan-row").forEach(row => {
    const checkbox=row.querySelector(".plan-stocked"), input=row.querySelector(".plan-required");
    const sync=()=>input.disabled=!checkbox.checked; checkbox.addEventListener("change",sync); sync();
    row.querySelector(".plan-save").addEventListener("click", async () => {
      try {
        await apiPost("/vehicle-requirement/upsert", {
          vehicleId:vehicle.id, material:row.dataset.material, stocked:checkbox.checked, required:Number(input.value)
        });
        overviewData=await apiGet("/overview");
        openVehicleMaterialPlan(vehicle,label); renderHome();
      } catch(e){ alert(e.message||e); }
    });
  });
  modal.classList.remove("hidden");
}

el("closeMaterialPlanBtn")?.addEventListener("click",()=>el("materialPlanModal").classList.add("hidden"));

function renderHome() {
  el("homeLoading").style.display = "none";
  el("homeContent").style.display = "block";

  const ids = selectedStationIds();
  const stations = overviewData.stations.filter(s => ids.includes(Number(s.id)));
  const vehicles = overviewData.vehicles.filter(v => ids.includes(Number(v.stationId)));
  const vehicleIds = new Set(vehicles.map(v => Number(v.id)));
  const materialRows = overviewData.material.filter(m =>
    (m.stationId && ids.includes(Number(m.stationId))) ||
    (m.vehicleId && vehicleIds.has(Number(m.vehicleId)))
  );

  const stationStock = materialRows.filter(m => m.storageType === "Stationslager");
  const vehicleStock = materialRows.filter(m => m.storageType === "Fordon");

  el("countStations").textContent = stations.length;
  el("countStationStock").textContent = stationStock.length;
  el("countVehicleStock").textContent = vehicleStock.length;

  el("stationOverview").innerHTML = "";
  stations.forEach(station => {
    const stock = stationStock.filter(m => Number(m.stationId) === Number(station.id));
    const card = document.createElement("div");
    card.className = "overview-card";
    const levels = (overviewData.stockLevels || []).filter(x => Number(x.stationId) === Number(station.id));
    const visibleLevels = levels.filter(x => x.status !== "green");
    const levelRows = levels.map(x =>
      "<div class='level-row " + (x.status === "green" ? "overview-green-row overview-hidden-green" : "") + "'><span><i class='status-dot " + escapeHtml(x.status) + "'></i>" +
      escapeHtml(x.material) + "</span><span class='level-count'>" + escapeHtml(x.actual) +
      (x.max !== null ? "/" + escapeHtml(x.max) : "") + "</span></div>"
    ).join("");
    const levelHtml = levels.length
      ? "<div class='level-list'>" + levelRows + "</div>" +
        (levels.some(x => x.status === "green") ? "<button class='overview-expand' type='button'>VISA ALLA (" + levels.length + ")</button>" : "")
      : "";
    card.innerHTML =
      "<div><strong>" + escapeHtml(station.name) + "</strong><div class='muted small'>" +
      stock.length + " material i stationslager</div>" + levelHtml + "</div>";
    const stationExpand = card.querySelector(".overview-expand");
    if (stationExpand) stationExpand.addEventListener("click", event => {
      event.stopPropagation();
      const hidden = card.querySelectorAll(".overview-green-row");
      const expanding = [...hidden].some(row => row.classList.contains("overview-hidden-green"));
      hidden.forEach(row => row.classList.toggle("overview-hidden-green", !expanding));
      stationExpand.textContent = expanding ? "DÖLJ GRÖNA" : "VISA ALLA (" + levels.length + ")";
    });
    el("stationOverview").appendChild(card);
  });

  el("vehicleOverview").innerHTML = "";
  vehicles.forEach(vehicle => {
    const stock = vehicleStock.filter(m => Number(m.vehicleId) === Number(vehicle.id));
    const type = typeof vehicle.type === "object" ? (vehicle.type?.value || "") : (vehicle.type || "");
    const label = [vehicle.rakel, vehicle.registration].filter(Boolean).join(" – ");
    const card = document.createElement("div");
    card.className = "overview-card";
    const requirements = (overviewData.vehicleRequirements || []).filter(x => Number(x.vehicleId) === Number(vehicle.id));
    const overallStatus = requirements.length && requirements.every(x => x.status === "green") ? "green" : "red";
    const reqRows = requirements.map(x =>
      "<div class='level-row " + (x.status === "green" ? "overview-green-row overview-hidden-green" : "") + "'><span><i class='status-dot " + escapeHtml(x.status) + "'></i>" +
      escapeHtml(x.material) + "</span><span class='level-count'>" + escapeHtml(x.actual) + "/" +
      escapeHtml(x.required ?? "–") + "</span></div>"
    ).join("");
    const reqHtml = requirements.length
      ? "<div class='level-list'>" + reqRows + "</div>" +
        (requirements.some(x => x.status === "green") ? "<button class='overview-expand' type='button'>VISA ALLA (" + requirements.length + ")</button>" : "")
      : "<div class='muted small'>Inga materialkrav registrerade</div>";
    card.innerHTML =
      "<div><strong><i class='status-dot " + overallStatus + "'></i>" + escapeHtml(label || "Fordon") +
      "</strong><div class='muted small'>" + escapeHtml(type) + (type ? " • " : "") +
      stock.length + " material</div>" + reqHtml + "</div>";
    const vehicleExpand = card.querySelector(".overview-expand");
    if (vehicleExpand) vehicleExpand.addEventListener("click", event => {
      event.stopPropagation();
      const hidden = card.querySelectorAll(".overview-green-row");
      const expanding = [...hidden].some(row => row.classList.contains("overview-hidden-green"));
      hidden.forEach(row => row.classList.toggle("overview-hidden-green", !expanding));
      vehicleExpand.textContent = expanding ? "DÖLJ GRÖNA" : "VISA ALLA (" + requirements.length + ")";
    });
    el("vehicleOverview").appendChild(card);
  });

  if (!vehicles.length) {
    el("vehicleOverview").innerHTML = '<div class="muted empty">Inga fordon registrerade för valda stationer.</div>';
  }

  // Material under transport visas separat. Det räknas inte som stationslager eller fordonsmaterial.
  const transports = (overviewData.material || []).filter(m =>
    m.transportStatus === "Under transport" || m.storageType === "Transport"
  );
  const visibleTransports = transports.filter(m =>
    !m.transportDestinationId || ids.includes(Number(m.transportDestinationId))
  );

  el("countTransport").textContent = visibleTransports.length;
  el("transportOverview").innerHTML = "";

  if (!visibleTransports.length) {
    el("transportOverview").innerHTML =
      '<div class="muted empty">Inget material är under transport till valda stationer.</div>';
  } else {
    visibleTransports
      .sort((a,b) => a.materialId.localeCompare(b.materialId, "sv"))
      .forEach(item => {
        const row = document.createElement("div");
        row.className = "transport-item";
        const destination = item.transportDestination || "Destination saknas";
        row.innerHTML =
          "<div><strong>" + escapeHtml(item.materialId) + " – " + escapeHtml(item.material) +
          "</strong><div class='transport-note'>🚚 Under transport → <span class='transport-destination'>" +
          escapeHtml(destination) + "</span></div></div>" +
          "<button class='mini-button' type='button'>Öppna</button>";

        const openMaterial = () => {
          location.href = location.pathname + "?material=" + encodeURIComponent(item.materialId);
        };
        row.addEventListener("click", openMaterial);
        row.querySelector("button").addEventListener("click", event => {
          event.stopPropagation();
          openMaterial();
        });
        el("transportOverview").appendChild(row);
      });
  }
}

function showMaterialList(title, rows) {
  el("detailTitle").textContent = title;
  el("detailList").innerHTML = "";
  if (!rows.length) {
    el("detailList").innerHTML = '<div class="muted empty">Inget material.</div>';
  } else {
    rows.sort((a,b) => a.materialId.localeCompare(b.materialId, "sv")).forEach(item => {
      const div = document.createElement("div");
      div.className = "material-row";
      div.innerHTML = "<strong>" + escapeHtml(item.materialId) + "</strong><span>" +
        escapeHtml(item.material) + (item.comment ? " • " + escapeHtml(item.comment) : "") +
        "</span><span class='muted small'>Tryck för att öppna materialet</span>";
      div.tabIndex = 0;
      div.setAttribute("role", "button");
      const openMaterial = () => {
        location.href = location.pathname + "?material=" + encodeURIComponent(item.materialId);
      };
      div.addEventListener("click", openMaterial);
      div.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openMaterial();
        }
      });
      el("detailList").appendChild(div);
    });
  }
  el("detailPanel").classList.add("active");
  el("detailPanel").scrollIntoView({behavior:"smooth", block:"start"});
}

function openSettings() {
  renderStationSettings();
  el("settingsPanel").classList.add("active");
  el("settingsPanel").scrollIntoView({behavior:"smooth", block:"start"});
}

function saveSettingsFromUi() {
  const all = el("allStations").checked;
  const ids = [...el("stationChecks").querySelectorAll("input:checked")].map(x => Number(x.value));
  if (!all && ids.length === 0) {
    alert("Välj minst en station eller Alla stationer.");
    return;
  }
  saveStationSelection({all, ids: all ? [] : ids});
  el("settingsPanel").classList.remove("active");
  renderStationSettings();
  renderHome();
}


function populateAddMaterialForm() {
  const stationSelect = el("newMaterialStation");
  stationSelect.innerHTML = "";

  const savedIds = selectedStationIds();
  const orderedStations = [...overviewData.stations].sort((a, b) => {
    const aSelected = savedIds.includes(Number(a.id)) ? 0 : 1;
    const bSelected = savedIds.includes(Number(b.id)) ? 0 : 1;
    return aSelected - bSelected || a.name.localeCompare(b.name, "sv");
  });

  orderedStations.forEach(station => {
    const option = document.createElement("option");
    option.value = station.id;
    option.textContent = station.name;
    stationSelect.appendChild(option);
  });

  const categories = [...new Set(
    overviewData.material.map(item => item.category).filter(Boolean)
  )].sort((a,b) => a.localeCompare(b, "sv"));

  el("categorySuggestions").innerHTML = "";
  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = category;
    el("categorySuggestions").appendChild(option);
  });
}

function openAddMaterial() {
  populateAddMaterialForm();
  el("createMaterialMessage").className = "message";
  el("createdQr").style.display = "none";
  el("addMaterialPanel").classList.add("active");
  el("addMaterialPanel").scrollIntoView({behavior:"smooth", block:"start"});
}

function closeAddMaterial() {
  el("addMaterialPanel").classList.remove("active");
}

async function createMaterial() {
  const materialName = el("newMaterialName").value.trim();
  const category = el("newMaterialCategory").value.trim();
  const stationId = Number(el("newMaterialStation").value);
  const comment = el("newMaterialComment").value.trim();

  if (!materialName) {
    alert("Ange material.");
    el("newMaterialName").focus();
    return;
  }
  if (!category) {
    alert("Ange kategori.");
    el("newMaterialCategory").focus();
    return;
  }
  if (!Number.isInteger(stationId) || stationId <= 0) {
    alert("Välj station.");
    return;
  }

  const station = overviewData.stations.find(s => Number(s.id) === stationId);
  const stationName = station?.name || "vald station";

  if (!confirm("Skapa nytt brandmaterial och placera det i " + stationName + "?")) {
    return;
  }

  el("createMaterialBtn").disabled = true;
  el("createMaterialMessage").className = "message info active";
  el("createMaterialMessage").innerHTML = "<strong>Sparar…</strong><br>Skapar nytt brandmaterial.";

  try {
    const response = await fetch(API + "/material", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({material: materialName, category, comment, stationId})
    });

    let data;
    try { data = await response.json(); }
    catch { throw new Error("API:t gav ett ogiltigt svar."); }

    if (!response.ok) {
      throw new Error(data.message || data.error || "Materialet kunde inte skapas.");
    }

    el("createMaterialMessage").className = "message success-box active";
    el("createMaterialMessage").innerHTML =
      "<strong>✓ " + escapeHtml(data.materialId) + " har skapats.</strong><br>" +
      escapeHtml(data.message || "");

    const materialUrl =
      location.origin + location.pathname + "?material=" + encodeURIComponent(data.materialId);
    el("createdQrId").textContent = data.materialId;
    window.lastCreatedMaterialName = materialName;
    el("createdQrImage").src =
      "https://quickchart.io/qr?size=300&ecLevel=H&margin=2&text=" + encodeURIComponent(materialUrl);
    el("createdQr").style.display = "block";

    el("newMaterialName").value = "";
    el("newMaterialCategory").value = "";
    el("newMaterialComment").value = "";

    overviewData = await apiGet("/overview");
    renderStationSettings();
    renderHome();
    populateAddMaterialForm();
  } catch (err) {
    el("createMaterialMessage").className = "message error active";
    el("createMaterialMessage").innerHTML =
      "<strong>Kunde inte skapa materialet.</strong><br>" + escapeHtml(err.message);
  } finally {
    el("createMaterialBtn").disabled = false;
  }
}


function printMaterialLabel(materialId, materialName) {
  if (!materialId) return;

  const materialUrl =
    location.origin + location.pathname + "?material=" + encodeURIComponent(materialId);

  // Hög felkorrigering för att tåla det vita textfältet i QR-kodens centrum.
  const qrSrc =
    "https://quickchart.io/qr?size=500&ecLevel=H&margin=2&text=" +
    encodeURIComponent(materialUrl);

  const safeId = escapeHtml(materialId);
  const safeName = escapeHtml(materialName || "");

  const w = window.open("", "_blank", "width=520,height=620");
  if (!w) {
    alert("Webbläsaren blockerade utskriftsfönstret. Tillåt popup-fönster och försök igen.");
    return;
  }

  w.document.write(`<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<title>${safeId} – QR-etikett</title>
<style>
  @page { size: 40mm 40mm; margin: 2mm; }
  html,body { margin:0; padding:0; font-family:Arial,Helvetica,sans-serif; background:#fff; }
  .label {
    width:36mm; height:36mm;
    display:flex; align-items:center; justify-content:center;
    overflow:hidden;
  }
  .qr {
    width:34mm; height:34mm;
    position:relative;
  }
  .qr img {
    width:34mm; height:34mm;
    display:block;
    image-rendering:pixelated;
  }
  .qrtext {
    position:absolute;
    left:50%; top:50%;
    transform:translate(-50%,-50%);
    background:#fff;
    color:#000;
    text-align:center;
    padding:0.8mm 1mm;
    line-height:1.05;
    white-space:nowrap;
    font-weight:700;
    max-width:19mm;
  }
  .id { font-size:6.5pt; }
  .name {
    font-size:6pt;
    margin-top:.5mm;
    overflow:hidden;
    text-overflow:ellipsis;
    max-width:17mm;
  }
</style>
</head>
<body>
  <div class="label">
    <div class="qr">
      <img src="${qrSrc}" alt="QR-kod">
      <div class="qrtext">
        <div class="id">${safeId}</div>
        <div class="name">${safeName}</div>
      </div>
    </div>
  </div>
<script>
window.onload = () => setTimeout(() => window.print(), 500);
<\/script>
</body>
</html>`);
  w.document.close();
}

function printConsumableShelfQr() {
  if (!currentConsumable) return;
  const articleId = currentConsumable.articleId || consumable;
  const articleName = currentConsumable.article || "";
  const station = currentConsumable.station || "";
  const qrUrl = location.origin + location.pathname + "?forbrukning=" + encodeURIComponent(articleId);
  const qrSrc = "https://quickchart.io/qr?size=700&ecLevel=H&margin=2&text=" + encodeURIComponent(qrUrl);
  const w = window.open("", "_blank", "width=700,height=800");
  if (!w) { alert("Webbläsaren blockerade utskriftsfönstret. Tillåt popup-fönster och försök igen."); return; }
  w.document.write(`<!DOCTYPE html><html lang="sv"><head><meta charset="UTF-8"><title>${escapeHtml(articleId)} – Hyll-QR</title><style>
  @page{size:A6 portrait;margin:8mm}body{margin:0;font-family:Arial,Helvetica,sans-serif;text-align:center;color:#111}.label{border:2px solid #2a3768;padding:8mm}.title{font-size:22pt;font-weight:700;margin:0 0 2mm}.station{font-size:13pt;margin-bottom:5mm}.qr{width:75mm;height:75mm;margin:0 auto}.qr img{width:100%;height:100%;display:block}.id{font-size:14pt;font-weight:700;margin-top:4mm}.hint{font-size:11pt;margin-top:3mm}
  </style></head><body><div class="label"><div class="title">${escapeHtml(articleName)}</div><div class="station">${escapeHtml(station)}</div><div class="qr"><img src="${qrSrc}" alt="QR-kod"></div><div class="id">${escapeHtml(articleId)}</div><div class="hint">Skanna för uttag eller påfyllning</div></div><script>window.onload=()=>setTimeout(()=>window.print(),500);<\/script></body></html>`);
  w.document.close();
}

el("printConsumableQrBtn")?.addEventListener("click", printConsumableShelfQr);

function printCreatedQr() {
  printMaterialLabel(
    el("createdQrId").textContent.trim(),
    window.lastCreatedMaterialName || ""
  );
}

function printExistingQr() {
  printMaterialLabel(
    el("materialId").textContent.trim() || material,
    el("materialName").textContent.trim()
  );
}

el("printQrBtn")?.addEventListener("click", printCreatedQr);
el("printExistingQrBtn")?.addEventListener("click", printExistingQr);

el("addMaterialBtn")?.addEventListener("click", openAddMaterial);
el("closeAddMaterialBtn")?.addEventListener("click", closeAddMaterial);
el("cancelAddMaterialBtn")?.addEventListener("click", closeAddMaterial);
el("createMaterialBtn")?.addEventListener("click", createMaterial);

el("settingsBtn")?.addEventListener("click", openSettings);
el("closeSettingsBtn")?.addEventListener("click", () => el("settingsPanel").classList.remove("active"));
el("saveSettingsBtn")?.addEventListener("click", saveSettingsFromUi);
el("closeDetailBtn")?.addEventListener("click", () => el("detailPanel").classList.remove("active"));
el("allStations")?.addEventListener("change", () => {
  const all = el("allStations").checked;
  el("stationChecks").querySelectorAll("input").forEach(input => {
    input.disabled = all;
    if (all) input.checked = true;
    else input.checked = false;
  });
});

if (el("stockOrders")) loadOrders();


// Excel-knappar: explicit init efter att hela sidan och appen är laddad.
(function initExcelButtons() {
  const importBtn = document.getElementById("importExcelBtn");
  const exportBtn = document.getElementById("exportExcelBtn");
  const templateBtn = document.getElementById("downloadTemplateBtn");
  const fileInput = document.getElementById("excelFileInput");

  function requireXlsx() {
    if (typeof XLSX === "undefined") {
      alert("Excel-funktionen kunde inte laddas. Ladda om sidan och försök igen.");
      return false;
    }
    return true;
  }

  if (importBtn && fileInput) {
    importBtn.onclick = function() {
      if (!requireXlsx()) return;
      fileInput.value = "";
      fileInput.click();
    };
  }

  if (exportBtn) {
    exportBtn.onclick = async function() {
      if (!requireXlsx()) return;
      const msg = document.getElementById("excelMessage");
      try {
        msg.className = "message info active";
        msg.textContent = "Skapar Excel-export…";

        const currentOverview = await apiGet("/overview");
        const materials = currentOverview.material || [];
        const rows = [];

        for (const m of materials) {
          let full = {};
          try { full = await apiGet("/material/" + encodeURIComponent(m.materialId)); } catch (_) {}
          const linkValue = key =>
            Array.isArray(full[key]) && full[key][0]?.value ? String(full[key][0].value) : "";

          rows.push({
            "Material-ID": m.materialId || "",
            "Material": m.material || "",
            "Kategori": m.category || "",
            "Station": linkValue("Station"),
            "Rakelnummer": linkValue("Rakelnummer") || m.rakel || "",
            "Registreringsnummer": linkValue("Registreringsnummer"),
            "Kommentar": full["Kommentar"] || m.comment || "",
            "Aktiv": full["Aktiv"] === false ? false : true,
            "Transportstatus": full["Transportstatus"]?.value || full["Transportstatus"] || m.transportStatus || "",
            "Transport till station": linkValue("Transport till station") || m.transportDestination || ""
          });
        }

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows, {header: EXCEL_COLUMNS});
        ws["!cols"] = EXCEL_COLUMNS.map((_,i) => ({wch:[18,24,20,18,16,24,36,12,20,24][i]}));
        XLSX.utils.book_append_sheet(wb, ws, "Brandmaterial");
        XLSX.writeFile(wb, "Brandmaterial_export_" + new Date().toISOString().slice(0,10) + ".xlsx");

        msg.className = "message info active";
        msg.textContent = "✓ Excel-export skapad.";
      } catch (err) {
        msg.className = "message error active";
        msg.textContent = "Exporten misslyckades: " + (err.message || err);
      }
    };
  }

  if (templateBtn) {
    templateBtn.onclick = function() {
      try {
        const base64Data = "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";
        const binary = atob(base64Data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const blob = new Blob([bytes], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "Brandmaterial_importmall.xlsx";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (err) {
        alert("Mallen kunde inte laddas ner: " + (err.message || err));
      }
    };
  }
})();

