(() => {
  const OLD_ID = "oc-public-apply-widget";
  const ID = "oc-apply-card-v3";
  document.getElementById(OLD_ID)?.remove();
  document.getElementById("oc-public-apply-widget-v2")?.remove();
  if (document.getElementById(ID)) return;

  const host = document.createElement("div");
  host.id = ID;
  host.style.cssText = "position:fixed;right:18px;bottom:22px;z-index:2147483646;font-family:-apple-system,BlinkMacSystemFont,'Microsoft YaHei',sans-serif";
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = `
    *{box-sizing:border-box}
    .box{position:relative;width:88px;min-height:76px;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:8px 6px;border:1px solid #ffffff66;border-radius:18px;background:linear-gradient(145deg,#065f57,#13a596);box-shadow:0 7px 22px #063f3980;color:white;user-select:none;touch-action:none;cursor:grab}
    .box::before{content:'投';width:28px;height:28px;display:grid;place-items:center;margin-bottom:5px;border-radius:9px;background:#ffffff36;font-size:17px;font-weight:800}
    .box::after{content:'1.5';position:absolute;right:7px;top:5px;font-size:9px;opacity:.8}
    .box.dragging{cursor:grabbing}
    .go{width:100%;border:0;background:transparent;color:white;padding:0;font:700 11px/1.2 -apple-system,BlinkMacSystemFont,'Microsoft YaHei',sans-serif;cursor:inherit;text-align:center;white-space:normal}
    .bubble{display:none;position:absolute;right:0;bottom:calc(100% + 10px);width:285px;max-width:80vw;padding:12px 13px;border:1px solid #b9dcd5;border-left:4px solid #0f8b7e;border-radius:11px;background:white;box-shadow:0 7px 23px #172b4d35;color:#183e39;font:12px/1.55 -apple-system,BlinkMacSystemFont,'Microsoft YaHei',sans-serif;overflow-wrap:anywhere;user-select:text;cursor:auto}
    .bubble.show{display:block}.bubble.error{border-left-color:#d92d20;color:#b42318}
    .close{float:right;border:0;background:transparent;color:#667085;cursor:pointer;font-size:15px;line-height:1;padding:0 0 3px 7px}
  `;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.setAttribute("role", "status");
  const close = document.createElement("button");
  close.className = "close";
  close.type = "button";
  close.textContent = "×";
  close.title = "关闭提示";
  const message = document.createElement("span");
  bubble.append(close, message);
  const box = document.createElement("div");
  box.className = "box";
  box.title = "点击搜索；按住拖动位置";
  const go = document.createElement("button");
  go.className = "go";
  go.type = "button";
  go.textContent = "查投递入口";
  box.append(go);
  shadow.append(style, bubble, box);
  (document.body || document.documentElement).append(host);

  let running = false;
  let cancel = false;
  let pointer = null;
  const clean = (value) => String(value || "").replace(/[\s\u00a0]+/g, " ").trim();
  const keyName = (value) => clean(value).replace(/\s/g, "").replace(/[（(].*?[）)]/g, "");
  const isHttpUrl = (value) => {
    try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
  };
  const setLinkBrowser = (anchor, destination, browser) => {
    anchor.dataset.ocOriginalUrl = destination;
    anchor.href = browser === "edge" ? `microsoft-edge:${destination}` : destination;
    if (browser === "edge") anchor.removeAttribute("target");
    else anchor.target = "_blank";
  };
  const show = (text, error = false) => {
    message.textContent = text;
    bubble.className = `bubble show${error ? " error" : ""}`;
  };
  const send = async (payload) => {
    const attempts = payload.type === "get-public-settings" ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const reply = await chrome.runtime.sendMessage(payload);
      if (reply) {
        if (!reply.ok) throw new Error(reply.error || `v1.5 请求“${payload.type}”失败。`);
        return reply.data;
      }
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
    throw new Error(`v1.5 后台未回复“${payload.type}”；请查看 chrome://extensions 中此扩展的错误记录。`);
  };

  function scanRows() {
    const candidates = [];
    for (const table of document.querySelectorAll("table")) {
      const rows = [...table.querySelectorAll("tr")];
      let headerIndex = -1;
      let companyIndex = -1;
      let jobIndex = -1;
      let linksIndex = -1;
      for (let i = 0; i < Math.min(rows.length, 6); i++) {
        const headers = [...rows[i].children].map((cell) => keyName(cell.textContent));
        const company = headers.findIndex((text) => /^(公司名称|企业名称|单位名称|雇主名称)$/.test(text));
        const job = headers.findIndex((text) => text.includes("岗位"));
        if (company >= 0 && job >= 0) {
          headerIndex = i;
          companyIndex = company;
          jobIndex = job;
          linksIndex = headers.findIndex((text) => text.includes("相关链接"));
          break;
        }
      }
      if (headerIndex < 0) continue;
      const matches = [];
      for (const row of rows.slice(headerIndex + 1)) {
        const cells = [...row.children].filter((cell) => cell.tagName === "TD");
        const companyCell = cells[companyIndex];
        const jobCell = cells[jobIndex];
        if (!companyCell || !jobCell || !row.getClientRects().length) continue;
        const clone = companyCell.cloneNode(true);
        clone.querySelectorAll("[data-oc-public-apply-link]").forEach((item) => item.remove());
        const name = clean(clone.textContent).replace(/\s+/g, "");
        if (name.length < 2 || name.length > 80 || /登录后可见|会员可见/.test(name)) continue;
        matches.push({ name, jobs: clean(jobCell.textContent).slice(0, 160), row, companyCell, jobCell, linksCell: linksIndex >= 0 ? cells[linksIndex] : null });
      }
      if (matches.length) candidates.push(matches);
    }
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0] || [];
  }

  function annotate(rows, result, placement, linkBrowser) {
    let written = 0;
    for (const item of rows) {
      if (keyName(item.name) !== keyName(result.company)) continue;
      item.row.querySelectorAll("[data-oc-public-apply-link]").forEach((node) => node.remove());
      const target = placement === "links" && item.linksCell ? item.linksCell : item.companyCell;
      const wrapper = document.createElement("div");
      wrapper.dataset.ocPublicApplyLink = "1";
      wrapper.style.cssText = "margin-top:7px;padding-top:5px;border-top:1px solid #dbe6fb;font-size:12px;line-height:1.5";
      const link = document.createElement("a");
      const found = isHttpUrl(result.apply_url);
      const destination = found ? result.apply_url : `https://www.bing.com/search?q=${encodeURIComponent(item.name + " 官方招聘 投递")}`;
      setLinkBrowser(link, destination, linkBrowser);
      link.rel = "noopener noreferrer";
      link.textContent = found ? "🔗 候选投递链接" : "🔎 手动搜索";
      link.title = `${found ? "打开前请核对公司官网、岗位和截止日期" : "未找到可核验链接；打开公开网页搜索"}${linkBrowser === "edge" ? "（使用 Microsoft Edge）" : ""}`;
      link.style.cssText = "display:inline-block;padding:3px 8px;border-radius:6px;background:#edf3ff;color:#2457d4;text-decoration:none;font-weight:700";
      wrapper.append(link);
      if (found && isHttpUrl(result.source_url) && result.source_url !== result.apply_url) {
        const source = document.createElement("a");
        setLinkBrowser(source, result.source_url, linkBrowser);
        source.rel = "noopener noreferrer";
        source.textContent = "核对来源";
        source.style.cssText = "margin-left:8px;color:#667085;text-decoration:underline";
        wrapper.append(source);
      }
      target.append(wrapper);
      written++;
    }
    return written;
  }

  async function run() {
    if (running) { cancel = true; show("正在停止；当前公司完成后结束。"); return; }
    running = true;
    cancel = false;
    go.textContent = "停止搜索";
    let done = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheHits = 0;
    try {
      const settings = await send({ type: "get-public-settings" });
      const rows = scanRows();
      if (!rows.length) throw new Error("没有找到包含“公司名称”和“岗位”列的招聘表格，请等页面加载完成后重试。");
      const selected = settings.scope === "all" ? rows.slice(0, 50) : rows.filter(({ jobCell }) => {
        const rect = jobCell.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < innerHeight;
      }).slice(0, 12);
      if (!selected.length) throw new Error("当前屏幕没有可搜索的企业；请滚动到企业列表，或在设置中改为“整页”。");
      const seen = new Set();
      for (const item of selected) {
        if (cancel) break;
        const normalized = keyName(item.name);
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        show(`正在搜索 ${done + 1}/${selected.length}：${item.name}`);
        const answer = await send({ type: "search-one", company: { name: item.name, jobs: item.jobs } });
        if (!annotate(scanRows(), answer.result, settings.placement, settings.browser)) throw new Error(`网页中的“${item.name}”行已改变，请刷新列表后重试。`);
        done++;
        inputTokens += answer.usage?.inputTokens || 0;
        outputTokens += answer.usage?.outputTokens || 0;
        if (answer.cached) cacheHits++;
        show(`已完成 ${done}/${selected.length} 家；缓存 ${cacheHits} 家；输入 ${inputTokens} / 输出 ${outputTokens} Token。`);
      }
      show(cancel ? `已停止，完成 ${done} 家。` : `完成 ${done} 家。链接已逐条加到招聘列表中；请核对候选链接。`);
    } catch (error) {
      show(`搜索中断：${error?.message || error}`, true);
    } finally {
      running = false;
      go.textContent = "查投递入口";
    }
  }

  box.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const rect = host.getBoundingClientRect();
    pointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: rect.left, y: rect.top, moved: false };
    box.setPointerCapture(event.pointerId);
  });
  box.addEventListener("pointermove", (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;
    if (Math.hypot(dx, dy) > 5) pointer.moved = true;
    if (!pointer.moved) return;
    box.classList.add("dragging");
    const x = Math.max(0, Math.min(innerWidth - host.offsetWidth, pointer.x + dx));
    const y = Math.max(0, Math.min(innerHeight - host.offsetHeight, pointer.y + dy));
    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
    host.style.right = "auto";
    host.style.bottom = "auto";
  });
  box.addEventListener("pointerup", (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const moved = pointer.moved;
    pointer = null;
    box.classList.remove("dragging");
    if (moved) {
      send({ type: "save-position", position: { x: parseFloat(host.style.left), y: parseFloat(host.style.top) } }).catch(() => {});
    } else run();
  });
  box.addEventListener("pointercancel", () => { pointer = null; box.classList.remove("dragging"); });
  go.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(); } });
  close.addEventListener("click", (event) => { event.stopPropagation(); bubble.className = "bubble"; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.linkBrowser) return;
    const browser = changes.linkBrowser.newValue === "edge" ? "edge" : "chrome";
    for (const anchor of document.querySelectorAll("[data-oc-public-apply-link] a[data-oc-original-url]")) {
      const destination = anchor.dataset.ocOriginalUrl;
      if (isHttpUrl(destination)) setLinkBrowser(anchor, destination, browser);
    }
  });
  send({ type: "get-public-settings" }).then(({ position }) => {
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return;
    host.style.left = `${Math.max(0, Math.min(innerWidth - host.offsetWidth, position.x))}px`;
    host.style.top = `${Math.max(0, Math.min(innerHeight - host.offsetHeight, position.y))}px`;
    host.style.right = "auto";
    host.style.bottom = "auto";
  }).catch((error) => show(`扩展连接异常：${error.message}`, true));
})();
