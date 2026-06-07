const DEFAULT_TEAMS = [
  { name: "Real Madrid", pot: 1 },
  { name: "Manchester City", pot: 1 },
  { name: "PSG", pot: 1 },
  { name: "Bayern Munich", pot: 1 },
  { name: "Inter Milan", pot: 1 },
  { name: "Arsenal", pot: 1 },
  { name: "Barcelona", pot: 1 },
  { name: "Liverpool", pot: 1 },
  { name: "Chelsea", pot: 1 },

  { name: "Manchester United", pot: 2 },
  { name: "Borussia Dortmund", pot: 2 },
  { name: "Porto", pot: 2 },
  { name: "Aston Villa", pot: 2 },
  { name: "Bayer Leverkusen", pot: 2 },
  { name: "Napoli", pot: 2 },
  { name: "Benfica", pot: 2 },
  { name: "Atletico Madrid", pot: 2 },
  { name: "Real Betis", pot: 2 },

  { name: "Feyenoord", pot: 3 },
  { name: "RB Leipzig", pot: 3 },
  { name: "Shakhtar Donetsk", pot: 3 },
  { name: "Galatasaray", pot: 3 },
  { name: "Villarreal", pot: 3 },
  { name: "Lille", pot: 3 },
  { name: "Sporting CP", pot: 3 },
  { name: "AC Milan", pot: 3 },
  { name: "Juventus", pot: 3 },

  { name: "RB Salzburg", pot: 4 },
  { name: "Celtic", pot: 4 },
  { name: "Olympiacos", pot: 4 },
  { name: "Dinamo Zagreb", pot: 4 },
  { name: "Union Berlin", pot: 4 },
  { name: "Stuttgart", pot: 4 },
  { name: "Lazio", pot: 4 },
  { name: "Roma", pot: 4 },
  { name: "Braga", pot: 4 }
];

const MATCHDAYS = 8;
const KO_ROUNDS = ["playoffs", "roundOf16", "quarterFinal", "semiFinal", "final"];
const SEASONS_STORAGE_KEY = "ucl_saved_seasons_v1";

let teams = DEFAULT_TEAMS.map(t => ({ ...t }));
let fixtures = [];
let currentMatchday = 1;

let currentPage = "league";
let savedResults = {};
let knockoutState = null;
let currentRound = null;
let savedKnockout = {};
let currentSeasonId = null;

/* ---------------- HELPERS ---------------- */

