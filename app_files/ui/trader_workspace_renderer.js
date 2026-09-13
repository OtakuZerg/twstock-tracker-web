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

  function renderSessionBrief(brief = {}) {
    return `<header class="trader-session-brief" data-trader-session-brief>
      <div class="trader-session-title"><div><span>TAIWAN EQUITY · 波段研究</span><h2>今日操盤工作台</h2></div><span class="trader-session-date">${escapeHtml(brief.date || "")}</span></div>
      <div class="trader-session-grid">
        <article><span>01 市場環境</span><strong>${escapeHtml(brief.market || "市場資料待補")}</strong><small>${escapeHtml(brief.marketSource || "核對大盤與夜盤日期")}</small></article>
        <article><span>02 我的追蹤</span><strong>${escapeHtml(brief.tracking || "尚未建立清單")}</strong><small>${escapeHtml(brief.trackingNote || "先處理資料缺口，再比較候選")}</small></article>
        <article><span>03 今日任務</span><strong>${escapeHtml(brief.task || "檢查研究計畫")}</strong><small>${escapeHtml(brief.taskNote || "觸發條件、失效條件與資料依據")}</small></article>
      </div>
      <nav class="trader-workflow-links" aria-label="操盤研究流程">
        <button type="button" data-tab-target="macro">市場與風險</button><button type="button" data-tab-target="discovery">族群與候選</button><button type="button" data-tab-target="catalyst">公告與催化劑</button><button type="button" data-tab-target="help">同步與資料</button>
      </nav>
    </header>`;
  }

  function renderReviewQueue(rows = [], domains = []) {
    return `<section class="trader-review-board" data-trader-review-board>
      <div class="trader-review-head"><div><h3>追蹤清單 · 先處理這些</h3><p>依資料缺口優先；股票清單不含部位大小，不能據此推算帳戶風險。</p></div><button class="ghost-btn" type="button" data-tab-target="report">持股與計畫</button></div>
      <div class="trader-review-list">${rows.length ? rows.map((row) => `<button type="button" class="trader-review-row" data-trader-review-code="${escapeHtml(row.code)}"><strong>${escapeHtml(row.code)} <span>${escapeHtml(row.name)}</span></strong><span class="trader-review-reason">${escapeHtml(row.reason)}</span><small>${escapeHtml(row.asOf || "日期待補")} <span aria-hidden="true">↗</span></small></button>`).join("") : `<p>加入追蹤清單後，這裡會列出需要複核的標的。</p>`}</div>
      <details class="trader-data-detail"><summary>各類資料同步狀態 · 查看日期與範圍</summary><div class="trader-domain-grid">${domains.map((row) => `<article><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.coverage)}</strong><small>${escapeHtml(row.asOf)}</small><p>${escapeHtml(row.note)}</p></article>`).join("")}</div><p class="trader-domain-note">行情自動更新與私人清單搬移是不同流程。月營收依公告月份；ETF 等不適用項目不補零。季報、集保與其他研究資料仍依原資料來源或匯入快照，需核對各自日期。</p></details>
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
      ${renderSessionBrief(model.sessionBrief)}
      ${renderHoldingQuickSwitch(model.holdingRows, model.holdingSummary)}
      <div class="trader-desk-head">
        <div>
          <div class="trader-desk-kicker">目前標的 · 計畫與失效條件</div>
          <h1 class="trader-desk-title">${escapeHtml(stock.code)} ${escapeHtml(stock.name)}</h1>
          <p class="trader-desk-meta">${escapeHtml(model.quoteSource)}｜研究排序，不是買賣保證；盤中執行前仍需核對即時價量。</p>
        </div>
        <select id="traderStockSelect" class="select trader-stock-select" aria-label="操盤首頁選擇個股">
          ${renderStockOptions(model.stockOptions)}
        </select>
      </div>

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
      ${renderReviewQueue(model.reviewRows, model.domainRows)}
    </section>`;
  }

  const api = Object.freeze({
    version: VERSION,
    escapeHtml,
    renderStockOptions,
    renderHoldingQuickSwitch,
    renderSessionBrief,
    renderReviewQueue,
    render
  });

  root.TwStockTraderWorkspaceRenderer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
