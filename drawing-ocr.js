/* Offline OCR of PDF drawings with Tesseract (Apache 2.0, files in ./tesseract).
   Nothing is sent over the network: all engine and language files are local. */
(() => {
  "use strict";
  let loading = null;
  function loadEngine() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    loading ||= new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "./tesseract/tesseract.min.js";
      s.onload = () => resolve(window.Tesseract);
      s.onerror = () => reject(Error("OCR-motorn kunde inte laddas. Installera offlinefilerna igen."));
      document.head.append(s);
    });
    return loading;
  }
  async function worker() {
    const T = await loadEngine(),
      base = new URL("./tesseract/", location.href).href.replace(/\/$/, "");
    const w = await T.createWorker("eng", 1, {
      workerPath: base + "/worker.min.js",
      corePath: base,
      langPath: base,
      gzip: false,
      cacheMethod: "none",
      workerBlobURL: false,
    });
    await w.setParameters({ preserve_interword_spaces: "1" });
    return w;
  }
  /* Render one rotation of a page (or one tile of it), black/white, for OCR.
     Tiles keep each canvas small enough for iPad/iPhone canvas limits. */
  async function render(page, rotation, maxSide, tile) {
    const base = page.getViewport({ scale: 1, rotation: page.rotate }),
      scale = maxSide / Math.max(base.width, base.height),
      vp = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 }),
      W = Math.ceil(vp.width),
      H = Math.ceil(vp.height),
      { n, tx, ty } = tile,
      overlap = 90,
      x0 = Math.max(0, Math.floor((tx * W) / n) - overlap),
      y0 = Math.max(0, Math.floor((ty * H) / n) - overlap),
      x1 = Math.min(W, Math.ceil(((tx + 1) * W) / n) + overlap),
      y1 = Math.min(H, Math.ceil(((ty + 1) * H) / n) + overlap),
      canvas = document.createElement("canvas");
    canvas.width = x1 - x0;
    canvas.height = y1 - y0;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // "print" renders without waiting for screen frames (works with a dimmed screen)
    await page.render({ canvasContext: ctx, viewport: vp, transform: [1, 0, 0, 1, -x0, -y0], intent: "print" }).promise;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height),
      d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      // dark strokes stay black; coloured section areas become white
      const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 110 ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    return { canvas, vp, base, x0, y0 };
  }
  /* Box in the rendered canvas -> 0..1 coordinates of the page as shown in the app. */
  function toPage(vp, base, x0, y0, x1, y1) {
    const pts = [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y1],
    ].map(([x, y]) => base.convertToViewportPoint(...vp.convertToPdfPoint(x, y)));
    const xs = pts.map((p) => p[0] / base.width),
      ys = pts.map((p) => p[1] / base.height);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  }
  function linesOf(data) {
    const source = data.lines?.length ? data.lines : [{ words: data.words || [], bbox: null }];
    return source.map((l) => ({ words: l.words || [], bbox: l.bbox }));
  }
  // Two passes at different resolutions find different labels; together they find most.
  const PLAN = [
    { maxSide: 3600, tiles: 1 },
    { maxSide: 5400, tiles: 2 },
  ];
  const COVER = [{ maxSide: 3600, tiles: 1 }];
  const ALL = [0, 90, 180, 270];
  const score = (pass) => window.drawingOcrData.scoreWords(pass.lines.flatMap((l) => l.words));
  /* Labels on drawings run in two directions: the readable one and a quarter turn from it. */
  const pairOf = (rotation) => [rotation, (rotation + 270) % 360];
  /* Returns per page: {page, rotation, passes:[{rotation, lines:[{cy, h, words:[{text, conf, x0,y0,x1,y1}]}]}]}
     cy/h are in the pass's own reading direction (for grouping table rows).
     rotation = clockwise turn that makes the page readable. known: {page: rotation}. */
  async function readPages(pdf, numbers, { onProgress, cover = 0, known = {}, cancelled } = {}) {
    const w = await worker(),
      out = [];
    try {
      const jobsFor = (n, cfg, rotations) =>
          rotations.flatMap((rotation) =>
            Array.from({ length: cfg.tiles * cfg.tiles }, (_, i) => ({
              n,
              rotation,
              cfg,
              tile: { n: cfg.tiles, tx: i % cfg.tiles, ty: Math.floor(i / cfg.tiles) },
            })),
          ),
        // first a quick pass on every page (all four directions when the direction is unknown);
        // the detailed pass only where addresses were found
        quickRotations = (n) => (Number.isInteger(known[n]) ? pairOf(known[n]) : ALL),
        jobs = numbers.flatMap((n) => jobsFor(n, n === cover ? COVER[0] : PLAN[0], quickRotations(n))),
        pages = new Map();
      let step = 0;
      for (let j = 0; j < jobs.length; j++) {
        const job = jobs[j];
        if (cancelled?.()) throw Error("Avbruten.");
        onProgress?.(`Läser sida ${job.n} – steg ${++step} av ${jobs.length} …`, step / jobs.length);
        const page = await pdf.getPage(job.n);
        await w.setParameters({ tessedit_pageseg_mode: job.n === cover ? "6" : "11" });
        const { canvas, vp, base, x0, y0 } = await render(page, job.rotation, job.cfg.maxSide, job.tile);
        const { data } = await w.recognize(canvas);
        canvas.width = canvas.height = 1;
        const entry = pages.get(job.n) || { page: job.n, rotation: known[job.n] ?? null, passes: [] };
        entry.passes.push({
          rotation: job.rotation,
          quick: job.cfg === PLAN[0] || job.cfg === COVER[0],
          lines: linesOf(data).map((l) => ({
            cy: l.bbox ? (l.bbox.y0 + l.bbox.y1) / 2 + y0 : 0,
            h: l.bbox ? l.bbox.y1 - l.bbox.y0 : 0,
            words: l.words.map((x) => ({
              text: x.text,
              conf: x.confidence,
              ...toPage(vp, base, x.bbox.x0 + x0, x.bbox.y0 + y0, x.bbox.x1 + x0, x.bbox.y1 + y0),
            })),
          })),
        });
        pages.set(job.n, entry);
        const quick = entry.passes.filter((p) => p.quick);
        if (!entry.done && quick.length === quickRotations(job.n).length) {
          entry.done = true;
          if (entry.rotation == null) {
            // the direction with most readable text; keep it and its quarter turn
            const scores = Object.fromEntries(quick.map((p) => [p.rotation, score(p)]));
            entry.rotation = window.drawingOcrData.bestRotation(scores);
            const keep = pairOf(entry.rotation);
            entry.passes = entry.passes.filter((p) => keep.includes(p.rotation));
          }
          const hits = entry.passes
            .flatMap((p) => p.lines.flatMap((l) => l.words))
            .filter((x) => /\d{2}[.,]\d{3}/.test(x.text)).length;
          if (job.n !== cover && hits >= 3)
            jobs.push(...PLAN.slice(1).flatMap((cfg) => jobsFor(job.n, cfg, pairOf(entry.rotation))));
        }
      }
      for (const n of numbers)
        if (pages.has(n)) {
          const { done, ...entry } = pages.get(n);
          out.push(entry);
        }
    } finally {
      await w.terminate();
    }
    return out;
  }
  /* Reading direction of one page (or an image canvas) for the drawing view.
     Upright and quarter turn first, then the half turn of the better one. */
  async function detectRotation(source, { cancelled } = {}) {
    const w = await worker();
    try {
      await w.setParameters({ tessedit_pageseg_mode: "11" });
      const page = source.pdf ? await source.pdf.getPage(source.number) : null,
        scores = {};
      const run = async (rotation) => {
        if (cancelled?.()) throw Error("Avbruten.");
        const canvas = page ? (await render(page, rotation, 2400, { n: 1, tx: 0, ty: 0 })).canvas : turned(source.canvas, rotation);
        const { data } = await w.recognize(canvas);
        canvas.width = canvas.height = 1;
        scores[rotation] = window.drawingOcrData.scoreWords(linesOf(data).flatMap((l) => l.words.map((x) => ({ text: x.text, conf: x.confidence }))));
      };
      await run(0);
      await run(90);
      const better = scores[90] > scores[0] ? 90 : 0;
      await run(better + 180);
      return { rotation: window.drawingOcrData.bestRotation(scores), scores };
    } finally {
      await w.terminate();
    }
  }
  /* Image source turned clockwise, black/white like the PDF renders. */
  function turned(source, rotation) {
    const quarter = rotation % 180 !== 0,
      canvas = document.createElement("canvas");
    canvas.width = quarter ? source.height : source.width;
    canvas.height = quarter ? source.width : source.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height),
      d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] < 110 ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
  window.drawingOCR = { readPages, detectRotation, loadEngine };
})();
