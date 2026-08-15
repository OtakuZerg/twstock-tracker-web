(function initTwStockTraderWorkspaceSelectors(root) {
  "use strict";

  const VERSION = "trader-workspace-selectors-v1";

  function text(value) {
    return String(value ?? "").trim();
  }

  function normalizeStock(value) {
    if (!value || typeof value !== "object") return null;
    const code = text(value.code);
    if (!code) return null;
    return { ...value, code, name: text(value.name) || code };
  }

  function stockFromMap(stockMap, code) {
    const key = text(code);
    if (!key || !stockMap) return null;
    if (typeof stockMap.get === "function") return normalizeStock(stockMap.get(key));
    return normalizeStock(stockMap[key]);
  }

  function finiteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function valueFromMap(recordMap, code) {
    const key = text(code);
    if (!key || !recordMap) return null;
    return typeof recordMap.get === "function" ? recordMap.get(key) || null : recordMap[key] || null;
  }

  function selectCurrentStock(input = {}) {
    const selected = stockFromMap(input.stockMap, input.selectedCode);
    if (selected) return selected;
    return normalizeStock(Array.isArray(input.watchlist) ? input.watchlist[0] : null);
  }

  function holdingCodeSet(holdings) {
    return new Set((Array.isArray(holdings) ? holdings : [])
      .map((entry) => text(entry?.code))
      .filter(Boolean));
  }

  function selectStockOptions(input = {}) {
    const currentStock = normalizeStock(input.currentStock);
    if (!currentStock) return [];
    const holdingCodes = holdingCodeSet(input.holdings);
    const rows = [currentStock, ...(Array.isArray(input.watchlist) ? input.watchlist : [])];
    const seen = new Set();
    return rows.map(normalizeStock).filter((stock) => {
      if (!stock || seen.has(stock.code)) return false;
      if (stock.code !== currentStock.code && !holdingCodes.has(stock.code)) return false;
      seen.add(stock.code);
      return true;
    }).map((stock) => ({
      code: stock.code,
      name: stock.name,
      selected: stock.code === currentStock.code
    }));
  }

  function selectHoldingRows(input = {}) {
    const selectedCode = text(input.selectedCode);
    const seen = new Set();
    return (Array.isArray(input.holdings) ? input.holdings : []).map((entry) => {
      const holding = normalizeStock(entry);
      if (!holding || seen.has(holding.code)) return null;
      seen.add(holding.code);
      const stock = stockFromMap(input.stockMap, holding.code) || holding;
      const quote = valueFromMap(input.quotes, holding.code);
      const price = finiteNumber(quote?.price);
      const pct = finiteNumber(quote?.pct);
      return {
        code: stock.code,
        name: stock.name,
        suffix: text(holding.suffix || stock.suffix) || "TW",
        selected: stock.code === selectedCode,
        quoteAvailable: price !== null,
        price,
        pct
      };
    }).filter(Boolean);
  }

  function summarizeHoldingRows(rows) {
    const holdings = Array.isArray(rows) ? rows : [];
    const etfCount = holdings.filter((row) => text(row?.code).startsWith("00")).length;
    return {
      total: holdings.length,
      etfCount,
      stockCount: Math.max(0, holdings.length - etfCount),
      quotedCount: holdings.filter((row) => row?.quoteAvailable === true).length
    };
  }

  function selectTraderDeskStore(input = {}) {
    const state = input.state && typeof input.state === "object" ? input.state : {};
    const stock = selectCurrentStock({
      selectedCode: input.selectedCode ?? state.selectedCode,
      stockMap: input.stockMap,
      watchlist: input.watchlist
    });
    const code = stock?.code || "";
    const holdingRows = selectHoldingRows({
      holdings: state.holdings,
      stockMap: input.stockMap,
      quotes: input.quotes || state.quotes,
      selectedCode: code
    });
    return {
      stock,
      institutional: code ? state.institutional?.[code] || null : null,
      margin: code ? state.margin?.[code] || null : null,
      holdingRows,
      holdingSummary: summarizeHoldingRows(holdingRows),
      stockOptions: stock ? selectStockOptions({
        currentStock: stock,
        watchlist: input.watchlist,
        holdings: state.holdings
      }) : []
    };
  }

  function coverageInput(input = {}) {
    return {
      quote: {
        hasPrice: input.quoteHasPrice === true,
        freshnessLevel: text(input.quoteFreshnessLevel) || "missing",
        freshnessLabel: text(input.quoteFreshnessLabel)
      },
      technical: {
        ready: input.technicalReady === true,
        ageDays: input.technicalAgeDays ?? null
      },
      institutional: {
        available: input.institutionalAvailable === true,
        ageDays: input.institutionalAgeDays ?? null
      },
      margin: {
        available: input.marginAvailable === true,
        ageDays: input.marginAgeDays ?? null
      },
      revenueAvailable: input.revenueAvailable === true,
      valuation: {
        available: input.valuationAvailable === true,
        ageDays: input.valuationAgeDays ?? null
      }
    };
  }

  const api = Object.freeze({
    version: VERSION,
    selectCurrentStock,
    holdingCodeSet,
    selectStockOptions,
    selectHoldingRows,
    summarizeHoldingRows,
    selectTraderDeskStore,
    coverageInput
  });

  root.TwStockTraderWorkspaceSelectors = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
