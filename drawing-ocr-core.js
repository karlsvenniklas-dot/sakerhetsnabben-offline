/* Interpretation of offline OCR results from drawings whose text is drawn
   as vector lines (no PDF text layer). Pure functions, no network. */
(function (root) {
  "use strict";
  // OCR confusions inside numbers: O->0, L/l/I/|->1, ","->"."
  function digits(s) {
    return String(s || "")
      .replace(/(?<=[\d.,]|^)[OoQD](?=[\d.,])|(?<=[\d.,])[OoQD](?=[\d.,]|$)/g, "0")
      .replace(/(?<=[\d.,]|^)[LlI|!](?=[\d.,])|(?<=[\d.,])[LlI|!](?=[\d.,]|$)/g, "1")
      .replace(/(\d),(\d{3})/g, "$1.$2")
      .replace(/[–—]/g, "-");
  }
  const ADDR = /(?<!\d)(\d{2})\.(\d{3})(?!\d)/g;
  const norm = (loop, addr) => String(Number(loop)).padStart(2, "0") + "." + String(Number(addr)).padStart(3, "0");
  const value = (a) => {
    const [l, n] = a.split(".");
    return Number(l) * 1000 + Number(n);
  };
  const valid = (loop, addr) => Number(loop) >= 1 && Number(loop) <= 99 && Number(addr) >= 1 && Number(addr) <= 255;

  /* lines: [{words:[{text,x0,y0,x1,y1}]}] with page-normalized boxes (0..1). */
  function readLabels(lines) {
    const labels = [],
      legend = [];
    for (const line of lines || []) {
      const words = (line.words || []).filter((w) => w && typeof w.text === "string");
      for (let i = 0; i < words.length; i++) {
        const w = words[i],
          text = digits(w.text);
        // stacked labels can be read as one long token: split every match
        const found = [];
        if (/^(?:\d{2}\.\d{3}){2,}$/.test(text))
          // "01.23201.23201.233": labels stacked on top of each other
          for (let k = 0; k < text.length; k += 6) {
            const m = text.slice(k, k + 6).match(/^(\d{2})\.(\d{3})$/);
            if (m && valid(m[1], m[2])) found.push({ m, index: k });
          }
        else {
          ADDR.lastIndex = 0;
          let m;
          while ((m = ADDR.exec(text))) if (valid(m[1], m[2])) found.push({ m, index: m.index });
        }
        if (!found.length) continue;
        // words after the address on the same line, e.g. "01.204 FLÄKTSTYRNING"
        const after = words
          .slice(i + 1)
          .map((x) => x.text)
          .join(" ")
          .trim();
        const describing = found.length === 1 && /[A-Za-zÅÄÖåäö]{3,}/.test(after) && !/\d{2}[.,]\d{3}/.test(after);
        for (const f of found) {
          const t0 = f.index / text.length,
            t1 = (f.index + f.m[0].length) / text.length,
            horizontal = Math.abs(w.x1 - w.x0) >= Math.abs(w.y1 - w.y0);
          // approximate the position of the matched part inside the word box
          const x = horizontal ? w.x0 + (w.x1 - w.x0) * ((t0 + t1) / 2) : (w.x0 + w.x1) / 2,
            y = horizontal ? (w.y0 + w.y1) / 2 : w.y0 + (w.y1 - w.y0) * ((t0 + t1) / 2),
            address = norm(f.m[1], f.m[2]);
          // size of the label box (the matched part only), page-normalized
          const bw = horizontal ? (w.x1 - w.x0) * (t1 - t0) : w.x1 - w.x0,
            bh = horizontal ? w.y1 - w.y0 : (w.y1 - w.y0) * (t1 - t0);
          if (describing) legend.push({ address, text: after, x, y });
          else labels.push({ address, x, y, w: Math.abs(bw), h: Math.abs(bh), conf: Number(w.conf) || 0 });
        }
      }
    }
    return { labels, legend };
  }
  /* Merge the passes (rotations): the same address close to the same spot is one label. */
  function mergeLabels(list, radius = 0.012) {
    const out = [];
    for (const l of list.sort((a, b) => b.conf - a.conf)) {
      if (out.some((o) => o.address === l.address && Math.hypot(o.x - l.x, o.y - l.y) < radius)) continue;
      out.push({ ...l });
    }
    return out;
  }

  /* Section table on the cover sheet: "1 | 01.007-01.014, 01.208-01.212 | PLAN 1". */
  function parseSectionTable(lines) {
    const found = [];
    for (const line of lines || []) {
      const raw = (line.words || []).map((w) => w.text).join(" "),
        // a lost dot in the table: "01208-01212" -> "01.208-01.212"
        text = digits(raw).replace(/(?<![\d.])(0\d)(\d{3})(?![\d.])/g, "$1.$2"),
        ranges = [],
        rx = /(?<!\d)(\d{2})\.(\d{3})(?:\s*-\s*(\d{2})\.(\d{3}))?(?!\d)/g;
      let m,
        first = -1;
      while ((m = rx.exec(text))) {
        if (!valid(m[1], m[2])) continue;
        if (first < 0) first = m.index;
        const a = norm(m[1], m[2]),
          b = m[3] && valid(m[3], m[4]) ? norm(m[3], m[4]) : a;
        ranges.push(value(a) <= value(b) ? [a, b] : [b, a]);
      }
      if (!ranges.length) continue;
      const lead = text.slice(0, first).match(/(?:^|[\s|])(\d{1,3})\s*[|:]?\s*$/);
      found.push({ lead: lead ? String(Number(lead[1])) : "", ranges, cy: line.cy, h: line.h });
    }
    const geometric = found.length > 1 && found.every((f) => Number.isFinite(f.cy) && f.h > 0);
    if (!geometric) {
      // no positions (typed text): reading order, explicit numbers where present
      let prev = 0;
      return found.map((f) => {
        if (f.lead) prev = Number(f.lead);
        else prev += 1;
        return { sektion: f.lead || String(prev), ranges: f.ranges, ...(f.lead ? {} : { guessed: true }) };
      });
    }
    // Table rows: a wrapped cell sits about one text line below; rows have a fixed pitch.
    const sorted = [...found].sort((a, b) => a.cy - b.cy),
      lineH = sorted.map((f) => f.h).sort((a, b) => a - b)[Math.floor(sorted.length / 2)],
      rows = [];
    let lastCy = -Infinity;
    for (const f of sorted) {
      const prev = rows[rows.length - 1];
      if (prev && f.cy - lastCy < lineH * 1.3) prev.ranges.push(...f.ranges);
      else rows.push({ ranges: [...f.ranges], cy: f.cy });
      lastCy = f.cy;
    }
    const gaps = rows.slice(1).map((r, i) => r.cy - rows[i].cy).sort((a, b) => a - b),
      pitch = gaps[Math.floor(gaps.length / 2)] || 1;
    // row number from the position; a missing row (not read) leaves a double gap
    return rows.map((r) => ({
      sektion: String(1 + Math.round((r.cy - rows[0].cy) / pitch)),
      ranges: r.ranges,
      guessed: true,
    }));
  }
  const formatSections = (rows) =>
    rows
      .map(
        (r) =>
          `${r.sektion || "?"}: ${r.ranges.map(([a, b]) => (a === b ? a : a + "-" + b)).join(", ")}${r.guessed ? "   (kontrollera nummer)" : ""}`,
      )
      .join("\n");
  /* Edited text back to rows: "3: 01.001-01.002, 01.015" (one or more lines per section). */
  function parseSections(text) {
    const rows = [];
    for (const lineText of String(text || "").split(/\r?\n/)) {
      const line = lineText.replace(/\(kontrollera nummer\)/g, "").trim();
      if (!line) continue;
      const m = line.match(/^\s*(\d{1,4})\s*[:|]\s*(.*)$/);
      if (!m) throw Error(`Börja raden med sektionsnummer och kolon: ${line.slice(0, 40)}`);
      const parsed = parseSectionTable([{ words: [{ text: m[2] }] }])[0];
      if (!parsed) throw Error(`Inga adresser på raden för sektion ${m[1]}.`);
      rows.push({ sektion: String(Number(m[1])), ranges: parsed.ranges });
    }
    return rows;
  }
  function sectionOf(address, rows) {
    const v = value(address);
    const hit = (rows || []).find((r) => r.ranges.some(([a, b]) => v >= value(a) && v <= value(b)));
    return hit ? hit.sektion : "";
  }

  /* Legend line after an address: "VD PLACERAD I VENTILATIONSAGGREGAT", "FLÄKTSTYRNING". */
  function describe(info, textApi) {
    if (!info) return { typ: "", placering: "" };
    const words = info.split(/\s+/).filter(Boolean),
      // OCR may put a stray symbol before the abbreviation ("X VD ...")
      at = words.slice(0, 3).findIndex((w) => textApi.shortType(w)),
      typ = at >= 0 ? textApi.shortType(words[at]) : textApi.typeOf(info) || "In-/utgångsenhet",
      rest = (at >= 0 ? words.slice(at + 1) : words).join(" ").replace(/[^A-Za-zÅÄÖåäö0-9)]+$/, "").trim(),
      placering = rest.toLowerCase().replace(/^./, (c) => c.toUpperCase());
    return { typ, placering: placering.slice(0, 120) };
  }
  /* Review rows for drawing pages read with OCR. */
  function candidates(pages, sections, register, defaults, detectorApi, textApi) {
    const rows = [],
      warnings = [],
      legendInfo = new Map();
    for (const p of pages) for (const l of p.legend) legendInfo.set(l.address, l.text);
    for (const p of pages) {
      const seen = new Map();
      for (const l of p.labels) {
        const list = seen.get(l.address) || [];
        list.push(l);
        seen.set(l.address, list);
      }
      // Labels packed tightly in a row or column are a legend list, not positions on the plan.
      const dense = (l) =>
        p.labels.filter(
          (o) =>
            o !== l &&
            ((Math.abs(o.y - l.y) < 0.004 && Math.abs(o.x - l.x) < 0.04) ||
              (Math.abs(o.x - l.x) < 0.004 && Math.abs(o.y - l.y) < 0.04)),
        ).length >= 3;
      for (const [address, all] of seen) {
        if (all.length > 1)
          warnings.push(`Sida ${p.page}: ${address} finns ${all.length} gånger (t.ex. konventionell sektion), en markering används.`);
        const onPlan = all.filter((x) => !dense(x)),
          list = onPlan.length ? onPlan : all,
          inList = !onPlan.length,
          l = list[0],
          [slinga, adress] = address.split("."),
          info = legendInfo.get(address) || "",
          sektion = sectionOf(address, sections),
          inTable = !sections?.length || !!sektion,
          legend = describe(info, textApi),
          values = {
            central: "",
            slinga,
            adress,
            sektion: sektion || defaults.sektion || "",
            typ: legend.typ || defaults.typ || "",
            placering: legend.placering,
            lokalId: "",
          },
          existing = register.devices.find(
            (d) => detectorApi.identity(d) === detectorApi.identity({ ...values, central: d.central || "" }),
          );
        rows.push({
          id: "ocr-" + rows.length,
          page: p.page,
          x: Math.min(1, Math.max(0, l.x)),
          y: Math.min(1, Math.max(0, l.y)),
          ...(l.w > 0 && l.h > 0 ? { w: l.w, h: l.h } : {}),
          ...values,
          ...(existing
            ? { sektion: existing.sektion || values.sektion, typ: existing.typ || values.typ, placering: existing.placering || values.placering }
            : {}),
          existingId: existing?.id || "",
          fromCover: !!sektion,
          ocr: true,
          conf: l.conf,
          // addresses outside the section table are probably misreadings
          inList,
          approved: inTable && !inList && (l.conf >= 40 || !!sektion),
          flag: !inTable ? "Saknas i sektionsförteckningen" : inList ? "Bara i förklaringslista – placera rätt" : "",
        });
      }
    }
    rows.sort((a, b) => a.page - b.page || value(a.slinga + "." + a.adress) - value(b.slinga + "." + b.adress));
    return { rows, warnings };
  }

  /* Words that look like real text (used to find the reading direction). */
  const scoreWords = (words) =>
    (words || []).filter(
      (w) => Number(w.conf) >= 60 && /[A-Za-zÅÄÖåäö]{3,}|\d{2}[.,]\d{3}/.test(String(w.text || "")),
    ).length;
  /* scores: {0: n, 90: n, 180: n, 270: n} -> clockwise rotation that makes the text readable. */
  function bestRotation(scores) {
    let best = 0,
      top = -1;
    for (const r of [0, 90, 180, 270])
      if (Number.isFinite(scores[r]) && scores[r] > top) {
        top = scores[r];
        best = r;
      }
    return best;
  }
  /* Text-layer directions [{a, b, n}] (baseline vector in screen coordinates, y down,
     n = characters) -> clockwise rotation that makes most text read left to right. */
  function rotationFromText(dirs) {
    const weight = { 0: 0, 90: 0, 180: 0, 270: 0 };
    let total = 0;
    for (const d of dirs || []) {
      if (!(Math.hypot(d.a, d.b) > 0) || !(d.n > 0)) continue;
      const angle = (((Math.round((Math.atan2(d.b, d.a) * 180) / Math.PI / 90) * 90) % 360) + 360) % 360;
      weight[(360 - angle) % 360] += d.n;
      total += d.n;
    }
    return total >= 20 ? bestRotation(weight) : null;
  }

  const api = { scoreWords, bestRotation, rotationFromText, digits, readLabels, mergeLabels, parseSectionTable, formatSections, parseSections, sectionOf, candidates };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.drawingOcrData = api;
})(typeof window === "object" ? window : globalThis);
