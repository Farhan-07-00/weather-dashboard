
const $ = (sel) => document.querySelector(sel);
const fmtInt = (n) => Math.round(n).toString();
const toKmh = (ms) => (ms * 3.6).toFixed(0);
const toMph = (ms) => (ms * 2.23694).toFixed(0);
const dtFmt = (ts, tz) => new Date((ts + tz) * 1000);
const pad = (n) => String(n).padStart(2, "0");

// State
const state = {
  map: null,
  marker: null,
  overlay: null,
  units: localStorage.getItem("units") || "metric",
  last: JSON.parse(localStorage.getItem("lastCoord") || "null") || {
    lat: 12.9716,
    lon: 77.5946,
  }, // Bengaluru default
  lastName: localStorage.getItem("lastName") || "Bengaluru, IN",
  theme: localStorage.getItem("theme") || "night",
  chart: null,
};

// Theme handling
function applyTheme() {
  const isDay = state.theme === "day";
  document.body.classList.toggle("day", isDay);
  const btn = $("#btnTheme");
  btn.textContent = isDay ? "☀️ Day" : "🌙 Night";
  btn.setAttribute("aria-pressed", String(isDay));
}

$("#btnTheme").addEventListener("click", () => {
  state.theme = state.theme === "day" ? "night" : "day";
  localStorage.setItem("theme", state.theme);
  applyTheme();
});
applyTheme();

// Init units UI
$("#units").value = state.units;

// Map init
const map = L.map("map", { zoomControl: true });
state.map = map;
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

// Weather overlay function
function setWeatherLayer(layerId) {
  if (state.overlay) {
    state.map.removeLayer(state.overlay);
    state.overlay = null;
  }
  if (!layerId) return;
  const url = `https://tile.openweathermap.org/map/${layerId}/{z}/{x}/{y}.png?appid=${OPENWEATHER_API_KEY}`;
  const opacity = parseFloat($("#layerOpacity").value || "0.7");
  state.overlay = L.tileLayer(url, {
    opacity,
    attribution: "Weather tiles © OpenWeather",
  });
  state.overlay.addTo(state.map);
}

$("#layerSelect").addEventListener("change", (e) =>
  setWeatherLayer(e.target.value)
);

$("#layerOpacity").addEventListener("input", (e) => {
  if (state.overlay) {
    state.overlay.setOpacity(parseFloat(e.target.value));
  }
});

// Marker helpers
function setMarker(lat, lon, label) {
  if (state.marker) state.map.removeLayer(state.marker);
  state.marker = L.marker([lat, lon])
    .addTo(state.map)
    .bindPopup(label || "")
    .openPopup();
}

// API helpers
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error("API error " + r.status);
  return r.json();
}

async function geocodeCity(q) {
  const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
    q
  )}&limit=1&appid=${OPENWEATHER_API_KEY}`;
  const [hit] = await getJSON(url);
  if (!hit) throw new Error("City not found");
 return {
  lat: hit.lat,
  lon: hit.lon,
  name: `${hit.name}, ${hit.country}`
};
}

async function reverseGeocode(lat, lon) {
  const url = `https://api.openweathermap.org/geo/1.0/reverse?lat=${lat}&lon=${lon}&limit=1&appid=${OPENWEATHER_API_KEY}`;
  const [hit] = await getJSON(url);
  if (hit) {
    return `${hit.name}${hit.state ? ", " + hit.state : ""}, ${hit.country}`;
  }
  return `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
}

async function fetchAll(lat, lon) {
  const units = state.units;
  const cur = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${OPENWEATHER_API_KEY}`;
  const fc = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${OPENWEATHER_API_KEY}`;
  const aqi = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}`;
  const [cw, fw, aq] = await Promise.all([
    getJSON(cur),
    getJSON(fc),
    getJSON(aqi),
  ]);
  return { cw, fw, aq };
}

// UI update
function weatherEmoji(id) {
  if (id >= 200 && id < 300) return "⛈️";
  if (id >= 300 && id < 600) return "🌧️";
  if (id >= 600 && id < 700) return "❄️";
  if (id === 711) return "🌫️";
  if (id >= 700 && id < 800) return "🌁";
  if (id === 800) return "☀️";
  if (id === 801) return "🌤️";
  if (id === 802) return "⛅";
  if (id >= 803) return "☁️";
  return "🌡️";
}

