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

  function selectTraderDeskStore(input = {}) {
    const state = input.state && typeof input.state === "object" ? input.state : {};
    const stock = selectCurrentStock({
      selectedCode: input.selectedCode ?? state.selectedCode,
      stockMap: input.stockMap,
      watchlist: input.watchlist
    });
    const code = stock?.code || "";
    return {
      stock,
      institutional: code ? state.institutional?.[code] || null : null,
      margin: code ? state.margin?.[code] || null : null,
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
    selectTraderDeskStore,
    coverageInput
  });

  root.TwStockTraderWorkspaceSelectors = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
