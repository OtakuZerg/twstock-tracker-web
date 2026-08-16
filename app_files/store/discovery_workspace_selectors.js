(function initTwStockDiscoveryWorkspaceSelectors(root) {
  "use strict";

  const VERSION = "discovery-workspace-selectors-v1";

  function rows(value) {
    return Array.isArray(value) ? value : [];
  }

  function finiteNumber(value, fallback = null) {
    if (value === null || value === undefined || value === "") return fallback;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function recordFromMap(records, code) {
    if (!records || !code) return null;
    return typeof records.get === "function" ? records.get(code) || null : records[code] || null;
  }

  function stockSummary(row) {
    const stock = row?.stock || {};
    return stock?.code ? { code: String(stock.code), name: String(stock.name || stock.code) } : null;
  }

  function selectDiscoveryWorkspace(input = {}) {
    const allRows = rows(input.allRows);
    const candidates = allRows.filter((row) => row?.universePass === true);
    const leftRows = candidates
      .filter((row) => row?.leftSetup === true && finiteNumber(row.leftScore, -Infinity) >= 50 && row?.risk?.label !== "高")
      .slice()
      .sort((a, b) => finiteNumber(b.leftScore, -Infinity) - finiteNumber(a.leftScore, -Infinity)
        || finiteNumber(b.qualityScore, -Infinity) - finiteNumber(a.qualityScore, -Infinity));
    const rightRows = candidates
      .filter((row) => row?.rightSetup === true && finiteNumber(row.rightScore, -Infinity) >= 55 && row?.risk?.label !== "高")
      .slice()
      .sort((a, b) => finiteNumber(b.rightScore, -Infinity) - finiteNumber(a.rightScore, -Infinity)
        || finiteNumber(b.trendScore, -Infinity) - finiteNumber(a.trendScore, -Infinity));
    const riskRows = candidates
      .filter((row) => row?.risk?.label === "高" || finiteNumber(row.riskPoints, 0) >= 24)
      .slice()
      .sort((a, b) => finiteNumber(b.riskPoints, -Infinity) - finiteNumber(a.riskPoints, -Infinity)
        || finiteNumber(b.trendScore, -Infinity) - finiteNumber(a.trendScore, -Infinity))
      .slice(0, 10);
    const showDetail = input.showDetail === true;
    return {
      showDetail,
      tableLimit: showDetail ? 12 : 5,
      scannedCount: candidates.length,
      excludedCount: Math.max(0, allRows.length - candidates.length),
      leftRows,
      rightRows,
      riskRows,
      topLeft: stockSummary(leftRows[0]),
      topRight: stockSummary(rightRows[0])
    };
  }

  function selectForeignBuyStreakRows(input = {}) {
    const minimum = Math.max(1, Math.floor(finiteNumber(input.minStreak, 3)));
    const limit = Math.max(1, Math.floor(finiteNumber(input.limit, 15)));
    const out = [];
    for (const stock of rows(input.stocks)) {
      const code = String(stock?.code || "").trim();
      if (!code) continue;
      const record = recordFromMap(input.records, code);
      const history = rows(record?.history);
      if (history.length < minimum) continue;
      let streak = 0;
      let sumNet = 0;
      let lastDate = "";
      for (let index = history.length - 1; index >= 0; index -= 1) {
        const net = finiteNumber(history[index]?.foreignNet, null);
        if (net === null || net <= 0) break;
        streak += 1;
        sumNet += net;
        if (!lastDate) lastDate = String(history[index]?.date || "");
      }
      if (streak < minimum) continue;
      out.push({
        stock,
        streak,
        sumNet,
        lastDate,
        coverageDays: history.length,
        source: String(record?.source || "TWSE / TPEx 三大法人")
      });
    }
    return out
      .sort((a, b) => b.streak - a.streak || b.sumNet - a.sumNet)
      .slice(0, limit);
  }

  function countForeignCoverage(input = {}) {
    const minimum = Math.max(1, Math.floor(finiteNumber(input.minimumDays, 3)));
    return rows(input.stocks).filter((stock) => {
      const code = String(stock?.code || "").trim();
      return code && rows(recordFromMap(input.records, code)?.history).length >= minimum;
    }).length;
  }

  const api = Object.freeze({
    version: VERSION,
    selectDiscoveryWorkspace,
    selectForeignBuyStreakRows,
    countForeignCoverage
  });

  root.TwStockDiscoveryWorkspaceSelectors = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
