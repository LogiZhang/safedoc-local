/* ==========================================================================
   SafeDoc Local (票证私盒) — Core Client-Side Document Engine (app.js)
   100% Local Browser Memory Execution · Zero Network Upload · Offline Ready
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------------------
     0. Storefront & License Configuration
     Once Mianbaoduo / auto-delivery link is created, update CHECKOUT_URL here.
     ------------------------------------------------------------------------ */
  const STORE_CONFIG = {
    checkoutUrl: "https://ifdian.net/", // Will be replaced with exact Afdian / Xianyu product URL
    checkoutConfigured: false,
    storageKey: "safedoc_pro_license_v1",
    alphabet: "23456789ABCDEFGHJKLMNPQRSTUVWXYZ",
    seedA: 0xfadefc7e,
    seedB: 0x8e474222,
    seedOffset: 6,
  };

  /* Configure bundled Mozilla PDF.js (Zero CDN calls, seamless file:// support) */
  if (typeof window !== "undefined" && window.pdfjsLib) {
    if (!(window.location && window.location.protocol === "file:" && window.pdfjsWorker)) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.js";
    }
  }

  /* ------------------------------------------------------------------------
     1. Deterministic Offline License Verifier (Matches scripts/license_keygen.py)
     ------------------------------------------------------------------------ */
  function rotl32(val, shift) {
    const u = val >>> 0;
    return ((u << shift) | (u >>> (32 - shift))) >>> 0;
  }

  function computeLicenseTag(payload) {
    const raw = payload + "::v1";
    let h1 = STORE_CONFIG.seedA >>> 0;
    let h2 = STORE_CONFIG.seedB >>> 0;
    for (let i = 0; i < raw.length; i++) {
      const c = raw.charCodeAt(i);
      const idxMask = (i + STORE_CONFIG.seedOffset) & 7;
      h1 = Math.imul((h1 ^ c) >>> 0, 0x01000193) >>> 0;
      h2 = Math.imul((h2 ^ ((c << 3) | idxMask)) >>> 0, 0x85ebca6b) >>> 0;
      h1 = rotl32(h1, 13);
    }
    const mix = (h1 ^ h2 ^ (h1 >>> 11) ^ (h2 >>> 7)) >>> 0;
    let out = "";
    let v = mix;
    for (let k = 0; k < 4; k++) {
      out += STORE_CONFIG.alphabet[v & 31];
      v = v >>> 5;
    }
    return out;
  }

  function verifyLicenseKey(code) {
    if (!code || typeof code !== "string") {
      return { valid: false, reason: "请输入激活码" };
    }
    const cleaned = code.trim().toUpperCase();
    const parts = cleaned.split("-");
    if (parts.length !== 4 || parts[0] !== "SDPRO") {
      return { valid: false, reason: "格式错误：激活码应以 SDPRO- 开头，共 4 段" };
    }
    const [prefix, g1, g2, tag] = parts;
    if (prefix !== "SDPRO" || g1.length !== 4 || g2.length !== 4 || tag.length !== 4) {
      return { valid: false, reason: "激活码长度不正确，请检查是否完整复制" };
    }
    const joined = g1 + g2 + tag;
    for (let i = 0; i < joined.length; i++) {
      if (STORE_CONFIG.alphabet.indexOf(joined[i]) === -1) {
        return { valid: false, reason: "包含无效字符（请注意区分数字与字母）" };
      }
    }
    const tierChar = g1[0];
    if (tierChar !== "P" && tierChar !== "T") {
      return { valid: false, reason: "未知的授权版本标识" };
    }
    const expected = computeLicenseTag(g1 + "-" + g2);
    if (tag !== expected) {
      return { valid: false, reason: "激活码校验未通过，请核对是否输错字符" };
    }
    return {
      valid: true,
      tier: tierChar === "T" ? "TEAM" : "PERSONAL",
      tierLabel: tierChar === "T" ? "Pro 工作室多机版" : "Pro 个人终身版",
      key: cleaned,
    };
  }

  /* ------------------------------------------------------------------------
     2. Pure Vanilla JS Binary PDF 1.4 Generator (Multi-Page A4 JPEG Embed)
     ------------------------------------------------------------------------ */
  function dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function buildPdfBytesFromPages(pageSpecs) {
    // Each pageSpec: { jpegBytes: Uint8Array, pixelWidth: number, pixelHeight: number, ptWidth: number, ptHeight: number }
    const encoder = new TextEncoder();
    const chunks = [];
    let byteOffset = 0;

    function pushStr(str) {
      const b = encoder.encode(str);
      chunks.push(b);
      byteOffset += b.length;
    }

    function pushBytes(b) {
      chunks.push(b);
      byteOffset += b.length;
    }

    // Object ID layout:
    // 1: Catalog
    // 2: Pages
    // For page i (0..N-1):
    //   imgObjId  = 3 + i * 3
    //   cntObjId  = 4 + i * 3
    //   pageObjId = 5 + i * 3
    const totalObjects = 2 + pageSpecs.length * 3;
    const offsets = new Array(totalObjects + 1).fill(0);

    pushStr("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");

    // Obj 1: Catalog
    offsets[1] = byteOffset;
    pushStr("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

    // Obj 2: Pages
    const kidsRefs = pageSpecs.map((_, idx) => `${5 + idx * 3} 0 R`).join(" ");
    offsets[2] = byteOffset;
    pushStr(`2 0 obj\n<< /Type /Pages /Kids [ ${kidsRefs} ] /Count ${pageSpecs.length} >>\nendobj\n`);

    pageSpecs.forEach((p, idx) => {
      const imgObjId = 3 + idx * 3;
      const cntObjId = 4 + idx * 3;
      const pageObjId = 5 + idx * 3;
      const wPt = (p.ptWidth || 595.28).toFixed(2);
      const hPt = (p.ptHeight || 841.89).toFixed(2);

      // Image XObject
      offsets[imgObjId] = byteOffset;
      pushStr(
        `${imgObjId} 0 obj\n` +
          `<< /Type /XObject /Subtype /Image /Width ${p.pixelWidth} /Height ${p.pixelHeight} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpegBytes.length} >>\n` +
          `stream\n`
      );
      pushBytes(p.jpegBytes);
      pushStr("\nendstream\nendobj\n");

      // Page Content Stream
      const streamCmd = `q ${wPt} 0 0 ${hPt} 0 0 cm /Im0 Do Q\n`;
      const streamBytes = encoder.encode(streamCmd);
      offsets[cntObjId] = byteOffset;
      pushStr(`${cntObjId} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`);
      pushBytes(streamBytes);
      pushStr("endstream\nendobj\n");

      // Page Object
      offsets[pageObjId] = byteOffset;
      pushStr(
        `${pageObjId} 0 obj\n` +
          `<< /Type /Page /Parent 2 0 R /MediaBox [ 0 0 ${wPt} ${hPt} ] ` +
          `/Resources << /XObject << /Im0 ${imgObjId} 0 R >> >> /Contents ${cntObjId} 0 R >>\n` +
          `endobj\n`
      );
    });

    // Cross-reference table
    const xrefStart = byteOffset;
    pushStr(`xref\n0 ${totalObjects + 1}\n`);
    pushStr("0000000000 65535 f \n");
    for (let id = 1; id <= totalObjects; id++) {
      const padded = String(offsets[id]).padStart(10, "0");
      pushStr(`${padded} 00000 n \n`);
    }

    pushStr(
      `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
    );

    const out = new Uint8Array(byteOffset);
    let cursor = 0;
    for (const chunk of chunks) {
      out.set(chunk, cursor);
      cursor += chunk.length;
    }
    return out;
  }

  /* ------------------------------------------------------------------------
     3. Pure Vanilla JS ZIP Archive Builder (UTF-8 Filename + CRC32 Store)
     ------------------------------------------------------------------------ */
  const CRC32_TABLE = (function () {
    const tbl = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      tbl[n] = c >>> 0;
    }
    return tbl;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function buildZipBytes(entries) {
    // entries: [{ name: string, data: Uint8Array }]
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const item of entries) {
      const nameBytes = encoder.encode(item.name);
      const data = item.data;
      const crc = crc32(data);

      // Local file header (30 bytes + name + data)
      const lfh = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(lfh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
      lv.setUint16(8, 0, true); // Store (PNG/JPG already compressed)
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0x5671, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      lfh.set(nameBytes, 30);

      localParts.push(lfh, data);

      // Central directory header (46 bytes + name)
      const cdh = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cdh.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); // UTF-8
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x5671, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      cdh.set(nameBytes, 46);
      centralParts.push(cdh);

      offset += lfh.length + data.length;
    }

    let cdSize = 0;
    for (const c of centralParts) cdSize += c.length;

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    const totalLen = offset + cdSize + eocd.length;
    const out = new Uint8Array(totalLen);
    let pos = 0;
    for (const p of localParts) {
      out.set(p, pos);
      pos += p.length;
    }
    for (const p of centralParts) {
      out.set(p, pos);
      pos += p.length;
    }
    out.set(eocd, pos);
    return out;
  }

  /* Export testable core utilities when imported in Node.js verification tests */
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      computeLicenseTag,
      verifyLicenseKey,
      buildPdfBytesFromPages,
      buildZipBytes,
      crc32,
    };
    if (typeof document === "undefined") return;
  }

  /* ------------------------------------------------------------------------
     4. Browser UI State & Helpers
     ------------------------------------------------------------------------ */
  const state = {
    activeTab: "invoice",
    license: null, // { valid: true, tier, tierLabel, key }

    // Panel 1: Invoices
    invoices: [], // [{ id, name, canvas }]
    invPerPage: 2,
    invBindingMargin: true,
    invCutLines: true,
    invSummarySheet: false,
    invClaimant: "",
    invPreviewPageIdx: 0,

    // Panel 2: Watermark
    wmItems: [], // [{ id, name, canvas }]
    wmMode: "single", // "single" | "a4pair"
    wmText: "仅供入职背景调查核验使用，他用无效",
    wmColor: "#C4302B",
    wmOpacity: 0.28,
    wmDensity: 2,
    wmAppendDate: true,
    wmAntiAiGrain: false,
    wmSelectedIdx: 0,

    // Panel 3: Redactor
    redactPages: [], // [{ name, baseCanvas, rects: [{x,y,w,h,style}] }]
    redactPageIdx: 0,
    redactStyle: "black", // "black" | "mosaic" | "hatch"
    dragStart: null,
    dragCurrent: null,
  };

  const A4_W = 1654; // 200 DPI A4 width (210mm)
  const A4_H = 2339; // 200 DPI A4 height (297mm)

  function isPro() {
    return Boolean(state.license && state.license.valid);
  }

  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  }

  /* Load Image or PDF pages into offscreen canvases */
  function loadImageFileToCanvas(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth || img.width;
        c.height = img.naturalHeight || img.height;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve([{ name: file.name, canvas: c }]);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("无法读取图片: " + file.name));
      };
      img.src = url;
    });
  }

  async function loadPdfFileToCanvases(file, maxPages) {
    if (!window.pdfjsLib) {
      throw new Error("本地 PDF 引擎未就绪");
    }
    const buf = await file.arrayBuffer();
    const isFileProto =
      typeof window !== "undefined" && window.location && window.location.protocol === "file:";
    const docOpts = isFileProto
      ? { data: buf }
      : { data: buf, cMapUrl: "./vendor/cmaps/", cMapPacked: true };
    const loadingTask = window.pdfjsLib.getDocument(docOpts);
    const pdf = await loadingTask.promise;
    const count = Math.min(pdf.numPages, maxPages || 80);
    const results = [];
    for (let p = 1; p <= count; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2.2 });
      const c = document.createElement("canvas");
      c.width = Math.round(viewport.width);
      c.height = Math.round(viewport.height);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const label = count > 1 ? `${file.name} (P${p})` : file.name;
      results.push({ name: label, canvas: c });
    }
    return results;
  }

  async function parseUploadedFile(file, maxPdfPages) {
    const isPdf =
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      return loadPdfFileToCanvases(file, maxPdfPages);
    }
    return loadImageFileToCanvas(file);
  }

  /* ------------------------------------------------------------------------
     5. Panel 1 — Electronic Invoice A4 Merger Rendering
     ------------------------------------------------------------------------ */
  function getTotalInvoicePages(itemsCount) {
    if (itemsCount === 0) return 0;
    const basePages = Math.ceil(itemsCount / state.invPerPage);
    const extra = state.invSummarySheet && isPro() ? 1 : 0;
    return basePages + extra;
  }

  function renderInvoiceA4Sheet(pageIndex, sourceItems) {
    const canvas = document.createElement("canvas");
    canvas.width = A4_W;
    canvas.height = A4_H;
    const ctx = canvas.getContext("2d");

    // Clean white A4 sheet
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, A4_W, A4_H);

    const contentPagesCount = Math.ceil(sourceItems.length / state.invPerPage);

    // Summary cover/tail page (Pro feature)
    if (pageIndex >= contentPagesCount && state.invSummarySheet && isPro()) {
      drawInvoiceSummarySheet(ctx, sourceItems);
      return canvas;
    }

    const bindOffset = state.invBindingMargin ? 105 : 42; // ~15mm at 200dpi
    const padRight = 46;
    const padTop = 52;
    const padBottom = 56;

    // Optional binding gutter indicator
    if (state.invBindingMargin) {
      ctx.save();
      ctx.strokeStyle = "#CBD5E1";
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(bindOffset - 14, padTop);
      ctx.lineTo(bindOffset - 14, A4_H - padBottom);
      ctx.stroke();

      ctx.fillStyle = "#94A3B8";
      ctx.font = "22px sans-serif";
      ctx.save();
      ctx.translate(46, A4_H / 2 + 120);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("◀ 财务装订线预留区（请勿在此线左侧装订压字） ▶", 0, 0);
      ctx.restore();
      ctx.restore();
    }

    const usableW = A4_W - bindOffset - padRight;
    const usableH = A4_H - padTop - padBottom;

    const perPage = state.invPerPage;
    const startIdx = pageIndex * perPage;
    const slice = sourceItems.slice(startIdx, startIdx + perPage);

    const cols = perPage === 4 ? 2 : 1;
    const rows = perPage === 4 ? 2 : 2;
    const cellW = usableW / cols;
    const cellH = usableH / rows;

    slice.forEach((inv, slotIdx) => {
      const r = Math.floor(slotIdx / cols);
      const c = slotIdx % cols;
      const x0 = bindOffset + c * cellW;
      const y0 = padTop + r * cellH;
      const innerPad = 24;
      const boxW = cellW - innerPad * 2;
      const boxH = cellH - innerPad * 2;

      const src = inv.canvas;
      // Auto-rotate portrait invoice onto landscape slot if 2-up
      const scale = Math.min(boxW / src.width, boxH / src.height);
      const drawW = src.width * scale;
      const drawH = src.height * scale;
      const dx = x0 + innerPad + (boxW - drawW) / 2;
      const dy = y0 + innerPad + (boxH - drawH) / 2;

      ctx.drawImage(src, dx, dy, drawW, drawH);

      if (state.invCutLines) {
        ctx.save();
        ctx.fillStyle = "#94A3B8";
        ctx.font = "20px monospace";
        ctx.fillText(`#${startIdx + slotIdx + 1}`, x0 + 10, y0 + 26);
        ctx.restore();
      }
    });

    // Cut guide dashed lines
    if (state.invCutLines) {
      ctx.save();
      ctx.strokeStyle = "#94A3B8";
      ctx.lineWidth = 2;
      ctx.setLineDash([14, 12]);

      // Horizontal middle cut line
      const midY = padTop + usableH / 2;
      ctx.beginPath();
      ctx.moveTo(bindOffset, midY);
      ctx.lineTo(A4_W - padRight, midY);
      ctx.stroke();

      if (cols === 2) {
        const midX = bindOffset + usableW / 2;
        ctx.beginPath();
        ctx.moveTo(midX, padTop);
        ctx.lineTo(midX, A4_H - padBottom);
        ctx.stroke();
      }

      ctx.fillStyle = "#64748B";
      ctx.font = "20px sans-serif";
      ctx.fillText("✂ 沿虚线裁切", bindOffset + 8, midY - 8);
      ctx.restore();
    }

    // Subtle footer page index
    ctx.fillStyle = "#94A3B8";
    ctx.font = "20px sans-serif";
    const footerRight = isPro()
      ? `报销附件 第 ${pageIndex + 1} / ${contentPagesCount} 页`
      : `报销附件 第 ${pageIndex + 1} 页 · 票证私盒 SafeDoc 本地生成`;
    ctx.fillText(footerRight, bindOffset, A4_H - 20);

    return canvas;
  }

  function drawInvoiceSummarySheet(ctx, items) {
    const margin = 120;
    ctx.fillStyle = "#171717";
    ctx.font = "bold 46px sans-serif";
    ctx.fillText("费用报销电子发票打印附件汇总单", margin, 160);

    ctx.strokeStyle = "#C4302B";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(margin, 188);
    ctx.lineTo(A4_W - margin, 188);
    ctx.stroke();

    ctx.fillStyle = "#44403C";
    ctx.font = "26px sans-serif";
    const claimant = state.invClaimant.trim() || "__________________";
    ctx.fillText(`报销人 / 部门：${claimant}`, margin, 250);
    ctx.fillText(`打印日期：${todayStr()}`, A4_W - margin - 340, 250);
    ctx.fillText(
      `票据总张数：共 ${items.length} 张（拼版合 ${Math.ceil(items.length / state.invPerPage)} 页 A4）`,
      margin,
      305
    );

    // Table Header
    let y = 370;
    ctx.fillStyle = "#F5F5F4";
    ctx.fillRect(margin, y, A4_W - margin * 2, 60);
    ctx.strokeStyle = "#D6D3D1";
    ctx.lineWidth = 2;
    ctx.strokeRect(margin, y, A4_W - margin * 2, 60);

    ctx.fillStyle = "#171717";
    ctx.font = "bold 24px sans-serif";
    ctx.fillText("序号", margin + 24, y + 38);
    ctx.fillText("原始票据文件名", margin + 130, y + 38);
    ctx.fillText("所在拼版页码", A4_W - margin - 260, y + 38);
    y += 60;

    const maxRows = Math.min(items.length, 28);
    ctx.font = "23px sans-serif";
    for (let i = 0; i < maxRows; i++) {
      ctx.strokeRect(margin, y, A4_W - margin * 2, 54);
      ctx.fillStyle = "#292524";
      ctx.fillText(String(i + 1).padStart(2, "0"), margin + 28, y + 36);
      const shortName =
        items[i].name.length > 42 ? items[i].name.slice(0, 40) + "…" : items[i].name;
      ctx.fillText(shortName, margin + 130, y + 36);
      const pNum = Math.floor(i / state.invPerPage) + 1;
      ctx.fillText(`第 ${pNum} 页`, A4_W - margin - 240, y + 36);
      y += 54;
    }

    const sigY = A4_H - 210;
    ctx.fillStyle = "#171717";
    ctx.font = "26px sans-serif";
    ctx.fillText("经办人签字：________________", margin, sigY);
    ctx.fillText("财务复核签字：________________", margin + 520, sigY);
    ctx.fillText("已核验原件无重复报销 [  ]", margin + 1050, sigY);
  }

  function refreshInvoiceUI() {
    const count = state.invoices.length;
    document.getElementById("invoice-count-label").textContent = `已选 ${count} 张`;

    const listEl = document.getElementById("invoice-file-list");
    listEl.innerHTML = "";
    state.invoices.forEach((item, idx) => {
      const li = document.createElement("li");
      li.className = "file-queue__item";
      const span = document.createElement("span");
      span.className = "file-queue__name";
      span.textContent = `${idx + 1}. ${item.name}`;
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "file-queue__remove";
      rm.textContent = "×";
      rm.title = "移除此票据";
      rm.onclick = () => {
        state.invoices.splice(idx, 1);
        if (state.invPreviewPageIdx >= getTotalInvoicePages(state.invoices.length)) {
          state.invPreviewPageIdx = Math.max(0, getTotalInvoicePages(state.invoices.length) - 1);
        }
        refreshInvoiceUI();
      };
      li.append(span, rm);
      listEl.appendChild(li);
    });

    const emptyEl = document.getElementById("inv-empty-state");
    const previewCanvas = document.getElementById("invoice-preview-canvas");
    const exportBtn = document.getElementById("btn-export-invoice-pdf");
    const clearBtn = document.getElementById("btn-inv-clear");
    const prevBtn = document.getElementById("btn-inv-prev-page");
    const nextBtn = document.getElementById("btn-inv-next-page");
    const pageIndicator = document.getElementById("inv-page-indicator");

    if (count === 0) {
      emptyEl.style.display = "block";
      previewCanvas.style.display = "none";
      exportBtn.disabled = true;
      clearBtn.disabled = true;
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      pageIndicator.textContent = "第 0 / 0 页";
      return;
    }

    emptyEl.style.display = "none";
    previewCanvas.style.display = "block";
    exportBtn.disabled = false;
    clearBtn.disabled = false;

    const totalPages = getTotalInvoicePages(count);
    if (state.invPreviewPageIdx >= totalPages) {
      state.invPreviewPageIdx = totalPages - 1;
    }
    pageIndicator.textContent = `第 ${state.invPreviewPageIdx + 1} / ${totalPages} 页`;
    prevBtn.disabled = state.invPreviewPageIdx <= 0;
    nextBtn.disabled = state.invPreviewPageIdx >= totalPages - 1;

    const rendered = renderInvoiceA4Sheet(state.invPreviewPageIdx, state.invoices);
    previewCanvas.width = rendered.width;
    previewCanvas.height = rendered.height;
    previewCanvas.getContext("2d").drawImage(rendered, 0, 0);

    if (!isPro() && count > 2) {
      exportBtn.textContent = `解锁 Pro 一次导出全部 ${count} 张发票（或免费导出前 2 张）`;
    } else {
      exportBtn.textContent = `导出高清可打印 A4 PDF（共 ${totalPages} 页）`;
    }
  }

  /* ------------------------------------------------------------------------
     6. Panel 2 — ID Card & License Anti-Fraud Watermark Studio
     ------------------------------------------------------------------------ */
  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }

  function applyTiledWatermark(ctx, width, height) {
    const baseText = state.wmText.trim() || "仅供本次业务核验使用，他用无效";
    const fullText = state.wmAppendDate ? `${baseText} · ${todayStr()}` : baseText;
    const rgb = hexToRgb(state.wmColor);

    // Optional Pro subtle anti-AI micro-pattern
    if (state.wmAntiAiGrain && isPro()) {
      ctx.save();
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.04)`;
      for (let gx = 0; gx < width; gx += 18) {
        for (let gy = 0; gy < height; gy += 18) {
          if ((gx + gy) % 36 === 0) {
            ctx.fillRect(gx, gy, 3, 3);
          }
        }
      }
      ctx.restore();
    }

    ctx.save();
    const minDim = Math.min(width, height);
    const fontSize = Math.max(18, Math.round(minDim * 0.032));
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${state.wmOpacity})`;
    ctx.textBaseline = "middle";

    const textWidth = ctx.measureText(fullText).width;
    const densityFactor = state.wmDensity === 3 ? 0.72 : state.wmDensity === 1 ? 1.45 : 1.0;
    const stepX = Math.max(textWidth + fontSize * 2.4, 180) * densityFactor;
    const stepY = Math.max(fontSize * 4.2, 85) * densityFactor;

    ctx.translate(width / 2, height / 2);
    ctx.rotate((-28 * Math.PI) / 180);

    const diag = Math.hypot(width, height);
    let row = 0;
    for (let y = -diag; y <= diag; y += stepY) {
      const xShift = row % 2 === 0 ? 0 : stepX / 2;
      for (let x = -diag; x <= diag; x += stepX) {
        ctx.fillText(fullText, x + xShift, y);
      }
      row++;
    }
    ctx.restore();
  }

  function renderWatermarkedItem(itemCanvas) {
    const out = document.createElement("canvas");
    out.width = itemCanvas.width;
    out.height = itemCanvas.height;
    const ctx = out.getContext("2d");
    ctx.drawImage(itemCanvas, 0, 0);
    applyTiledWatermark(ctx, out.width, out.height);
    return out;
  }

  function renderIdPairOnA4(frontCanvas, backCanvas) {
    const out = document.createElement("canvas");
    out.width = A4_W;
    out.height = A4_H;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, A4_W, A4_H);

    // Standard ID card width on A4 (~85.6mm -> ~674px at 200dpi, scaled nicely for readability ~860px)
    const targetMaxW = 920;
    const targetMaxH = 620;

    const cards = [frontCanvas, backCanvas].filter(Boolean);
    cards.forEach((card, idx) => {
      const scale = Math.min(targetMaxW / card.width, targetMaxH / card.height);
      const w = card.width * scale;
      const h = card.height * scale;
      const x = (A4_W - w) / 2;
      const centerY = idx === 0 ? A4_H * 0.31 : A4_H * 0.69;
      const y = centerY - h / 2;

      // Subtle card border
      ctx.strokeStyle = "#D6D3D1";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
      ctx.drawImage(card, x, y, w, h);

      // Apply watermark directly over card + margin zone so cropping cannot strip it
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 60, y - 50, w + 120, h + 100);
      ctx.clip();
      applyTiledWatermark(ctx, A4_W, A4_H);
      ctx.restore();
    });

    ctx.fillStyle = "#78716C";
    ctx.font = "22px sans-serif";
    ctx.fillText(`证件正反面核验复印件 · 生成日期 ${todayStr()}`, 120, A4_H - 80);
    return out;
  }

  function refreshWatermarkUI() {
    const count = state.wmItems.length;
    document.getElementById("wm-count-label").textContent = `已选 ${count} 张`;

    const listEl = document.getElementById("wm-file-list");
    listEl.innerHTML = "";
    state.wmItems.forEach((item, idx) => {
      const li = document.createElement("li");
      li.className = "file-queue__item";
      if (idx === state.wmSelectedIdx && state.wmMode === "single") {
        li.style.borderColor = "#171717";
      }
      const span = document.createElement("span");
      span.className = "file-queue__name";
      span.style.cursor = "pointer";
      span.textContent = `${idx + 1}. ${item.name}`;
      span.onclick = () => {
        state.wmSelectedIdx = idx;
        refreshWatermarkUI();
      };
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "file-queue__remove";
      rm.textContent = "×";
      rm.onclick = () => {
        state.wmItems.splice(idx, 1);
        state.wmSelectedIdx = Math.max(0, Math.min(state.wmSelectedIdx, state.wmItems.length - 1));
        refreshWatermarkUI();
      };
      li.append(span, rm);
      listEl.appendChild(li);
    });

    const emptyEl = document.getElementById("wm-empty-state");
    const previewCanvas = document.getElementById("wm-preview-canvas");
    const singleBtn = document.getElementById("btn-export-wm-single");
    const batchBtn = document.getElementById("btn-export-wm-batch");
    const clearBtn = document.getElementById("btn-wm-clear");

    if (count === 0) {
      emptyEl.style.display = "block";
      previewCanvas.style.display = "none";
      singleBtn.disabled = true;
      batchBtn.disabled = true;
      clearBtn.disabled = true;
      return;
    }

    emptyEl.style.display = "none";
    previewCanvas.style.display = "block";
    singleBtn.disabled = false;
    batchBtn.disabled = false;
    clearBtn.disabled = false;

    let rendered;
    if (state.wmMode === "a4pair") {
      rendered = renderIdPairOnA4(
        state.wmItems[0].canvas,
        state.wmItems[1] ? state.wmItems[1].canvas : null
      );
      batchBtn.textContent = isPro()
        ? "导出正反面标准 A4 打印版 (PDF)"
        : "解锁 Pro 导出正反面 A4 标准打印版 (PDF)";
    } else {
      const target = state.wmItems[state.wmSelectedIdx] || state.wmItems[0];
      rendered = renderWatermarkedItem(target.canvas);
      batchBtn.textContent = isPro()
        ? `一键打包下载全部 ${count} 张防伪图 (ZIP)`
        : `解锁 Pro 批量打包下载全部 ${count} 张 (ZIP)`;
    }

    previewCanvas.width = rendered.width;
    previewCanvas.height = rendered.height;
    previewCanvas.getContext("2d").drawImage(rendered, 0, 0);
  }

  /* ------------------------------------------------------------------------
     7. Panel 3 — Irreversible Pixel Redactor Studio
     ------------------------------------------------------------------------ */
  function paintRedactionRect(ctx, sourceCanvas, rect) {
    const x = Math.max(0, Math.round(Math.min(rect.x, rect.x + rect.w)));
    const y = Math.max(0, Math.round(Math.min(rect.y, rect.y + rect.h)));
    const w = Math.min(sourceCanvas.width - x, Math.round(Math.abs(rect.w)));
    const h = Math.min(sourceCanvas.height - y, Math.round(Math.abs(rect.h)));
    if (w < 2 || h < 2) return;

    if (rect.style === "black") {
      ctx.fillStyle = "#0F0F0F";
      ctx.fillRect(x, y, w, h);
    } else if (rect.style === "hatch") {
      ctx.save();
      ctx.fillStyle = "#18181B";
      ctx.fillRect(x, y, w, h);
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.strokeStyle = "#C4302B";
      ctx.lineWidth = 3;
      for (let d = -h; d < w + h; d += 16) {
        ctx.beginPath();
        ctx.moveTo(x + d, y);
        ctx.lineTo(x + d - h, y + h);
        ctx.stroke();
      }
      ctx.restore();
    } else if (rect.style === "mosaic") {
      // Destructive coarse block averaging + deterministic scramble so AI super-resolution cannot invert
      const srcCtx = sourceCanvas.getContext("2d");
      const imgData = srcCtx.getImageData(x, y, w, h);
      const block = Math.max(14, Math.round(Math.min(w, h) * 0.22));
      for (let by = 0; by < h; by += block) {
        for (let bx = 0; bx < w; bx += block) {
          // Scrambled solid neutral gray blocks completely erase character glyph luminance
          const shade = ((bx * 31 + by * 17) % 80) + 75;
          ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
          ctx.fillRect(x + bx, y + by, Math.min(block, w - bx), Math.min(block, h - by));
        }
      }
      // Explicitly zero out temporary buffer reference
      imgData.data.fill(0);
    }
  }

  function renderRedactedPageCanvas(pageObj, activeDragRect) {
    const out = document.createElement("canvas");
    out.width = pageObj.baseCanvas.width;
    out.height = pageObj.baseCanvas.height;
    const ctx = out.getContext("2d");
    ctx.drawImage(pageObj.baseCanvas, 0, 0);

    for (const r of pageObj.rects) {
      paintRedactionRect(ctx, pageObj.baseCanvas, r);
    }

    if (activeDragRect) {
      paintRedactionRect(ctx, pageObj.baseCanvas, activeDragRect);
      ctx.save();
      ctx.strokeStyle = "#C4302B";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(activeDragRect.x, activeDragRect.y, activeDragRect.w, activeDragRect.h);
      ctx.restore();
    }
    return out;
  }

  function refreshRedactUI(liveDragRect) {
    const total = state.redactPages.length;
    const emptyEl = document.getElementById("redact-empty-state");
    const previewCanvas = document.getElementById("redact-preview-canvas");
    const undoBtn = document.getElementById("btn-redact-undo");
    const resetBtn = document.getElementById("btn-redact-reset");
    const pngBtn = document.getElementById("btn-export-redact-png");
    const pdfBtn = document.getElementById("btn-export-redact-pdf");
    const prevBtn = document.getElementById("btn-redact-prev");
    const nextBtn = document.getElementById("btn-redact-next");
    const pageInd = document.getElementById("redact-page-indicator");

    if (total === 0) {
      emptyEl.style.display = "block";
      previewCanvas.style.display = "none";
      undoBtn.disabled = true;
      resetBtn.disabled = true;
      pngBtn.disabled = true;
      pdfBtn.disabled = true;
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      pageInd.textContent = "第 0 / 0 页";
      return;
    }

    emptyEl.style.display = "none";
    previewCanvas.style.display = "block";
    pngBtn.disabled = false;
    pdfBtn.disabled = false;

    const current = state.redactPages[state.redactPageIdx];
    undoBtn.disabled = current.rects.length === 0;
    resetBtn.disabled = current.rects.length === 0;
    prevBtn.disabled = state.redactPageIdx <= 0;
    nextBtn.disabled = state.redactPageIdx >= total - 1;
    pageInd.textContent = `第 ${state.redactPageIdx + 1} / ${total} 页`;

    const rendered = renderRedactedPageCanvas(current, liveDragRect);
    previewCanvas.width = rendered.width;
    previewCanvas.height = rendered.height;
    previewCanvas.getContext("2d").drawImage(rendered, 0, 0);
  }

  /* ------------------------------------------------------------------------
     8. Built-in 1-Click Procedural Demo Generators (Instant Trust Builder)
     ------------------------------------------------------------------------ */
  function createSampleInvoiceCanvas(index, seller, itemTitle, amount) {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 760;
    const ctx = c.getContext("2d");

    ctx.fillStyle = "#FFFEFA";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#9A3412";
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, c.width - 48, c.height - 48);

    // Header title
    ctx.fillStyle = "#9A3412";
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("电子发票（普通发票）", c.width / 2, 92);
    ctx.fillRect(c.width / 2 - 210, 108, 420, 3);
    ctx.fillRect(c.width / 2 - 210, 116, 420, 2);

    // Tax authority oval stamp simulation
    ctx.save();
    ctx.strokeStyle = "rgba(196, 48, 43, 0.75)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(c.width / 2, 86, 130, 44, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "rgba(196, 48, 43, 0.75)";
    ctx.fillText("全国统一发票监制章 · 样本演示", c.width / 2, 122);
    ctx.restore();

    ctx.textAlign = "left";
    ctx.fillStyle = "#292524";
    ctx.font = "20px monospace";
    ctx.fillText(`发票号码：26312000000${1840 + index}`, 850, 74);
    ctx.fillText(`开票日期：${todayStr()}`, 850, 106);

    // Grid lines
    ctx.strokeStyle = "#B45309";
    ctx.lineWidth = 2;
    ctx.strokeRect(56, 150, c.width - 112, 520);
    ctx.beginPath();
    ctx.moveTo(56, 260);
    ctx.lineTo(c.width - 56, 260);
    ctx.moveTo(56, 520);
    ctx.lineTo(c.width - 56, 520);
    ctx.moveTo(600, 150);
    ctx.lineTo(600, 260);
    ctx.stroke();

    ctx.font = "21px sans-serif";
    ctx.fillStyle = "#7C2D12";
    ctx.fillText("购买方信息", 76, 190);
    ctx.fillText("销售方信息", 620, 190);

    ctx.fillStyle = "#1C1917";
    ctx.fillText("名称：上海远航数字科技有限公司（演示样本）", 76, 232);
    ctx.fillText(`名称：${seller}`, 620, 232);

    ctx.fillStyle = "#7C2D12";
    ctx.fillText("项目名称", 80, 305);
    ctx.fillText("规格型号", 470, 305);
    ctx.fillText("金额 (不含税)", 760, 305);
    ctx.fillText("税额 (6%)", 980, 305);

    ctx.fillStyle = "#1C1917";
    ctx.font = "23px sans-serif";
    ctx.fillText(itemTitle, 80, 365);
    ctx.fillText("标准项", 470, 365);
    const net = (amount / 1.06).toFixed(2);
    const tax = (amount - parseFloat(net)).toFixed(2);
    ctx.fillText(`¥ ${net}`, 760, 365);
    ctx.fillText(`¥ ${tax}`, 980, 365);

    ctx.font = "bold 28px sans-serif";
    ctx.fillText(`价税合计（小写）：¥ ${amount.toFixed(2)}`, 680, 585);
    ctx.font = "20px sans-serif";
    ctx.fillStyle = "#57534E";
    ctx.fillText("开票人：系统自动开具（演示数据）", 76, 712);

    return c;
  }

  function createSampleIdCanvas(isBack) {
    const c = document.createElement("canvas");
    c.width = 960;
    c.height = 604;
    const ctx = c.getContext("2d");

    ctx.fillStyle = "#F4F8FB";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#CBD5E1";
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, c.width - 24, c.height - 24);

    if (!isBack) {
      ctx.fillStyle = "#0F172A";
      ctx.font = "bold 30px sans-serif";
      ctx.fillText("居民身份证件（正页演示样张）", 72, 92);

      ctx.fillStyle = "#334155";
      ctx.font = "26px sans-serif";
      ctx.fillText("姓  名：张  三（示例样本）", 72, 175);
      ctx.fillText("性  别：男        民  族：汉", 72, 235);
      ctx.fillText("出  生：1996 年 08 月 18 日", 72, 295);
      ctx.fillText("住  址：上海市浦东新区世纪大道 888 号", 72, 355);
      ctx.fillText("        示范园区 12 栋 601 室", 72, 402);
      ctx.font = "bold 28px monospace";
      ctx.fillText("公民身份号码：31011519960818000X", 72, 515);

      // Silhouette box
      ctx.fillStyle = "#E2E8F0";
      ctx.fillRect(650, 120, 220, 280);
      ctx.fillStyle = "#94A3B8";
      ctx.beginPath();
      ctx.arc(760, 215, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(760, 365, 92, Math.PI, 0);
      ctx.fill();
    } else {
      ctx.fillStyle = "#0F171A";
      ctx.font = "bold 40px sans-serif";
      ctx.fillText("中华人民共和国 · 居民证件背页（样张）", 150, 210);
      ctx.font = "28px sans-serif";
      ctx.fillStyle = "#334155";
      ctx.fillText("签发机关：上海市公安局浦东分局（演示专用）", 150, 380);
      ctx.fillText("有效期限：2022.08.18 — 2042.08.18", 150, 445);
    }
    return c;
  }

  function createSampleContractCanvas() {
    const c = document.createElement("canvas");
    c.width = 1100;
    c.height = 1420;
    const ctx = c.getContext("2d");

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, c.width, c.height);

    ctx.fillStyle = "#171717";
    ctx.font = "bold 42px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("技术服务采购合同（内部保密样张）", c.width / 2, 125);

    ctx.textAlign = "left";
    ctx.font = "25px sans-serif";
    const lines = [
      "合同编号：HT-2026-SH-0892",
      "",
      "甲方（委托方）：星辰智造科技股份有限公司",
      "甲方法定代表人：李明哲      联系电话：138-0013-8899",
      "甲方身份证号：310104198805126618",
      "",
      "乙方（服务方）：云帆软件工作室",
      "收款开户银行：招商银行上海张江支行",
      "收款银行账号：6225 8821 9044 7712（请用鼠标拖拽框选涂黑此处）",
      "",
      "第一条 结算核心底价与商业机密条款",
      "1. 本项目含税包干协议内部底价为人民币：¥ 186,500.00 元。",
      "2. 双方应对上述协议单价严格保密，对外公示版本须对身份证号、",
      "   收款银行卡号及协议底价进行不可逆像素级脱敏处理。",
      "",
      "（提示：直接在右侧画布上按住鼠标左键框选上方卡号或金额即可抹除）",
    ];

    let y = 220;
    for (const line of lines) {
      ctx.fillStyle = line.includes("提示") ? "#C4302B" : "#27272A";
      ctx.fillText(line, 95, y);
      y += 58;
    }
    return c;
  }

  function loadDemoForActiveTab() {
    if (state.activeTab === "invoice") {
      state.invoices = [
        { id: 1, name: "示例发票01_滴滴出行交通费_68元.pdf", canvas: createSampleInvoiceCanvas(1, "滴滴出行科技有限公司", "*运输服务*客运服务费", 68.0) },
        { id: 2, name: "示例发票02_全季酒店差旅住宿_428元.pdf", canvas: createSampleInvoiceCanvas(2, "华住酒店管理有限公司", "*住宿服务*差旅房费", 428.0) },
        { id: 3, name: "示例发票03_阿里云服务器租赁_360元.pdf", canvas: createSampleInvoiceCanvas(3, "阿里云计算有限公司", "*信息技术服务*云主机资源", 360.0) },
        { id: 4, name: "示例发票04_京东办公耗材采购_159元.pdf", canvas: createSampleInvoiceCanvas(4, "北京京东世纪贸易有限公司", "*办公用品*打印纸及硒鼓", 159.0) },
      ];
      state.invPreviewPageIdx = 0;
      refreshInvoiceUI();
    } else if (state.activeTab === "watermark") {
      state.wmItems = [
        { id: 1, name: "示例_身份证人像面.png", canvas: createSampleIdCanvas(false) },
        { id: 2, name: "示例_身份证国徽面.png", canvas: createSampleIdCanvas(true) },
      ];
      state.wmSelectedIdx = 0;
      refreshWatermarkUI();
    } else if (state.activeTab === "redact") {
      state.redactPages = [
        {
          name: "示例_采购合同保密页.pdf",
          baseCanvas: createSampleContractCanvas(),
          rects: [{ x: 255, y: 654, w: 345, h: 40, style: state.redactStyle }],
        },
      ];
      state.redactPageIdx = 0;
      refreshRedactUI();
    }
  }

  /* ------------------------------------------------------------------------
     9. License State Persistence & Modal Controls
     ------------------------------------------------------------------------ */
  function loadSavedLicense() {
    try {
      const saved = localStorage.getItem(STORE_CONFIG.storageKey);
      if (saved) {
        const res = verifyLicenseKey(saved);
        if (res.valid) {
          state.license = res;
        }
      }
    } catch (_) {
      // Ignore storage errors in strict incognito modes
    }
    updateLicenseHeaderUI();
  }

  function updateLicenseHeaderUI() {
    const badge = document.getElementById("license-status-badge");
    const openBtn = document.getElementById("btn-open-activate");
    const invHint = document.getElementById("inv-free-hint");

    if (isPro()) {
      badge.textContent = `已激活：${state.license.tierLabel}`;
      badge.className = "license-badge license-badge--pro";
      openBtn.textContent = "查看授权信息";
      openBtn.className = "btn btn--outline btn--sm";
      if (invHint) {
        invHint.style.display = "none";
      }
    } else {
      badge.textContent = "当前版本：免费体验版";
      badge.className = "license-badge";
      openBtn.textContent = "解锁 Pro 永久买断版";
      openBtn.className = "btn btn--primary btn--sm";
      if (invHint) {
        invHint.style.display = "block";
      }
    }

    refreshInvoiceUI();
    refreshWatermarkUI();
    refreshRedactUI();
  }

  function openActivateModal(customPrompt) {
    const modal = document.getElementById("activate-modal");
    const fb = document.getElementById("license-feedback");
    if (customPrompt) {
      fb.textContent = customPrompt;
      fb.className = "feedback-msg feedback-msg--err";
    } else if (isPro()) {
      fb.textContent = `当前设备已永久激活（${state.license.tierLabel}：${state.license.key}）`;
      fb.className = "feedback-msg feedback-msg--ok";
    } else {
      fb.textContent = "";
    }
    modal.classList.add("is-open");
  }

  function closeActivateModal() {
    document.getElementById("activate-modal").classList.remove("is-open");
  }

  /* ------------------------------------------------------------------------
     10. Event Wiring
     ------------------------------------------------------------------------ */
  function setupDropzone(zoneId, inputId, onFiles) {
    const zone = document.getElementById(zoneId);
    const input = document.getElementById(inputId);

    input.addEventListener("change", () => {
      if (input.files && input.files.length > 0) {
        onFiles(Array.from(input.files));
        input.value = "";
      }
    });

    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("is-dragover");
    });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("is-dragover");
    });

    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("is-dragover");
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        onFiles(Array.from(e.dataTransfer.files));
      }
    });
  }

  function initEvents() {
    // Network status proof bar
    const updateNetLabel = () => {
      const online = navigator.onLine;
      const lbl = document.getElementById("network-state-label");
      lbl.textContent = online
        ? "外网上传请求: 0 B · 可随时断网运行"
        : "已处于完全断网离线态 · 本机安全运行中";
    };
    window.addEventListener("online", updateNetLabel);
    window.addEventListener("offline", updateNetLabel);
    updateNetLabel();

    // Tabs switching
    document.querySelectorAll(".tool-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-tab");
        state.activeTab = target;
        document.querySelectorAll(".tool-tab").forEach((b) => {
          b.setAttribute("aria-selected", String(b === btn));
        });
        document.querySelectorAll(".studio-panel").forEach((panel) => {
          panel.classList.toggle("is-active", panel.id === `panel-${target}`);
        });
      });
    });

    // Demo loader buttons
    document.getElementById("btn-load-demo").addEventListener("click", loadDemoForActiveTab);
    document.getElementById("btn-inv-demo-inline").addEventListener("click", loadDemoForActiveTab);
    document.getElementById("btn-wm-demo-inline").addEventListener("click", loadDemoForActiveTab);
    document.getElementById("btn-redact-demo-inline").addEventListener("click", loadDemoForActiveTab);

    // Modal & Activation
    document.getElementById("btn-open-activate").addEventListener("click", () => openActivateModal());
    document.getElementById("btn-close-modal").addEventListener("click", closeActivateModal);
    document.getElementById("activate-modal").addEventListener("click", (e) => {
      if (e.target.id === "activate-modal") closeActivateModal();
    });

    document.getElementById("btn-buy-link").addEventListener("click", (e) => {
      if (STORE_CONFIG.checkoutConfigured && STORE_CONFIG.checkoutUrl) {
        e.currentTarget.href = STORE_CONFIG.checkoutUrl;
      } else {
        e.preventDefault();
        const fb = document.getElementById("license-feedback");
        fb.textContent = "自动发卡收银台链接正在绑定中；若您已获取激活码，请直接在下方输入框粘贴激活。";
        fb.className = "feedback-msg feedback-msg--err";
      }
    });

    document.getElementById("btn-verify-license").addEventListener("click", () => {
      const code = document.getElementById("license-code-input").value;
      const res = verifyLicenseKey(code);
      const fb = document.getElementById("license-feedback");
      if (!res.valid) {
        fb.textContent = res.reason;
        fb.className = "feedback-msg feedback-msg--err";
        return;
      }
      state.license = res;
      try {
        localStorage.setItem(STORE_CONFIG.storageKey, res.key);
      } catch (_) {}
      fb.textContent = `激活成功！已永久解锁 ${res.tierLabel} 全部批量与高级排版功能。`;
      fb.className = "feedback-msg feedback-msg--ok";
      updateLicenseHeaderUI();
    });

    // ---------------- Panel 1: Invoices ----------------
    setupDropzone("invoice-dropzone", "invoice-file-input", async (files) => {
      for (const f of files) {
        try {
          const pages = await parseUploadedFile(f, 50);
          for (const p of pages) {
            state.invoices.push({
              id: Date.now() + Math.random(),
              name: p.name,
              canvas: p.canvas,
            });
          }
        } catch (err) {
          alert(err.message || "文件解析失败");
        }
      }
      refreshInvoiceUI();
    });

    document.querySelectorAll("[data-inv-layout]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.invPerPage = parseInt(btn.getAttribute("data-inv-layout"), 10);
        document.querySelectorAll("[data-inv-layout]").forEach((b) => {
          b.classList.toggle("is-selected", b === btn);
        });
        state.invPreviewPageIdx = 0;
        refreshInvoiceUI();
      });
    });

    document.getElementById("inv-binding-margin").addEventListener("change", (e) => {
      state.invBindingMargin = e.target.checked;
      refreshInvoiceUI();
    });

    document.getElementById("inv-cut-lines").addEventListener("change", (e) => {
      state.invCutLines = e.target.checked;
      refreshInvoiceUI();
    });

    document.getElementById("inv-summary-sheet").addEventListener("change", (e) => {
      if (e.target.checked && !isPro()) {
        e.target.checked = false;
        openActivateModal("「报销票据打印汇总签字单」属于 Pro 买断版功能，输入激活码即可永久解锁。");
        return;
      }
      state.invSummarySheet = e.target.checked;
      document.getElementById("inv-summary-fields").style.display = e.target.checked
        ? "block"
        : "none";
      refreshInvoiceUI();
    });

    document.getElementById("inv-claimant-input").addEventListener("input", (e) => {
      state.invClaimant = e.target.value;
      refreshInvoiceUI();
    });

    document.getElementById("btn-inv-prev-page").addEventListener("click", () => {
      if (state.invPreviewPageIdx > 0) {
        state.invPreviewPageIdx--;
        refreshInvoiceUI();
      }
    });

    document.getElementById("btn-inv-next-page").addEventListener("click", () => {
      const total = getTotalInvoicePages(state.invoices.length);
      if (state.invPreviewPageIdx < total - 1) {
        state.invPreviewPageIdx++;
        refreshInvoiceUI();
      }
    });

    document.getElementById("btn-inv-clear").addEventListener("click", () => {
      state.invoices = [];
      state.invPreviewPageIdx = 0;
      refreshInvoiceUI();
    });

    document.getElementById("btn-export-invoice-pdf").addEventListener("click", () => {
      if (state.invoices.length === 0) return;
      if (!isPro() && state.invoices.length > 2) {
        openActivateModal(
          `当前已导入 ${state.invoices.length} 张发票；免费版支持最多 2 张拼版验证效果，解锁 Pro 版（¥19.9 永久买断）即可一次批量导出全部发票。`
        );
        return;
      }

      const itemsToExport = isPro() ? state.invoices : state.invoices.slice(0, 2);
      const totalPages = getTotalInvoicePages(itemsToExport.length);
      const pageSpecs = [];

      for (let p = 0; p < totalPages; p++) {
        const sheet = renderInvoiceA4Sheet(p, itemsToExport);
        const jpgBytes = dataUrlToUint8Array(sheet.toDataURL("image/jpeg", 0.91));
        pageSpecs.push({
          jpegBytes: jpgBytes,
          pixelWidth: sheet.width,
          pixelHeight: sheet.height,
          ptWidth: 595.28,
          ptHeight: 841.89,
        });
      }

      const pdfBytes = buildPdfBytesFromPages(pageSpecs);
      triggerDownload(
        new Blob([pdfBytes], { type: "application/pdf" }),
        `电子发票A4报销拼版_${itemsToExport.length}张_${todayStr()}.pdf`
      );
    });

    // ---------------- Panel 2: Watermark ----------------
    setupDropzone("wm-dropzone", "wm-file-input", async (files) => {
      for (const f of files) {
        try {
          const imgs = await loadImageFileToCanvas(f);
          for (const im of imgs) {
            state.wmItems.push({
              id: Date.now() + Math.random(),
              name: im.name,
              canvas: im.canvas,
            });
          }
        } catch (err) {
          alert(err.message);
        }
      }
      refreshWatermarkUI();
    });

    document.querySelectorAll("[data-wm-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-wm-mode");
        state.wmMode = mode;
        document.querySelectorAll("[data-wm-mode]").forEach((b) => {
          b.classList.toggle("is-selected", b === btn);
        });
        refreshWatermarkUI();
      });
    });

    document.getElementById("wm-text-input").addEventListener("input", (e) => {
      state.wmText = e.target.value;
      refreshWatermarkUI();
    });

    document.querySelectorAll("[data-wm-preset]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const txt = chip.getAttribute("data-wm-preset");
        state.wmText = txt;
        document.getElementById("wm-text-input").value = txt;
        refreshWatermarkUI();
      });
    });

    document.querySelectorAll("[data-wm-color]").forEach((sw) => {
      sw.addEventListener("click", () => {
        state.wmColor = sw.getAttribute("data-wm-color");
        document.querySelectorAll("[data-wm-color]").forEach((s) => {
          s.classList.toggle("is-selected", s === sw);
        });
        refreshWatermarkUI();
      });
    });

    document.getElementById("wm-opacity-range").addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      state.wmOpacity = val / 100;
      document.getElementById("wm-opacity-val").textContent = `${val}%`;
      refreshWatermarkUI();
    });

    document.getElementById("wm-density-range").addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      state.wmDensity = val;
      document.getElementById("wm-density-val").textContent =
        val === 1 ? "疏朗" : val === 3 ? "加密" : "标准";
      refreshWatermarkUI();
    });

    document.getElementById("wm-append-date").addEventListener("change", (e) => {
      state.wmAppendDate = e.target.checked;
      refreshWatermarkUI();
    });

    document.getElementById("wm-anti-ai-grain").addEventListener("change", (e) => {
      if (e.target.checked && !isPro()) {
        e.target.checked = false;
        openActivateModal("「防 PS / AI 去水印微噪点干扰纹」属于 Pro 永久买断版功能。");
        return;
      }
      state.wmAntiAiGrain = e.target.checked;
      refreshWatermarkUI();
    });

    document.getElementById("btn-wm-clear").addEventListener("click", () => {
      state.wmItems = [];
      state.wmSelectedIdx = 0;
      refreshWatermarkUI();
    });

    document.getElementById("btn-export-wm-single").addEventListener("click", () => {
      if (state.wmItems.length === 0) return;
      const target = state.wmItems[state.wmSelectedIdx] || state.wmItems[0];
      const out = renderWatermarkedItem(target.canvas);
      out.toBlob((blob) => {
        const stem = target.name.replace(/\.[^.]+$/, "");
        triggerDownload(blob, `${stem}_防盗用水印_${todayStr()}.png`);
      }, "image/png");
    });

    document.getElementById("btn-export-wm-batch").addEventListener("click", () => {
      if (state.wmItems.length === 0) return;
      if (!isPro()) {
        openActivateModal(
          "「身份证正反面 A4 合版 PDF 打印」与「多张证件一键 ZIP 批量加水印」属于 Pro 永久买断版功能。"
        );
        return;
      }

      if (state.wmMode === "a4pair") {
        const sheet = renderIdPairOnA4(
          state.wmItems[0].canvas,
          state.wmItems[1] ? state.wmItems[1].canvas : null
        );
        const jpgBytes = dataUrlToUint8Array(sheet.toDataURL("image/jpeg", 0.92));
        const pdfBytes = buildPdfBytesFromPages([
          {
            jpegBytes: jpgBytes,
            pixelWidth: sheet.width,
            pixelHeight: sheet.height,
            ptWidth: 595.28,
            ptHeight: 841.89,
          },
        ]);
        triggerDownload(
          new Blob([pdfBytes], { type: "application/pdf" }),
          `身份证正反面A4防盗用复印件_${todayStr()}.pdf`
        );
      } else {
        const entries = state.wmItems.map((item, idx) => {
          const c = renderWatermarkedItem(item.canvas);
          const pngBytes = dataUrlToUint8Array(c.toDataURL("image/png"));
          const stem = item.name.replace(/\.[^.]+$/, "");
          return {
            name: `${String(idx + 1).padStart(2, "0")}_${stem}_已加防盗用水印.png`,
            data: pngBytes,
          };
        });
        const zipBytes = buildZipBytes(entries);
        triggerDownload(
          new Blob([zipBytes], { type: "application/zip" }),
          `证件防盗用水印批量包_${entries.length}张_${todayStr()}.zip`
        );
      }
    });

    // ---------------- Panel 3: Redactor ----------------
    setupDropzone("redact-dropzone", "redact-file-input", async (files) => {
      const f = files[0];
      if (!f) return;
      try {
        const pages = await parseUploadedFile(f, 40);
        state.redactPages = pages.map((p) => ({
          name: p.name,
          baseCanvas: p.canvas,
          rects: [],
        }));
        state.redactPageIdx = 0;
        refreshRedactUI();
      } catch (err) {
        alert(err.message || "文件解析失败");
      }
    });

    document.querySelectorAll("[data-redact-style]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.redactStyle = btn.getAttribute("data-redact-style");
        document.querySelectorAll("[data-redact-style]").forEach((b) => {
          b.classList.toggle("is-selected", b === btn);
        });
      });
    });

    const redactCanvas = document.getElementById("redact-preview-canvas");
    function getCanvasCoords(evt) {
      const rect = redactCanvas.getBoundingClientRect();
      const scaleX = redactCanvas.width / rect.width;
      const scaleY = redactCanvas.height / rect.height;
      const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
      const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY,
      };
    }

    redactCanvas.addEventListener("pointerdown", (e) => {
      if (state.redactPages.length === 0) return;
      redactCanvas.setPointerCapture(e.pointerId);
      state.dragStart = getCanvasCoords(e);
      state.dragCurrent = state.dragStart;
    });

    redactCanvas.addEventListener("pointermove", (e) => {
      if (!state.dragStart) return;
      state.dragCurrent = getCanvasCoords(e);
      refreshRedactUI({
        x: state.dragStart.x,
        y: state.dragStart.y,
        w: state.dragCurrent.x - state.dragStart.x,
        h: state.dragCurrent.y - state.dragStart.y,
        style: state.redactStyle,
      });
    });

    redactCanvas.addEventListener("pointerup", () => {
      if (!state.dragStart || !state.dragCurrent) return;
      const w = state.dragCurrent.x - state.dragStart.x;
      const h = state.dragCurrent.y - state.dragStart.y;
      if (Math.abs(w) > 6 && Math.abs(h) > 6) {
        state.redactPages[state.redactPageIdx].rects.push({
          x: state.dragStart.x,
          y: state.dragStart.y,
          w,
          h,
          style: state.redactStyle,
        });
      }
      state.dragStart = null;
      state.dragCurrent = null;
      refreshRedactUI();
    });

    document.getElementById("btn-redact-undo").addEventListener("click", () => {
      const cur = state.redactPages[state.redactPageIdx];
      if (cur && cur.rects.length > 0) {
        cur.rects.pop();
        refreshRedactUI();
      }
    });

    document.getElementById("btn-redact-reset").addEventListener("click", () => {
      const cur = state.redactPages[state.redactPageIdx];
      if (cur) {
        cur.rects = [];
        refreshRedactUI();
      }
    });

    document.getElementById("btn-redact-prev").addEventListener("click", () => {
      if (state.redactPageIdx > 0) {
        state.redactPageIdx--;
        refreshRedactUI();
      }
    });

    document.getElementById("btn-redact-next").addEventListener("click", () => {
      if (state.redactPageIdx < state.redactPages.length - 1) {
        state.redactPageIdx++;
        refreshRedactUI();
      }
    });

    document.getElementById("btn-export-redact-png").addEventListener("click", () => {
      if (state.redactPages.length === 0) return;
      const cur = state.redactPages[state.redactPageIdx];
      const out = renderRedactedPageCanvas(cur, null);
      out.toBlob((blob) => {
        triggerDownload(blob, `安全脱敏文档_P${state.redactPageIdx + 1}_${todayStr()}.png`);
      }, "image/png");
    });

    document.getElementById("btn-export-redact-pdf").addEventListener("click", () => {
      if (state.redactPages.length === 0) return;
      if (!isPro() && state.redactPages.length > 1) {
        openActivateModal("多页合同 PDF 连续不可逆脱敏导出属于 Pro 永久买断版功能。");
        return;
      }
      const pages = isPro() ? state.redactPages : [state.redactPages[state.redactPageIdx]];
      const specs = pages.map((p) => {
        const c = renderRedactedPageCanvas(p, null);
        const jpgBytes = dataUrlToUint8Array(c.toDataURL("image/jpeg", 0.9));
        const ratio = c.height / c.width;
        return {
          jpegBytes: jpgBytes,
          pixelWidth: c.width,
          pixelHeight: c.height,
          ptWidth: 595.28,
          ptHeight: 595.28 * ratio,
        };
      });
      const pdfBytes = buildPdfBytesFromPages(specs);
      triggerDownload(
        new Blob([pdfBytes], { type: "application/pdf" }),
        `不可逆脱敏合同_${pages.length}页_${todayStr()}.pdf`
      );
    });
  }

  loadSavedLicense();
  initEvents();
})();
