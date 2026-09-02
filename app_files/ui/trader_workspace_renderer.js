(function initTwStockTraderWorkspaceRenderer(root) {
  "use strict";

  const VERSION = "trader-workspace-renderer-v1.1";
  const TONES = new Set(["up", "down", "flat"]);
  const READINESS = new Set(["good", "warn", "bad"]);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeTone(value) {
    const tone = String(value || "");
    return TONES.has(tone) ? tone : "flat";
  }

  function safeReadiness(value) {
    const status = String(value || "");
    return READINESS.has(status) ? status : "bad";
  }

  function renderStockOptions(options) {
    return (Array.isArray(options) ? options : []).map((row) => `
      <option value="${escapeHtml(row?.code)}" ${row?.selected === true ? "selected" : ""}>
        ${escapeHtml(row?.code)} ${escapeHtml(row?.name)}
      </option>`).join("");
  }

  function renderHoldingQuickSwitch(rows, summary = {}) {
    const holdings = Array.isArray(rows) ? rows : [];
    if (!holdings.length) return "";
    const summaryText = `${Number(summary.total) || holdings.length} 檔 · ETF ${Number(summary.etfCount) || 0} / 個股 ${Number(summary.stockCount) || 0} · 報價 ${Number(summary.quotedCount) || 0}`;
    return `
      <section class="trader-holding-switch" aria-label="目前持股快切">
        <div class="trader-holding-switch-head">
          <strong>目前持股快切</strong>
          <span>${escapeHtml(summaryText)}；清單僅供快速切換與研究排序，不處理張數、均價或損益。</span>
        </div>
        <div class="trader-holding-rail" role="group" aria-label="持股代碼">
          ${holdings.map((row) => `
            <button class="trader-holding-chip${row?.selected === true ? " is-selected" : ""}" type="button"
              data-trader-holding-code="${escapeHtml(row?.code)}" aria-pressed="${row?.selected === true ? "true" : "false"}">
              <span class="trader-holding-chip-title"><strong>${escapeHtml(row?.code)}</strong><small>${escapeHtml(row?.name)}</small></span>
              <span class="trader-holding-chip-quote"><strong>${escapeHtml(row?.priceText || "待更新")}</strong><small class="${safeTone(row?.pctTone)}">${escapeHtml(row?.pctText || "報價待更新")}</small></span>
            </button>`).join("")}
        </div>
      </section>`;
  }

  function render(model = {}) {
    const stock = model.stock || {};
    const quoteChangeText = model.quoteAvailable === true ? model.quoteChangeText : "報價待更新";
    const eligibility = model.eligibility && typeof model.eligibility === "object"
      ? model.eligibility
      : { status: "eligible", label: "可執行研究", reason: "", allowDerived: true, allowExecution: true };
    const derivedLocked = eligibility.allowDerived !== true;
    const executionLocked = eligibility.allowExecution !== true;
    const derivedValue = (value) => derivedLocked ? "—" : value;
    const executionValue = (value) => executionLocked ? "—" : value;
    return `
    <section class="panel trader-desk" data-trader-desk data-stock-code="${escapeHtml(stock.code)}">
      <div class="trader-desk-head">
        <div>
          <div class="trader-desk-kicker">Trader workspace · 先判斷，再看細節</div>
          <h1 class="trader-desk-title">${escapeHtml(stock.code)} ${escapeHtml(stock.name)}</h1>
          <p class="trader-desk-meta">${escapeHtml(model.quoteSource)}｜研究排序，不是買賣保證；盤中執行前仍需核對即時價量。</p>
        </div>
        <select id="traderStockSelect" class="select trader-stock-select" aria-label="操盤首頁選擇個股">
          ${renderStockOptions(model.stockOptions)}
        </select>
      </div>

      ${renderHoldingQuickSwitch(model.holdingRows, model.holdingSummary)}

      <div class="trader-safety-gate" data-status="${escapeHtml(eligibility.status || "blocked")}" role="status">
        <div>
          <strong>${escapeHtml(eligibility.label || "資料鎖定")}</strong>
          <span>${escapeHtml(eligibility.reason || "報價或日線尚未通過可信度檢查")}</span>
        </div>
        <b>${eligibility.allowExecution === true ? "可顯示執行研究" : eligibility.allowDerived === true ? "衍生值僅供研究" : "衍生結論已鎖定"}</b>
      </div>

      <div class="trader-decision-grid">
        <article class="trader-decision-card trader-price-card">
          <span>${escapeHtml(model.priceLabel || "現價 / 今日")}</span>
          <strong>${escapeHtml(model.priceText)}</strong>
          <small class="trader-price-change ${safeTone(model.quoteChangeTone)}">${escapeHtml(quoteChangeText)}</small>
        </article>
        <article class="trader-decision-card">
          <span>技術多空</span>
          <strong class="${safeTone(model.technicalTone)}">${escapeHtml(derivedValue(model.technicalLabel))}</strong>
          <p class="trader-decision-note">${escapeHtml(derivedLocked ? "資料未通過新鮮度閘門" : model.technicalNote)}</p>
        </article>
        <article class="trader-decision-card">
          <span>籌碼強弱</span>
          <strong class="${safeTone(model.chipTone)}">${escapeHtml(derivedValue(model.chipLabel))}</strong>
          <p class="trader-decision-note">${escapeHtml(derivedLocked ? "資料未通過新鮮度閘門" : model.chipSourceText)}${derivedLocked ? "" : ` · confidence ${escapeHtml(model.chipConfidence)}`}</p>
        </article>
        <article class="trader-decision-card">
          <span>執行結論</span>
          <strong class="${safeTone(model.executionTone)}">${escapeHtml(model.executionStatus)} · 雷達 ${escapeHtml(executionValue(model.radarScoreText))}</strong>
          <p class="trader-decision-note">${escapeHtml(model.executionConclusion)}</p>
        </article>
      </div>

      <div class="trader-plan-strip">
        <div class="trader-level"><span>入場帶</span><strong>${escapeHtml(executionValue(model.entryText || "-"))}</strong></div>
        <div class="trader-level trader-stop"><span>停損</span><strong>${escapeHtml(executionValue(model.stopText || "-"))}</strong></div>
        <div class="trader-level trader-target"><span>目標</span><strong>${escapeHtml(executionValue(model.targetText || "-"))}</strong></div>
        <div class="trader-readiness" data-status="${safeReadiness(model.coverageStatus)}">
          <span>R:R / 資料完整度</span>
          <strong><span class="${safeTone(model.rrTone)}">${escapeHtml(executionValue(model.rrText || "-"))}</span> · ${escapeHtml(model.coverageText)}</strong>
        </div>
      </div>

      <div class="trader-action-row">
        <button class="secondary-btn" type="button" data-tab-target="technical">看線型與籌碼</button>
        <button class="ghost-btn" type="button" data-tab-target="report">開完整決策</button>
        <button class="ghost-btn" type="button" data-tab-target="screener">回標的雷達</button>
        <p class="trader-blocker"><strong>目前限制：</strong>${escapeHtml(model.blockerText)}｜${escapeHtml(model.missingText)}</p>
      </div>
    </section>`;
  }

  const api = Object.freeze({
    version: VERSION,
    escapeHtml,
    renderStockOptions,
    renderHoldingQuickSwitch,
    render
  });

  root.TwStockTraderWorkspaceRenderer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
