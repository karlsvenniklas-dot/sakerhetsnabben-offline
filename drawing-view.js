/* Drawing view: turns the drawing so its text reads left to right, and draws
   detector markings as tinted boxes over the label on the drawing.
   Saved positions stay in the drawing's own (unturned) coordinates; only the view turns.
   Everything runs on the device. */
(function (root) {
  "use strict";
  const turns = [0, 90, 180, 270];
  const valid = (r) => turns.includes(r);
  /* Clockwise view turn: CSS for the stage and its layers (w, h = unturned size). */
  function layout(rotation, w, h) {
    if (!rotation || !(w > 0 && h > 0)) return null;
    const quarter = rotation % 180 !== 0;
    return {
      ar: quarter ? h / w : w / h,
      cw: quarter ? (w / h) * 100 + "%" : "100%",
      ch: quarter ? (h / w) * 100 + "%" : "100%",
      tf:
        rotation === 90
          ? "rotate(90deg) translateY(-100%)"
          : rotation === 180
            ? "rotate(180deg) translate(-100%,-100%)"
            : "rotate(270deg) translateX(-100%)",
    };
  }
  /* Point on the turned view (0..1) -> point on the drawing (0..1). */
  function fromView(rotation, X, Y) {
    if (rotation === 90) return { x: Y, y: 1 - X };
    if (rotation === 180) return { x: 1 - X, y: 1 - Y };
    if (rotation === 270) return { x: 1 - Y, y: X };
    return { x: X, y: Y };
  }
  function toView(rotation, x, y) {
    if (rotation === 90) return { X: 1 - y, Y: x };
    if (rotation === 180) return { X: 1 - x, Y: 1 - y };
    if (rotation === 270) return { X: y, Y: 1 - x };
    return { X: x, Y: y };
  }
  const pure = { layout, fromView, toView };
  if (typeof module === "object" && module.exports) {
    module.exports = pure;
    return;
  }

  const key = (docId) => "drawing-view:" + docId;
  const mem = new Map();
  async function saved(docId) {
    try {
      const s = (await root.localData.read(key(docId), { pages: {} })) || { pages: {} };
      mem.set(docId, s);
      return s;
    } catch {
      return { pages: {} };
    }
  }
  /* {page: rotation} for every page whose direction is known. */
  async function known(docId) {
    const s = await saved(docId),
      out = {};
    for (const [n, v] of Object.entries(s.pages || {})) if (valid(v?.rotation)) out[n] = v.rotation;
    return out;
  }
  /* Store a direction; an automatic one never replaces one the user chose. */
  async function remember(docId, page, rotation, manual = false) {
    if (!docId || !valid(rotation)) return;
    await root.localData.updateRecord(key(docId), { pages: {} }, (s) => {
      const pages = { ...(s?.pages || {}) },
        old = pages[page];
      if (!manual && old?.manual) return { ...s, pages };
      pages[page] = { rotation, ...(manual ? { manual: true } : {}), at: new Date().toISOString() };
      mem.set(docId, { ...s, pages });
      return { ...s, pages };
    });
  }
  function apply(stage, canvas, rotation) {
    const l = layout(rotation, canvas.width, canvas.height);
    stage.dataset.rotation = String(l ? rotation : 0);
    if (!l) {
      delete stage.dataset.turned;
      for (const p of ["--dv-ar", "--dv-cw", "--dv-ch", "--dv-tf", "--dv-unturn"]) stage.style.removeProperty(p);
      return;
    }
    stage.dataset.turned = "yes";
    stage.style.setProperty("--dv-ar", String(l.ar));
    stage.style.setProperty("--dv-cw", l.cw);
    stage.style.setProperty("--dv-ch", l.ch);
    stage.style.setProperty("--dv-tf", l.tf);
    stage.style.setProperty("--dv-unturn", -rotation + "deg");
  }
  /* Click on the stage -> point on the drawing (0..1), whatever the view turn. */
  function point(stage, event) {
    const rect = stage.getBoundingClientRect(),
      X = (event.clientX - rect.left) / rect.width,
      Y = (event.clientY - rect.top) / rect.height;
    return fromView(Number(stage.dataset.rotation) || 0, X, Y);
  }
  /* A marking with a known label size becomes a tinted box over the label. */
  function decorate(mark, pin) {
    if (![pin?.w, pin?.h].every((v) => Number.isFinite(v) && v > 0 && v <= 0.25)) return mark;
    mark.classList.add("box");
    mark.style.width = `calc(${pin.w * 100}% + 8px)`;
    mark.style.height = `calc(${pin.h * 100}% + 8px)`;
    return mark;
  }

  /* Called after every render of the drawing. */
  let current = null,
    queue = Promise.resolve();
  async function drawn({ stage, canvas, docId, page, pdf, status }) {
    const me = (current = { docId, page });
    const bar = toolbar(stage, status),
      cached = mem.get(docId)?.pages?.[page];
    apply(stage, canvas, valid(cached?.rotation) ? cached.rotation : 0);
    const s = await saved(docId);
    if (current !== me) return;
    const entry = s.pages?.[page];
    apply(stage, canvas, valid(entry?.rotation) ? entry.rotation : 0);
    bar.turn.onclick = async () => {
      const next = ((Number(stage.dataset.rotation) || 0) + 90) % 360;
      apply(stage, canvas, next);
      bar.text.textContent = "Vriden för hand – sparas för den här sidan.";
      await remember(docId, page, next, true);
    };
    if (valid(entry?.rotation)) {
      bar.text.textContent = entry.manual ? "Vriden för hand." : entry.rotation ? "Vriden så texten blir läsbar." : "";
      return;
    }
    // unknown direction: the PDF's own text first (instant), otherwise OCR in the background
    let rotation = pdf ? await fromTextLayer(pdf, page) : null;
    if (current !== me) return;
    if (rotation == null && root.drawingOCR) {
      bar.text.textContent = "Tar reda på åt vilket håll texten går …";
      const job = queue.then(() =>
        current === me
          ? root.drawingOCR.detectRotation(pdf ? { pdf, number: page } : { canvas }, { cancelled: () => current !== me })
          : null,
      );
      queue = job.catch(() => {});
      try {
        rotation = (await job)?.rotation ?? null;
      } catch {
        rotation = null;
      }
    }
    if (current !== me) return;
    if (!valid(rotation)) {
      bar.text.textContent = "Läsriktningen gick inte att avgöra – vrid med knappen.";
      return;
    }
    await remember(docId, page, rotation);
    if (current !== me) return;
    // a manual turn made meanwhile wins
    const after = (await saved(docId)).pages?.[page];
    if (current !== me) return;
    if (after?.manual) return;
    apply(stage, canvas, rotation);
    bar.text.textContent = rotation ? "Vriden så texten blir läsbar." : "";
  }
  async function fromTextLayer(pdf, number) {
    try {
      const page = await pdf.getPage(number),
        vp = page.getViewport({ scale: 1 }),
        content = await page.getTextContent(),
        [m0, m1, m2, m3] = vp.transform,
        dirs = content.items
          .filter((i) => typeof i.str === "string" && i.str.trim())
          .map((i) => {
            const [a, b] = i.transform;
            // baseline direction on screen: viewport matrix times text matrix
            return { a: m0 * a + m2 * b, b: m1 * a + m3 * b, n: i.str.trim().length };
          });
      return root.drawingOcrData.rotationFromText(dirs);
    } catch {
      return null;
    }
  }
  function toolbar(stage, status) {
    const scroller = stage.parentElement;
    let bar = scroller.previousElementSibling;
    if (!bar?.classList.contains("dv-bar")) {
      bar = document.createElement("div");
      bar.className = "dv-bar";
      const turn = document.createElement("button");
      turn.type = "button";
      turn.textContent = "↻ Vrid ritningen";
      const text = document.createElement("span");
      text.setAttribute("role", "status");
      bar.append(turn, text);
      scroller.before(bar);
    }
    const [turn, text] = bar.children;
    if (status) text.textContent = status;
    return { turn, text };
  }
  root.drawingView = { ...pure, known, remember, apply, point, decorate, drawn };
})(typeof window === "object" ? window : globalThis);
