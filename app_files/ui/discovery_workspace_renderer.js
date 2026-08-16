(function initTwStockDiscoveryWorkspaceRenderer(root) {
  "use strict";

  const VERSION = "discovery-workspace-renderer-v1";
  const SAFE_CLASSES = new Set(["up", "down", "flat", "warn", "large", "mid", "small", "micro", "pending", "etf"]);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeClass(value, fallback = "flat") {
    const name = String(value || "");
    return SAFE_CLASSES.has(name) ? name : fallback;
  }

  function formatCount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.round(number)).toLocaleString("en-US") : "0";
  }

  function renderBadge(badge, kind) {
    if (!badge || !badge.label) return "";
    const className = kind === "scale" ? `stock-scale-pill ${safeClass(badge.tone, "pending")}` : `chip ${safeClass(badge.tone)}`;
    return `<span class="${className}" title="${escapeHtml(badge.title)}">${escapeHtml(badge.label)}</span>`;
  }

  function renderRow(row = {}) {
    return `
      <tr class="discovery-row" data-discovery-stock-code="${escapeHtml(row.code)}">
        <td class="sc-sticky">
          <div style="font-weight:900;">${escapeHtml(row.name)} ${escapeHtml(row.code)}</div>
          <div style="font-size:0.72rem;color:var(--muted);">${renderBadge(row.scaleBadge, "scale")} ${renderBadge(row.liquidityBadge, "liquidity")}</div>
        </td>
        <td>${escapeHtml(row.sectorLabel)}</td>
        <td><strong>${escapeHtml(row.pattern)}</strong><div class="discovery-tags">${(Array.isArray(row.reasonTags) ? row.reasonTags : []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div></td>
        <td class="num ${safeClass(row.trendTone)}"><strong>${escapeHtml(row.trendScoreText)}</strong></td>
        <td class="num ${safeClass(row.chipTone)}"><strong>${escapeHtml(row.chipScoreText)}</strong></td>
        <td><strong class="${safeClass(row.riskTone)}">${escapeHtml(row.riskLabel)}</strong><div style="font-size:0.72rem;color:var(--muted);">${escapeHtml(row.riskText)}</div></td>
        <td><strong>${escapeHtml(row.action)}</strong><div style="font-size:0.72rem;color:var(--muted);">排序 ${escapeHtml(row.rankText)} · ${escapeHtml(row.sourceText)}</div></td>
        <td class="discovery-metrics">${escapeHtml(row.metricsText)}</td>
      </tr>`;
  }

  function renderTable(config = {}) {
    const rows = Array.isArray(config.rows) ? config.rows : [];
    const limit = Math.max(1, Number(config.limit) || 5);
    const list = rows.slice(0, limit);
    return `
      <article class="report-card discovery-section-card">
        <div class="discovery-section-head">
          <h3>${escapeHtml(config.title)}</h3>
          <span class="chip flat">${formatCount(rows.length)} 檔${rows.length > list.length ? `（先顯示前 ${formatCount(list.length)}）` : ""}</span>
        </div>
        ${list.length ? `
          <div class="table-wrap">
            <table class="screener-table discovery-table">
              <thead>
                <tr>
                  <th class="sc-sticky">股票</th>
                  <th>產業</th>
                  <th>技術型態</th>
                  <th class="num">趨勢分數</th>
                  <th class="num">籌碼分數</th>
                  <th>風險</th>
                  <th>建議動作</th>
                  <th>指標摘要</th>
                </tr>
              </thead>
              <tbody>${list.map(renderRow).join("")}</tbody>
            </table>
          </div>
        ` : `<div class="empty">${escapeHtml(config.emptyText)}</div>`}
      </article>`;
  }

  function renderHero(model = {}) {
    const topLeft = model.topLeft ? `${model.topLeft.code} ${model.topLeft.name}` : "待更新資料";
    const topRight = model.topRight ? `${model.topRight.code} ${model.topRight.name}` : "待更新資料";
    return `
      <div class="discovery-hero" data-discovery-workspace>
        <div>
          <h3>標的找尋</h3>
          <p>先過濾流動性與市值，再用技術線型、籌碼、月營收 / 殖利率與 AI / 產業題材做組合條件。單一 RSI、MACD 或爆量不會直接變成買賣訊號。</p>
        </div>
        <div class="discovery-stat-grid">
          <div><span>可掃描</span><strong>${formatCount(model.scannedCount)}</strong><small>已排除 ${formatCount(model.excludedCount)} 檔低流動性 / 小市值 / ETF</small></div>
          <div><span>左側候選</span><strong>${formatCount(model.leftCount)}</strong><small>${escapeHtml(topLeft)}</small></div>
          <div><span>右側候選</span><strong>${formatCount(model.rightCount)}</strong><small>${escapeHtml(topRight)}</small></div>
          <div><span>風險警訊</span><strong>${formatCount(model.riskCount)}</strong><small>量縮創高 / RSI&gt;80 / 法人轉賣 / 跌破20MA放量</small></div>
        </div>
      </div>`;
  }

  function renderFilterNote() {
    return `
      <div class="note-box" style="margin-bottom:12px;">
        <strong>四層篩選：</strong>流動性（日均 &gt;= 500 張或中型以上）與市值（官方 rank &lt;= 500；缺 rank 時用本機市值級距 proxy） → 趨勢（MA5/10/20/60/120/240、RSI、MACD、量能、ATR、布林、20/60/120 日高低） → 籌碼（法人 5 / 10 日、Chip Score、融資） → 基本面 / 題材（月營收 YoY、PE / 殖利率、AI / CPO / 半導體 / PCB / 散熱電源等標籤）。
      </div>`;
  }

  function renderDetailNote() {
    return `
      <div class="panel-lite" data-discovery-detail-note style="margin-bottom:12px;">
        <div class="section-head discovery-detail-note-head">
          <div>
            <h3>完整詳表已收斂</h3>
            <p>初始畫面每張清單先顯示前 5 檔；「勝率 proxy / 歷史校準」與每張清單前 12 檔完整詳表改為按需載入。</p>
          </div>
          <button class="secondary-btn discovery-detail-load" type="button" data-discovery-detail-action="load" style="font-size:0.8rem;min-height:32px;">載入完整詳表</button>
        </div>
      </div>`;
  }

  function renderTables(model = {}) {
    const limit = Math.max(1, Number(model.tableLimit) || 5);
    return `
      <div class="discovery-grid">
        ${renderTable({ title: "左側交易：好公司倒楣事 / 回測月季線 / 底部翻揚", rows: model.leftRows, emptyText: "目前沒有符合左側條件的標的。請先執行收盤後同步，補齊日線、籌碼、月營收與估值。", limit })}
        ${renderTable({ title: "右側交易：突破整理 / 主升段 / 籌碼轉強", rows: model.rightRows, emptyText: "目前沒有符合右側突破條件的標的。", limit })}
        ${renderTable({ title: "避開清單：量價背離或出貨警訊", rows: model.riskRows, emptyText: "目前沒有明顯高風險警訊。", limit })}
      </div>`;
  }

  const api = Object.freeze({
    version: VERSION,
    escapeHtml,
    renderHero,
    renderFilterNote,
    renderDetailNote,
    renderRow,
    renderTable,
    renderTables
  });

  root.TwStockDiscoveryWorkspaceRenderer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