function setCurrent(cw) {
  const u = state.units;
  $("#city").textContent = state.lastName;
  $("#temp").textContent = `${fmtInt(cw.main.temp)}°${u === "metric" ? "C" : "F"
    }`;

  $("#desc").textContent = cw.weather?.[0]?.description || "";
  $("#wIcon").textContent = weatherEmoji(cw.weather?.[0]?.id || 800);
  $("#heroIcon").textContent =
  weatherEmoji(cw.weather?.[0]?.id || 800);

$("#heroTemp").textContent =
  `${fmtInt(cw.main.temp)}°`;

$("#heroCity").textContent =
  state.lastName || `${cw.name}, ${cw.sys.country}`;

$("#heroFeels").textContent =
  `Feels like ${fmtInt(cw.main.feels_like)}°`;

$("#heroDesc").textContent =
  cw.weather?.[0]?.description || "";
  setDynamicBackground(cw.weather?.[0]?.main);

  $("#feels").textContent = `${fmtInt(cw.main.feels_like)}°`;
  $("#hum").textContent = `${cw.main.humidity}%`;
  const wind =
    u === "imperial"
      ? `${toMph(cw.wind.speed)} mph`
      : `${toKmh(cw.wind.speed)} km/h`;
  $("#wind").textContent = `${wind} ${cw.wind.deg != null ? "• " + cw.wind.deg + "°" : ""
    }`;
  $("#press").textContent = `${cw.main.pressure} hPa`;
  $("#vis").textContent = `${(cw.visibility / 1000).toFixed(1)} km`;

const tz = cw.timezone || 0;

$("#localTime").textContent =
  `${formatLocalTime(tz)} GMT${tz >= 0 ? "+" : ""}${(tz / 3600).toFixed(0)}`;

  // Weather Facts
  $("#maxTemp").textContent = `${fmtInt(cw.main.temp_max)}°`;
  $("#minTemp").textContent = `${fmtInt(cw.main.temp_min)}°`;
  $("#factHumidity").textContent = `${cw.main.humidity}%`;
  $("#factWind").textContent = `${toKmh(cw.wind.speed)} km/h`;

}

function updateClothingRecommendation(cw) {
  const temp = cw.main.temp;
  const weather = cw.weather?.[0]?.main || "";

  let tips = [];

  if (temp >= 35) {
    tips = [
      "👕 T-Shirt",
      "🧢 Cap",
      "🕶️ Sunglasses",
      "💧 Carry Water"
    ];
  } else if (temp >= 25) {
    tips = [
      "👕 Light Clothing",
      "🕶️ Sunglasses",
      "👟 Comfortable Shoes"
    ];
  } else if (temp >= 15) {
    tips = [
      "👔 Full Sleeves",
      "👖 Jeans",
      "👟 Sneakers"
    ];
  } else {
    tips = [
      "🧥 Jacket",
      "🧣 Scarf",
      "🧤 Warm Clothing"
    ];
  }

  if (weather === "Rain") {
    tips.push("☔ Umbrella");
  }

  document.getElementById("clothingTips").innerHTML =
    tips.map(item => `<p>${item}</p>`).join("");
}
function updateActivityScores(cw) {

  let running = 10;
  let cycling = 10;
  let outdoor = 10;
  let photo = 8;

  const temp = cw.main.temp;
  const weather = cw.weather?.[0]?.main;

  if (temp > 35) {
    running -= 3;
    cycling -= 2;
    outdoor -= 3;
  }

  if (
    weather === "Rain" ||
    weather === "Drizzle" ||
    weather === "Thunderstorm"
  ) {
    running -= 4;
    cycling -= 5;
    outdoor -= 5;
    photo += 1;
  }

  if (weather === "Clear") {
    photo += 1;
  }

  running = Math.max(1, running);
  cycling = Math.max(1, cycling);
  outdoor = Math.max(1, outdoor);
  photo = Math.min(10, photo);

  $("#runScore").textContent = `${running}/10`;
  $("#cycleScore").textContent = `${cycling}/10`;
  $("#outdoorScore").textContent = `${outdoor}/10`;
  $("#photoScore").textContent = `${photo}/10`;
}

