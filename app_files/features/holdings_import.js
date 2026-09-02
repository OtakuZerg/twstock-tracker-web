(function initTwStockHoldingsImport(root) {
  "use strict";

  const VERSION = "holdings-import-v1";
  const SYMBOL_RE = /(^|[\s,;|])([0-9]{4,6}[A-Z]?)\s*\.\s*(TW|TWO)(?=$|[\s,;|])/i;
  const BARE_ROW_RE = /^([0-9]{4,6}[A-Z]?)\s+([^\d].+)$/i;
  const BARE_ROW_REVERSED = /^([^\d].*?)\s+([0-9]{4,6}[A-Z]?)$/i;
  const MARKET_FLAGS = new Set(["配", "權", "配權", "權配"]);

  function cleanText(value) {
    return String(value ?? "").replace(/\u3000/g, " ").trim();
  }

  function cleanName(value) {
    return cleanText(value)
      .replace(/^[,;|\s]+|[,;|\s]+$/g, "")
      .replace(/\s{2,}/g, " ");
  }

  function isMarketFlag(value) {
    return MARKET_FLAGS.has(cleanText(value).replace(/\s+/g, ""));
  }

  function looksNumeric(value) {
    const text = cleanText(value).replace(/,/g, "");
    return /^[-+]?\d+(?:\.\d+)?%?$/.test(text) || text === "-";
  }

  function resolveName(code, suffix, candidate, options = {}) {
    const inline = cleanName(candidate);
    if (inline && !isMarketFlag(inline) && !looksNumeric(inline)) return inline;
    if (typeof options.resolveName === "function") {
      const resolved = cleanName(options.resolveName(code, suffix));
      if (resolved) return resolved;
    }
    const mapName = cleanName(options.knownNames?.[code]);
    return mapName || `自訂股 ${code}`;
  }

  function normalizeHolding(entry, options = {}) {
    if (!entry || typeof entry !== "object") return null;
    const code = cleanText(entry.code).toUpperCase();
    const suffix = cleanText(entry.suffix || "TW").toUpperCase();
    if (!/^[0-9]{4,6}[A-Z]?$/.test(code) || !["TW", "TWO"].includes(suffix)) return null;
    return {
      code,
      suffix,
      name: resolveName(code, suffix, entry.name, options)
    };
  }

  function previousNameCandidate(lines, index) {
    for (let cursor = index - 1; cursor >= Math.max(0, index - 3); cursor -= 1) {
      const candidate = cleanText(lines[cursor]);
      if (!candidate || isMarketFlag(candidate)) continue;
      if (SYMBOL_RE.test(candidate)) break;
      if (!looksNumeric(candidate)) return candidate;
    }
    return "";
  }

  function parseLine(line, lines, index, options = {}) {
    const symbolMatch = line.match(SYMBOL_RE);
    if (symbolMatch) {
      const code = symbolMatch[2].toUpperCase();
      const suffix = symbolMatch[3].toUpperCase();
      const symbolStart = (symbolMatch.index || 0) + symbolMatch[1].length;
      const prefix = line.slice(0, symbolStart);
      const suffixText = line.slice(symbolStart + symbolMatch[0].length - symbolMatch[1].length);
      const inlineName = [prefix, suffixText]
        .map(cleanName)
        .find((candidate) => candidate && !looksNumeric(candidate) && !isMarketFlag(candidate)) || "";
      return normalizeHolding({
        code,
        suffix,
        name: inlineName || previousNameCandidate(lines, index)
      }, options);
    }

    if (options.allowBareRows === false) return null;
    const bare = line.match(BARE_ROW_RE);
    if (bare) return normalizeHolding({ code: bare[1], suffix: options.defaultSuffix || "TW", name: bare[2] }, options);
    const reversed = line.match(BARE_ROW_REVERSED);
    if (reversed) return normalizeHolding({ code: reversed[2], suffix: options.defaultSuffix || "TW", name: reversed[1] }, options);
    return null;
  }

  function parseHoldingsText(value, options = {}) {
    const raw = String(value ?? "").replace(/\r\n?/g, "\n");
    const lines = raw.split("\n").map(cleanText).filter(Boolean);
    const holdings = [];
    const duplicateCodes = [];
    const consumedIndexes = new Set();
    const seen = new Set();

    for (let index = 0; index < lines.length; index += 1) {
      const holding = parseLine(lines[index], lines, index, options);
      if (!holding) continue;
      consumedIndexes.add(index);
      if (index > 0 && cleanText(lines[index - 1]) === holding.name) consumedIndexes.add(index - 1);
      if (seen.has(holding.code)) {
        duplicateCodes.push(holding.code);
        continue;
      }
      seen.add(holding.code);
      holdings.push(holding);
    }

    const ignoredLines = lines.filter((line, index) => !consumedIndexes.has(index) && !isMarketFlag(line));
    const quoteLikeLineCount = ignoredLines.filter(looksNumeric).length;
    const warnings = [];
    if (!holdings.length) warnings.push("找不到 .TW / .TWO 股號或可辨識的「股號 名稱」列。");
    if (duplicateCodes.length) warnings.push(`已忽略重複股號：${[...new Set(duplicateCodes)].join("、")}。`);
    if (ignoredLines.length) warnings.push(`已忽略 ${ignoredLines.length} 行非持股欄位；報價與漲跌數字不會匯入。`);

    return {
      version: VERSION,
      holdings,
      count: holdings.length,
      duplicateCodes: [...new Set(duplicateCodes)],
      ignoredLineCount: ignoredLines.length,
      quoteLikeLineCount,
      ignoredLines,
      warnings
    };
  }

  function diffHoldings(currentRows, nextRows, options = {}) {
    const normalizeRows = (rows) => {
      const seen = new Set();
      return (Array.isArray(rows) ? rows : []).map((row) => normalizeHolding(row, options)).filter((row) => {
        if (!row || seen.has(row.code)) return false;
        seen.add(row.code);
        return true;
      });
    };
    const current = normalizeRows(currentRows);
    const next = normalizeRows(nextRows);
    const currentMap = new Map(current.map((row) => [row.code, row]));
    const nextMap = new Map(next.map((row) => [row.code, row]));
    const added = next.filter((row) => !currentMap.has(row.code));
    const removed = current.filter((row) => !nextMap.has(row.code));
    const renamed = next.filter((row) => currentMap.has(row.code) && currentMap.get(row.code).name !== row.name)
      .map((row) => ({ before: currentMap.get(row.code), after: row }));
    const marketChanged = next.filter((row) => currentMap.has(row.code) && currentMap.get(row.code).suffix !== row.suffix)
      .map((row) => ({ before: currentMap.get(row.code), after: row }));
    const unchanged = next.filter((row) => {
      const before = currentMap.get(row.code);
      return before && before.name === row.name && before.suffix === row.suffix;
    });
    return {
      currentCount: current.length,
      nextCount: next.length,
      added,
      removed,
      renamed,
      marketChanged,
      unchanged,
      hasChanges: Boolean(added.length || removed.length || renamed.length || marketChanged.length || current.length !== next.length)
    };
  }

  function signature(rows) {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => normalizeHolding(row))
      .filter(Boolean)
      .map((row) => `${row.code}.${row.suffix}:${row.name}`)
      .join("|");
  }

  function selectExactMigration(currentRows, currentPresetVersion, migrations) {
    const currentSignature = signature(currentRows);
    const currentPreset = cleanText(currentPresetVersion);
    for (const migration of Array.isArray(migrations) ? migrations : []) {
      const from = migration?.from || {};
      const to = migration?.to || {};
      const acceptedVersions = Array.isArray(from.presetVersions) ? from.presetVersions.map(cleanText) : [];
      if (!acceptedVersions.includes(currentPreset)) continue;
      if (signature(from.holdings) !== currentSignature) continue;
      const holdings = (Array.isArray(to.holdings) ? to.holdings : []).map((row) => normalizeHolding(row)).filter(Boolean);
      if (!holdings.length || !cleanText(to.presetVersion)) continue;
      return {
        id: cleanText(migration.id) || "private-holdings-migration",
        fromCount: Array.isArray(from.holdings) ? from.holdings.length : 0,
        toCount: holdings.length,
        presetVersion: cleanText(to.presetVersion),
        holdings
      };
    }
    return null;
  }

  const api = Object.freeze({
    version: VERSION,
    parseHoldingsText,
    diffHoldings,
    normalizeHolding,
    signature,
    selectExactMigration
  });

  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TwStockHoldingsImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
