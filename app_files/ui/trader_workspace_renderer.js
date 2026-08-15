(function initTwStockTraderWorkspaceRenderer(root) {
  "use strict";

  const VERSION = "trader-workspace-renderer-v1";
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

  function render(model = {}) {
    const stock = model.stock || {};
    const quoteChangeText = model.quoteAvailable === true ? model.quoteChangeText : "報價待更新";
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

      <div class="trader-decision-grid">
        <article class="trader-decision-card trader-price-card">
          <span>現價 / 今日</span>
          <strong>${escapeHtml(model.priceText)}</strong>
          <small class="trader-price-change ${safeTone(model.quoteChangeTone)}">${escapeHtml(quoteChangeText)}</small>
        </article>
        <article class="trader-decision-card">
          <span>技術多空</span>
          <strong class="${safeTone(model.technicalTone)}">${escapeHtml(model.technicalLabel)}</strong>
          <p class="trader-decision-note">${escapeHtml(model.technicalNote)}</p>
        </article>
        <article class="trader-decision-card">
          <span>籌碼強弱</span>
          <strong class="${safeTone(model.chipTone)}">${escapeHtml(model.chipLabel)}</strong>
          <p class="trader-decision-note">${escapeHtml(model.chipSourceText)} · confidence ${escapeHtml(model.chipConfidence)}</p>
        </article>
        <article class="trader-decision-card">
          <span>執行結論</span>
          <strong class="${safeTone(model.executionTone)}">${escapeHtml(model.executionStatus)} · 雷達 ${escapeHtml(model.radarScoreText)}</strong>
          <p class="trader-decision-note">${escapeHtml(model.executionConclusion)}</p>
        </article>
      </div>

      <div class="trader-plan-strip">
        <div class="trader-level"><span>入場帶</span><strong>${escapeHtml(model.entryText || "-")}</strong></div>
        <div class="trader-level trader-stop"><span>停損</span><strong>${escapeHtml(model.stopText || "-")}</strong></div>
        <div class="trader-level trader-target"><span>目標</span><strong>${escapeHtml(model.targetText || "-")}</strong></div>
        <div class="trader-readiness" data-status="${safeReadiness(model.coverageStatus)}">
          <span>R:R / 資料完整度</span>
          <strong><span class="${safeTone(model.rrTone)}">${escapeHtml(model.rrText || "-")}</span> · ${escapeHtml(model.coverageText)}</strong>
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
    render
  });

  root.TwStockTraderWorkspaceRenderer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