function setDynamicBackground(weather){

  clearWeatherEffects();

  if(weather === "Clouds"){
    createClouds();
  }

  if(
    weather === "Rain" ||
    weather === "Drizzle" ||
    weather === "Thunderstorm"
  ){
    createRain();
  }

  if(weather === "Snow"){
    createSnow();
  }

  if(weather === "Clear"){
    createSunGlow();
  }
}

function clearWeatherEffects() {
  document.getElementById("weatherEffects").innerHTML = "";
}

function createRain() {

  const c = document.getElementById("weatherEffects");

  for(let i=0;i<120;i++){

    const drop = document.createElement("div");

    drop.className = "rain-drop";

    drop.style.left = Math.random()*100+"vw";

    drop.style.animationDuration =
      (0.6 + Math.random())+"s";

    c.appendChild(drop);
  }
}

function createSnow() {

  const c = document.getElementById("weatherEffects");

  for(let i=0;i<60;i++){

    const flake = document.createElement("div");

    flake.className = "snowflake";

    flake.innerHTML = "❄";

    flake.style.left = Math.random()*100+"vw";

    flake.style.fontSize =
      (10 + Math.random()*15)+"px";

    flake.style.animationDuration =
      (4 + Math.random()*6)+"s";

    c.appendChild(flake);
  }
}

function createClouds(){

  const c = document.getElementById("weatherEffects");

  for(let i=0;i<8;i++){

    const cloud = document.createElement("div");

    cloud.className = "cloud";

    cloud.innerHTML = "☁️";

    cloud.style.top =
      Math.random()*40+"%";

    cloud.style.animationDelay =
      Math.random()*20+"s";

    c.appendChild(cloud);
  }
}

function createSunGlow(){

  const c = document.getElementById("weatherEffects");

  const sun = document.createElement("div");

  sun.className = "sun-glow";

  c.appendChild(sun);


}

function setAQI(aq) {
  const val = aq?.list?.[0]?.main?.aqi || 0;
  const comps = aq?.list?.[0]?.components || {};
  const label =
    ["—", "Good", "Fair", "Moderate", "Poor", "Very Poor"][val] || "—";
  const bg =
    ["#0b1220", "#065f46", "#065f46", "#92400e", "#7f1d1d", "#7f1d1d"][val] ||
    "#0b1220";
  const fg =
    ["#e5e7eb", "#a7f3d0", "#a7f3d0", "#fde68a", "#fecaca", "#fecaca"][val] ||
    "#e5e7eb";
  const el = $("#aqiBadge");
  el.textContent = `AQI ${val || "—"} — ${label}`;
  el.style.background = bg;
  el.style.color = fg;
  el.style.borderColor = "var(--border)";

  // components in μg/m3 (CO is mg/m3 in API docs; convert to μg/m3 *1000)
  $("#pm25").textContent = comps.pm2_5 != null ? comps.pm2_5.toFixed(1) : "—";
  $("#pm10").textContent = comps.pm10 != null ? comps.pm10.toFixed(1) : "—";
  $("#no2").textContent = comps.no2 != null ? comps.no2.toFixed(1) : "—";
  $("#o3").textContent = comps.o3 != null ? comps.o3.toFixed(1) : "—";
  $("#so2").textContent = comps.so2 != null ? comps.so2.toFixed(1) : "—";
  $("#co").textContent = comps.co != null ? (comps.co * 1).toFixed(1) : "—";
}

function generateAnalysis(cw, aq) {

  let analysis = [];

  const temp = cw.main.temp;
  const aqi = aq?.list?.[0]?.main?.aqi || 1;
  const humidity = cw.main.humidity;

  if(temp > 35)
    analysis.push("🔥 High temperature detected.");

  if(temp < 10)
    analysis.push("🥶 Cold weather conditions.");

  if(aqi >= 4)
    analysis.push("🌫 Air quality is poor.");

  if(humidity > 80)
    analysis.push("💧 Humidity levels are high.");

  if(analysis.length === 0)
    analysis.push("✅ Weather conditions are stable.");

  document.getElementById("recommendation").innerHTML =
    analysis.join("<br>");
}

