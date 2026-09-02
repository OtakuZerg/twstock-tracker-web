(function initTwStockTechnicalWorkspaceSelectors(root) {
  "use strict";

  const VERSION = "technical-workspace-selectors-v1";

  function selectGateModel(input = {}) {
    const stock = input.stock || {};
    const eligibility = input.eligibility || {};
    return {
      stockCode: String(stock.code || "").trim(),
      stockName: String(stock.name || stock.code || "").trim(),
      status: eligibility.status || "blocked",
      label: eligibility.label || "資料鎖定",
      tone: eligibility.tone || "bad",
      reason: eligibility.reason || "報價或日線尚未通過可信度檢查",
      allowDerived: eligibility.allowDerived === true,
      allowExecution: eligibility.allowExecution === true,
      coverageText: `${Number(eligibility.coverageReady) || 0}/${Number(eligibility.coverageTotal) || 6}`,
      quoteAsOf: String(input.quoteAsOf || "").trim(),
      technicalAsOf: String(input.technicalAsOf || "").trim()
    };
  }

  const api = Object.freeze({ version: VERSION, selectGateModel });
  root.TwStockTechnicalWorkspaceSelectors = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
