(function initTwStockDecisionSafety(root) {
  "use strict";

  const VERSION = "decision-safety-v1";
  const DEFAULT_MAX_AGE_DAYS = 10;
  const DEFAULT_MIN_EXECUTION_COVERAGE = 5;
  const CONFIDENCE_RANK = Object.freeze({
    "very-low": 0,
    low: 1,
    medium: 2,
    "medium-high": 3,
    high: 4
  });

  function finiteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function dailyReady(ageDays, maxAgeDays = DEFAULT_MAX_AGE_DAYS) {
    const age = finiteNumber(ageDays);
    const maxAge = finiteNumber(maxAgeDays) ?? DEFAULT_MAX_AGE_DAYS;
    return age !== null && age >= -1 && age <= maxAge;
  }

  function buildEligibility(input = {}) {
    const quote = input.quote || {};
    const technical = input.technical || {};
    const coverage = input.coverage || {};
    const coverageReady = Math.max(0, finiteNumber(coverage.ready) ?? 0);
    const coverageTotal = Math.max(0, finiteNumber(coverage.total) ?? 0);
    const minExecutionCoverage = Math.max(1, finiteNumber(input.minExecutionCoverage) ?? DEFAULT_MIN_EXECUTION_COVERAGE);
    const quoteLevel = text(quote.freshnessLevel || quote.level).toLowerCase();
    const quoteReady = quote.hasPrice === true && ["fresh", "fallback"].includes(quoteLevel);
    const technicalReady = technical.ready === true && dailyReady(technical.ageDays, input.maxAgeDays);
    const conflict = input.sourceConflict === true || quote.sourceConflict === true || technical.sourceConflict === true;
    const reasons = [];

    if (!quote.hasPrice) reasons.push("缺少可核對報價");
    else if (!quoteReady) reasons.push(quoteLevel === "stale" ? "報價已過期" : "報價日期不可核對");
    if (technical.ready !== true) reasons.push("日線不足");
    else if (!technicalReady) reasons.push("日線已過期");
    if (conflict) reasons.push("來源數值衝突待複核");

    const allowDerived = quoteReady && technicalReady && !conflict;
    const allowExecution = allowDerived && coverageReady >= minExecutionCoverage;
    if (allowDerived && !allowExecution) {
      reasons.push(`核心資料僅 ${coverageReady}/${coverageTotal || 6}`);
    }

    const status = allowExecution ? "eligible" : allowDerived ? "research-only" : "blocked";
    const label = status === "eligible" ? "可執行研究" : status === "research-only" ? "僅研究，不可執行" : "資料鎖定";
    const tone = status === "eligible" ? "good" : status === "research-only" ? "warn" : "bad";
    const reason = reasons.join("；") || "報價、日線與核心資料均可核對";
    return {
      status,
      label,
      tone,
      reason,
      allowDerived,
      allowExecution,
      coverageReady,
      coverageTotal,
      minExecutionCoverage,
      quoteReady,
      technicalReady,
      sourceConflict: conflict
    };
  }

  function buildCoverageScopes(input = {}) {
    const runtime = input.runtime === "web" ? "web" : "extension";
    const researchTotal = Math.max(0, finiteNumber(input.researchTotal) ?? 0);
    const webTarget = Math.max(0, finiteNumber(input.webTarget) ?? 0);
    const webFresh = Math.max(0, finiteNumber(input.webFresh) ?? 0);
    const holdingsTotal = Math.max(0, finiteNumber(input.holdingsTotal) ?? 0);
    const holdingsFresh = Math.max(0, finiteNumber(input.holdingsFresh) ?? 0);
    const decisionReady = Math.max(0, finiteNumber(input.decisionReady) ?? 0);
    const scopes = [
      {
        key: "research",
        label: "研究宇宙",
        value: `${researchTotal}`,
        detail: "可搜尋與分類，不等於今日都有新鮮行情",
        tone: "flat"
      }
    ];
    if (runtime === "web") {
      scopes.push({
        key: "web-fresh",
        label: "Web 今日快照",
        value: `${webFresh}/${webTarget}`,
        detail: "公開中性清單；以四個盤後核心 domain 的最低 freshCount 計",
        tone: webTarget > 0 && webFresh >= webTarget ? "up" : webFresh > 0 ? "warn" : "down"
      });
    } else {
      scopes.push({
        key: "holdings-fresh",
        label: "個人持股新鮮",
        value: `${holdingsFresh}/${holdingsTotal}`,
        detail: "只計目前持股／觀察清單，不用全研究宇宙當分母",
        tone: holdingsTotal > 0 && holdingsFresh >= holdingsTotal ? "up" : holdingsFresh > 0 ? "warn" : "down"
      });
    }
    scopes.push({
      key: "decision-ready",
      label: "決策可用",
      value: `${decisionReady}/${runtime === "web" ? webTarget : holdingsTotal}`,
      detail: "報價與日線新鮮、無來源衝突且核心覆蓋達門檻",
      tone: decisionReady > 0 ? "up" : "down"
    });
    return scopes;
  }

  function normalizeSnapshotRows(rows) {
    const output = {};
    for (const raw of Array.isArray(rows) ? rows : []) {
      const code = text(raw?.code).toUpperCase();
      if (!code) continue;
      output[code] = {
        code,
        name: text(raw?.name) || code,
        eligibility: text(raw?.eligibility) || "blocked",
        eligibilityLabel: text(raw?.eligibilityLabel),
        executionStatus: text(raw?.executionStatus),
        technicalState: text(raw?.technicalState),
        confidence: text(raw?.confidence).toLowerCase() || "very-low",
        asOf: text(raw?.asOf)
      };
    }
    return output;
  }

  function changeItem(row, type, before, after, severity, message) {
    return {
      code: row.code,
      name: row.name,
      type,
      before,
      after,
      severity,
      message
    };
  }

  function diffDecisionSnapshots(previousRows, currentRows, options = {}) {
    const previous = normalizeSnapshotRows(previousRows);
    const current = normalizeSnapshotRows(currentRows);
    const hasBaseline = Object.keys(previous).length > 0;
    const items = [];
    if (hasBaseline) {
      for (const row of Object.values(current)) {
        const old = previous[row.code];
        if (!old) continue;
        if (old.eligibility !== row.eligibility) {
          const lost = row.eligibility === "blocked" || (old.eligibility === "eligible" && row.eligibility !== "eligible");
          items.push(changeItem(
            row,
            "eligibility",
            old.eligibilityLabel || old.eligibility,
            row.eligibilityLabel || row.eligibility,
            lost ? 10 : 9,
            `${row.code} ${row.name}：決策資格由「${old.eligibilityLabel || old.eligibility}」變為「${row.eligibilityLabel || row.eligibility}」`
          ));
        }
        if (old.executionStatus && row.executionStatus && old.executionStatus !== row.executionStatus) {
          items.push(changeItem(row, "execution", old.executionStatus, row.executionStatus, 8, `${row.code} ${row.name}：執行狀態 ${old.executionStatus} → ${row.executionStatus}`));
        }
        if (old.technicalState && row.technicalState && old.technicalState !== row.technicalState) {
          items.push(changeItem(row, "technical", old.technicalState, row.technicalState, 6, `${row.code} ${row.name}：技術狀態 ${old.technicalState} → ${row.technicalState}`));
        }
        const oldConfidence = CONFIDENCE_RANK[old.confidence] ?? 0;
        const newConfidence = CONFIDENCE_RANK[row.confidence] ?? 0;
        if (newConfidence < oldConfidence) {
          items.push(changeItem(row, "confidence", old.confidence, row.confidence, 9, `${row.code} ${row.name}：資料信心 ${old.confidence} → ${row.confidence}`));
        }
      }
    }
    const limit = Math.max(1, finiteNumber(options.limit) ?? 12);
    items.sort((left, right) => right.severity - left.severity || left.code.localeCompare(right.code));
    const visible = items.slice(0, limit);
    return {
      version: VERSION,
      generatedAt: text(options.generatedAt) || new Date().toISOString(),
      baselineEstablished: !hasBaseline,
      totalChanges: items.length,
      materialChangeCount: items.filter((item) => item.severity >= 8).length,
      items: visible,
      summary: !hasBaseline
        ? `已建立 ${Object.keys(current).length} 檔基準；下次同步只列變更`
        : items.length
          ? `本次有 ${items.length} 項決策變更，其中 ${items.filter((item) => item.severity >= 8).length} 項需優先檢查`
          : "本次沒有影響決策的狀態變更",
      baseline: Object.values(current)
    };
  }

  const api = Object.freeze({
    version: VERSION,
    buildEligibility,
    buildCoverageScopes,
    normalizeSnapshotRows,
    diffDecisionSnapshots
  });

  root.TwStockDecisionSafety = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
