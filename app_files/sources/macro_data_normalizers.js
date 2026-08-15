(function initTwStockMacroDataNormalizers(root) {
  "use strict";

  const VERSION = "macro-data-normalizers-v1";

  function adapters() {
    const value = root.TwStockSourceAdapters;
    if (!value?.parseJson || !value?.validateRows || !value?.definition) {
      const error = new Error("TwStockSourceAdapters 尚未載入");
      error.code = "SOURCE_ADAPTER_MISSING";
      throw error;
    }
    return value;
  }

  function sourceError(message, code, category = "schema") {
    const error = new Error(message);
    error.code = code;
    error.category = category;
    error.retryable = false;
    return error;
  }

  function toNumber(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).replace(/,/g, "").replace(/%/g, "").trim();
    if (!text || text === "-" || /^null$/i.test(text) || /^n\/?a$/i.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function stripHtml(value) {
    return String(value || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function macroNumberCell(value) {
    return toNumber(String(value || "").replace(/,/g, ""));
  }

  function slashDateFromCompact(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 8) return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6, 8)}`;
    if (digits.length === 7) return `${Number(digits.slice(0, 3)) + 1911}/${digits.slice(3, 5)}/${digits.slice(5, 7)}`;
    return "";
  }

  function parseSlashDate(value) {
    const match = String(value || "").trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    return match ? `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}` : "";
  }

  function sourcePayload(input, label) {
    const sourceAdapters = adapters();
    sourceAdapters.definition("macro");
    if (typeof input === "string") return sourceAdapters.parseJson(input, { label });
    if (!input || typeof input !== "object") throw sourceError(`${label} payload 格式錯誤`, "SOURCE_SCHEMA_DRIFT");
    return input;
  }

  function twseIndexRowToMacroItem(row, label, sourceDate) {
    if (!row) return null;
    const value = macroNumberCell(row[1]);
    if (value === null) return null;
    const pct = macroNumberCell(row[4]);
    const point = macroNumberCell(row[3]);
    const signText = stripHtml(row[2] || "");
    const signedPoint = signText.includes("-") && point !== null ? -Math.abs(point) : point;
    return {
      key: `twse-${label}`,
      label,
      value,
      valueSuffix: "",
      change: signedPoint,
      pct,
      date: slashDateFromCompact(sourceDate || ""),
      source: "TWSE MI_INDEX",
      sourceTier: "官方",
      url: "https://www.twse.com.tw/zh/trading/historical/mi-index.html",
      note: "臺灣證券交易所每日收盤指數"
    };
  }

  function parseTwseMacroItems(input) {
    const payload = sourcePayload(input, "TWSE MI_INDEX");
    const rows = payload?.tables?.flatMap((table) => Array.isArray(table?.data) ? table.data : []) || [];
    if (!rows.length) throw sourceError("TWSE MI_INDEX 回傳 0 筆", "SOURCE_ZERO_ROWS", "no-data");
    const findRow = (label) => rows.find((row) => String(row?.[0] || "").includes(label));
    const items = [
      twseIndexRowToMacroItem(findRow("發行量加權股價指數"), "加權指數", payload.date),
      twseIndexRowToMacroItem(findRow("電子工業類指數"), "電子指數", payload.date),
      twseIndexRowToMacroItem(findRow("半導體類指數"), "半導體指數", payload.date)
    ].filter(Boolean);
    if (!items.length) throw sourceError("TWSE MI_INDEX 指數欄位結構已變更", "SOURCE_SCHEMA_DRIFT");
    return items;
  }

  function parseVixCsv(text) {
    const rows = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter((line) => /^\d{2}\/\d{2}\/\d{4},/.test(line));
    if (!rows.length) throw sourceError("Cboe VIX CSV 回傳 0 筆", "SOURCE_ZERO_ROWS", "no-data");
    const latest = rows.at(-1);
    const previous = rows.at(-2);
    const latestCells = latest.split(",");
    const previousCells = previous ? previous.split(",") : [];
    const close = macroNumberCell(latestCells[4]);
    if (close === null) throw sourceError("Cboe VIX CSV 缺少收盤欄位", "SOURCE_SCHEMA_DRIFT");
    const prevClose = macroNumberCell(previousCells[4]);
    const change = close !== null && prevClose !== null ? close - prevClose : null;
    const pct = change !== null && prevClose ? change / prevClose * 100 : null;
    return {
      key: "vix",
      label: "VIX",
      value: close,
      valueSuffix: "",
      change,
      pct,
      date: latestCells[0] || "",
      source: "Cboe VIX History CSV",
      sourceTier: "官方",
      url: "https://www.cboe.com/tradable-products/vix/",
      note: "美股波動率，>20 通常代表風險情緒升溫",
      series: rows.slice(-120).map((line) => {
        const cells = line.split(",");
        return { date: cells[0] || "", value: macroNumberCell(cells[4]) };
      }).filter((point) => point.value !== null)
    };
  }

  function xmlTagValue(block, tag) {
    const match = String(block || "").match(new RegExp(`<d:${tag}[^>]*>([^<]*)<\\/d:${tag}>`));
    return match ? match[1] : "";
  }

  function parseTreasuryYieldCurveXml(text) {
    const entries = [...String(text || "").matchAll(/<m:properties>([\s\S]*?)<\/m:properties>/g)].map((match) => match[1]);
    if (!entries.length) throw sourceError("Treasury yield XML 回傳 0 筆", "SOURCE_ZERO_ROWS", "no-data");
    const rows = entries.map((block) => ({
      date: xmlTagValue(block, "NEW_DATE").slice(0, 10),
      twoYear: macroNumberCell(xmlTagValue(block, "BC_2YEAR")),
      twentyYear: macroNumberCell(xmlTagValue(block, "BC_20YEAR")),
      tenYear: macroNumberCell(xmlTagValue(block, "BC_10YEAR")),
      thirtyYear: macroNumberCell(xmlTagValue(block, "BC_30YEAR"))
    })).filter((row) => row.date && row.tenYear !== null).sort((left, right) => left.date.localeCompare(right.date));
    if (!rows.length) throw sourceError("Treasury yield XML 欄位結構已變更", "SOURCE_SCHEMA_DRIFT");
    return rows;
  }

  function treasuryMacroItemsFromRows(rows) {
    const validRows = Array.isArray(rows) ? rows.filter((row) => row?.date && toNumber(row?.tenYear) !== null) : [];
    if (!validRows.length) throw sourceError("Treasury yield rows 回傳 0 筆", "SOURCE_ZERO_ROWS", "no-data");
    const latest = validRows.at(-1);
    const curveSpread = latest.tenYear !== null && latest.twoYear !== null ? latest.tenYear - latest.twoYear : null;
    const tenYearSeries = validRows.slice(-120).map((row) => ({ date: row.date, value: row.tenYear })).filter((point) => point.value !== null);
    const thirtyYearSeries = validRows.slice(-120).map((row) => ({ date: row.date, value: row.thirtyYear })).filter((point) => point.value !== null);
    const spreadSeries = validRows.slice(-120).map((row) => ({
      date: row.date,
      value: row.tenYear !== null && row.twoYear !== null ? row.tenYear - row.twoYear : null
    })).filter((point) => point.value !== null);
    const common = {
      change: null,
      pct: null,
      date: latest.date,
      source: "U.S. Treasury Yield Curve",
      sourceTier: "官方",
      url: "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve"
    };
    return [
      {
        key: "ust10y",
        label: "美債 10Y",
        value: latest.tenYear,
        valueSuffix: "%",
        ...common,
        note: "長天期利率，影響科技股估值與美債 ETF 久期",
        series: tenYearSeries
      },
      {
        key: "ust30y",
        label: "美債 30Y",
        value: latest.thirtyYear,
        valueSuffix: "%",
        ...common,
        note: "長天期美債 ETF 的核心利率代理；工具燈號以此搭配 USD/TWD 與 Fed 狀態判讀",
        series: thirtyYearSeries
      },
      {
        key: "ust2y10y",
        label: "10Y-2Y 利差",
        value: curveSpread,
        valueSuffix: "百分點",
        ...common,
        note: "殖利率曲線斜率；負值代表倒掛",
        series: spreadSeries
      }
    ];
  }

  function twseMarginRow(rows, keyword) {
    return (rows || []).find((row) => stripHtml(row?.[0] || "").includes(keyword)) || null;
  }

  function parseTwseMarketMarginSnapshot(input) {
    const payload = sourcePayload(input, "TWSE MI_MARGN");
    const rows = Array.isArray(payload?.data)
      ? payload.data
      : payload?.tables?.flatMap((table) => Array.isArray(table?.data) ? table.data : []) || [];
    if (!rows.length) throw sourceError("TWSE MI_MARGN 回傳 0 筆", "SOURCE_ZERO_ROWS", "no-data");
    const financeRow = twseMarginRow(rows, "融資(交易單位)");
    const shortRow = twseMarginRow(rows, "融券(交易單位)");
    const financeValueRow = twseMarginRow(rows, "融資金額");
    const financeBalance = macroNumberCell(financeRow?.[5]);
    const financePrevious = macroNumberCell(financeRow?.[4]);
    const shortBalance = macroNumberCell(shortRow?.[5]);
    const shortPrevious = macroNumberCell(shortRow?.[4]);
    const financeValueThousand = macroNumberCell(financeValueRow?.[5]);
    if (financeBalance === null && shortBalance === null && financeValueThousand === null) {
      throw sourceError("TWSE MI_MARGN 無法解析融資融券統計列", "SOURCE_SCHEMA_DRIFT");
    }
    return {
      source: "TWSE MI_MARGN",
      sourceTier: "官方",
      date: slashDateFromCompact(payload?.date || "") || stripHtml(payload?.title || "").match(/\d{3,4}\/\d{1,2}\/\d{1,2}/)?.[0] || "",
      url: "https://www.twse.com.tw/zh/trading/margin/MI_MARGN.html",
      financeBalance,
      financeChange: financeBalance !== null && financePrevious !== null ? financeBalance - financePrevious : null,
      shortBalance,
      shortChange: shortBalance !== null && shortPrevious !== null ? shortBalance - shortPrevious : null,
      financeValue100m: financeValueThousand !== null ? financeValueThousand / 100000 : null,
      note: "目前圖表先接 TWSE 上市信用交易統計；上櫃 TPEx 入口列在交叉核對卡，未併入前不當作完整全市場結論。"
    };
  }

  function parseCbcUsdTwdRows(html, options = {}) {
    const text = stripHtml(html).replace(/\u00a0/g, " ");
    const rows = [];
    const seen = new Set();
    const pattern = /(\d{4}\/\d{1,2}\/\d{1,2})\s+([23]\d(?:\.\d{2,4})?)/g;
    for (const match of text.matchAll(pattern)) {
      const date = parseSlashDate(match[1]);
      const value = toNumber(match[2]);
      if (!date || value === null || seen.has(date)) continue;
      seen.add(date);
      rows.push({ date, value });
    }
    const normalized = rows.sort((left, right) => right.date.localeCompare(left.date));
    if (options.strict && !normalized.length) throw sourceError("CBC USD/TWD 匯率頁回傳 0 筆", "SOURCE_ZERO_ROWS", "no-data");
    return normalized;
  }

  function xmlBlockValue(block, tag) {
    const match = String(block || "").match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
    if (!match) return "";
    const value = String(match[1] || "").replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "");
    return stripHtml(value);
  }

  function parseFedRssItems(text, options = {}) {
    let items = [];
    if (root.DOMParser) {
      try {
        const doc = new root.DOMParser().parseFromString(text, "application/xml");
        items = Array.from(doc.querySelectorAll("item")).map((item) => ({
          title: stripHtml(item.querySelector("title")?.textContent || ""),
          description: stripHtml(item.querySelector("description")?.textContent || ""),
          pubDate: item.querySelector("pubDate")?.textContent || "",
          link: item.querySelector("link")?.textContent || options.fallbackUrl || ""
        })).filter((item) => item.title || item.description);
      } catch (_) {
        items = [];
      }
    }
    if (!items.length) {
      items = [...String(text || "").matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((match) => ({
        title: xmlBlockValue(match[1], "title"),
        description: xmlBlockValue(match[1], "description"),
        pubDate: xmlBlockValue(match[1], "pubDate"),
        link: xmlBlockValue(match[1], "link") || options.fallbackUrl || ""
      })).filter((item) => item.title || item.description);
    }
    if (options.strict && !items.length) throw sourceError("Federal Reserve RSS 回傳 0 筆", "SOURCE_ZERO_ROWS", "no-data");
    return items;
  }

  function parseRateRangeMidpoint(value) {
    const raw = String(value || "").replace(/[–—−]/g, "-");
    const numbers = raw.match(/\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
    if (numbers.length >= 2) return (numbers[0] + numbers[1]) / 2;
    return numbers.length === 1 ? numbers[0] : null;
  }

  function parseFedSepTable1Rates(text, options = {}) {
    const normalized = String(text || "").replace(/\u00a0/g, " ").replace(/[–—−]/g, "-").replace(/\s+/g, " ");
    const match = normalized.match(/Federal funds rate\s+(.+?)\s+December projection/i);
    const tokens = match ? match[1].trim().split(/\s+/).filter(Boolean) : [];
    const labels = options.labels || ["2026", "2027", "2028", "Longer Run"];
    const medians = labels.map((year, index) => ({ year, rate: parseRateRangeMidpoint(tokens[index]) })).filter((row) => row.rate !== null);
    const centralTendency = labels.map((year, index) => ({ year, range: tokens[index + labels.length] || "" })).filter((row) => row.range);
    const range = labels.map((year, index) => ({ year, range: tokens[index + labels.length * 2] || "" })).filter((row) => row.range);
    if (options.strict && !medians.length) throw sourceError("Fed SEP Table 1 欄位結構已變更", "SOURCE_SCHEMA_DRIFT");
    return { medians, centralTendency, range };
  }

  function dateFromMixedFedValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const iso = raw.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
    const slash = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slash) return `${slash[3]}-${String(slash[1]).padStart(2, "0")}-${String(slash[2]).padStart(2, "0")}`;
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
  }

  function collectFedWatchDates(value, out = []) {
    if (!value) return out;
    if (typeof value === "string" || typeof value === "number") {
      const date = dateFromMixedFedValue(value);
      if (date) out.push(date);
      return out;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectFedWatchDates(item, out));
      return out;
    }
    if (typeof value === "object") {
      ["meetingDate", "fomcMeetingDate", "date", "meeting", "eventDate"].forEach((key) => {
        if (value[key]) collectFedWatchDates(value[key], out);
      });
      ["meetingDates", "dates", "data", "meetings"].forEach((key) => {
        if (value[key]) collectFedWatchDates(value[key], out);
      });
    }
    return out;
  }

  function fedWatchProbabilityValue(row) {
    for (const key of ["probability", "prob", "pct", "percentage", "value", "probabilityPct", "rateProbability"]) {
      const value = toNumber(row?.[key]);
      if (value !== null) return value <= 1 ? value * 100 : value;
    }
    return null;
  }

  function fedWatchRangeLabel(row) {
    for (const key of ["targetRate", "targetRange", "rateRange", "range", "rate", "label", "federalFundsRate", "fedFundsRate"]) {
      const value = String(row?.[key] || "").trim();
      if (value) return value;
    }
    const lower = toNumber(row?.lowerBound ?? row?.lower ?? row?.min);
    const upper = toNumber(row?.upperBound ?? row?.upper ?? row?.max);
    return lower !== null && upper !== null ? `${lower.toFixed(2)}-${upper.toFixed(2)}` : "";
  }

  function collectFedWatchProbabilityRows(value, out = []) {
    if (!value) return out;
    if (Array.isArray(value)) {
      value.forEach((item) => collectFedWatchProbabilityRows(item, out));
      return out;
    }
    if (typeof value !== "object") return out;
    const probability = fedWatchProbabilityValue(value);
    const range = fedWatchRangeLabel(value);
    const midpoint = parseRateRangeMidpoint(range);
    if (probability !== null && range && midpoint !== null) {
      out.push({ range, midpoint, probability: Math.max(0, Math.min(100, probability)) });
    }
    Object.values(value).forEach((child) => {
      if (child && (Array.isArray(child) || typeof child === "object")) collectFedWatchProbabilityRows(child, out);
    });
    return out;
  }

  function parseCmeFedWatchMeetingPayload(input, meetingDate = "", options = {}) {
    const payload = typeof input === "string" ? sourcePayload(input, "CME FedWatch") : input;
    if (!payload || typeof payload !== "object") throw sourceError("CME FedWatch payload 格式錯誤", "SOURCE_SCHEMA_DRIFT");
    const deduped = collectFedWatchProbabilityRows(payload).reduce((map, row) => {
      const key = `${row.range}|${row.midpoint}`;
      const existing = map.get(key);
      if (!existing || row.probability > existing.probability) map.set(key, row);
      return map;
    }, new Map());
    const probabilities = Array.from(deduped.values()).sort((left, right) => left.midpoint - right.midpoint);
    if (options.strict && !probabilities.length) throw sourceError("CME FedWatch 機率欄位結構已變更", "SOURCE_SCHEMA_DRIFT");
    const totalProb = probabilities.reduce((sum, row) => sum + row.probability, 0);
    const expectedRate = totalProb > 0
      ? probabilities.reduce((sum, row) => sum + row.midpoint * row.probability, 0) / totalProb
      : null;
    const dominant = probabilities.reduce((best, row) => (!best || row.probability > best.probability ? row : best), null);
    return {
      meetingDate,
      probabilities,
      expectedRate,
      dominant,
      totalProb,
      confidence: probabilities.length ? "medium" : "low"
    };
  }

  const api = Object.freeze({
    version: VERSION,
    twseIndexRowToMacroItem,
    parseTwseMacroItems,
    parseVixCsv,
    parseTreasuryYieldCurveXml,
    treasuryMacroItemsFromRows,
    parseTwseMarketMarginSnapshot,
    parseCbcUsdTwdRows,
    parseFedRssItems,
    parseRateRangeMidpoint,
    parseFedSepTable1Rates,
    collectFedWatchDates,
    parseCmeFedWatchMeetingPayload
  });

  root.TwStockMacroDataNormalizers = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
