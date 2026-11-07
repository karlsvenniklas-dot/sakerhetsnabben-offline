/* Drawing tools for the field: offline PDF text scan, tap-to-test sheet and
   progress box. Everything runs locally in the browser. */
(() => {
  "use strict";
  const core = window.drawingTextData;
  let det = window.detectorData; // detectors.js loads after this file
  const memory = { facility: "", quick: false, scroll: {}, scan: null, planOpen: false };
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const button = (text, fn, cls = "secondary") => {
    const b = el("button", text, cls);
    b.type = "button";
    b.onclick = fn;
    return b;
  };
  function field(parent, title, node) {
    const l = el("label", title);
    l.append(node);
    parent.append(l);
    return node;
  }
  function options(select, values, value) {
    select.replaceChildren(
      ...values.map(([v, t]) => {
        const o = el("option", t);
        o.value = v;
        return o;
      }),
    );
    if (value !== undefined) select.value = value;
    return select;
  }
  // Predefined answers; the rule reference ends up in the protocol comment.
  const FAULTS = [
    "Ingen larmindikering vid larmprov (SBF 110:8 avsnitt 11.5.3 a–b)",
    "Indikeringslampa tänds inte vid larmprov (SBF 110:8 avsnitt 11.5.3 a–b)",
    "Detektor nedsmutsad — rengöring/byte krävs (SBF 110:8 avsnitt 12.4)",
    "Detektor defekt — byte krävs (SBF 110:8 avsnitt 12.4)",
    "Detektor felplacerad efter lokalförändring (SBF 110:8 avsnitt 6.5 och 11.6)",
    "Detektor övertäckt eller skymd av föremål (SBF 110:8 avsnitt 11.6)",
    "Detektor saknas på angiven plats (SBF 110:8 avsnitt 9.4 och 11.6)",
    "Adress/sektion stämmer ej med ritning eller centralens text (SBF 110:8 avsnitt 9.4 och 11.6)",
    "Märkning saknas eller felaktig",
    "Detektor ej åtkomlig — provas vid nästa tillfälle",
  ];
  /* Camera photo -> JPEG data URL of at most ~1600 px, so the register stays small. */
  async function shrinkPhoto(file) {
    if (!/^image\//.test(file.type || "image/")) throw Error("Välj en bild.");
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      try {
        await img.decode();
      } catch {
        throw Error("Bilden kunde inte läsas. Prova att ta fotot igen.");
      }
      for (const [side, quality] of [[1600, 0.75], [1200, 0.65], [900, 0.6]]) {
        const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight)),
          canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/jpeg", quality);
        canvas.width = canvas.height = 0;
        if (data.length < 1.4 * 1024 * 1024) return data;
      }
      throw Error("Fotot blev för stort.");
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  let toastTimer = 0;
  function toast(text, undo) {
    document.querySelector(".dq-toast")?.remove();
    clearTimeout(toastTimer);
    const t = el("div", undefined, "dq-toast");
    t.setAttribute("role", "status");
    t.append(el("span", text));
    if (undo)
      t.append(
        button("Ångra", async () => {
          t.remove();
          await undo();
        }),
      );
    document.body.append(t);
    toastTimer = setTimeout(() => t.remove(), 9000);
  }
  async function loadPdf(db, docId) {
    const content = await db.read("docfile:" + docId);
    if (typeof content !== "string") throw Error("Dokumentfilen saknas.");
    if (!content.startsWith("data:application/pdf;"))
      throw Error("Textläsning fungerar på PDF-ritningar. Bilder kan märkas med symbolsökningen.");
    const pdfjs = await import("./pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("./pdf.worker.min.mjs", location.href).href;
    const pdf = await pdfjs.getDocument({
      data: Uint8Array.from(atob(content.split(",")[1]), (c) => c.charCodeAt(0)),
      useSystemFonts: true,
      useWasm: false,
      isEvalSupported: false,
    }).promise;
    return { pdf, Util: pdfjs.Util };
  }
  async function pageText(pdf, Util, number) {
    const page = await pdf.getPage(number),
      viewport = page.getViewport({ scale: 1 }),
      text = await page.getTextContent();
    const items = text.items
      .filter((i) => typeof i.str === "string" && i.str.trim())
      .map((i) => {
        const m = Util.transform(viewport.transform, i.transform),
          len = Math.hypot(m[0], m[1]) || 1;
        return {
          str: i.str,
          x: m[4],
          y: m[5],
          dx: m[0] / len,
          dy: m[1] / len,
          h: Math.hypot(m[2], m[3]),
          w: i.width * viewport.scale,
        };
      });
    page.cleanup();
    return { items, width: viewport.width, height: viewport.height };
  }

  function mount(ctx) {
    det = window.detectorData;
    const {
      drawings,
      stage,
      scroller,
      facility: f,
      db,
      register,
      orderSelect,
      technician,
      testDate,
      year,
      quarter,
    } = ctx;
    if (memory.facility !== f.id) {
      memory.facility = f.id;
      memory.quick = false;
      memory.scan = null;
    }
    let disposed = false;
    const layer = el("div", undefined, "drawing-overlay ai-overlay");
    stage.append(layer);

    /* ---------- progress box ---------- */
    const box = el("section", undefined, "dq-progress");
    const head = el("div", undefined, "dq-head"),
      big = el("strong", "–", "dq-big"),
      headText = el("div"),
      bar = el("div", undefined, "dq-bar"),
      fill = el("span"),
      mark = el("i"),
      detail = el("p", undefined, "dq-detail");
    bar.append(fill, mark);
    head.append(big, headText);
    const quickToggle = button("", () => {
      memory.quick = !memory.quick;
      paintQuick();
    });
    const done = button("Klar – öppna protokollet", openProtocol);
    const actions = el("div", undefined, "dq-actions");
    actions.append(quickToggle, done);
    const goalBox = el("details", undefined, "dq-goal");
    goalBox.append(el("summary", "Regelverk, krav och sektioner"));
    const goalGrid = el("div", undefined, "import-grid"),
      ruleSel = field(goalGrid, "Krav för kvartalsprov", el("select")),
      percent = field(goalGrid, "Eget krav per kvartal (%)", el("input")),
      basis = field(goalGrid, "Eget krav räknas på", el("select"));
    percent.type = "number";
    percent.min = "1";
    percent.max = "100";
    percent.step = "1";
    const goal = ctx.goal || { rule: "auto" };
    options(
      ruleSel,
      [
        ["auto", "Automatiskt förslag (kontrollera regelval)"],
        ...Object.entries(core.RULES).map(([k, r]) => [k, r.label]),
        ["custom", "Eget krav (avtal)"],
      ],
      goal.rule || (goal.percent ? "custom" : "auto"),
    );
    percent.value = String(goal.percent || 10);
    options(
      basis,
      [
        ["sections", "Sektioner (minst en provad detektor)"],
        ["devices", "Detektorer"],
      ],
      goal.basis || "sections",
    );
    const showCustom = () => {
      percent.parentElement.hidden = ruleSel.value !== "custom";
      basis.parentElement.hidden = ruleSel.value !== "custom";
    };
    showCustom();
    const saveGoal = async () => {
      showCustom();
      try {
        const g =
          ruleSel.value === "custom"
            ? { rule: "custom", percent: Number(percent.value), basis: basis.value }
            : { rule: ruleSel.value };
        core.rule(g, register.devices);
        await ctx.saveField((s) => (s.goal = g));
      } catch (e) {
        detail.textContent = e.message;
      }
    };
    ruleSel.onchange = saveGoal;
    percent.onchange = saveGoal;
    basis.onchange = saveGoal;
    const ruleNote = el("p", undefined, "dq-detail"),
      sectionList = el("div", undefined, "dq-sections");
    goalBox.append(
      goalGrid,
      ruleNote,
      el(
        "p",
        "Välj rätt regel för objektet. Auto är bara ett förslag. Översikten visar registrerad detektorprovning, inte ett intyg om regeluppfyllelse. Avtal och kravställare kan kräva mer. Larmdon, styrningar, larmöverföring, tablåer och batterier kontrolleras separat.",
        "dq-detail",
      ),
      sectionList,
    );
    /* ---------- quarterly plan and history per section ---------- */
    const qp = window.quarterPlanData;
    let quarterPlan = ctx.quarterPlan || { sections: {} };
    const planBox = el("details", undefined, "dq-goal dq-plan"),
      planSummary = el("summary", "Kvartalsplan och historik per sektion"),
      planNote = el("p", undefined, "dq-detail"),
      planTable = el("div", undefined, "dq-table-wrap");
    planBox.append(
      planSummary,
      el(
        "p",
        "Sektionerna fördelas som arbetsförslag över året. Små anläggningar kan få samma sektion planerad flera kvartal. Granska förslaget mot valt regelverk och antal detektorer; du kan justera manuellt. Rött = inte provad på 12 månader.",
        "dq-detail",
      ),
      planNote,
      planTable,
    );
    const shareList = button("Återstående – dela lista", shareRemaining),
      exportPdf = button("Märkt ritning som PDF", exportDrawing);
    actions.append(shareList, exportPdf);
    box.append(head, bar, detail, actions, goalBox, planBox);
    drawings.insertBefore(box, drawings.children[1] || null);
    const refDate = () => (/^\d{4}-\d{2}-\d{2}$/.test(testDate.value) ? testDate.value : new Date().toISOString().slice(0, 10));
    const sectionName = (s) => qp.sectionName(s);

    function paintPlan(c) {
      const plan = qp.planQuarters(register.devices, quarterPlan),
        h = qp.history(register, refDate()),
        hist = new Map(h.sections.map((s) => [s.section, s])),
        current = Number(quarter.value),
        planned = plan.byQuarter[current] || [],
        testedNow = (s) =>
          register.devices.some((d) => qp.sectionOf(d) === s && det.tested(d, register.events, c.from, c.to)),
        doneNow = planned.filter(testedNow).length,
        staleSections = h.sections.filter((s) => s.stale && s.section).length;
      planSummary.textContent =
        `Kvartalsplan och historik · kvartal ${current}: ${doneNow}/${planned.length} planerade sektioner provade` +
        (h.stale.length ? ` · ${h.stale.length} detektorer ej provade på 12 mån` : "");
      planNote.textContent =
        `Kvartal ${current}: ${planned.length ? planned.map(sectionName).join(", ") : "inga sektioner"}. ` +
        (staleSections
          ? `${staleSections} ${staleSections === 1 ? "sektion" : "sektioner"} har inte provats sedan ${h.limit}.`
          : `Alla sektioner har provats sedan ${h.limit}.`);
      planNote.className = staleSections ? "dq-detail dq-left" : "dq-detail";
      if (!plan.rows.length) {
        planTable.replaceChildren(el("p", "Inga detektorer med sektion ännu.", "dq-detail"));
        return;
      }
      const table = el("table", undefined, "dq-table dq-plan-table"),
        headRow = el("tr");
      for (const t of ["Sektion", "Kvartal", "Senast provad", "Läge"]) headRow.append(el("th", t));
      table.append(headRow);
      for (const r of plan.rows) {
        const s = hist.get(r.section) || { last: "", stale: true, devices: r.devices, recent: 0 },
          row = el("tr"),
          sel = el("select"),
          now = testedNow(r.section);
        sel.setAttribute("aria-label", "Kvartal för " + sectionName(r.section));
        options(
          sel,
          [
            ["auto", "Auto"],
            ...[1, 2, 3, 4].map((q) => [String(q), "Kvartal " + q]),
          ],
          r.manual ? String(r.quarter) : "auto",
        );
        if (!r.manual) sel.options[0].textContent = "Auto (" + r.quarter + ")";
        sel.onchange = async () => {
          try {
            quarterPlan = qp.setQuarter(quarterPlan, r.section, sel.value);
            const next = quarterPlan;
            await ctx.saveField((st) => (st.quarterPlan = next));
          } catch (e) {
            toast(e.message);
          }
        };
        const state = now
          ? "✓ provad i kvartalet"
          : s.stale
            ? "⚠ ej provad på 12 mån"
            : r.quarter === current
              ? "Planerad nu – återstår"
              : "";
        row.className = [r.quarter === current && "now", s.stale && "stale", now && "done"].filter(Boolean).join(" ");
        const selCell = el("td");
        selCell.append(sel);
        row.append(
          el("td", `${sectionName(r.section)} (${r.devices})`),
          selCell,
          el("td", s.last || "Aldrig"),
          el(
            "td",
            [state, s.recent < s.devices && s.last && `${s.devices - s.recent} av ${s.devices} detektorer >12 mån`]
              .filter(Boolean)
              .join(" · "),
          ),
        );
        table.append(row);
      }
      planTable.replaceChildren(table);
    }

    function remainingText() {
      const r = qp.remaining(register, {
        year: year.value,
        quarter: quarter.value,
        plan: quarterPlan,
        refDate: refDate(),
        issues: ctx.issues || [],
      });
      return qp.remainingText(r, {
        facility: [f.anlNr, f.namn].filter(Boolean).join(" "),
        year: year.value,
        quarter: quarter.value,
        label: (d) => det.label(d, f.central) + (d.placering ? " (" + d.placering + ")" : ""),
        today: new Date().toISOString().slice(0, 10),
      });
    }
    const fileName = (kind, ext) =>
      `${kind}-${String(f.anlNr || f.namn || "objekt").replace(/[^\wåäöÅÄÖ-]+/g, "_")}-${year.value}-K${quarter.value}.${ext}`;
    async function shareFile(file, title) {
      try {
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title });
          return;
        }
      } catch (e) {
        if (e.name === "AbortError") return;
      }
      const url = URL.createObjectURL(file),
        a = el("a");
      a.href = url;
      a.download = file.name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    async function shareRemaining() {
      let text;
      try {
        text = remainingText();
      } catch (e) {
        toast(e.message);
        return;
      }
      const wrap = el("div", undefined, "dq-sheet-wrap"),
        sheet = el("div", undefined, "dq-sheet");
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-modal", "true");
      sheet.setAttribute("aria-label", "Återstående provning");
      wrap.onclick = (e) => e.target === wrap && wrap.remove();
      const area = el("textarea", undefined, "dq-remaining");
      area.value = text;
      area.rows = 14;
      area.readOnly = true;
      const row = el("div", undefined, "dq-actions");
      row.append(
        button(
          "Dela / spara som text",
          () => shareFile(new File([text], fileName("aterstaende", "txt"), { type: "text/plain" }), "Återstående provning"),
          "primary",
        ),
        button("Kopiera", async () => {
          try {
            await navigator.clipboard.writeText(text);
            toast("Listan är kopierad.");
          } catch {
            area.select();
            toast("Markerad – kopiera med menyn.");
          }
        }),
        button("Märkt ritning + lista som PDF", () => {
          wrap.remove();
          exportDrawing();
        }),
      );
      sheet.append(el("h3", "Återstående provning"), area, row, button("Stäng", () => wrap.remove()));
      wrap.append(sheet);
      document.body.append(wrap);
    }
    async function exportDrawing() {
      if (!window.drawingExport || !window.PDFLib) {
        toast("PDF-funktionen är inte laddad.");
        return;
      }
      exportPdf.disabled = true;
      const old = exportPdf.textContent;
      exportPdf.textContent = "Skapar PDF …";
      try {
        const date = (() => {
          const { to } = qp.quarterRange(year.value, quarter.value),
            ref = refDate();
          return ref < to ? ref : to;
        })();
        const blob = await window.drawingExport.pdf({
          facilityId: f.id,
          facilityName: [f.anlNr, f.namn].filter(Boolean).join(" "),
          date,
          remainingText: remainingText(),
        });
        await shareFile(new File([blob], fileName("ritning", "pdf"), { type: "application/pdf" }), "Märkt ritning");
      } catch (e) {
        toast("PDF kunde inte skapas: " + e.message);
      } finally {
        exportPdf.disabled = false;
        exportPdf.textContent = old;
      }
    }

    function updateProgress() {
      let c, p;
      try {
        c = det.coverage(register, year.value, quarter.value);
        p = core.progress(c, ctx.goal || goal, register.devices);
      } catch (e) {
        detail.textContent = e.message;
        return;
      }
      const q = p.quarter,
        unit = (n) =>
          p.basis === "devices" ? (n === 1 ? "detektor" : "detektorer") : n === 1 ? "sektion" : "sektioner",
        left = q.needed - q.done;
      big.textContent = q.percent + " %";
      headText.replaceChildren(
        el("span", `Kvartal ${quarter.value} · ${year.value} · ${p.label}`, "dq-eyebrow"),
        el(
          "span",
          q.total
            ? q.met
              ? `Kvartalskravet är uppfyllt ✓ (${q.done} av minst ${q.needed} ${unit(q.needed)})`
              : `${left} ${unit(left)} kvar – krav minst ${p.goal} % = ${q.needed} av ${q.total}`
            : "Inga detektorer med sektion ännu – läs in ritningen",
          q.met ? "dq-ok" : "dq-left",
        ),
      );
      box.classList.toggle("met", q.met);
      // the bar shows progress towards the quarterly requirement
      fill.style.width = (q.needed ? Math.min(100, (q.done / q.needed) * 100) : 0) + "%";
      mark.hidden = true;
      const yearText = p.yearChecks.length
        ? " · År " +
          year.value +
          ": " +
          p.yearChecks
            .map(
              (y) =>
                `${y.basis === "devices" ? "detektorer" : "sektioner"} ${y.done}/${y.needed}${y.met ? " ✓" : ""}`,
            )
            .join(", ")
        : ` · År ${year.value}: ${p.year.devicePercent} % av detektorerna`;
      detail.textContent =
        `Kvartal: detektorer ${c.quarter.devices}/${c.totalDevices} (${q.devicePercent} %) · ` +
        `sektioner ${c.quarter.sections}/${c.totalSections} (${q.sectionPercent} %)` +
        yearText;
      ruleNote.textContent = p.ref + ": " + p.note;
      try {
        paintPlan(c);
      } catch (e) {
        planNote.textContent = e.message;
      }
      // per-section overview
      const sections = new Map();
      for (const d of register.devices) {
        const s = d.sektion || "Utan sektion";
        if (!sections.has(s)) sections.set(s, { total: 0, tested: 0 });
        const row = sections.get(s);
        row.total++;
        if (det.tested(d, register.events, c.from, c.to)) row.tested++;
      }
      sectionList.replaceChildren(
        ...[...sections.entries()]
          .sort((a, b) => a[0].localeCompare(b[0], "sv", { numeric: true }))
          .map(([s, r]) =>
            el(
              "span",
              `${/^\d/.test(s) ? "Sektion " + s : s}: ${r.tested}/${r.total}${r.tested ? " ✓" : ""}`,
              r.tested ? "dq-chip ok" : "dq-chip",
            ),
          ),
      );
    }
    year.addEventListener("change", updateProgress);
    quarter.addEventListener("change", updateProgress);
    testDate.addEventListener("change", updateProgress);
    planBox.open = !!memory.planOpen;
    planBox.addEventListener("toggle", () => (memory.planOpen = planBox.open));

    function paintQuick() {
      quickToggle.textContent = memory.quick
        ? "Provningsläge PÅ – tryck på en detektor"
        : "Starta provningsläge";
      quickToggle.className = memory.quick ? "primary" : "secondary";
      quickToggle.setAttribute("aria-pressed", String(memory.quick));
      stage.classList.toggle("dq-quick", memory.quick);
    }
    function openProtocol() {
      const order = ctx.orders.find((o) => o.id === orderSelect.value);
      if (!order) {
        toast("Välj arbetsorder ovanför ritningen först.");
        return;
      }
      ctx.refresh();
      window.dispatchEvent(
        new CustomEvent("open-order", { detail: { id: f.id, order: { ...order } } }),
      );
    }

    /* ---------- technician memory (this device only) ---------- */
    try {
      if (!technician.value) technician.value = localStorage.getItem("dq-technician") || "";
    } catch {}
    technician.addEventListener("change", () => {
      try {
        localStorage.setItem("dq-technician", technician.value.trim());
      } catch {}
    });

    /* ---------- tap-to-test sheet ---------- */
    function closeSheet() {
      document.querySelector(".dq-sheet-wrap")?.remove();
    }
    function openSheet(device) {
      closeSheet();
      const c = det.coverage(register, year.value, quarter.value),
        latest = register.events
          .filter(
            (e) =>
              e.kind === "test" &&
              e.deviceId === device.id &&
              e.generation === device.generation &&
              e.date >= c.from &&
              e.date <= c.to,
          )
          .sort((a, b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt))[0];
      const wrap = el("div", undefined, "dq-sheet-wrap"),
        sheet = el("div", undefined, "dq-sheet");
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-modal", "true");
      wrap.onclick = (e) => e.target === wrap && closeSheet();
      const label = det.label(device, f.central);
      sheet.setAttribute("aria-label", label);
      sheet.append(
        el("h3", label),
        el("p", [device.typ || "Typ saknas", device.placering].filter(Boolean).join(" · ")),
        el(
          "p",
          latest
            ? `Senast i kvartalet: ${latest.date} · ${latest.status}${latest.note ? " · " + latest.note : ""}`
            : "Inte provad i kvartalet.",
          "muted",
        ),
      );
      const ever = qp.lastTested(device, register.events),
        limit = qp.yearBefore(refDate());
      sheet.append(
        el(
          "p",
          ever
            ? `Senast provad: ${ever}${ever < limit ? " – mer än 12 månader sedan" : ""}`
            : "Aldrig provad enligt registret.",
          !ever || ever < limit ? "dq-stale" : "muted",
        ),
      );
      const order = ctx.orders.find((o) => o.id === orderSelect.value && o.status !== "Klart");
      const missing = [!order && "arbetsorder", !technician.value.trim() && "provare"].filter(Boolean);
      const msg = el("p", missing.length ? "Välj " + missing.join(" och ") + " ovanför ritningen." : "", "dq-msg");
      msg.setAttribute("role", "status");
      const big = el("div", undefined, "dq-big-buttons"),
        ok = button("✓ OK", () => save("Provad – OK", ""), "dq-ok-btn"),
        fault = button("✕ Fel", () => showNote("Provad – anmärkning"), "dq-fault-btn"),
        na = button("Ej åtkomlig", () => showNote("Ej åtkomlig"), "secondary");
      [ok, fault, na].forEach((b) => (b.disabled = missing.length > 0));
      big.append(ok, fault, na);
      const noteBox = el("div", undefined, "dq-note");
      noteBox.hidden = true;
      sheet.append(msg, big, noteBox, button("Avbryt", closeSheet));
      wrap.append(sheet);
      document.body.append(wrap);
      (missing.length ? sheet.querySelector("button:last-child") : ok).focus();
      function showNote(status) {
        noteBox.hidden = false;
        noteBox.replaceChildren(el("h4", status === "Ej åtkomlig" ? "Varför ej åtkomlig?" : "Beskriv felet"));
        const area = el("textarea");
        area.rows = 3;
        const chips = el("div", undefined, "dq-chips");
        for (const t of [...new Set([...FAULTS, ...(ctx.phrases || [])])])
          chips.append(
            button(t, () => {
              area.value += (area.value ? "; " : "") + t;
              area.focus();
            }),
          );
        field(noteBox, "Kommentar", area);
        // photo straight from the camera; shrunk on the device before it is saved
        let photo = "";
        const camera = el("input");
        camera.type = "file";
        camera.accept = "image/*";
        camera.setAttribute("capture", "environment");
        camera.hidden = true;
        const photoRow = el("div", undefined, "dq-photo"),
          preview = el("img"),
          takeBtn = button("📷 Ta foto", () => camera.click()),
          dropBtn = button("Ta bort foto", () => {
            photo = "";
            paintPhoto();
          });
        preview.alt = "Foto till anmärkningen";
        function paintPhoto() {
          preview.hidden = !photo;
          dropBtn.hidden = !photo;
          if (photo) preview.src = photo;
          else preview.removeAttribute("src");
          takeBtn.textContent = photo ? "📷 Ta nytt foto" : "📷 Ta foto";
        }
        camera.onchange = async () => {
          const file = camera.files?.[0];
          camera.value = "";
          if (!file) return;
          takeBtn.disabled = true;
          try {
            photo = await shrinkPhoto(file);
            msg.textContent = "";
          } catch (e) {
            msg.textContent = e.message;
          } finally {
            takeBtn.disabled = false;
            paintPhoto();
          }
        };
        photoRow.append(camera, takeBtn, dropBtn, preview);
        paintPhoto();
        noteBox.append(
          chips,
          photoRow,
          button("Spara " + (status === "Ej åtkomlig" ? "ej åtkomlig" : "fel"), () => {
            if (!area.value.trim()) {
              msg.textContent = "Skriv en kommentar.";
              area.focus();
              return;
            }
            save(status, area.value.trim(), photo);
          }, "primary"),
        );
        area.focus();
      }
      async function save(status, note, photo = "") {
        [...sheet.querySelectorAll("button")].forEach((b) => (b.disabled = true));
        ctx.beforeSave();
        let id = "";
        try {
          const orders = await db.read("workorders", []),
            target = orders.find((o) => o.id === orderSelect.value && o.facilityId === f.id && o.status !== "Klart");
          if (!target) throw Error("Välj en öppen arbetsorder ovanför ritningen.");
          await db.updateRecord("detectors:" + f.id, { devices: [], events: [] }, (r) => {
            const current = r.devices.find((x) => x.id === device.id);
            if (!current || current.generation !== device.generation)
              throw Error("Detektorn har ändrats. Öppna ritningen igen.");
            const e = det.event(current, {
              date: testDate.value,
              technician: technician.value.trim(),
              orderId: target.id,
              orderNumber: target.ordernummer,
              status,
              note,
              ...(photo ? { photo } : {}),
              label: det.label(current, f.central),
              source: "drawing",
              docId: ctx.getDocument(),
              page: ctx.getPage(),
            });
            id = e.id;
            r.events.push(e);
            return r;
          });
          let warning = "";
          try {
            await window.serviceData?.syncIssues(f.id);
          } catch (e) {
            warning = " Feluppföljningen kunde inte uppdateras.";
          }
          closeSheet();
          toast(`${det.address(device, f.central)} · ${status}${warning}`, async () => {
            try {
              ctx.beforeSave();
              await window.serviceData.undoTest(f.id,id);
              toast("Ångrat: " + det.address(device, f.central));
            } catch (e) {
              toast("Kunde inte ångra: " + e.message);
            } finally {
              ctx.afterSave();
            }
          });
          ctx.afterSave();
        } catch (e) {
          msg.textContent = e.message;
          [...sheet.querySelectorAll("button")].forEach((b) => (b.disabled = false));
          ctx.afterError();
        }
      }
    }
    const capture = (e) => {
      if (!memory.quick || ctx.busy()) return;
      const pin = e.target.closest?.(".drawing-pin[data-device]");
      if (!pin) return;
      const device = register.devices.find((d) => d.id === pin.dataset.device);
      if (!device) return;
      e.stopPropagation();
      e.preventDefault();
      openSheet(device);
    };
    stage.addEventListener("click", capture, true);

    /* ---------- scroll position survives re-renders ---------- */
    const scrollKey = () => ctx.getDocument() + "|" + ctx.getPage();
    const onScroll = () => {
      memory.scroll[scrollKey()] = { left: scroller.scrollLeft, top: scroller.scrollTop };
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });

    /* ---------- offline PDF scan ---------- */
    const scan = el("details", undefined, "settings-card drawing-ai dq-scan");
    scan.append(el("summary", "Läs in detektorer från PDF-ritningen (offline)"));
    scan.append(
      el(
        "p",
        "Appen läser ritningen på enheten: adresser som 01.001, sektionsförteckningen och förklaringar som \"VD placerad i …\". PDF:er med riktig text läses direkt. Ritningar där texten är ritad som linjer läses med bildigenkänning (OCR) – tar 1–3 minuter per plan på iPad. Inget skickas via internet. Allt granskas innan det sparas.",
      ),
    );
    const scanGrid = el("div", undefined, "import-grid"),
      coverSel = field(scanGrid, "Försättsblad", el("select")),
      typeSel = field(scanGrid, "Typ när ritningen inte anger typ", el("select")),
      secInput = field(scanGrid, "Sektion när ritningen inte anger sektion", el("input")),
      methodSel = field(scanGrid, "Läsmetod", el("select"));
    options(
      methodSel,
      [
        ["auto", "Automatisk (PDF-text, annars OCR)"],
        ["text", "Bara PDF-text (snabb)"],
        ["ocr", "Bildigenkänning OCR (långsammare)"],
      ],
      "auto",
    );
    options(coverSel, [["1", "Sida 1"], ["0", "Inget försättsblad"]], "1");
    options(typeSel, [["", "Okänd typ – välj manuellt"], ...core.TYPES.map(([t]) => [t, t])], "");
    secInput.placeholder = "Lämna tomt om okänt";
    const scanStatus = el("p");
    scanStatus.setAttribute("role", "status");
    let cancelScan = false;
    const runBtn = button("Skanna PDF", runScan, "primary"),
      stopBtn = button("Avbryt skanning", () => (cancelScan = true)),
      review = el("div"),
      saveBtn = button("Spara valda detektorer och markeringar", commit, "primary");
    stopBtn.hidden = true;
    saveBtn.hidden = true;
    /* Section table read from the cover sheet: always reviewed by the technician. */
    const sectionBox = el("div", undefined, "dq-sectionbox"),
      sectionText = el("textarea"),
      sectionMsg = el("p", undefined, "dq-detail");
    sectionText.rows = 6;
    sectionText.spellcheck = false;
    sectionBox.append(
      el("h4", "Sektionsförteckning från försättsbladet"),
      el(
        "p",
        "Kontrollera mot försättsbladet och rätta vid behov. En rad per sektion: nummer, kolon, adresser. Saknas en rad – lägg till den, t.ex. 7: 01.231-01.233.",
        "dq-detail",
      ),
    );
    field(sectionBox, "Sektion: adresser", sectionText);
    sectionBox.append(
      button("Använd förteckningen", () => {
        try {
          const rows = window.drawingOcrData.parseSections(sectionText.value);
          applySections(rows);
          if(memory.scan)memory.scan.sectionVerified=false;
          sectionMsg.textContent = rows.length + " sektioner används. Adresser som saknas i förteckningen är inte valda.";
        } catch (e) {
          sectionMsg.textContent = e.message;
        }
      }),
      sectionMsg,
    );
    sectionBox.hidden = true;
    scan.append(scanGrid, runBtn, stopBtn, scanStatus, sectionBox, review, saveBtn);
    drawings.insertBefore(scan, drawings.querySelector(".drawing-ai") || scroller);

    async function runScan() {
      const docId = ctx.getDocument();
      if (!docId) {
        scanStatus.textContent = "Välj en ritning först.";
        return;
      }
      runBtn.disabled = true;
      scanStatus.textContent = "Läser PDF:en på enheten …";
      let pdf;
      try {
        const loaded = await loadPdf(db, docId);
        pdf = loaded.pdf;
        if (coverSel.options.length !== pdf.numPages + 1) {
          const keep = coverSel.value;
          options(
            coverSel,
            [
              ...Array.from({ length: pdf.numPages }, (_, i) => [String(i + 1), "Sida " + (i + 1)]),
              ["0", "Inget försättsblad"],
            ],
            Number(keep) <= pdf.numPages ? keep : pdf.numPages > 1 ? "1" : "0",
          );
        }
        const coverPage = Number(coverSel.value),
          pages = [];
        let cover = { table: new Map(), legend: [] };
        if (coverPage) cover = core.readCover((await pageText(pdf, loaded.Util, coverPage)).items);
        let textItems = 0;
        for (let n = 1; n <= pdf.numPages; n++) {
          if (disposed) return;
          if (n === coverPage && pdf.numPages > 1) continue;
          scanStatus.textContent = `Läser sida ${n} av ${pdf.numPages} …`;
          const t = await pageText(pdf, loaded.Util, n);
          textItems += t.items.length;
          pages.push({ page: n, ...core.readPage(t.items, t.width, t.height) });
        }
        if (cover.legend.length) {
          const keep = typeSel.value;
          options(
            typeSel,
            [["", "Okänd typ – välj manuellt"], ...[...new Set([...cover.legend, ...core.TYPES.map(([t]) => t)])].map((t) => [t, t])],
            keep || "",
          );
        }
        const defaults = { typ: typeSel.value, sektion: secInput.value.trim() },
          textLabels = pages.reduce((n, p) => n + p.labels.length, 0),
          useOcr = methodSel.value === "ocr" || (methodSel.value === "auto" && textLabels < 3);
        if (useOcr) {
          // the drawing text is drawn as lines: read it as an image, still on the device
          const numbers = [...(coverPage ? [coverPage] : []), ...pages.map((p) => p.page)];
          cancelScan = false;
          stopBtn.hidden = false;
          const read = await window.drawingOCR.readPages(pdf, numbers, {
              cover: coverPage,
              known: await window.drawingView.known(docId),
              cancelled: () => cancelScan || disposed,
              onProgress: (text) => (scanStatus.textContent = text + " Låt appen vara öppen."),
            }),
            ocrApi = window.drawingOcrData,
            // the reading direction found while scanning also turns the drawing view
            remembered = await Promise.all(read.map((p) => window.drawingView.remember(docId, p.page, p.rotation))),
            coverRead = read.find((p) => p.page === coverPage),
            sections = coverRead
              ? coverRead.passes.map((p) => ocrApi.parseSectionTable(p.lines)).sort((a, b) => b.length - a.length)[0] || []
              : [],
            drawn = read
              .filter((p) => p.page !== coverPage || pdf.numPages === 1)
              .map((p) => {
                const all = p.passes.map((x) => ocrApi.readLabels(x.lines));
                return {
                  page: p.page,
                  labels: ocrApi.mergeLabels(all.flatMap((a) => a.labels)),
                  legend: all.flatMap((a) => a.legend),
                };
              }),
            snapshot = await db.snapshot(),
            { rows, warnings } = ocrApi.candidates(drawn, sections, register, defaults, det, core);
          memory.scan = { docId, rows, snapshot, ocr: true, sections, warnings, sectionVerified:false };
          sectionText.value = ocrApi.formatSections(sections);
          scanStatus.textContent =
            `OCR: ${rows.length} adresser på ${drawn.length} sida/sidor, 0 granskade` +
            (sections.length ? `, ${sections.length} sektionsrader lästa från försättsbladet` : "") +
            ". Bildigenkänning kan läsa fel eller missa etiketter – granska listan och lägg till missade. " +
            warnings.slice(0, 2).join(" ");
        } else {
          const snapshot = await db.snapshot(),
            { rows, warnings } = core.candidates(pages, cover, register, f.central, defaults, det);
          memory.scan = { docId, rows, snapshot, warnings, sectionVerified:false };
          scanStatus.textContent = !textItems
            ? "PDF:en innehåller ingen läsbar text. Välj läsmetod OCR."
            : `${rows.length} adresser hittades på ${pages.length} sida/sidor` +
              (cover.table.size ? `, ${cover.table.size} rader på försättsbladet` : "") +
              (cover.legend.length ? `. Typer i teckenförklaringen: ${cover.legend.join(", ")}` : "") +
              ". Granska varje adress och kryssa för innan sparande. " +
              warnings.slice(0, 3).join(" ");
        }
        renderReview();
      } catch (e) {
        scanStatus.textContent = "Skanningen misslyckades: " + (e.message || e);
      } finally {
        runBtn.disabled = false;
        stopBtn.hidden = true;
        await pdf?.destroy();
      }
    }
    function applySections(sections) {
      const s = memory.scan;
      if (!s) return;
      s.sections = sections;
      for (const r of s.rows) {
        if (r.existingId || r.manual) continue;
        const sektion = window.drawingOcrData.sectionOf(r.slinga + "." + r.adress, sections);
        r.sektion = sektion || r.sektion;
        r.fromCover = !!sektion;
        r.flag = !sektion ? "Saknas i sektionsförteckningen" : r.inList ? "Bara i förklaringslista – placera rätt" : "";
        r.approved = false;
      }
      renderReview();
    }
    /* Add a label OCR missed: type the address, then tap its place on the drawing. */
    let adding = "";
    function startAdd(address) {
      const m = String(address || "").trim().replace(",", ".").match(/^(\d{1,2})\.(\d{3})$/);
      if (!m) {
        scanStatus.textContent = "Skriv adressen som 01.017.";
        return;
      }
      adding = m[1].padStart(2, "0") + "." + m[2];
      scanStatus.textContent = `Tryck på platsen för ${adding} på ritningen.`;
      scroller.scrollIntoView({ block: "center" });
    }
    const addCapture = (e) => {
      if (!adding || !memory.scan) return;
      if (e.target.closest?.(".drawing-pin")) return;
      e.stopPropagation();
      const at = window.drawingView.point(stage, e),
        [slinga, adress] = adding.split("."),
        s = memory.scan,
        sektion = s.sections ? window.drawingOcrData.sectionOf(adding, s.sections) : "",
        existing = register.devices.find((d) => det.identity(d) === det.identity({ central: d.central || "", slinga, adress }));
      s.rows.push({
        id: "add-" + Date.now(),
        page: ctx.getPage(),
        x: at.x,
        y: at.y,
        central: "",
        slinga,
        adress,
        sektion: existing?.sektion || sektion || secInput.value.trim(),
        typ: existing?.typ || typeSel.value,
        placering: existing?.placering || "",
        lokalId: "",
        existingId: existing?.id || "",
        fromCover: !!sektion,
        manual: true,
        approved: false,
        flag: "Tillagd manuellt – granska och välj",
      });
      scanStatus.textContent = `${adding} tillagd på sida ${ctx.getPage()}.`;
      adding = "";
      renderReview();
    };
    stage.addEventListener("click", addCapture, true);
    function renderReview() {
      const s = memory.scan;
      review.replaceChildren();
      layer.replaceChildren();
      ctx.reviewing(!!s?.rows.length);
      saveBtn.hidden = !s?.rows.length;
      sectionBox.hidden = !s?.ocr;
      if (s?.ocr && !sectionText.value) sectionText.value = window.drawingOcrData.formatSections(s.sections || []);
      if (!s?.rows.length) return;
      const addBox = el("div", undefined, "dq-bulk"),
        addInput = el("input");
      addInput.placeholder = "01.017";
      addInput.inputMode = "decimal";
      field(addBox, "Missad adress", addInput);
      addBox.append(button("Lägg till – tryck sedan på ritningen", () => startAdd(addInput.value)));
      review.append(addBox);
      const tools = el("div", undefined, "dq-bulk"),
        verified = el("input"), verifiedLabel = el("label");
      verified.type="checkbox";verified.checked=!!s.sectionVerified;
      verified.onchange=()=>{s.sectionVerified=verified.checked;renderReview();};
      verifiedLabel.append(verified,document.createTextNode(" Jag har kontrollerat sektionsförteckningen mot originalritningen."));
      tools.append(verifiedLabel);
      const eligible=s.rows.filter(r=>window.drawingReview.canQuickSelect(r,s.rows,s.sectionVerified));
      tools.append(
        button("Markera tydliga och kontrollerade träffar ("+eligible.length+")", () => {
          if(!s.sectionVerified){scanStatus.textContent="Kontrollera sektionsförteckningen först.";return;}
          eligible.forEach(r=>r.approved=true);renderReview();
        }),
        button("Avmarkera alla", () => {s.rows.forEach(r=>r.approved=false);renderReview();}),
        button("Avbryt inläsning", () => {
          memory.scan=null;scanStatus.textContent="Inläsningen avbröts. Inget sparades.";renderReview();
        })
      );
      const report=window.drawingReview.summary(s.rows);
      const missing=s.rows.filter(r=>r.approved&&!r.existingId&&(!r.sektion||!r.typ)).length;
      const overview=el("div",undefined,"dq-sectionbox");
      overview.append(
        el("strong",report.total+" adresser hittade · "+report.selected+" valda · "+report.newDevices+" nya detektorer"),
        el("p",report.conflicts+" träffar med särskilda kontrollpunkter: låg OCR-säkerhet, okänd typ, saknad sektion eller dubbletter. "+report.selectedConflicts+" av dessa är valda.","dq-detail")
      );
      if(s.warnings?.length){
        const warn=el("details");
        warn.append(el("summary",s.warnings.length+" anmärkningar från skanningen"));
        for(const note of s.warnings.slice(0,40))warn.append(el("p",note,"dq-detail"));
        overview.append(warn);
      }
      review.append(tools,overview,el("p",missing?missing+" valda rader saknar typ eller sektion och kan inte sparas.":"Kontrollera adresserna på ritningen. Importen skapar inte provningshändelser.",missing?"dq-left":"dq-detail"));
      const table = el("table", undefined, "dq-table"),
        headRow = el("tr");
      for (const h of ["", "Sida", "Adress", "Sektion", "Typ", "Placering", ""]) headRow.append(el("th", h));
      table.append(headRow);
      for (const r of s.rows) {
        const tr = el("tr");
        tr.id = "dq-" + r.id;
        const check = el("input");
        check.type = "checkbox";
        check.checked = r.approved;
        check.setAttribute("aria-label", "Ta med " + r.slinga + "." + r.adress);
        check.onchange = () => {r.approved=check.checked;renderReview();};
        const sec = el("input");
        sec.value = r.sektion;
        sec.inputMode = "numeric";
        sec.disabled = !!r.existingId;
        sec.setAttribute("aria-label", "Sektion");
        sec.oninput = () => { r.sektion = sec.value.trim(); r.approved = false; check.checked = false; paintPreview(); };
        const typ = options(
          el("select"),
          [["", "Välj typ"], ...core.TYPES.map(([t]) => [t, t])],
          r.typ,
        );
        typ.disabled = !!r.existingId;
        typ.setAttribute("aria-label", "Typ");
        typ.onchange = () => { r.typ = typ.value; r.approved = false; check.checked = false; paintPreview(); };
        const place = el("input");
        place.value = r.placering;
        place.disabled = !!r.existingId;
        place.setAttribute("aria-label", "Placering");
        place.oninput = () => { r.placering = place.value; r.approved = false; check.checked = false; paintPreview(); };
        const cells = [check, String(r.page), r.slinga + "." + r.adress, sec, typ, place, [r.existingId?"Finns i registret":"Ny i registret",...window.drawingReview.reasons(r,s.rows),r.flag].filter(Boolean).join(" · ")];
        for (const c of cells) {
          const td = el("td");
          if (typeof c === "string") td.textContent = c;
          else td.append(c);
          tr.append(td);
        }
        tr.onclick = (e) => {
          if (e.target.closest("input,select")) return;
          if (r.page !== ctx.getPage()) ctx.setPage(r.page);
        };
        table.append(tr);
      }
      const wrapTable = el("div", undefined, "dq-table-wrap");
      wrapTable.append(table);
      review.append(wrapTable);
      paintPreview();
    }
    function paintPreview() {
      layer.replaceChildren();
      const s = memory.scan;
      if (!s || s.docId !== ctx.getDocument()) return;
      for (const r of s.rows.filter((r) => r.page === ctx.getPage())) {
        const b = button(r.slinga + "." + r.adress, (e) => {
          e.stopPropagation();
          document.getElementById("dq-" + r.id)?.scrollIntoView({ block: "center" });
        });
        b.className = "drawing-pin ai-pin" + (r.approved ? " reviewed" : "");
        b.style.left = r.x * 100 + "%";
        b.style.top = r.y * 100 + "%";
        window.drawingView.decorate(b, r);
        layer.append(b);
      }
    }
    async function commit() {
      const s = memory.scan;
      if (!s) return;
      saveBtn.disabled = true;
      try {
        const result = core.writes(s.snapshot, f.id, s.docId, s.rows, f.central, det);
        ctx.beforeSave();
        await db.commitRecords(s.snapshot, result.writes);
        memory.scan = null;
        ctx.reviewing(false);
        ctx.saved(
          `Ritningen är inläst: ${result.created} nya detektorer, ${result.pinned} nya markeringar` +
            (result.moved ? `, ${result.moved} flyttade` : "") +
            ". Starta provningsläget och tryck på en detektor.",
        );
      } catch (e) {
        scanStatus.textContent =
          e.message +
          (/ändrats/.test(e.message) ? " Skanna PDF:en igen." : "");
        ctx.afterError();
      } finally {
        saveBtn.disabled = false;
      }
    }

    paintQuick();
    updateProgress();
    if (memory.scan) {
      scan.open = true;
      renderReview();
    }
    return {
      drawn() {
        const s = memory.scroll[scrollKey()];
        if (s) {
          scroller.scrollLeft = s.left;
          scroller.scrollTop = s.top;
        }
        paintPreview();
      },
      update: updateProgress,
      dispose() {
        disposed = true;
        closeSheet();
        stage.removeEventListener("click", capture, true);
        scroller.removeEventListener("scroll", onScroll);
        year.removeEventListener("change", updateProgress);
        quarter.removeEventListener("change", updateProgress);
        testDate.removeEventListener("change", updateProgress);
        stage.removeEventListener("click", addCapture, true);
        cancelScan = true;
        layer.remove();
      },
    };
  }
  window.drawingQuick = { mount };
})();
