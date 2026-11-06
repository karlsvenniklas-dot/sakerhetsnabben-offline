/* Quarterly plan, test history per section and the list of what remains.
   Pure functions: no storage, no DOM. Exported for node tests too. */
(function (root) {
  "use strict";
  const TESTED = ["Provad – OK", "Provad – anmärkning"];
  const OPEN = ["Provad – anmärkning", "Ej åtkomlig"];
  const sectionOf = (d) => {
    const s = String(d?.sektion ?? "").trim();
    return /^\d+$/.test(s) ? String(Number(s)) : s;
  };
  const bySection = (a, b) => (a || "~").localeCompare(b || "~", "sv", { numeric: true });
  const sectionName = (s) => (s ? (/^\d/.test(s) ? "Sektion " + s : s) : "Utan sektion");
  function isoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) throw Error("Ange ett giltigt datum.");
    return value;
  }
  /* The same day one year earlier (29 Feb -> 28 Feb). */
  function yearBefore(ref) {
    isoDate(ref);
    const [y, m, d] = ref.split("-").map(Number),
      last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
    return `${y - 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  }
  function quarterRange(year, quarter) {
    const y = Number(year),
      q = Number(quarter);
    if (!Number.isInteger(y) || !Number.isInteger(q) || q < 1 || q > 4) throw Error("Välj år och kvartal.");
    return {
      from: `${y}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`,
      to: new Date(Date.UTC(y, q * 3, 0)).toISOString().slice(0, 10),
    };
  }
  const quarterOf = (date) => Math.floor((Number(isoDate(date).slice(5, 7)) - 1) / 3) + 1;
  /* Test events on the device's current generation, newest first. */
  function testsOf(device, events, upTo) {
    return (events || [])
      .filter(
        (e) =>
          e.kind === "test" &&
          e.deviceId === device.id &&
          e.generation === device.generation &&
          (!upTo || e.date <= upTo),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || String(b.recordedAt).localeCompare(String(a.recordedAt)));
  }
  /* Last date the device was actually tested (OK or with a remark). */
  function lastTested(device, events, upTo) {
    return testsOf(device, events, upTo).find((e) => TESTED.includes(e.status))?.date || "";
  }

  /* Four groups of sections so every section is tested once a year.
     Sections alternate between the quarters (1, 2, 3, 4, 1, …) so each quarter
     covers the whole facility; a quarter chosen by hand is kept. */
  function planQuarters(devices, saved) {
    const chosen = (saved && saved.sections) || {},
      counts = new Map();
    for (const d of devices || []) {
      const s = sectionOf(d);
      if (!s) continue;
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    const rows = [...counts.keys()].sort(bySection).map((section, i) => {
      const own = Number(chosen[section]);
      const manual = Number.isInteger(own) && own >= 1 && own <= 4;
      return { section, devices: counts.get(section), quarter: manual ? own : (i % 4) + 1, manual };
    });
    const byQuarter = { 1: [], 2: [], 3: [], 4: [] };
    for (const r of rows) byQuarter[r.quarter].push(r.section);
    return { rows, byQuarter };
  }
  /* Store a hand-picked quarter; "auto" removes the choice. */
  function setQuarter(saved, section, quarter) {
    const sections = { ...((saved && saved.sections) || {}) };
    if (quarter === "auto" || quarter == null || quarter === "") delete sections[section];
    else {
      const q = Number(quarter);
      if (!Number.isInteger(q) || q < 1 || q > 4) throw Error("Välj kvartal 1–4.");
      sections[section] = q;
    }
    return { sections };
  }

  /* Per section: when it was last tested, and devices not tested for 12 months. */
  function history(register, refDate) {
    const limit = yearBefore(refDate),
      map = new Map(),
      stale = [];
    for (const d of register.devices || []) {
      const s = sectionOf(d);
      if (!map.has(s)) map.set(s, { section: s, devices: 0, recent: 0, last: "" });
      const row = map.get(s),
        last = lastTested(d, register.events, refDate);
      row.devices++;
      if (last && last >= limit) row.recent++;
      else stale.push({ device: d, last });
      if (last > row.last) row.last = last;
    }
    const sections = [...map.values()]
      .map((r) => ({ ...r, stale: !r.last || r.last < limit }))
      .sort((a, b) => bySection(a.section, b.section));
    stale.sort((a, b) => (a.last || "").localeCompare(b.last || "") || bySection(sectionOf(a.device), sectionOf(b.device)));
    return { limit, sections, stale };
  }

  /* Devices whose latest result is a remark or "not accessible". */
  function openFaults(register, upTo) {
    const out = [];
    for (const d of register.devices || []) {
      const e = testsOf(d, register.events, upTo).find((x) => x.status !== "Inte provad");
      if (e && OPEN.includes(e.status)) out.push({ device: d, event: e });
    }
    return out.sort((a, b) => bySection(sectionOf(a.device), sectionOf(b.device)));
  }

  /* Everything that remains, for the customer or the next visit. */
  function remaining(register, { year, quarter, plan, refDate }) {
    const { from, to } = quarterRange(year, quarter),
      upTo = refDate && refDate < to ? refDate : to,
      testedIn = (s, a, b) =>
        (register.devices || []).some(
          (d) => sectionOf(d) === s && testsOf(d, register.events, b).some((e) => e.date >= a && TESTED.includes(e.status)),
        ),
      p = planQuarters(register.devices, plan),
      planned = p.byQuarter[Number(quarter)] || [],
      h = history(register, upTo);
    return {
      from,
      to,
      upTo,
      plannedLeft: planned.filter((s) => !testedIn(s, from, upTo)),
      planned,
      yearLeft: p.rows.map((r) => r.section).filter((s) => !testedIn(s, `${year}-01-01`, upTo)),
      stale: h.stale,
      limit: h.limit,
      faults: openFaults(register, upTo),
      totalSections: p.rows.length,
    };
  }
  function remainingText(r, { facility = "", year, quarter, label = (d) => d.adress || "", today = "" } = {}) {
    const names = (list) => (list.length ? list.map(sectionName).join(", ") : "Inga");
    const lines = [
      `Återstående provning${facility ? " – " + facility : ""}`,
      `Kvartal ${quarter} ${year} (${r.from} – ${r.to})${today ? ", sammanställt " + today : ""}`,
      "",
      `Sektioner i kvartalets plan som inte provats (${r.plannedLeft.length} av ${r.planned.length}):`,
      "  " + names(r.plannedLeft),
      "",
      `Sektioner som inte provats i år (${r.yearLeft.length} av ${r.totalSections}):`,
      "  " + names(r.yearLeft),
      "",
      `Detektorer som inte provats på 12 månader, sedan ${r.limit} (${r.stale.length}):`,
      ...(r.stale.length ? r.stale.map((x) => `  ${label(x.device)} – ${x.last ? "senast " + x.last : "aldrig provad"}`) : ["  Inga"]),
      "",
      `Kvarstående anmärkningar och ej åtkomliga (${r.faults.length}):`,
      ...(r.faults.length
        ? r.faults.map(
            (x) =>
              `  ${label(x.device)} – ${x.event.date} ${x.event.status === "Ej åtkomlig" ? "ej åtkomlig" : "anmärkning"}${x.event.note ? ": " + x.event.note : ""}`,
          )
        : ["  Inga"]),
    ];
    return lines.join("\n");
  }

  const api = {
    sectionOf,
    sectionName,
    yearBefore,
    quarterRange,
    quarterOf,
    lastTested,
    planQuarters,
    setQuarter,
    history,
    openFaults,
    remaining,
    remainingText,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.quarterPlanData = api;
})(typeof window === "object" ? window : globalThis);