function updateSunJourney(cw) {

  const sunrise = cw.sys.sunrise;
  const sunset = cw.sys.sunset;

  // Current time in city's timezone
  const nowUTC = Math.floor(Date.now() / 1000);
  const nowCity = nowUTC + new Date().getTimezoneOffset() * 60 + cw.timezone;

  const totalDay = sunset - sunrise;
  const elapsed = nowCity - sunrise;

  let progress = (elapsed / totalDay) * 100;

  progress = Math.max(0, Math.min(100, progress));

  document.getElementById("sunDot").style.left =
    `calc(${progress}% - 14px)`;

  function formatTime(timestamp, timezone) {
    return new Date((timestamp + timezone) * 1000)
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC"
      });
  }

  document.getElementById("sunriseText").textContent =
    formatTime(sunrise, cw.timezone);

  document.getElementById("sunsetText").textContent =
    formatTime(sunset, cw.timezone);
    


}

function generateSuggestions(cw, aq) {

  const tips = [];

  const temp = cw.main.temp;
  const weather = cw.weather[0].main;
  const aqi = aq?.list?.[0]?.main?.aqi || 1;

  if(weather === "Rain" || weather === "Drizzle")
    tips.push("☔ Carry an umbrella.");

  if(temp > 35)
    tips.push("🥤 Stay hydrated.");

  if(temp < 10)
    tips.push("🧥 Wear warm clothing.");

  if(aqi >= 4)
    tips.push("😷 Wear a mask outdoors.");

  if(temp > 30)
    tips.push("🧴 Apply sunscreen.");

  if(tips.length === 0)
    tips.push("✅ No special precautions needed today.");

  document.getElementById("weatherTips").innerHTML =
    tips.map(t => `<p>${t}</p>`).join("");
}

function formatLocalTime(timezone) {
  return new Date(Date.now() + timezone * 1000)
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "UTC"
    });
}

function updateVideoBackground(weather) {

  const video = document.getElementById("bgVideo");

  let file = "videos/sunny.mp4";

  if (weather === "Clear")
    file = "videos/sunny.mp4";

  else if (weather === "Clouds")
    file = "videos/overcast.mp4";

  else if (
    weather === "Rain" ||
    weather === "Drizzle" ||
    weather === "Thunderstorm"
  )
    file = "videos/rain.mp4";

  else if (weather === "Snow")
    file = "videos/snow.mp4";

  video.src = file;

  video.load();

  video.play();
}

function setForecast(fw) {
  // Build hourly (next 24h) from 3h steps
  const hours = fw.list.slice(0, 8); // 8 * 3h = 24h
  const labels = hours.map((x) => x.dt_txt.slice(11, 16));
  const temps = hours.map((x) => x.main.temp);

  if (state.chart) {
    state.chart.destroy();
  }
  const ctx = document.getElementById("hourlyChart");
  state.chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{ label: "Temp", data: temps, tension: 0.35, fill: true }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: "rgba(0,0,0,.15)" } },
      },
    },
  });

  // Build 5-day summary
  const byDay = {};
  for (const item of fw.list) {
    const d = item.dt_txt.slice(0, 10);
    byDay[d] = byDay[d] || { temps: [], icons: [] };
    byDay[d].temps.push(item.main.temp);
    byDay[d].icons.push(item.weather?.[0]?.id || 800);
  }
  const days = Object.entries(byDay).slice(0, 5);
  const fc = $("#forecast");
  fc.innerHTML = "";
  for (const [date, obj] of days) {
    const tmin = Math.min(...obj.temps);
    const tmax = Math.max(...obj.temps);
    // choose most frequent icon id
    const counts = obj.icons.reduce(
      (m, v) => ((m[v] = (m[v] || 0) + 1), m),
      {}
    );
    const id = Object.entries(counts)
      .sort((a, b) => a[1] - b[1])
      .pop()[0];
    const d = new Date(date);
    const day = d.toLocaleDateString(undefined, { weekday: "short" });
    const el = document.createElement("div");
    el.className = "fcard";
    el.innerHTML = `<div class="day">${day}</div><div class="ix">${weatherEmoji(
      Number(id)
    )}</div><div>${fmtInt(tmin)}° / ${fmtInt(tmax)}°</div>`;
    fc.appendChild(el);
  }
}
function hideWelcomeScreen() {
  const el = document.getElementById("welcomeScreen");

  if (el) {
    el.classList.add("hidden");
  }
}
async function updateAll(lat, lon, label) {
  try {
    const { cw, fw, aq } = await fetchAll(lat, lon);
    console.log("Temp =", cw.main.temp);
    console.log("Feels =", cw.main.feels_like);
    console.log("Lat =", cw.coord.lat);
    console.log("Lon =", cw.coord.lon);
    console.log("City =", cw.name);

    // MOVE THIS UP
    const name = label || `${cw.name}, ${cw.sys.country}`;
    state.lastName = name;

    setCurrent(cw);

    setAQI(aq);
    setForecast(fw);
    updateSunJourney(cw);
    generateAnalysis(cw, aq);
    generateSuggestions(cw, aq);
    updateActivityScores(cw);
    updateVideoBackground(cw.weather?.[0]?.main);
    updateClothingRecommendation(cw);
    hideWelcomeScreen();

    state.map.setView([lat, lon], 10);
    setMarker(lat, lon, name);

    state.last = { lat, lon };
    localStorage.setItem("lastCoord", JSON.stringify(state.last));

    localStorage.setItem("lastName", name);

  } catch (err) {
    alert(
      "Failed to load weather data. Check your API key and network.\n" +
      err.message
    );
  }
}

