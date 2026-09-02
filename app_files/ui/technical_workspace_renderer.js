(function initTwStockTechnicalWorkspaceRenderer(root) {
  "use strict";

  const VERSION = "technical-workspace-renderer-v1";
  const STATUSES = new Set(["eligible", "research-only", "blocked"]);

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderGate(model = {}) {
    const status = STATUSES.has(model.status) ? model.status : "blocked";
    const action = status === "eligible"
      ? "技術與籌碼衍生值可供研究；盤中執行仍須再核對即時價量。"
      : status === "research-only"
        ? "可查看技術結構，但入場、停損、目標與 R:R 不列為可執行。"
        : "技術衍生結論已鎖定；先重新讀取快照或執行收盤後同步。";
    return `
      <section class="technical-safety-gate" data-status="${escapeHtml(status)}" aria-live="polite">
        <div>
          <span>Technical workspace · Decision safety</span>
          <strong>${escapeHtml(model.stockCode)} ${escapeHtml(model.stockName)}｜${escapeHtml(model.label)}</strong>
          <p>${escapeHtml(model.reason)}｜報價 ${escapeHtml(model.quoteAsOf || "待補")}；日線 ${escapeHtml(model.technicalAsOf || "待補")}；核心 ${escapeHtml(model.coverageText)}。</p>
        </div>
        <b>${escapeHtml(action)}</b>
      </section>`;
  }

  const api = Object.freeze({ version: VERSION, escapeHtml, renderGate });
  root.TwStockTechnicalWorkspaceRenderer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
