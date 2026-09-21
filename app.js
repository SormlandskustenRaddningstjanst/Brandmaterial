const API = "https://ros-material-api.peter-hasselberg.workers.dev";

const params = new URLSearchParams(location.search);
const material = (params.get("material") || "").trim().toUpperCase();

const el = id => document.getElementById(id);

if (material) {
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
    throw new Error(data.error || data.message || "API-fel");
  }
  return data;
}

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
    const levelHtml = levels.length ? "<div class='level-list'>" + levels.map(x =>
      "<div class='level-row'><span><i class='status-dot " + escapeHtml(x.status) + "'></i>" +
      escapeHtml(x.material) + "</span><span class='level-count'>" + escapeHtml(x.actual) +
      (x.max !== null ? "/" + escapeHtml(x.max) : "") + "</span></div>"
    ).join("") + "</div>" : "";
    card.innerHTML =
      "<div><strong>" + escapeHtml(station.name) + "</strong><div class='muted small'>" +
      stock.length + " material i stationslager</div>" + levelHtml + "</div>" +
      "<button class='mini-button' type='button'>Visa</button>";
    card.querySelector("button").addEventListener("click", () =>
      showMaterialList(station.name, stock)
    );
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
    const reqHtml = requirements.length ? "<div class='level-list'>" + requirements.map(x =>
      "<div class='level-row'><span><i class='status-dot " + escapeHtml(x.status) + "'></i>" +
      escapeHtml(x.material) + "</span><span class='level-count'>" + escapeHtml(x.actual) + "/" +
      escapeHtml(x.required ?? "–") + "</span></div>"
    ).join("") + "</div>" : "<div class='muted small'>Inga materialkrav registrerade</div>";
    card.innerHTML =
      "<div><strong><i class='status-dot " + overallStatus + "'></i>" + escapeHtml(label || "Fordon") +
      "</strong><div class='muted small'>" + escapeHtml(type) + (type ? " • " : "") +
      stock.length + " material</div>" + reqHtml + "</div>" +
      "<button class='mini-button' type='button'>Visa</button>";
    card.querySelector("button").addEventListener("click", () =>
      showMaterialList(label || "Fordon", stock)
    );
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