// Events
$("#btnSearch").addEventListener("click", async () => {
  const q = $("#q").value.trim();
  if (!q) return;

  hideWelcomeScreen();

  try {
    const g = await geocodeCity(q);
    await updateAll(g.lat, g.lon, g.name);
  } catch (err) {
    alert(err.message);
  }
});

$("#q").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("#btnSearch").click();
});

document
  .getElementById("focusSearch")
  ?.addEventListener("click", () => {

    hideWelcomeScreen();

    setTimeout(() => {
      document.getElementById("q").focus();
    }, 100);

});

document
  .getElementById("welcomeLocation")
  ?.addEventListener("click", () => {

    $("#btnLocate").click();

});
let favorites = JSON.parse(localStorage.getItem("favorites")) || [];

function renderFavorites() {
  const container = document.getElementById("favorites");

  if (!container) return;

  container.innerHTML = "";

  favorites.forEach((city, index) => {

    const wrapper = document.createElement("div");
    wrapper.className = "fav-item";

    const cityBtn = document.createElement("button");
    cityBtn.className = "btn";
    cityBtn.textContent = city;

    cityBtn.onclick = async () => {
      const g = await geocodeCity(city);
      updateAll(g.lat, g.lon, city);
    };

    const removeBtn = document.createElement("button");
    removeBtn.className = "fav-remove";
    removeBtn.innerHTML = "✖";

    removeBtn.onclick = () => {
      favorites.splice(index, 1);

      localStorage.setItem(
        "favorites",
        JSON.stringify(favorites)
      );

      renderFavorites();
    };

    wrapper.appendChild(cityBtn);
    wrapper.appendChild(removeBtn);

    container.appendChild(wrapper);
  });
}
// Voice Search
const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  const recognition = new SpeechRecognition();

  recognition.lang = "en-US";
  recognition.continuous = false;

  $("#btnVoice").addEventListener("click", () => {
    recognition.start();
  });

  recognition.onresult = (event) => {
    const city = event.results[0][0].transcript;
    $("#q").value = city;
    $("#btnSearch").click();
  };

  recognition.onerror = (event) => {
    alert("Voice recognition error: " + event.error);
  };
}

$("#saveCity").addEventListener("click", () => {
 const city = $("#q").value.trim();

  if (!city || city === "—") return;

  if (!favorites.includes(city)) {
    favorites.push(city);
    localStorage.setItem("favorites", JSON.stringify(favorites));
    renderFavorites();
  }
});

$("#btnLocate").addEventListener("click", () => {
  if (!navigator.geolocation)
    return alert("Geolocation not supported on this browser.");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      const name = await reverseGeocode(lat, lon);
      updateAll(lat, lon, name);
    },
    (err) => alert("Location error: " + err.message),
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

$("#units").addEventListener("change", () => {
  state.units = $("#units").value;
  localStorage.setItem("units", state.units);
  if (state.last) updateAll(state.last.lat, state.last.lon, state.lastName);
});

state.map?.on?.("click", async (ev) => {
  const { lat, lng } = ev.latlng;
  const name = await reverseGeocode(lat, lng);
  updateAll(lat, lng, name);
});

// Kick off — last viewed location
(async function init() {

  renderFavorites();

  map.setView([20, 78], 4);

  setWeatherLayer($("#layerSelect").value);

})();