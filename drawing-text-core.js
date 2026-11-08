/* Offline text scan of PDF drawings: finds detector addresses (01.001),
   sections and types in the PDF text layer. Pure functions, no network. */
(function (root) {
  "use strict";
  const TYPES = [
    ["Multidetektor", /multi|kombi|opto[\s-]*(?:termisk|värme)|optisk\s*\/\s*värme/i],
    ["Värmedetektor", /värme|termisk|thermal|\bheat\b|\bterm\b/i],
    ["Rökdetektor", /rök|optisk|\bopt\b|smoke|joniser/i],
    ["Flamdetektor", /flam/i],
    ["Linjerökdetektor", /linje|beam|ir[\s-]*barri/i],
    ["Aspirerande detektor", /aspir|hssd|rörsystem/i],
    ["Larmknapp", /larmknapp|brandlarmsknapp|manuell|\bmcp\b|tryckknapp/i],
    ["Larmdon", /larmdon|siren|sirén|klocka|ljudgiv|blixtljus/i],
    ["In-/utgångsenhet", /\bi\/o\b|in-?\s*\/?\s*utgång|styr(?:ning|enhet)|ingångsenhet|utgångsenhet/i],
  ];
  const SHORT = {
    R: "Rökdetektor",
    O: "Rökdetektor",
    OPT: "Rökdetektor",
    V: "Värmedetektor",
    T: "Värmedetektor",
    M: "Multidetektor",
    MD: "Multidetektor",
    VD: "Värmedetektor",
    RD: "Rökdetektor",
    OD: "Rökdetektor",
    LK: "Larmknapp",
    K: "Larmknapp",
    F: "Flamdetektor",
    LD: "Larmdon",
  };
  const ADDRESS = /(?<![\d.,:])(\d{1,2})[.:](\d{3})(?![\d.,:]|\s?(?:mm|m²|m2|kvm)\b)/g;
  const SECTION =
    /\b(?:sektion|sekt\.?|sek\.?|brandsektion|larmsektion|zon)\s*:?\s*(\d{1,4})\b/gi;

  function typeOf(text) {
    for (const [name, rx] of TYPES) if (rx.test(text)) return name;
    return "";
  }
  function shortType(text) {
    const m = String(text || "")
      .trim()
      .toUpperCase()
      .match(/^([A-ZÅÄÖ]{1,3})$/);
    return (m && SHORT[m[1]]) || "";
  }
  /* items: [{str, x, y, w, h, dx, dy}] in page units; x,y = baseline origin,
     (dx,dy) = unit reading direction, y grows downwards. */
  function lines(items, split = true) {
    const list = items
      .filter((i) => i && typeof i.str === "string" && i.str.trim())
      .map((i) => ({
        ...i,
        dx: Number.isFinite(i.dx) ? i.dx : 1,
        dy: Number.isFinite(i.dy) ? i.dy : 0,
        h: i.h > 0 ? i.h : 8,
        w: i.w > 0 ? i.w : i.str.length * (i.h > 0 ? i.h : 8) * 0.55,
      }));
    const out = [];
    for (const item of list) {
      // position along / across the reading direction
      const along = item.x * item.dx + item.y * item.dy,
        across = -item.x * item.dy + item.y * item.dx;
      let line = out.find(
        (l) =>
          Math.abs(l.dx - item.dx) < 0.05 &&
          Math.abs(l.dy - item.dy) < 0.05 &&
          Math.abs(l.across - across) < Math.max(l.h, item.h) * 0.45,
      );
      if (!line) {
        line = { dx: item.dx, dy: item.dy, across, h: item.h, parts: [] };
        out.push(line);
      }
      line.parts.push({ ...item, along });
    }
    const result = [];
    for (const line of out) {
      line.parts.sort((a, b) => a.along - b.along);
      // split a line where the gap is large (separate labels on one row)
      let current = null;
      for (const p of line.parts) {
        const gap = current ? p.along - current.end : 0;
        if (!current || (split && gap > Math.max(current.h, p.h) * 2.5)) {
          current = {
            text: "",
            chars: [],
            h: p.h,
            dx: line.dx,
            dy: line.dy,
            end: p.along,
          };
          result.push(current);
        } else if (gap > p.h * 0.25 && !/\s$/.test(current.text)) {
          current.text += " ";
          current.chars.push(current.chars[current.chars.length - 1]);
        }
        const n = p.str.length;
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          current.chars.push({
            x: p.x + p.dx * p.w * t,
            y: p.y + p.dy * p.w * t,
          });
        }
        current.text += p.str;
        current.h = Math.max(current.h, p.h);
        current.end = Math.max(current.end, p.along + p.w);
      }
    }
    return result;
  }
  function centre(line, from, to) {
    const a = line.chars[from],
      b = line.chars[Math.max(from, to - 1)];
    // move half a text height up from the baseline (perpendicular to reading)
    return {
      x: (a.x + b.x) / 2 + line.dy * line.h * 0.35,
      y: (a.y + b.y) / 2 - line.dx * line.h * 0.35,
    };
  }
  function addressesIn(line) {
    const found = [];
    ADDRESS.lastIndex = 0;
    let m;
    while ((m = ADDRESS.exec(line.text))) {
      const loop = Number(m[1]),
        addr = Number(m[2]);
      if (loop < 1 || loop > 99 || addr < 1 || addr > 255) continue;
      found.push({
        slinga: String(loop).padStart(2, "0"),
        adress: String(addr).padStart(3, "0"),
        index: m.index,
        end: m.index + m[0].length,
      });
    }
    return found;
  }
  function sectionsIn(line) {
    const found = [];
    SECTION.lastIndex = 0;
    let m;
    while ((m = SECTION.exec(line.text)))
      found.push({ sektion: String(Number(m[1])), index: m.index, end: m.index + m[0].length });
    return found;
  }
  const key = (slinga, adress) => Number(slinga) + "." + Number(adress);

  /* Cover sheet: rows with an address give type/section/placement,
     legend words give the list of detector types present. */
  function readCover(items) {
    const table = new Map(),
      legend = new Set();
    for (const line of lines(items, false)) {
      const t = typeOf(line.text);
      if (t) legend.add(t);
      const addrs = addressesIn(line);
      if (addrs.length !== 1) continue;
      const a = addrs[0],
        rest = (line.text.slice(0, a.index) + " " + line.text.slice(a.end)).trim(),
        sec = sectionsIn(line)[0];
      let sektion = sec?.sektion || "";
      if (!sektion) {
        // table layout: a bare 1–3 digit number before the address is usually the section
        const bare = line.text.slice(0, a.index).match(/(?:^|\s)(\d{1,3})\s*$/);
        if (bare) sektion = String(Number(bare[1]));
      }
      const words = (s, numbers) =>
          s
            .replace(SECTION, " ")
            .split(/\s+/)
            .filter((w) => w && !(numbers && /^\d{1,3}$/.test(w)) && !typeOf(w) && !shortType(w)),
        placering = [
          ...words(line.text.slice(0, a.index), true),
          ...words(line.text.slice(a.end), false),
        ]
          .join(" ")
        .replace(/^[\s,;:–-]+|[\s,;:–-]+$/g, "");
      table.set(key(a.slinga, a.adress), {
        slinga: a.slinga,
        adress: a.adress,
        sektion,
        typ: t || shortType(rest.split(/\s+/)[0]) || "",
        placering: placering.slice(0, 120),
      });
    }
    return { table, legend: [...legend] };
  }

  /* Drawing page: every address label becomes a candidate at its position. */
  function readPage(items, width, height) {
    if (!(width > 0 && height > 0)) throw Error("Ogiltig sidstorlek.");
    const all = lines(items),
      sections = [],
      labels = [];
    for (const line of all)
      for (const s of sectionsIn(line))
        sections.push({ ...s, ...centre(line, s.index, s.end) });
    for (const line of all)
      for (const a of addressesIn(line)) {
        const p = centre(line, a.index, a.end),
          before = line.text.slice(0, a.index).trim().split(/\s+/).pop() || "",
          after = line.text.slice(a.end).trim().split(/\s+/)[0] || "";
        // label box: along the reading direction the characters, across one text height
        const c0 = line.chars[a.index],
          c1 = line.chars[Math.max(a.index, a.end - 1)],
          n = Math.max(1, a.end - a.index),
          span = Math.hypot(c1.x - c0.x, c1.y - c0.y),
          long = n > 1 ? (span * n) / (n - 1) : line.h * 0.6,
          bw = Math.abs(line.dx) * long + Math.abs(line.dy) * line.h,
          bh = Math.abs(line.dy) * long + Math.abs(line.dx) * line.h;
        labels.push({
          slinga: a.slinga,
          adress: a.adress,
          x: Math.min(1, Math.max(0, p.x / width)),
          y: Math.min(1, Math.max(0, p.y / height)),
          w: bw / width,
          h: bh / height,
          px: p.x,
          py: p.y,
          typ: shortType(before) || shortType(after) || typeOf(line.text),
        });
      }
    // nearest section label on the page (within a generous radius)
    const diag = Math.hypot(width, height);
    for (const l of labels) {
      let best = null,
        dist = Infinity;
      for (const s of sections) {
        const d = Math.hypot(s.x - l.px, s.y - l.py);
        if (d < dist) {
          dist = d;
          best = s;
        }
      }
      l.sektion = best && dist < diag * 0.25 ? best.sektion : "";
      delete l.px;
      delete l.py;
    }
    return { labels, sections: [...new Set(sections.map((s) => s.sektion))] };
  }

  /* Combine pages + cover sheet + existing register into review rows. */
  function candidates(pages, cover, register, model, defaults, detectorApi) {
    const rows = [],
      seen = new Set(),
      warnings = [];
    for (const page of pages) {
      for (const l of page.labels) {
        const k = page.page + ":" + key(l.slinga, l.adress);
        if (seen.has(k)) {
          warnings.push(
            `Sida ${page.page}: adress ${l.slinga}.${l.adress} finns flera gånger, första används.`,
          );
          continue;
        }
        seen.add(k);
        const row = cover?.table?.get(key(l.slinga, l.adress)) || {},
          values = {
            central: "",
            slinga: l.slinga,
            adress: l.adress,
            sektion: row.sektion || l.sektion || defaults.sektion || "",
            typ: row.typ || l.typ || defaults.typ || "",
            placering: row.placering || "",
            lokalId: "",
          },
          existing = register.devices.find(
            (d) =>
              detectorApi.identity(d) ===
              detectorApi.identity({ ...values, central: d.central || "" }),
          );
        rows.push({
          id: "scan-" + rows.length,
          page: page.page,
          x: l.x,
          y: l.y,
          ...(l.w > 0 && l.h > 0 ? { w: l.w, h: l.h } : {}),
          ...values,
          ...(existing
            ? {
                sektion: existing.sektion || values.sektion,
                typ: existing.typ || values.typ,
                placering: existing.placering || values.placering,
              }
            : {}),
          existingId: existing?.id || "",
          fromCover: !!cover?.table?.has(key(l.slinga, l.adress)),
          approved: false,
        });
      }
    }
    return { rows, warnings };
  }

  /* Idempotent writes: new devices for unknown addresses, pins for each page. */
  // label box size for the pin (page-normalized), only when it is sensible
  const box = (r) =>
    [r.w, r.h].every((v) => Number.isFinite(v) && v > 0 && v <= 0.25) ? { w: r.w, h: r.h } : {};
  function writes(data, facilityId, docId, rows, model, detectorApi) {
    const parse = (k, fallback) => JSON.parse(data[k] ?? JSON.stringify(fallback));
    if (
      !parse("facilities", []).some((f) => f.id === facilityId) ||
      !parse("docs:" + facilityId, []).some((d) => d.id === docId) ||
      !data["docfile:" + docId]
    )
      throw Error("Objektet eller ritningen saknas.");
    const register = parse("detectors:" + facilityId, { devices: [], events: [] }),
      field = parse("fieldwork:" + facilityId, {
        visits: [],
        materials: [],
        plans: [],
        pins: [],
        prep: "",
      }),
      chosen = rows.filter((r) => r.approved);
    if (!chosen.length) throw Error("Välj minst en detektor.");
    let created = 0,
      pinned = 0,
      moved = 0;
    for (const r of chosen) {
      if (!Number.isInteger(r.page) || r.page < 1) throw Error("Ogiltig ritningssida.");
      if (![r.x, r.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
        throw Error("Markeringen ligger utanför ritningen.");
      const values = {
        central: "",
        slinga: String(r.slinga || "").trim(),
        adress: String(r.adress || "").trim(),
        sektion: String(r.sektion || "").trim(),
        typ: String(r.typ || "").trim(),
        placering: String(r.placering || "").trim(),
        lokalId: "",
      };
      let device = register.devices.find(
        (d) =>
          (r.existingId && d.id === r.existingId) ||
          detectorApi.identity(d) === detectorApi.identity({ ...values, central: d.central || "" }),
      );
      if (device) {
        // fill in blanks from the drawing, never overwrite registered data
        for (const k of ["sektion", "typ", "placering"])
          if (!device[k] && values[k]) device[k] = values[k];
      } else {
        if (!values.typ) throw Error(`Ange typ för ${values.slinga}.${values.adress}.`);
        if (!values.sektion) throw Error(`Ange sektion för ${values.slinga}.${values.adress}.`);
        device = {
          ...detectorApi.validateDevice(values),
          id: crypto.randomUUID(),
          generation: 1,
        };
        register.devices.push(device);
        created++;
      }
      const old = field.pins.find(
        (p) => p.docId === docId && p.page === r.page && p.deviceId === device.id,
      );
      if (old) {
        if (old.x !== r.x || old.y !== r.y) moved++;
        Object.assign(old, { x: r.x, y: r.y, ...box(r) });
      } else {
        field.pins.push({
          id: crypto.randomUUID(),
          docId,
          page: r.page,
          deviceId: device.id,
          x: r.x,
          y: r.y,
          ...box(r),
          source: "pdf-text",
          reviewedAt: new Date().toISOString(),
        });
        pinned++;
      }
    }
    return {
      writes: {
        ["detectors:" + facilityId]: JSON.stringify(register),
        ["fieldwork:" + facilityId]: JSON.stringify(field),
      },
      created,
      pinned,
      moved,
    };
  }

  /* Quarterly test requirements (minimum levels in the rules):
     SBF 110:8 11.5.3 a) sections without addresses: one detector in 10 % of the
       sections per quarter, all sections per year.
     SBF 110:8 11.5.3 b) sections with addresses: 2 % of the detectors per quarter,
       spread over the system and the year.
     SBF 110:7 11.5.3 a) one detector per section in 25 % of the sections per quarter;
       per year at least 5 % of the detectors and all sections. */
  const RULES = {
    "110-8-adr": {
      label: "SBF 110:8 – med larmadresser",
      ref: "SBF 110:8 avsnitt 11.5.3 b",
      quarter: { basis: "devices", percent: 2 },
      // 11.5.3 b has no yearly percentage, only that testing is spread so different detectors are tested.
      year: [],
      note: "Minst 2 % av detektorerna per kvartal. Provningen ska spridas över anläggningen och året så att olika detektorer provas (SBF 110:8 11.5.3 b). Inget särskilt årskrav i procent.",
    },
    "110-8-sek": {
      label: "SBF 110:8 – utan larmadresser (sektioner)",
      ref: "SBF 110:8 avsnitt 11.5.3 a",
      quarter: { basis: "sections", percent: 10 },
      year: [{ basis: "sections", percent: 100 }],
      note: "Minst en detektor i 10 % av sektionerna per kvartal. Samtliga sektioner ska vara provade på ett år.",
    },
    "110-7": {
      label: "SBF 110:7",
      ref: "SBF 110:7 avsnitt 11.5.3 a",
      quarter: { basis: "sections", percent: 25 },
      year: [
        { basis: "devices", percent: 5 },
        { basis: "sections", percent: 100 },
      ],
      note: "Minst en detektor per sektion i minst 25 % av sektionerna per kvartal. Per år minst 5 % av detektorerna och samtliga sektioner.",
    },
  };
  function rule(goal, devices = []) {
    let key = goal?.rule;
    if (key === "auto" || (!key && !goal?.percent))
      key = devices.some((d) => String(d.adress || "").trim()) ? "110-8-adr" : "110-8-sek";
    if (RULES[key]) return { key, ...RULES[key] };
    const percent = Number(goal?.percent),
      basis = goal?.basis === "devices" ? "devices" : "sections";
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100)
      throw Error("Ange ett krav mellan 1 och 100 %.");
    return {
      key: "custom",
      label: "Eget krav",
      ref: "Eget krav",
      quarter: { basis, percent },
      year: [],
      note: "Eget krav enligt avtal.",
    };
  }
  /* Progress vs requirement for the quarter and the year. */
  function progress(c, goal, devices) {
    const r = rule(goal, devices),
      pct = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : 0),
      check = (p, req) => {
        const done = req.basis === "devices" ? p.devices : p.sections,
          total = req.basis === "devices" ? c.totalDevices : c.totalSections,
          needed = Math.max(total ? 1 : 0, Math.ceil((total * req.percent) / 100 - 1e-9));
        return {
          basis: req.basis,
          goal: req.percent,
          done,
          total,
          needed,
          percent: pct(done, total),
          devicePercent: pct(p.devices, c.totalDevices),
          sectionPercent: pct(p.sections, c.totalSections),
          met: total > 0 && done >= needed,
        };
      };
    const quarter = check(c.quarter, r.quarter),
      yearChecks = r.year.map((req) => check(c.year, req));
    return {
      rule: r.key,
      label: r.label,
      ref: r.ref,
      note: r.note,
      basis: r.quarter.basis,
      goal: r.quarter.percent,
      quarter,
      year: check(c.year, r.quarter),
      yearChecks,
      yearMet: yearChecks.length ? yearChecks.every((y) => y.met) : null,
    };
  }

  const api = { RULES, rule, TYPES, typeOf, shortType, lines, readCover, readPage, candidates, writes, progress };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.drawingTextData = api;
})(typeof window === "object" ? window : globalThis);
