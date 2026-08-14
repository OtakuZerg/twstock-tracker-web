(function initTwStockChipDataNormalizers(root) {
  "use strict";

  const VERSION = "chip-data-normalizers-v1";

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

  function sourcePayload(sourceKey, input, label) {
    const sourceAdapters = adapters();
    sourceAdapters.definition(sourceKey);
    if (typeof input === "string") return sourceAdapters.parseJson(input, { label });
    if (input === null || input === undefined || typeof input !== "object") {
      throw sourceError(`${label} payload 格式錯誤`, "SOURCE_SCHEMA_DRIFT");
    }
    return input;
  }

  function sourceRows(sourceKey, input, options = {}) {
    const payload = sourcePayload(sourceKey, input, options.label || sourceKey);
    const rows = adapters().validateRows(payload, {
      paths: options.paths || [],
      minRows: options.minRows || 1,
      label: options.label || sourceKey
    });
    return { payload, rows };
  }

  function toNumber(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).replace(/,/g, "").replace(/%/g, "").trim();
    if (!text || text === "-" || text.toLowerCase() === "null") return null;
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  }

  function numberOrZero(value) {
    return toNumber(value) ?? 0;
  }

  function sharesToLots(value) {
    const shares = toNumber(value);
    return shares === null ? 0 : shares / 1000;
  }

  function usagePercent(balance, limit, explicit = null) {
    const explicitNumber = toNumber(explicit);
    if (explicitNumber !== null) return explicitNumber;
    const balanceNumber = toNumber(balance);
    const limitNumber = toNumber(limit);
    if (balanceNumber === null || !limitNumber) return null;
    return balanceNumber / limitNumber * 100;
  }

  function compactSlashDate(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 8) return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6, 8)}`;
    return String(value || "");
  }

  function rocSlashDate(value) {
    const digits = String(value || "").replace(/\//g, "").trim();
    if (/^\d{8}$/.test(digits) && Number(digits.slice(0, 4)) >= 1900) {
      return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6, 8)}`;
    }
    if (digits.length < 7) return String(value || "");
    const year = Number.parseInt(digits.slice(0, digits.length - 4), 10) + 1911;
    if (!Number.isFinite(year)) return String(value || "");
    return `${year}/${digits.slice(-4, -2)}/${digits.slice(-2)}`;
  }

  function objectValue(row, keys) {
    for (const key of keys) {
      if (row && Object.prototype.hasOwnProperty.call(row, key) && row[key] !== undefined && row[key] !== null && row[key] !== "") {
        return row[key];
      }
    }
    return null;
  }

  function normalizeFieldKey(key) {
    return String(key || "").toLowerCase().replace(/[\s_\-()／/]/g, "");
  }

  function objectValueByKeyParts(row, includes, excludes = []) {
    if (!row) return null;
    const includeParts = includes.map(normalizeFieldKey);
    const excludeParts = excludes.map(normalizeFieldKey);
    const key = Object.keys(row).find((candidate) => {
      const normalized = normalizeFieldKey(candidate);
      return includeParts.every((part) => normalized.includes(part))
        && excludeParts.every((part) => !normalized.includes(part));
    });
    return key ? row[key] : null;
  }

  function cleanCode(value) {
    return String(value || "").replace(/\s/g, "").trim();
  }

  function validTaiwanCode(value) {
    return /^\d{4,6}[A-Z]?$/.test(cleanCode(value));
  }

  function ensureProviderStatus(payload, label) {
    if (payload?.stat && payload.stat !== "OK") {
      throw sourceError(`${label} 回傳狀態 ${payload.stat}`, "SOURCE_PROVIDER_STATUS", "no-data");
    }
  }

  function ensureNormalizedRows(rows, label) {
    if (!rows.length) throw sourceError(`${label} 欄位結構已變更`, "SOURCE_SCHEMA_DRIFT");
    return rows;
  }

  function normalizeTwseInstitutionalRow(row, date, includeIdentity = true) {
    if (!Array.isArray(row) || !validTaiwanCode(row[0])) return null;
    const foreignNet = sharesToLots(row[4]);
    const trustNet = sharesToLots(row[10] ?? row[7]);
    const dealerNet = sharesToLots(row[11] ?? row[8]);
    const totalRaw = toNumber(row[18] ?? row[9]);
    const normalized = {
      date,
      foreignNet,
      trustNet,
      dealerNet,
      totalNet: totalRaw === null ? foreignNet + trustNet + dealerNet : totalRaw / 1000
    };
    if (includeIdentity) {
      return {
        code: cleanCode(row[0]),
        name: String(row[1] || "").trim(),
        market: "TW",
        ...normalized,
        source: "TWSE T86"
      };
    }
    return normalized;
  }

  function parseAllInstitutionalTwse(input) {
    const { payload, rows } = sourceRows("twse", input, { paths: ["data"], label: "TWSE T86" });
    ensureProviderStatus(payload, "TWSE T86");
    const date = compactSlashDate(payload.date || "");
    return ensureNormalizedRows(rows.map((row) => normalizeTwseInstitutionalRow(row, date, true)).filter(Boolean), "TWSE T86");
  }

  function parseInstitutionalTwse(input, code) {
    const { payload, rows } = sourceRows("twse", input, { paths: ["data"], label: "TWSE T86" });
    ensureProviderStatus(payload, "TWSE T86");
    const row = rows.find((candidate) => cleanCode(candidate?.[0]) === String(code));
    if (!row) return null;
    const date = compactSlashDate(payload.date || "");
    const normalized = normalizeTwseInstitutionalRow(row, date, false);
    if (!normalized) throw sourceError("TWSE T86 個股欄位結構已變更", "SOURCE_SCHEMA_DRIFT");
    return { ...normalized, source: `TWSE T86 (${date || "最新"})` };
  }

  function tpexInstitutionalValues(row) {
    const foreignRaw = objectValue(row, [
      "ForeignInvestorsIncludeMainlandAreaInvestors-Difference",
      "ForeignInvestorsInclude MainlandAreaInvestors-Difference",
      "ForeignInvestorsandMainlandChineseInvestors-Difference"
    ]) ?? objectValueByKeyParts(row, ["foreigninvestors", "difference"]);
    const trustRaw = objectValue(row, ["SecuritiesInvestmentTrustCompanies-Difference"])
      ?? objectValueByKeyParts(row, ["securitiesinvestmenttrustcompanies", "difference"]);
    const dealerRaw = objectValue(row, ["Dealers-Difference"])
      ?? objectValueByKeyParts(row, ["dealers", "difference"], ["foreign"]);
    const totalRaw = objectValue(row, ["TotalDifference"]) ?? objectValueByKeyParts(row, ["totaldifference"]);
    const foreignNet = sharesToLots(foreignRaw);
    const trustNet = sharesToLots(trustRaw);
    const dealerNet = sharesToLots(dealerRaw);
    const totalNumber = toNumber(totalRaw);
    return {
      foreignNet,
      trustNet,
      dealerNet,
      totalNet: totalNumber === null ? foreignNet + trustNet + dealerNet : totalNumber / 1000
    };
  }

  function normalizeTpexInstitutionalOpenApiRow(row, includeIdentity = true) {
    const code = cleanCode(objectValue(row, ["SecuritiesCompanyCode", "Code", "代號", "股票代號"]));
    if (!validTaiwanCode(code)) return null;
    const normalized = {
      date: rocSlashDate(row.Date || row["資料日期"] || ""),
      ...tpexInstitutionalValues(row)
    };
    if (!includeIdentity) return normalized;
    return {
      code,
      name: String(objectValue(row, ["CompanyName", "Name", "公司名稱", "證券名稱", "名稱"]) || "").trim(),
      market: "TWO",
      ...normalized,
      source: "TPEx OpenAPI 三大法人"
    };
  }

  function normalizeTpexInstitutionalTableRow(row, date, includeIdentity = true) {
    if (!Array.isArray(row) || row.length < 13 || !validTaiwanCode(row[0])) return null;
    const foreignNet = sharesToLots(row[10] ?? row[4]);
    const trustNet = sharesToLots(row[13] ?? row[10] ?? row[7]);
    const dealerNet = sharesToLots(row[22] ?? row[11]);
    const totalRaw = toNumber(row[23] ?? row[12]);
    const normalized = {
      date,
      foreignNet,
      trustNet,
      dealerNet,
      totalNet: totalRaw === null ? foreignNet + trustNet + dealerNet : totalRaw / 1000
    };
    if (!includeIdentity) return normalized;
    return {
      code: cleanCode(row[0]),
      name: String(row[1] || "").trim(),
      market: "TWO",
      ...normalized,
      source: "TPEx 三大法人日報"
    };
  }

  function parseAllInstitutionalTpex(input) {
    const payload = sourcePayload("tpex", input, "TPEx 三大法人");
    if (Array.isArray(payload)) {
      const rows = adapters().validateRows(payload, { label: "TPEx OpenAPI 三大法人" });
      return ensureNormalizedRows(rows.map((row) => normalizeTpexInstitutionalOpenApiRow(row, true)).filter(Boolean), "TPEx OpenAPI 三大法人");
    }
    const rows = adapters().validateRows(payload, {
      paths: ["tables.0.data", "data", "aaData"],
      label: "TPEx 三大法人日報"
    });
    const date = rocSlashDate(payload?.tables?.[0]?.date || payload?.date || "");
    return ensureNormalizedRows(rows.map((row) => normalizeTpexInstitutionalTableRow(row, date, true)).filter(Boolean), "TPEx 三大法人日報");
  }

  function parseInstitutionalTpexOpenApi(input, code) {
    const payload = sourcePayload("tpex", input, "TPEx OpenAPI 三大法人");
    const rows = adapters().validateRows(payload, { label: "TPEx OpenAPI 三大法人" });
    const row = rows.find((candidate) => cleanCode(objectValue(candidate, ["SecuritiesCompanyCode", "Code", "代號", "股票代號"])) === String(code));
    if (!row) return null;
    const normalized = normalizeTpexInstitutionalOpenApiRow(row, false);
    if (!normalized) throw sourceError("TPEx OpenAPI 三大法人欄位結構已變更", "SOURCE_SCHEMA_DRIFT");
    return { ...normalized, source: "TPEx OpenAPI 三大法人" };
  }

  function parseInstitutionalTpex(input, code) {
    const payload = sourcePayload("tpex", input, "TPEx 三大法人");
    if (Array.isArray(payload)) return parseInstitutionalTpexOpenApi(payload, code);
    const rows = adapters().validateRows(payload, {
      paths: ["tables.0.data", "data", "aaData"],
      label: "TPEx 三大法人日報"
    });
    const row = rows.find((candidate) => cleanCode(candidate?.[0]) === String(code));
    if (!row) return null;
    const date = rocSlashDate(payload?.tables?.[0]?.date || payload?.date || "");
    const normalized = normalizeTpexInstitutionalTableRow(row, date, false);
    if (!normalized) throw sourceError("TPEx 三大法人日報欄位結構已變更", "SOURCE_SCHEMA_DRIFT");
    return { ...normalized, source: `TPEx 三大法人日報 (${date || "最新"})` };
  }

  function ensureFields(row, fields, label) {
    const missing = fields.filter((field) => row?.[field] === undefined);
    if (missing.length) throw sourceError(`${label} 缺少欄位：${missing.join(", ")}`, "SOURCE_SCHEMA_DRIFT");
  }

  function parseMarginTwse(input, code) {
    const payload = sourcePayload("twse", input, "TWSE MI_MARGN");
    if (Array.isArray(payload)) {
      const rows = adapters().validateRows(payload, { label: "TWSE OpenAPI MI_MARGN" });
      const row = rows.find((candidate) => cleanCode(candidate?.["股票代號"] || candidate?.Code) === String(code));
      if (!row) return null;
      ensureFields(row, ["融資今日餘額", "融券今日餘額"], "TWSE OpenAPI MI_MARGN");
      const marginBalance = numberOrZero(row["融資今日餘額"]);
      const marginLimit = toNumber(row["融資限額"]);
      const shortBalance = numberOrZero(row["融券今日餘額"]);
      const shortLimit = toNumber(row["融券限額"]);
      return {
        date: row["資料日期"] || row.Date || "",
        marginBuy: numberOrZero(row["融資買進"]),
        marginSell: numberOrZero(row["融資賣出"]),
        marginBalance,
        marginLimit,
        marginUsagePct: usagePercent(marginBalance, marginLimit),
        shortSell: numberOrZero(row["融券賣出"]),
        shortBuy: numberOrZero(row["融券買進"]),
        shortBalance,
        shortLimit,
        shortUsagePct: usagePercent(shortBalance, shortLimit),
        source: "TWSE OpenAPI MI_MARGN"
      };
    }
    ensureProviderStatus(payload, "TWSE MI_MARGN");
    const rows = adapters().validateRows(payload, { paths: ["data"], label: "TWSE MI_MARGN" });
    const row = rows.find((candidate) => cleanCode(candidate?.[0]) === String(code));
    if (!row) return null;
    if (!Array.isArray(row) || row.length < 13) throw sourceError("TWSE MI_MARGN 欄位結構已變更", "SOURCE_SCHEMA_DRIFT");
    const marginBalance = numberOrZero(row[6] ?? row[5]);
    const marginLimit = toNumber(row[7] ?? row[6]);
    const shortBalance = numberOrZero(row[12] ?? row[11]);
    const shortLimit = toNumber(row[13] ?? row[12]);
    const date = compactSlashDate(payload.date || "");
    return {
      date,
      marginBuy: numberOrZero(row[2]),
      marginSell: numberOrZero(row[3]),
      marginBalance,
      marginLimit,
      marginUsagePct: usagePercent(marginBalance, marginLimit),
      shortSell: numberOrZero(row[9] ?? row[8]),
      shortBuy: numberOrZero(row[8] ?? row[9]),
      shortBalance,
      shortLimit,
      shortUsagePct: usagePercent(shortBalance, shortLimit),
      source: `TWSE MI_MARGN (${date || "最新"})`
    };
  }

  function parseMarginTpexOpenApi(input, code) {
    const payload = sourcePayload("tpex", input, "TPEx OpenAPI 融資融券");
    const rows = adapters().validateRows(payload, { label: "TPEx OpenAPI 融資融券" });
    const row = rows.find((candidate) => cleanCode(candidate?.SecuritiesCompanyCode || candidate?.Code || candidate?.["代號"]) === String(code));
    if (!row) return null;
    ensureFields(row, ["MarginPurchaseBalance", "ShortSaleBalance"], "TPEx OpenAPI 融資融券");
    const marginBalance = numberOrZero(row.MarginPurchaseBalance);
    const marginLimit = toNumber(row.MarginPurchaseQuota);
    const shortBalance = numberOrZero(row.ShortSaleBalance);
    const shortLimit = toNumber(row.ShortSaleQuota);
    return {
      date: rocSlashDate(row.Date || row["資料日期"] || ""),
      marginBuy: numberOrZero(row.MarginPurchase),
      marginSell: numberOrZero(row.MarginSales),
      marginBalance,
      marginLimit,
      marginUsagePct: usagePercent(marginBalance, marginLimit, row.MarginPurchaseUtilizationRate),
      shortSell: numberOrZero(row.ShortSale),
      shortBuy: numberOrZero(row.ShortConvering ?? row.ShortCovering),
      shortBalance,
      shortLimit,
      shortUsagePct: usagePercent(shortBalance, shortLimit, row.ShortSaleUtilizationRate),
      source: "TPEx OpenAPI 融資融券"
    };
  }

  function parseMarginTpex(input, code) {
    const payload = sourcePayload("tpex", input, "TPEx 融資融券");
    if (Array.isArray(payload)) return parseMarginTpexOpenApi(payload, code);
    const rows = adapters().validateRows(payload, {
      paths: ["tables.0.data", "data", "aaData"],
      label: "TPEx 融資融券"
    });
    const row = rows.find((candidate) => cleanCode(candidate?.[0]) === String(code));
    if (!row) return null;
    if (!Array.isArray(row) || row.length < 18) throw sourceError("TPEx 融資融券欄位結構已變更", "SOURCE_SCHEMA_DRIFT");
    const marginBalance = numberOrZero(row[6] ?? row[4]);
    const marginLimit = toNumber(row[9]);
    const shortBalance = numberOrZero(row[14] ?? row[10]);
    const shortLimit = toNumber(row[17]);
    const date = rocSlashDate(payload?.tables?.[0]?.date || payload?.date || "");
    return {
      date,
      marginBuy: numberOrZero(row[3] ?? row[2]),
      marginSell: numberOrZero(row[4] ?? row[3]),
      marginBalance,
      marginLimit,
      marginUsagePct: usagePercent(marginBalance, marginLimit, row[8]),
      shortSell: numberOrZero(row[11] ?? row[8]),
      shortBuy: numberOrZero(row[12] ?? row[9]),
      shortBalance,
      shortLimit,
      shortUsagePct: usagePercent(shortBalance, shortLimit, row[16]),
      source: `TPEx 融資融券 (${date || "最新"})`
    };
  }

  function decodeHtml(value) {
    return String(value || "")
      .replace(/&nbsp;|&#160;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)));
  }

  function htmlText(value) {
    return decodeHtml(String(value || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
  }

  function tdccTableRows(html) {
    if (typeof root.DOMParser !== "undefined") {
      const document = new root.DOMParser().parseFromString(String(html), "text/html");
      return [...document.querySelectorAll("table tr")].map((row) => [...row.querySelectorAll("th,td")].map((cell) => cell.textContent.trim()));
    }
    return [...String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) => (
      [...rowMatch[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cellMatch) => htmlText(cellMatch[1]))
    ));
  }

  function parseTdccHtml(html, code = "") {
    adapters().definition("tdcc");
    const text = String(html || "");
    if (text.length < 100) throw sourceError("TDCC 回傳 0 筆或內容過短", "SOURCE_ZERO_ROWS", "no-data");
    const tableRows = tdccTableRows(text).filter((row) => row.length).slice(1);
    const rows = adapters().validateRows(tableRows, { label: `TDCC ${code || "集保"}` });
    const tiers = [];
    let totalShares = 0;
    let whaleShares = 0;
    for (const cells of rows) {
      if (cells.length < 6) continue;
      const rangeLabel = cells[1] || cells[0];
      const holders = numberOrZero(cells[2]);
      const shares = numberOrZero(cells[4]);
      const pct = numberOrZero(cells[5]);
      tiers.push({ range: rangeLabel, holders, shares, pct });
      totalShares += shares;
      if (rangeLabel && /400|1000|2000|4000|1萬|10萬/i.test(rangeLabel.replace(/,/g, ""))) whaleShares += shares;
    }
    if (!tiers.length) throw sourceError("TDCC 持股分級欄位結構已變更", "SOURCE_SCHEMA_DRIFT");
    return {
      tiers,
      totalShares,
      whalePercent: totalShares > 0 ? whaleShares / totalShares * 100 : null,
      source: "TDCC 集保持股分布"
    };
  }

  function parseCsvLine(line) {
    const cells = [];
    let cell = "";
    let quoted = false;
    const text = String(line || "");
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"') {
        if (quoted && text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === "," && !quoted) {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += char;
      }
    }
    cells.push(cell.trim());
    return cells.map((value) => value.replace(/^\uFEFF/, "").replace(/^"|"$/g, ""));
  }

  function stripHtml(value) {
    return htmlText(value);
  }

  function taifexPositionColumnIndexes(headerParts) {
    const header = Array.isArray(headerParts) ? headerParts.map((cell) => stripHtml(cell).replace(/\s+/g, "")) : [];
    const findIndex = (...needles) => header.findIndex((cell) => needles.every((needle) => cell.includes(needle)));
    const columns = {
      date: findIndex("日期"),
      productName: findIndex("商品名稱"),
      identity: findIndex("身份別"),
      longTrade: findIndex("多方", "交易", "口數"),
      shortTrade: findIndex("空方", "交易", "口數"),
      netTrade: findIndex("多空", "交易", "淨額"),
      longOI: findIndex("多方", "未平倉", "口數"),
      shortOI: findIndex("空方", "未平倉", "口數"),
      netOI: findIndex("多空", "未平倉", "淨額")
    };
    const required = ["date", "productName", "identity", "longOI", "shortOI", "netOI"];
    return required.every((key) => columns[key] >= 0) ? columns : null;
  }

  function taifexPositionCell(parts, columns, key, fallbackIndex) {
    const index = columns && columns[key] >= 0 ? columns[key] : fallbackIndex;
    return parts[index];
  }

  function normalizeTaifexPositionRow(parts, index, columns = null) {
    if (!Array.isArray(parts) || parts.length < 14) return null;
    const identity = String(taifexPositionCell(parts, columns, "identity", 2) || "").trim();
    const role = identity.includes("外資") ? "foreign"
      : identity.includes("投信") ? "trust"
        : identity.includes("自營") ? "dealer"
          : index === 2 ? "foreign"
            : index === 1 ? "trust"
              : index === 0 ? "dealer"
                : "";
    if (!role) return null;
    const longTrade = numberOrZero(taifexPositionCell(parts, columns, "longTrade", 3));
    const shortTrade = numberOrZero(taifexPositionCell(parts, columns, "shortTrade", 5));
    const netTrade = toNumber(taifexPositionCell(parts, columns, "netTrade", 7));
    const longOI = numberOrZero(taifexPositionCell(parts, columns, "longOI", 9));
    const shortOI = numberOrZero(taifexPositionCell(parts, columns, "shortOI", 11));
    const netOI = toNumber(taifexPositionCell(parts, columns, "netOI", 13));
    return {
      role,
      identity,
      date: String(taifexPositionCell(parts, columns, "date", 0) || "").trim(),
      productName: String(taifexPositionCell(parts, columns, "productName", 1) || "").trim(),
      long: longOI,
      short: shortOI,
      net: netOI !== null ? netOI : longOI - shortOI,
      longTrade,
      shortTrade,
      netTrade: netTrade !== null ? netTrade : longTrade - shortTrade
    };
  }

  function parseTaifexCsv(csv, product = null) {
    adapters().definition("taifex");
    const text = String(csv || "");
    if (text.length < 50) throw sourceError("TAIFEX CSV 回傳 0 筆或內容過短", "SOURCE_ZERO_ROWS", "no-data");
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const result = {
      rows: [],
      source: "TAIFEX 三大法人期貨未平倉",
      commodityId: product?.commodityId || "",
      productLabel: product?.label || ""
    };
    let rowIndex = 0;
    let columns = null;
    for (const line of lines) {
      const parts = parseCsvLine(line);
      const joined = parts.join("");
      if (/日期|身份別|商品名稱/.test(joined)) {
        columns = taifexPositionColumnIndexes(parts);
        if (!columns) throw sourceError("TAIFEX 期貨 CSV 表頭無法定位未平倉欄位", "SOURCE_SCHEMA_DRIFT");
        continue;
      }
      if (parts.length < 14) continue;
      const row = normalizeTaifexPositionRow(parts, rowIndex, columns);
      rowIndex += 1;
      if (!row) continue;
      result.rows.push(row);
      result[row.role] = {
        long: row.long,
        short: row.short,
        net: row.net,
        longTrade: row.longTrade,
        shortTrade: row.shortTrade,
        netTrade: row.netTrade,
        identity: row.identity
      };
      result.sourceDate = row.date || result.sourceDate || "";
      result.productName = row.productName || result.productName || product?.label || "";
    }
    adapters().validateRows(result.rows, { label: "TAIFEX 三大法人期貨未平倉" });
    return result;
  }

  function parseCompactDay(value) {
    const match = String(value || "").match(/^(\d{4})(\d{2})(\d{2})$/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
  }

  function normalizeTaifexQuoteRow(row, product, marketType = "0") {
    adapters().definition("taifex");
    if (!row || typeof row !== "object") return null;
    const symbolId = String(row.SymbolID || "");
    const expectedSuffix = marketType === "1" ? "-M" : "-F";
    if (!symbolId.includes(expectedSuffix)) return null;
    return {
      symbolId,
      name: String(row.DispCName || product?.label || "").trim(),
      last: toNumber(row.CLastPrice),
      change: toNumber(row.CDiff),
      pct: toNumber(row.CDiffRate),
      open: toNumber(row.COpenPrice),
      high: toNumber(row.CHighPrice),
      low: toNumber(row.CLowPrice),
      ref: toNumber(row.CRefPrice),
      volume: numberOrZero(row.CTotalVolume),
      openInterest: toNumber(row.OpenInterest),
      bid: toNumber(row.CBestBidPrice || row.CBidPrice1),
      ask: toNumber(row.CBestAskPrice || row.CAskPrice1),
      sourceDate: parseCompactDay(row.CDate),
      sourceTime: String(row.CTime || "").replace(/^(\d{2})(\d{2})(\d{2})$/, "$1:$2:$3"),
      session: marketType === "1" ? "盤後交易" : "一般交易",
      source: marketType === "1" ? "TAIFEX 盤後交易即時行情 API" : "TAIFEX 即時行情 API"
    };
  }

  const api = Object.freeze({
    version: VERSION,
    parseAllInstitutionalTwse,
    parseAllInstitutionalTpex,
    parseInstitutionalTwse,
    parseInstitutionalTpex,
    parseInstitutionalTpexOpenApi,
    parseMarginTwse,
    parseMarginTpex,
    parseMarginTpexOpenApi,
    parseTdccHtml,
    taifexPositionColumnIndexes,
    normalizeTaifexPositionRow,
    parseTaifexCsv,
    normalizeTaifexQuoteRow
  });

  root.TwStockChipDataNormalizers = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