function cloneData(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function getPot(team) {
  return teams.find(t => t.name === team)?.pot ?? 4;
}

function pairKey(a, b) {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatSeasonTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}

function loadSavedSeasons() {
  try {
    const raw = localStorage.getItem(SEASONS_STORAGE_KEY);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSavedSeasons(seasons) {
  try {
    localStorage.setItem(SEASONS_STORAGE_KEY, JSON.stringify(seasons));
  } catch {
    alert("Could not save season data in browser storage.");
  }
}

function getSavedSeasonById(id) {
  return loadSavedSeasons().find(s => s.id === id) || null;
}

function listSavedSeasons() {
  return loadSavedSeasons().sort((a, b) => {
    const ta = Number(b.updatedAt || b.createdAt || 0);
    const tb = Number(a.updatedAt || a.createdAt || 0);
    return ta - tb;
  });
}

function hasCurrentSeasonData() {
  return (
    fixtures.length > 0 ||
    Object.keys(savedResults).length > 0 ||
    !!knockoutState ||
    Object.keys(savedKnockout).length > 0
  );
}

function createSeasonSnapshot() {
  return {
    teams: cloneData(teams),
    fixtures: cloneData(fixtures),
    currentMatchday,
    savedResults: cloneData(savedResults),
    knockoutState: cloneData(knockoutState),
    currentRound,
    savedKnockout: cloneData(savedKnockout),
    currentPage
  };
}

function normalizeCurrentRound(state) {
  if (!state || !state.knockoutState) return null;

  if (state.currentRound && state.knockoutState[state.currentRound]) {
    return state.currentRound;
  }

  for (const round of KO_ROUNDS) {
    if (state.knockoutState[round]) return round;
  }

  return null;
}

function applySeasonSnapshot(record) {
  const state = record.state || {};

  teams = cloneData(state.teams) || cloneData(DEFAULT_TEAMS);
  fixtures = cloneData(state.fixtures) || [];
  currentMatchday = state.currentMatchday || 1;
  savedResults = cloneData(state.savedResults) || {};
  knockoutState = cloneData(state.knockoutState) || null;
  savedKnockout = cloneData(state.savedKnockout) || {};

  currentRound = normalizeCurrentRound(state);

  currentPage =
    state.currentPage === "knockout" && knockoutState && currentRound
      ? "knockout"
      : "league";

  currentSeasonId = record.id;
}

function renderCurrentPage() {
  if (currentPage === "knockout" && knockoutState) {
    showKnockout();
  } else {
    currentPage = "league";
    showLeaguePhase();
  }
}

function generateSimulatedScore(home, away) {
  const result = simulateMatch(home, away);
  let h = 0;
  let a = 0;

  if (result === "H") {
    h = Math.floor(Math.random() * 4) + 1;
    a = Math.floor(Math.random() * h);
  } else if (result === "A") {
    a = Math.floor(Math.random() * 4) + 1;
    h = Math.floor(Math.random() * a);
  } else {
    h = a = Math.floor(Math.random() * 3);
  }

  return { h, a };
}

function generatePenaltyScore(teamA, teamB) {
  const strength = (getPot(teamB) - getPot(teamA)) * 0.08;
  const aChance = Math.max(0.25, Math.min(0.75, 0.5 + strength));

  const teamAWins = Math.random() < aChance;
  const base = 5 + Math.floor(Math.random() * 3);

  if (teamAWins) {
    return { h: base, a: base - 1 };
  }
  return { h: base - 1, a: base };
}

function showLeaguePhase() {
  currentPage = "league";

  const league = document.getElementById("leaguePhasePage");
  const knockout = document.getElementById("knockoutPage");

  if (league) league.style.display = "block";
  if (knockout) knockout.style.display = "none";

  renderFixtures();
  calculateTable();
}

function showKnockout() {
  currentPage = "knockout";

  const league = document.getElementById("leaguePhasePage");
  const knockout = document.getElementById("knockoutPage");

  if (league) league.style.display = "none";
  if (knockout) knockout.style.display = "block";

  renderKnockout();
}

function roundLabel(round) {
  if (round === "playoffs") return "Playoffs";
  if (round === "roundOf16") return "Round of 16";
  if (round === "quarterFinal") return "Quarter-finals";
  if (round === "semiFinal") return "Semi-finals";
  if (round === "final") return "Final";
  return round;
}

function renderSeasonManager() {
  const seasons = listSavedSeasons();
  const currentLabel = currentSeasonId
    ? (getSavedSeasonById(currentSeasonId)?.name || "Saved season")
    : "Unsaved working season";

  return `
    <div style="margin:16px 0; padding:12px; background:#111; border:1px solid #333; border-radius:10px;">
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:10px;">
        <button onclick="saveSeason()">Save season</button>
        <button onclick="renameCurrentSeason()" ${currentSeasonId ? "" : "disabled"}>Rename season</button>
        <button onclick="deleteCurrentSeason()" ${currentSeasonId ? "" : "disabled"}>Delete season</button>
        <button onclick="resetSeason()">Reset season</button>
        <button onclick="loadAdjacentSeason(-1)">Previous saved</button>
        <button onclick="loadAdjacentSeason(1)">Next saved</button>
        <span style="opacity:0.85; margin-left:8px;">Current: ${escapeHtml(currentLabel)}</span>
      </div>

      <div style="margin-top:8px;">
        <div style="font-weight:bold; margin-bottom:6px;">Saved seasons</div>
        ${
          seasons.length
            ? seasons.map(s => {
                const active = s.id === currentSeasonId ? "background:#1d1d1d;" : "";
                return `
                  <div style="display:flex; gap:8px; align-items:center; justify-content:space-between; padding:6px 0; border-top:1px solid #222; ${active}">
                    <span>
                      ${escapeHtml(s.name)}
                      <small style="opacity:0.7;">(${formatSeasonTime(s.updatedAt || s.createdAt)})</small>
                    </span>
                    <span style="display:flex; gap:6px; flex-wrap:wrap;">
                      <button onclick="loadSeason('${s.id}')">Load</button>
                      <button onclick="renameSeason('${s.id}')">Rename</button>
                      <button onclick="deleteSeason('${s.id}')">Delete</button>
                    </span>
                  </div>
                `;
              }).join("")
            : `<div style="opacity:0.75;">No saved seasons yet.</div>`
        }
      </div>
    </div>
  `;
}

/* ---------------- SEASON SAVE / LOAD / RENAME / DELETE ---------------- */

function saveSeason() {
  const seasons = loadSavedSeasons();
  const currentEntry = currentSeasonId ? getSavedSeasonById(currentSeasonId) : null;
  const defaultName = currentEntry?.name || `Season ${seasons.length + 1}`;

  let name = prompt("Save this season as:", defaultName);
  if (name === null) return;

  name = name.trim();
  if (!name) {
    alert("Season name cannot be empty.");
    return;
  }

  const record = {
    id: `season_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    state: createSeasonSnapshot()
  };

  seasons.unshift(record);
  saveSavedSeasons(seasons);

  currentSeasonId = record.id;
  renderCurrentPage();
  alert(`Season saved as "${name}".`);
}

function renameSeason(id) {
  const seasons = loadSavedSeasons();
  const entry = seasons.find(s => s.id === id);

  if (!entry) {
    alert("Season not found.");
    return;
  }

  const newName = prompt("Rename season:", entry.name);
  if (newName === null) return;

  const trimmed = newName.trim();
  if (!trimmed) {
    alert("Season name cannot be empty.");
    return;
  }

  entry.name = trimmed;
  entry.updatedAt = Date.now();
  saveSavedSeasons(seasons);

  renderCurrentPage();
}

function renameCurrentSeason() {
  if (!currentSeasonId) {
    alert("No current saved season is selected.");
    return;
  }

  renameSeason(currentSeasonId);
}

function deleteSeason(id) {
  const seasons = loadSavedSeasons();
  const entry = seasons.find(s => s.id === id);

  if (!entry) {
    alert("Season not found.");
    return;
  }

  if (!confirm(`Delete season "${entry.name}"?`)) return;

  const updated = seasons.filter(s => s.id !== id);
  saveSavedSeasons(updated);

  if (currentSeasonId === id) {
    currentSeasonId = null;
  }

  renderCurrentPage();
}

function deleteCurrentSeason() {
  if (!currentSeasonId) {
    alert("No current saved season is selected.");
    return;
  }

  deleteSeason(currentSeasonId);
}

function loadSeason(id) {
  const entry = getSavedSeasonById(id);

  if (!entry) {
    alert("Season not found.");
    return;
  }

  applySeasonSnapshot(entry);
  renderCurrentPage();
}

function loadAdjacentSeason(step) {
  const seasons = listSavedSeasons();

  if (!seasons.length) {
    alert("No saved seasons yet.");
    return;
  }

  if (!currentSeasonId) {
    loadSeason(seasons[0].id);
    return;
  }

  const index = seasons.findIndex(s => s.id === currentSeasonId);
  const safeIndex = index >= 0 ? index : 0;
  const target = seasons[safeIndex + step];

  if (!target) {
    alert(step < 0 ? "No previous saved season." : "No next saved season.");
    return;
  }

  loadSeason(target.id);
}

function resetSeason() {
  if (!confirm("Reset the current season results? Fixtures will stay in place.")) {
    return;
  }

  savedResults = {};
  knockoutState = null;
  currentRound = null;
  savedKnockout = {};
  currentPage = "league";
  currentMatchday = 1;
  currentSeasonId = null;

  renderCurrentPage();
}

function hasCurrentSeasonData() {
  return (
    fixtures.length > 0 ||
    Object.keys(savedResults).length > 0 ||
    !!knockoutState ||
    Object.keys(savedKnockout).length > 0
  );
}

/* ---------------- LEAGUE SAVE / RESET ---------------- */

function saveMatchday() {
  const dayFixtures = fixtures.filter(f => f.matchday === currentMatchday);

  if (!savedResults[currentMatchday]) {
    savedResults[currentMatchday] = {};
  }

  dayFixtures.forEach(f => {
    const hg = document.getElementById(`hg-${f.id}`);
    const ag = document.getElementById(`ag-${f.id}`);

    if (!hg || !ag) return;
    if (hg.value === "" || ag.value === "") return;

    savedResults[currentMatchday][f.id] = {
      h: Number(hg.value),
      a: Number(ag.value)
    };
  });

  renderCurrentPage();
  alert(`Matchday ${currentMatchday} saved.`);
}

function resetMatchday() {
  delete savedResults[currentMatchday];
  renderCurrentPage();
}

/* ---------------- LEAGUE SIMULATE ---------------- */

function simulateMatch(home, away) {
  const hPot = getPot(home);
  const aPot = getPot(away);
  const strength = (aPot - hPot) * 0.12;

  const homeScore = Math.random() + strength;
  const awayScore = Math.random();

  if (homeScore > awayScore + 0.18) return "H";
  if (awayScore > homeScore + 0.18) return "A";
  return "D";
}

function simulateLeagueMatchday() {
  const dayFixtures = fixtures.filter(f => f.matchday === currentMatchday);

  dayFixtures.forEach(f => {
    const score = generateSimulatedScore(f.home, f.away);
    const hg = document.getElementById(`hg-${f.id}`);
    const ag = document.getElementById(`ag-${f.id}`);

    if (hg) hg.value = score.h;
    if (ag) ag.value = score.a;
  });
}

/* ---------------- ONE SIMULATE BUTTON FOR BOTH MODES ---------------- */

function autoFillResults() {
  if (currentPage === "knockout") {
    simulateKnockoutRound();
    return;
  }

  simulateLeagueMatchday();
}

/* ---------------- LEAGUE DRAW ---------------- */

function generateDraw() {
  if (hasCurrentSeasonData() && !confirm("Generate a new league phase draw? This will replace the current fixtures and results.")) {
    return;
  }

  fixtures = [];
  currentMatchday = 1;
  savedResults = {};
  knockoutState = null;
  currentRound = null;
  savedKnockout = {};
  currentSeasonId = null;
  currentPage = "league";

  const maxAttempts = 80;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const season = [];
    let nextId = 0;
    let success = true;
    const usedPairs = new Set();

    for (let day = 1; day <= MATCHDAYS; day++) {
      const usedToday = new Set();
      const teamList = shuffleArray(teams.map(t => t.name));
      const dayMatches = [];

      for (const teamA of teamList) {
        if (usedToday.has(teamA)) continue;

        const opponents = shuffleArray(
          teams.map(t => t.name).filter(op =>
            op !== teamA &&
            !usedToday.has(op) &&
            !usedPairs.has(pairKey(teamA, op))
          )
        );

        let found = false;

        for (const teamB of opponents) {
          if (usedToday.has(teamB)) continue;

          usedToday.add(teamA);
          usedToday.add(teamB);
          usedPairs.add(pairKey(teamA, teamB));

          const result = simulateMatch(teamA, teamB);

          let home = teamA;
          let away = teamB;

          if (result === "A") {
            home = teamB;
            away = teamA;
          }

          dayMatches.push({
            id: nextId++,
            matchday: day,
            home,
            away
          });

          found = true;
          break;
        }

        if (!found) {
          success = false;
          break;
        }
      }

      if (!success) break;
      season.push(...dayMatches);
    }

    if (success && season.length === 144) {
      fixtures = season;
      renderCurrentPage();
      return;
    }
  }

  alert("Could not generate a balanced season. Try again.");
}

/* ---------------- MATCHDAY NAV ---------------- */

function prevMatchday() {
  if (currentMatchday > 1) {
    currentMatchday--;
    renderCurrentPage();
  }
}

function nextMatchday() {
  if (currentMatchday < MATCHDAYS) {
    currentMatchday++;
    renderCurrentPage();
  }
}

/* ---------------- LEAGUE FIXTURES ---------------- */

function renderFixtures() {
  const box = document.getElementById("fixtures");
  if (!box) return;

  const dayFixtures = fixtures.filter(f => f.matchday === currentMatchday);

  let html = `
    ${renderSeasonManager()}
    <div style="margin:16px 0; padding:12px; background:#1b1b1b; border-radius:10px;">
      <button onclick="prevMatchday()">Prev</button>
      <button onclick="nextMatchday()">Next</button>
      <button onclick="saveMatchday()">Save</button>
      <button onclick="resetMatchday()">Reset</button>
      <button onclick="calculateTable()">Update Table</button>
      <button onclick="generateKnockout()">Generate Knockout</button>
      <button onclick="autoFillResults()">Simulate</button>
      <b style="margin-left:10px;">Matchday ${currentMatchday}</b>
  `;

  dayFixtures.forEach(f => {
    const saved = savedResults[currentMatchday]?.[f.id];
    html += `
      <div style="margin:8px 0;">
        ${f.home}
        <input id="hg-${f.id}" type="number" value="${saved?.h ?? ""}" style="width:50px;">
        -
        <input id="ag-${f.id}" type="number" value="${saved?.a ?? ""}" style="width:50px;">
        ${f.away}
      </div>
    `;
  });

  html += `</div>`;
  box.innerHTML = html;
}

/* ---------------- LEAGUE STANDINGS ---------------- */

function computeLeagueStandings() {
  const table = {};

  teams.forEach(t => {
    table[t.name] = {
      mp: 0,
      w: 0,
      d: 0,
      l: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      pts: 0
    };
  });

  for (const f of fixtures) {
    const saved = savedResults[f.matchday]?.[f.id];
    if (!saved) continue;

    const h = saved.h;
    const a = saved.a;

    const home = table[f.home];
    const away = table[f.away];

    home.mp++;
    away.mp++;

    home.gf += h;
    home.ga += a;

    away.gf += a;
    away.ga += h;

    if (h > a) {
      home.w++;
      home.pts += 3;
      away.l++;
    } else if (a > h) {
      away.w++;
      away.pts += 3;
      home.l++;
    } else {
      home.d++;
      away.d++;
      home.pts++;
      away.pts++;
    }
  }

  for (const name in table) {
    table[name].gd = table[name].gf - table[name].ga;
  }

  return Object.entries(table).sort((a, b) =>
    b[1].pts - a[1].pts ||
    b[1].gd - a[1].gd ||
    b[1].gf - a[1].gf
  );
}

function calculateTable() {
  renderTable(computeLeagueStandings());
}

function renderTable(sorted) {
  const box = document.getElementById("standings");
  if (!box) return;

  let html = `
    <table border="1" style="width:100%; text-align:center; border-collapse:collapse;">
      <tr>
        <th>#</th>
        <th>Team</th>
        <th>MP</th>
        <th>W</th>
        <th>D</th>
        <th>L</th>
        <th>GF</th>
        <th>GA</th>
        <th>GD</th>
        <th>Pts</th>
      </tr>
  `;

  sorted.forEach(([name, s], i) => {
    let style = "";
    if (i < 8) style = "background:green;color:white;";
    else if (i < 24) style = "background:gold;color:black;";

    html += `
      <tr style="${style}">
        <td>${i + 1}</td>
        <td>${name}</td>
        <td>${s.mp}</td>
        <td>${s.w}</td>
        <td>${s.d}</td>
        <td>${s.l}</td>
        <td>${s.gf}</td>
        <td>${s.ga}</td>
        <td>${s.gd}</td>
        <td>${s.pts}</td>
      </tr>
    `;
  });

  html += `</table>`;
  box.innerHTML = html;
}

/* ---------------- KNOCKOUT HELPERS ---------------- */

function createTie(home, away, legs, id) {
  return {
    id,
    home,
    away,
    legs,
    winner: null,
    decidedBy: null
  };
}

function createPlayoffTies(playoffTeams) {
  const ties = [];

  for (let i = 0; i < 8; i++) {
    ties.push(createTie(playoffTeams[i], playoffTeams[15 - i], 2, `po-${i}`));
  }

  return ties;
}

function createSequentialTies(list, prefix, legs) {
  const ties = [];

  for (let i = 0; i < list.length; i += 2) {
    if (!list[i + 1]) break;
    ties.push(createTie(list[i], list[i + 1], legs, `${prefix}-${i / 2}`));
  }

  return ties;
}

function getKnockoutSnapshot(roundName, tie) {
  const saved = savedKnockout[roundName]?.[tie.id] || {};

  const leg1 = saved.leg1 || null;
  const leg2 = tie.legs === 2 ? (saved.leg2 || null) : null;
  const pens = saved.pens || null;

  let aggregate = null;
  if (tie.legs === 1) {
    if (leg1) aggregate = { home: leg1.h, away: leg1.a };
  } else if (leg1 && leg2) {
    aggregate = { home: leg1.h + leg2.a, away: leg1.a + leg2.h };
  }

  const tied = aggregate ? aggregate.home === aggregate.away : false;
  const complete =
    tie.legs === 1
      ? !!leg1 && (!tied || !!pens)
      : !!leg1 && !!leg2 && (!tied || !!pens);

  return { leg1, leg2, pens, aggregate, tied, complete };
}

function generatePenaltyScore(teamA, teamB) {
  const strength = (getPot(teamB) - getPot(teamA)) * 0.08;
  const aChance = Math.max(0.25, Math.min(0.75, 0.5 + strength));

  const teamAWins = Math.random() < aChance;
  const base = 5 + Math.floor(Math.random() * 3);

  if (teamAWins) {
    return { h: base, a: base - 1 };
  }
  return { h: base - 1, a: base };
}

function isKnockoutRoundComplete(roundName) {
  if (!knockoutState || !roundName || !knockoutState[roundName]) return false;

  return knockoutState[roundName].every(tie => {
    const snap = getKnockoutSnapshot(roundName, tie);
    return snap.complete;
  });
}

function getKnockoutWinnerFromSnapshot(roundName, tie) {
  const snap = getKnockoutSnapshot(roundName, tie);
  if (!snap.complete) return null;

  if (!snap.tied) {
    return snap.aggregate.home > snap.aggregate.away ? tie.home : tie.away;
  }

  if (!snap.pens) return null;
  return snap.pens.h > snap.pens.a ? tie.home : tie.away;
}

/* ---------------- KNOCKOUT SAVE / SIM / RESET ---------------- */

function simulateKnockoutRound() {
  if (!knockoutState || !currentRound || !knockoutState[currentRound]) {
    alert("Generate the knockout stage first.");
    return;
  }

  const ties = knockoutState[currentRound];

  ties.forEach(tie => {
    if (tie.legs === 1) {
      const score = generateSimulatedScore(tie.home, tie.away);
      const hEl = document.getElementById(`k-${currentRound}-${tie.id}-l1-h`);
      const aEl = document.getElementById(`k-${currentRound}-${tie.id}-l1-a`);

      if (hEl && hEl.value === "") hEl.value = score.h;
      if (aEl && aEl.value === "") aEl.value = score.a;

      const aggHome = Number(hEl?.value ?? score.h);
      const aggAway = Number(aEl?.value ?? score.a);

      if (aggHome === aggAway) {
        const pens = generatePenaltyScore(tie.home, tie.away);
        const pH = document.getElementById(`k-${currentRound}-${tie.id}-p-h`);
        const pA = document.getElementById(`k-${currentRound}-${tie.id}-p-a`);

        if (pH && pH.value === "") pH.value = pens.h;
        if (pA && pA.value === "") pA.value = pens.a;
      }
    } else {
      const l1 = generateSimulatedScore(tie.home, tie.away);
      const l2 = generateSimulatedScore(tie.away, tie.home);

      const h1 = document.getElementById(`k-${currentRound}-${tie.id}-l1-h`);
      const a1 = document.getElementById(`k-${currentRound}-${tie.id}-l1-a`);
      const h2 = document.getElementById(`k-${currentRound}-${tie.id}-l2-h`);
      const a2 = document.getElementById(`k-${currentRound}-${tie.id}-l2-a`);

      if (h1 && h1.value === "") h1.value = l1.h;
      if (a1 && a1.value === "") a1.value = l1.a;
      if (h2 && h2.value === "") h2.value = l2.h;
      if (a2 && a2.value === "") a2.value = l2.a;

      const aggHome = Number(h1?.value ?? l1.h) + Number(a2?.value ?? l2.a);
      const aggAway = Number(a1?.value ?? l1.a) + Number(h2?.value ?? l2.h);

      if (aggHome === aggAway) {
        const pens = generatePenaltyScore(tie.home, tie.away);
        const pH = document.getElementById(`k-${currentRound}-${tie.id}-p-h`);
        const pA = document.getElementById(`k-${currentRound}-${tie.id}-p-a`);

        if (pH && pH.value === "") pH.value = pens.h;
        if (pA && pA.value === "") pA.value = pens.a;
      }
    }
  });
}

function saveKnockoutRound() {
  if (!knockoutState || !currentRound || !knockoutState[currentRound]) {
    alert("No knockout round to save.");
    return;
  }

  const ties = knockoutState[currentRound];
  if (!savedKnockout[currentRound]) savedKnockout[currentRound] = {};

  ties.forEach(tie => {
    if (!savedKnockout[currentRound][tie.id]) {
      savedKnockout[currentRound][tie.id] = {};
    }

    const entry = savedKnockout[currentRound][tie.id];
    const snap = getKnockoutSnapshot(currentRound, tie);

    if (tie.legs === 1) {
      const hEl = document.getElementById(`k-${currentRound}-${tie.id}-l1-h`);
      const aEl = document.getElementById(`k-${currentRound}-${tie.id}-l1-a`);

      if (hEl && aEl && hEl.value !== "" && aEl.value !== "") {
        entry.leg1 = { h: Number(hEl.value), a: Number(aEl.value) };
      }

      if (snap.tied) {
        const pH = document.getElementById(`k-${currentRound}-${tie.id}-p-h`);
        const pA = document.getElementById(`k-${currentRound}-${tie.id}-p-a`);

        if (pH && pA && pH.value !== "" && pA.value !== "") {
          entry.pens = { h: Number(pH.value), a: Number(pA.value) };
        }
      }
    } else {
      const h1 = document.getElementById(`k-${currentRound}-${tie.id}-l1-h`);
      const a1 = document.getElementById(`k-${currentRound}-${tie.id}-l1-a`);
      const h2 = document.getElementById(`k-${currentRound}-${tie.id}-l2-h`);
      const a2 = document.getElementById(`k-${currentRound}-${tie.id}-l2-a`);

      if (h1 && a1 && h1.value !== "" && a1.value !== "") {
        entry.leg1 = { h: Number(h1.value), a: Number(a1.value) };
      }

      if (h2 && a2 && h2.value !== "" && a2.value !== "") {
        entry.leg2 = { h: Number(h2.value), a: Number(a2.value) };
      }

      if (snap.tied) {
        const pH = document.getElementById(`k-${currentRound}-${tie.id}-p-h`);
        const pA = document.getElementById(`k-${currentRound}-${tie.id}-p-a`);

        if (pH && pA && pH.value !== "" && pA.value !== "") {
          entry.pens = { h: Number(pH.value), a: Number(pA.value) };
        }
      }
    }
  });

  renderKnockout();
  alert(`${roundLabel(currentRound)} saved.`);
}

function resetKnockoutRound() {
  if (!currentRound) return;
  delete savedKnockout[currentRound];
  renderKnockout();
}

function resolveKnockoutRound(roundName) {
  const ties = knockoutState?.[roundName];
  if (!ties) return [];

  const winners = [];

  for (const tie of ties) {
    const snap = getKnockoutSnapshot(roundName, tie);
    if (!snap.complete) return [];

    let winner = null;

    if (!snap.tied) {
      winner = snap.aggregate.home > snap.aggregate.away ? tie.home : tie.away;
      tie.decidedBy = "agg";
    } else {
      winner = snap.pens.h > snap.pens.a ? tie.home : tie.away;
      tie.decidedBy = "pens";
    }

    tie.winner = winner;
    winners.push(winner);
  }

  return winners;
}

/* ---------------- KNOCKOUT GENERATION ---------------- */

function generateKnockout() {
  const rankings = computeLeagueStandings();

  if (!rankings.length || rankings.every(([, s]) => s.mp === 0)) {
    alert("Save some league results first.");
    return;
  }

  const rankedTeams = rankings.map(x => x[0]);
  const top8 = rankedTeams.slice(0, 8);
  const playoffTeams = rankedTeams.slice(8, 24);

  knockoutState = {
    top8,
    playoffs: createPlayoffTies(playoffTeams),
    roundOf16: [],
    quarterFinal: [],
    semiFinal: [],
    final: [],
    champion: null
  };

  savedKnockout = {};
  currentRound = "playoffs";
  currentPage = "knockout";
  currentSeasonId = null;
  showKnockout();
}

function advanceKnockoutRound() {
  if (!knockoutState || !currentRound) {
    alert("Generate knockout first.");
    return;
  }

  if (!isKnockoutRoundComplete(currentRound)) {
    alert("Save every match in this round before advancing.");
    return;
  }

  const winners = resolveKnockoutRound(currentRound);
  if (!winners.length) {
    alert("No results available for this round.");
    return;
  }

  if (currentRound === "playoffs") {
    const all16 = [...knockoutState.top8, ...winners];
    knockoutState.roundOf16 = createSequentialTies(all16, "r16", 2);
    currentRound = "roundOf16";
  } else if (currentRound === "roundOf16") {
    knockoutState.quarterFinal = createSequentialTies(winners, "qf", 2);
    currentRound = "quarterFinal";
  } else if (currentRound === "quarterFinal") {
    knockoutState.semiFinal = createSequentialTies(winners, "sf", 2);
    currentRound = "semiFinal";
  } else if (currentRound === "semiFinal") {
    knockoutState.final = createSequentialTies(winners, "final", 1);
    currentRound = "final";
  } else if (currentRound === "final") {
    knockoutState.champion = winners[0];
    alert(`🏆 Champion: ${winners[0]}`);
    renderKnockout();
    return;
  }

  renderKnockout();
}

function prevKnockoutRound() {
  if (!currentRound) return;

  const idx = KO_ROUNDS.indexOf(currentRound);
  if (idx <= 0) {
    alert("This is the first knockout round.");
    return;
  }

  currentRound = KO_ROUNDS[idx - 1];
  renderKnockout();
}

/* ---------------- KNOCKOUT RENDER ---------------- */

function renderKnockout() {
  const box = document.getElementById("knockout");
  if (!box) return;

  if (!knockoutState || !currentRound || !knockoutState[currentRound]) {
    box.innerHTML = `
      ${renderSeasonManager()}
      <div style="margin:16px; padding:12px; background:#1b1b1b; border-radius:10px;">
        Generate the knockout stage after saving league results.
      </div>
    `;
    return;
  }

  const round = knockoutState[currentRound];
  const canAdvance = isKnockoutRoundComplete(currentRound);

  let html = `
    ${renderSeasonManager()}
    <div style="margin:16px; padding:12px; background:#1b1b1b; border-radius:10px;">
      <h2 style="margin-top:0;">${roundLabel(currentRound)}</h2>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
        <button onclick="autoFillResults()">Simulate</button>
        <button onclick="saveKnockoutRound()">Save</button>
        <button onclick="resetKnockoutRound()">Reset</button>
        <button onclick="prevKnockoutRound()">Previous Round</button>
        ${
          canAdvance
            ? '<button onclick="advanceKnockoutRound()">Advance Round</button>'
            : '<span style="padding:6px 0; opacity:0.8;">Save every match in this round to unlock Advance Round.</span>'
        }
      </div>
  `;

  if (knockoutState.champion && currentRound === "final") {
    html += `
      <div style="padding:10px; margin-bottom:12px; background:#0f2e1f; color:#fff;">
        Champion: ${knockoutState.champion}
      </div>
    `;
  }

  round.forEach(tie => {
    const snap = getKnockoutSnapshot(currentRound, tie);

    if (tie.legs === 1) {
      html += `
        <div style="margin:12px 0; padding:10px; border:1px solid #333; border-radius:8px;">
          <div style="font-weight:bold; margin-bottom:6px;">${tie.home} vs ${tie.away}</div>
          <div style="margin-bottom:6px;">
            <span>${tie.home}</span>
            <input id="k-${currentRound}-${tie.id}-l1-h" type="number" value="${snap.leg1?.h ?? ""}" style="width:60px;">
            -
            <input id="k-${currentRound}-${tie.id}-l1-a" type="number" value="${snap.leg1?.a ?? ""}" style="width:60px;">
            <span>${tie.away}</span>
          </div>
          <div style="margin-top:6px;">
            Aggregate: ${snap.aggregate ? `${snap.aggregate.home}-${snap.aggregate.away}` : "-"}
          </div>
          ${
            snap.tied
              ? `
                <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #555;">
                  Penalties:
                  <input id="k-${currentRound}-${tie.id}-p-h" type="number" value="${snap.pens?.h ?? ""}" style="width:60px;">
                  -
                  <input id="k-${currentRound}-${tie.id}-p-a" type="number" value="${snap.pens?.a ?? ""}" style="width:60px;">
                </div>
              `
              : ""
          }
        </div>
      `;
    } else {
      html += `
        <div style="margin:12px 0; padding:10px; border:1px solid #333; border-radius:8px;">
          <div style="font-weight:bold; margin-bottom:8px;">${tie.home} vs ${tie.away}</div>

          <div style="margin-bottom:6px;">
            Leg 1:
            <span>${tie.home}</span>
            <input id="k-${currentRound}-${tie.id}-l1-h" type="number" value="${snap.leg1?.h ?? ""}" style="width:60px;">
            -
            <input id="k-${currentRound}-${tie.id}-l1-a" type="number" value="${snap.leg1?.a ?? ""}" style="width:60px;">
            <span>${tie.away}</span>
          </div>

          <div style="margin-bottom:6px;">
            Leg 2:
            <span>${tie.away}</span>
            <input id="k-${currentRound}-${tie.id}-l2-h" type="number" value="${snap.leg2?.h ?? ""}" style="width:60px;">
            -
            <input id="k-${currentRound}-${tie.id}-l2-a" type="number" value="${snap.leg2?.a ?? ""}" style="width:60px;">
            <span>${tie.home}</span>
          </div>

          <div style="margin-top:6px;">
            Aggregate: ${snap.aggregate ? `${snap.aggregate.home}-${snap.aggregate.away}` : "-"}
          </div>

          ${
            snap.tied
              ? `
                <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #555;">
                  Penalties:
                  <input id="k-${currentRound}-${tie.id}-p-h" type="number" value="${snap.pens?.h ?? ""}" style="width:60px;">
                  -
                  <input id="k-${currentRound}-${tie.id}-p-a" type="number" value="${snap.pens?.a ?? ""}" style="width:60px;">
                </div>
              `
              : ""
          }
        </div>
      `;
    }
  });

  html += `</div>`;
  box.innerHTML = html;
}

/* ---------------- GLOBAL EXPORTS ---------------- */

window.autoFillResults = autoFillResults;
window.generateDraw = generateDraw;
window.calculateTable = calculateTable;
window.prevMatchday = prevMatchday;
window.nextMatchday = nextMatchday;
window.saveMatchday = saveMatchday;
window.resetMatchday = resetMatchday;
window.showLeaguePhase = showLeaguePhase;
window.showKnockout = showKnockout;
window.generateKnockout = generateKnockout;
window.advanceKnockoutRound = advanceKnockoutRound;
window.prevKnockoutRound = prevKnockoutRound;
window.saveKnockoutRound = saveKnockoutRound;
window.resetKnockoutRound = resetKnockoutRound;
window.simulateKnockoutRound = simulateKnockoutRound;

window.saveSeason = saveSeason;
window.loadSeason = loadSeason;
window.renameSeason = renameSeason;
window.deleteSeason = deleteSeason;
window.renameCurrentSeason = renameCurrentSeason;
window.deleteCurrentSeason = deleteCurrentSeason;
window.resetSeason = resetSeason;
window.loadAdjacentSeason = loadAdjacentSeason;
