/* Marked drawing as an attachment: every drawing page with detector markings is
   drawn with green (tested OK), red (remark) and striped yellow (remaining) boxes,
   turned so the text reads, for the BL401 print and as a PDF. All on the device. */
(() => {
  "use strict";
  const COLOURS = {
    ok: { line: "#087f5b", fill: "rgba(18,183,106,.40)" },
    fault: { line: "#b42318", fill: "rgba(240,68,56,.42)" },
    remaining: { line: "#2b2100", fill: "rgba(255,200,40,.45)" },
  };
  const LEGEND = "Grön = provad OK · Röd = anmärkning · Gul randig = återstår i kvartalet";
  const MAX_SIDE = 2200;
  const db = () => window.localData;
  const qp = () => window.quarterPlanData;

  /* Colour per device as of the date: same rule as the drawing view, for the date's quarter. */
  function statuses(register, issues, date) {
    const q = qp().quarterOf(date),
      { from } = qp().quarterRange(date.slice(0, 4), q),
      out = new Map();
    for (const d of register.devices || []) {
      const latest = (register.events || [])
        .filter(
          (e) => e.kind === "test" && e.deviceId === d.id && e.generation === d.generation && e.date >= from && e.date <= date,
        )
        .sort((a, b) => b.date.localeCompare(a.date) || String(b.recordedAt).localeCompare(String(a.recordedAt)))[0];
      const pending = (issues || []).some((i) => i.group === "det:" + d.id + ":" + d.generation && i.status !== "Kontrollerad");
      out.set(
        d.id,
        pending || latest?.status === "Provad – anmärkning" ? "fault" : latest?.status === "Provad – OK" ? "ok" : "remaining",
      );
    }
    return { quarter: q, from, colours: out };
  }

  let pdfjsPromise = null;
  async function pdfjs() {
    if (!pdfjsPromise)
      pdfjsPromise = import("./pdf.min.mjs").then((m) => {
        m.GlobalWorkerOptions.workerSrc = new URL("./pdf.worker.min.mjs", location.href).href;
        return m;
      });
    return pdfjsPromise;
  }
  async function openDoc(content) {
    if (content.startsWith("data:application/pdf;")) {
      const lib = await pdfjs();
      const pdf = await lib.getDocument({
        data: Uint8Array.from(atob(content.split(",")[1]), (c) => c.charCodeAt(0)),
        useSystemFonts: true,
        useWasm: false,
        isEvalSupported: false,
      }).promise;
      return {
        async page(n) {
          const page = await pdf.getPage(n),
            base = page.getViewport({ scale: 1 }),
            scale = Math.min(4, MAX_SIDE / Math.max(base.width, base.height)),
            vp = page.getViewport({ scale }),
            canvas = document.createElement("canvas");
          canvas.width = Math.round(vp.width);
          canvas.height = Math.round(vp.height);
          const g = canvas.getContext("2d");
          g.fillStyle = "#fff";
          g.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: g, viewport: vp }).promise;
          page.cleanup();
          return canvas;
        },
        close: () => pdf.destroy(),
      };
    }
    if (/^data:image\//.test(content)) {
      const img = new Image();
      img.src = content;
      await img.decode();
      return {
        async page() {
          const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight)),
            canvas = document.createElement("canvas");
          canvas.width = Math.round(img.naturalWidth * scale);
          canvas.height = Math.round(img.naturalHeight * scale);
          const g = canvas.getContext("2d");
          g.fillStyle = "#fff";
          g.fillRect(0, 0, canvas.width, canvas.height);
          g.drawImage(img, 0, 0, canvas.width, canvas.height);
          return canvas;
        },
        close() {},
      };
    }
    throw Error("Ritningen har ett format som inte stöds.");
  }

  function stripes(g, colour) {
    const tile = document.createElement("canvas");
    tile.width = tile.height = 10;
    const t = tile.getContext("2d");
    t.fillStyle = colour.fill;
    t.fillRect(0, 0, 10, 10);
    t.strokeStyle = "rgba(43,33,0,.4)";
    t.lineWidth = 1.5;
    t.beginPath();
    for (const o of [-10, 0, 10]) {
      t.moveTo(o, 10);
      t.lineTo(o + 10, 0);
    }
    t.stroke();
    return g.createPattern(tile, "repeat");
  }
  /* Draw boxes (or dots for hand-placed markings) in the drawing's own coordinates. */
  function mark(canvas, pins, colours) {
    const g = canvas.getContext("2d"),
      W = canvas.width,
      H = canvas.height,
      line = Math.max(2, Math.round(Math.max(W, H) / 900)),
      pad = Math.max(4, Math.round(Math.max(W, H) / 450)),
      counts = { ok: 0, fault: 0, remaining: 0 };
    const pattern = stripes(g, COLOURS.remaining);
    for (const pin of pins) {
      const kind = colours.get(pin.deviceId);
      if (!kind) continue;
      counts[kind]++;
      const c = COLOURS[kind],
        x = pin.x * W,
        y = pin.y * H;
      g.lineWidth = line;
      g.strokeStyle = c.line;
      g.fillStyle = kind === "remaining" ? pattern : c.fill;
      const boxed = [pin.w, pin.h].every((v) => Number.isFinite(v) && v > 0 && v <= 0.25);
      if (boxed) {
        const w = pin.w * W + pad,
          h = pin.h * H + pad;
        g.fillRect(x - w / 2, y - h / 2, w, h);
        g.strokeRect(x - w / 2, y - h / 2, w, h);
        if (kind === "remaining") {
          g.strokeStyle = "#ffd54a";
          g.lineWidth = Math.max(1, line / 2);
          g.strokeRect(x - w / 2 - line, y - h / 2 - line, w + 2 * line, h + 2 * line);
        }
      } else {
        const r = Math.max(W, H) / 110;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fillStyle = c.line;
        g.fill();
        g.strokeStyle = "#fff";
        g.stroke();
      }
    }
    return counts;
  }
  /* Turn the marked page so the text reads (same turn as on screen). */
  function turn(canvas, rotation) {
    if (!rotation) return canvas;
    const quarter = rotation % 180 !== 0,
      out = document.createElement("canvas");
    out.width = quarter ? canvas.height : canvas.width;
    out.height = quarter ? canvas.width : canvas.height;
    const g = out.getContext("2d");
    g.translate(out.width / 2, out.height / 2);
    g.rotate((rotation * Math.PI) / 180);
    g.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
  }

  async function load(facilityId) {
    const [field, register, issues, docs] = await Promise.all([
      db().read("fieldwork:" + facilityId, { pins: [] }),
      db().read("detectors:" + facilityId, { devices: [], events: [] }),
      db().read("issues:" + facilityId, []),
      db().read("docs:" + facilityId, []),
    ]);
    return { pins: field?.pins || [], register: register || { devices: [], events: [] }, issues: issues || [], docs: docs || [] };
  }
  const cache = new Map();
  /* [{docId, name, page, dataUrl, width, height, counts}] for every page with markings. */
  async function render({ facilityId, date }) {
    const data = await load(facilityId),
      ev = data.register.events,
      key = [facilityId, date, ev.length, ev.map((e) => e.recordedAt).sort().pop() || "", JSON.stringify(data.pins), data.issues.length].join("|");
    if (!cache.has(key)) {
      if (cache.size > 4) cache.clear();
      cache.set(key, build(data, date).catch((e) => (cache.delete(key), Promise.reject(e))));
    }
    return cache.get(key);
  }
  async function build(data, date) {
    const { quarter, from, colours } = statuses(data.register, data.issues, date),
      groups = new Map();
    for (const p of data.pins) {
      if (!colours.has(p.deviceId)) continue;
      const k = p.docId + "|" + p.page;
      if (!groups.has(k)) groups.set(k, { docId: p.docId, page: p.page, pins: [] });
      groups.get(k).pins.push(p);
    }
    const out = [],
      byDoc = new Map();
    for (const g of groups.values()) {
      if (!byDoc.has(g.docId)) byDoc.set(g.docId, []);
      byDoc.get(g.docId).push(g);
    }
    for (const [docId, list] of byDoc) {
      const content = await db().read("docfile:" + docId);
      if (typeof content !== "string") continue;
      const meta = data.docs.find((d) => d.id === docId),
        view = (await db().read("drawing-view:" + docId, { pages: {} })) || { pages: {} },
        doc = await openDoc(content);
      try {
        for (const g of list.sort((a, b) => a.page - b.page)) {
          const canvas = await doc.page(g.page),
            counts = mark(canvas, g.pins, colours),
            turned = turn(canvas, Number(view.pages?.[g.page]?.rotation) || 0);
          out.push({
            docId,
            name: meta?.namn || "Ritning",
            page: g.page,
            dataUrl: turned.toDataURL("image/jpeg", 0.82),
            width: turned.width,
            height: turned.height,
            counts,
          });
          canvas.width = canvas.height = 0;
        }
      } finally {
        doc.close();
      }
    }
    return { quarter, year: date.slice(0, 4), from, date, pages: out };
  }

  /* BL401: drawing attachment under the detector results. Called from a React ref, so idempotent. */
  function mount(node, { facility, events }) {
    if (!node || !facility?.id) return;
    const date = events?.[0]?.date || window.orderData?.today?.() || new Date().toISOString().slice(0, 10),
      key = facility.id + "|" + date + "|" + (events || []).map((e) => e.id).join(",");
    if (node.dataset.key === key) return;
    node.dataset.key = key;
    const h = (tag, text, style) => {
      const n = document.createElement(tag);
      if (text) n.textContent = text;
      if (style) n.style.cssText = style;
      return n;
    };
    // In the printed protocol the attachment goes last, before the footer.
    const printDoc = node.closest("#protokoll-doc");
    if (printDoc) {
      let tail = printDoc.querySelector(":scope > .drawing-attachment-tail");
      if (!tail) {
        tail = document.createElement("div");
        tail.className = "drawing-attachment-tail";
        const footer = printDoc.lastElementChild;
        footer && footer.tagName === "DIV" ? printDoc.insertBefore(tail, footer) : printDoc.append(tail);
      }
      tail.dataset.key = key;
      node = tail;
    }
    node.replaceChildren(h("p", "Skapar ritningsbilaga …", "color:#526776"));
    render({ facilityId: facility.id, date })
      .then((r) => {
        if (node.dataset.key !== key) return;
        if (!r.pages.length) return node.replaceChildren();
        node.replaceChildren(
          ...r.pages.map((p, i) => {
            const fig = h(
              "figure",
              "",
              `margin:0;${i || printDoc ? "break-before:page;page-break-before:always;" : "margin-top:16px;"}break-inside:avoid`,
            );
            const cap = h(
              "figcaption",
              `Ritningsbilaga · ${p.name} · sida ${p.page} · kvartal ${r.quarter} ${r.year}, läge ${r.date} · ` +
                `${p.counts.ok} OK, ${p.counts.fault} anmärkning, ${p.counts.remaining} återstår`,
              "font-size:11px;font-weight:700;color:#153343;margin:0 0 4px",
            );
            const img = h("img", "", "display:block;width:100%;max-height:250mm;object-fit:contain;border:1px solid #ccc");
            img.src = p.dataUrl;
            img.alt = `Märkt ritning ${p.name} sida ${p.page}`;
            fig.append(cap, img, h("p", LEGEND, "font-size:10px;color:#3c4f5c;margin:4px 0 0"));
            return fig;
          }),
        );
      })
      .catch((e) => {
        if (node.dataset.key === key) node.replaceChildren(h("p", "Ritningsbilagan kunde inte skapas: " + e.message, "color:#b42318"));
      });
  }

  /* pdf-lib only has WinAnsi fonts: replace characters it cannot write. */
  const plain = (s) =>
    String(s ?? "")
      .replace(/[✓✔]/g, "OK")
      .replace(/[✕✗]/g, "x")
      .replace(/[^\x20-\x7E\xA0-\xFF–—·•‘’“”…\n]/g, "?");

  /* PDF: the marked pages, then what remains. */
  async function pdf({ facilityId, facilityName = "", date, remainingText = "" }) {
    const r = await render({ facilityId, date });
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib,
      doc = await PDFDocument.create(),
      font = await doc.embedFont(StandardFonts.Helvetica),
      bold = await doc.embedFont(StandardFonts.HelveticaBold),
      ink = rgb(0.08, 0.13, 0.17),
      M = 28;
    doc.setTitle(plain(`Märkt ritning ${facilityName} ${date}`));
    for (const p of r.pages) {
      const landscape = p.width > p.height,
        size = landscape ? [842, 595] : [595, 842],
        page = doc.addPage(size),
        image = await doc.embedJpg(p.dataUrl),
        fit = image.scaleToFit(size[0] - 2 * M, size[1] - 2 * M - 46);
      page.drawText(plain(`${facilityName ? facilityName + " · " : ""}${p.name} · sida ${p.page}`), {
        x: M,
        y: size[1] - M - 4,
        size: 11,
        font: bold,
        color: ink,
      });
      page.drawText(
        plain(`Kvartal ${r.quarter} ${r.year}, läge ${r.date} · ${p.counts.ok} OK · ${p.counts.fault} anmärkning · ${p.counts.remaining} återstår`),
        { x: M, y: size[1] - M - 18, size: 9, font, color: ink },
      );
      page.drawImage(image, { x: M + (size[0] - 2 * M - fit.width) / 2, y: M + 18, width: fit.width, height: fit.height });
      page.drawText(plain(LEGEND), { x: M, y: M, size: 8, font, color: ink });
    }
    if (remainingText) {
      let page,
        y = 0;
      const next = () => {
        page = doc.addPage([595, 842]);
        y = 842 - M - 6;
      };
      next();
      const lines = plain(remainingText).split("\n");
      lines.forEach((line, i) => {
        const f = i === 0 || /:$/.test(line) ? bold : font,
          size = i === 0 ? 13 : 9.5;
        // wrap long lines, keeping the indent
        const indent = line.match(/^ */)[0],
          words = line.trim().split(" ");
        let row = indent;
        const flush = () => {
          if (y < M + 12) next();
          page.drawText(row, { x: M, y, size, font: f, color: ink });
          y -= size + 4;
          row = indent + "  ";
        };
        for (const w of words) {
          const test = row.trim() ? row + " " + w : row + w;
          if (f.widthOfTextAtSize(test, size) > 595 - 2 * M && row.trim()) {
            flush();
            row += w;
          } else row = test;
        }
        flush();
      });
    }
    if (!doc.getPageCount()) throw Error("Det finns inga markeringar på ritningarna att exportera.");
    return new Blob([await doc.save()], { type: "application/pdf" });
  }

  window.drawingExport = { statuses, render, mount, pdf, LEGEND };
})();
