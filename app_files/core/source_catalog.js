(function initTwStockSourceCatalog(global) {
  "use strict";

  const VERSION = "source-catalog-v1";
  const SCHEMA_VERSION = 1;
  const REQUIRED_PROVENANCE_FIELDS = Object.freeze([
    "source",
    "sourceTier",
    "asOf",
    "fetchedAt",
    "fallbackUsed",
    "confidence"
  ]);

  const catalog = [
    {
      id: "quotes",
      label: "個股報價",
      decisionUse: "現價、漲跌、成交量、五檔與漲跌停價",
      cadence: "盤中按需；盤後 15:00 核對一次",
      ttlMinutes: 5,
      canonical: [
        { label: "TWSE MIS", tier: 1, url: "https://mis.twse.com.tw/stock/index.jsp" },
        { label: "TWSE STOCK_DAY_ALL", tier: 1, url: "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL" },
        { label: "TPEx mainboard quotes", tier: 1, url: "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes" }
      ],
      fallback: [
        { label: "Yahoo Finance chart", tier: 2, url: "https://tw.stock.yahoo.com/" }
      ],
      extensionCapability: "direct-fetch",
      webCapability: "same-origin-snapshot",
      missingPolicy: "無官方／fallback 報價時顯示缺資料，不沿用成今日價格。"
    },
    {
      id: "daily-bars",
      label: "日線 OHLCV",
      decisionUse: "MA、RSI、MACD、KD、布林、ATR、量價、大量 K 與支撐壓力",
      cadence: "每交易日收盤後",
      ttlMinutes: 1440,
      canonical: [
        { label: "TWSE STOCK_DAY", tier: 1, url: "https://www.twse.com.tw/zh/trading/historical/stock-day.html" },
        { label: "TPEx 個股日成交資訊", tier: 1, url: "https://www.tpex.org.tw/zh-tw/mainboard/trading/info/stock-pricing.html" }
      ],
      fallback: [
        { label: "Yahoo Finance history", tier: 2, url: "https://finance.yahoo.com/" }
      ],
      extensionCapability: "direct-fetch",
      webCapability: "bundled-or-sanitized-close-snapshot",
      missingPolicy: "日線不足時所有技術訊號回傳 missing，不建立新部位判斷。"
    },
    {
      id: "valuation-market-cap",
      label: "估值與市值",
      decisionUse: "PE、PBR、殖利率、市值級距與估值風險",
      cadence: "每交易日收盤後",
      ttlMinutes: 1440,
      canonical: [
        { label: "TWSE BWIBBU_d", tier: 1, url: "https://www.twse.com.tw/zh/trading/historical/bwibbu-day.html" },
        { label: "TPEx 本益比／殖利率／股價淨值比", tier: 1, url: "https://www.tpex.org.tw/zh-tw/mainboard/trading/info/pera.html" },
        { label: "TWSE MI_QFIIS 發行股數", tier: 1, url: "https://www.twse.com.tw/zh/trading/foreign/MI_QFIIS.html" }
      ],
      fallback: [],
      extensionCapability: "direct-fetch",
      webCapability: "sanitized-close-snapshot",
      missingPolicy: "缺官方估值時不以研究預估靜默取代；研究 PE／EPS 必須另標 Tier 3。"
    },
    {
      id: "fundamentals",
      label: "月營收與財報",
      decisionUse: "營收 MoM／YoY、累計 YoY、EPS、毛利率、營益率與淨利率",
      cadence: "月營收公告期每日檢查；季報依申報期",
      ttlMinutes: 360,
      canonical: [
        { label: "MOPS 上市月營收", tier: 1, url: "https://mopsfin.twse.com.tw/opendata/t187ap05_L.csv" },
        { label: "MOPS 上櫃月營收", tier: 1, url: "https://mopsfin.twse.com.tw/opendata/t187ap05_O.csv" },
        { label: "MOPS 財務報表", tier: 1, url: "https://mops.twse.com.tw/mops/web/t163sb04" }
      ],
      fallback: [
        { label: "Yahoo／Goodinfo／財報狗人工核對", tier: 2, url: "https://mops.twse.com.tw/mops/web/index" }
      ],
      extensionCapability: "direct-fetch-and-import",
      webCapability: "bundled-or-sanitized-periodic-snapshot",
      missingPolicy: "缺月營收或季報時顯示待補；不可把缺值解讀為衰退或低風險。"
    },
    {
      id: "institutional",
      label: "三大法人",
      decisionUse: "外資、投信、自營商當日與多週期買賣超",
      cadence: "每交易日收盤後",
      ttlMinutes: 1440,
      canonical: [
        { label: "TWSE T86", tier: 1, url: "https://www.twse.com.tw/zh/trading/foreign/t86.html" },
        { label: "TPEx 三大法人日報", tier: 1, url: "https://www.tpex.org.tw/zh-tw/mainboard/trading/major-institutional/summary.html" }
      ],
      fallback: [],
      extensionCapability: "direct-fetch",
      webCapability: "sanitized-close-snapshot",
      missingPolicy: "缺法人資料時 Chip Score 降 confidence，不把 0 當成法人未買賣。"
    },
    {
      id: "margin-short",
      label: "融資融券",
      decisionUse: "融資增減、使用率、融券增減、券資比與槓桿擁擠",
      cadence: "每交易日收盤後",
      ttlMinutes: 1440,
      canonical: [
        { label: "TWSE MI_MARGN", tier: 1, url: "https://www.twse.com.tw/zh/trading/margin/MI_MARGN.html" },
        { label: "TPEx 融資融券餘額", tier: 1, url: "https://www.tpex.org.tw/zh-tw/mainboard/trading/margin-trading/margin-balance.html" }
      ],
      fallback: [],
      extensionCapability: "direct-fetch",
      webCapability: "sanitized-close-snapshot",
      missingPolicy: "缺融資券時散戶情緒標資料不足，不把缺值視為籌碼乾淨。"
    },
    {
      id: "foreign-ownership",
      label: "外資持股",
      decisionUse: "外資持股比率、累積／出清趨勢與發行股數",
      cadence: "每交易日收盤後",
      ttlMinutes: 1440,
      canonical: [
        { label: "TWSE MI_QFIIS", tier: 1, url: "https://www.twse.com.tw/zh/trading/foreign/MI_QFIIS.html" },
        { label: "TPEx 外資持股 OpenAPI", tier: 1, url: "https://www.tpex.org.tw/openapi/v1/tpex_3insti_qfii" }
      ],
      fallback: [],
      extensionCapability: "direct-fetch",
      webCapability: "sanitized-close-snapshot",
      missingPolicy: "歷史不足時只顯示最新值，不推論累積或出清。"
    },
    {
      id: "tdcc",
      label: "TDCC 集保持股",
      decisionUse: "大戶持股 proxy、持股級距與週趨勢",
      cadence: "每週資料更新後",
      ttlMinutes: 10080,
      canonical: [
        { label: "TDCC 股權分散表", tier: 1, url: "https://www.tdcc.com.tw/portal/zh/smWeb/qryStock" }
      ],
      fallback: [],
      extensionCapability: "direct-fetch",
      webCapability: "sanitized-weekly-snapshot",
      missingPolicy: "缺少至少兩期資料時不可寫成大戶增持／減持。"
    },
    {
      id: "derivatives",
      label: "期貨與選擇權",
      decisionUse: "台指期、外資未平倉、Put/Call、夜盤與整體風險",
      cadence: "盤中按需；收盤後與夜盤分開標時間",
      ttlMinutes: 60,
      canonical: [
        { label: "TAIFEX", tier: 1, url: "https://www.taifex.com.tw/" },
        { label: "TAIFEX 行情資訊", tier: 1, url: "https://mis.taifex.com.tw/futures/" }
      ],
      fallback: [
        { label: "CMoney／WantGoo 人工交叉核對", tier: 2, url: "https://www.cmoney.tw/forum/futures/TXF1?s=p" }
      ],
      extensionCapability: "direct-fetch",
      webCapability: "same-origin-delayed-market-snapshot",
      missingPolicy: "日盤、夜盤、全市場 OI 與外資淨 OI 必須分欄，不可混寫。"
    },
    {
      id: "corporate-actions",
      label: "除權息與處置",
      decisionUse: "除權息交易日、處置／注意風險與交易限制",
      cadence: "每日收盤後；事件期提高檢查頻率",
      ttlMinutes: 360,
      canonical: [
        { label: "TWSE TWT48U／處置資訊", tier: 1, url: "https://www.twse.com.tw/zh/trading/exchange/TWT48U.html" },
        { label: "TPEx 除權息／處置資訊", tier: 1, url: "https://www.tpex.org.tw/openapi/" }
      ],
      fallback: [
        { label: "Yahoo／鉅亨／WantGoo 日曆核對", tier: 2, url: "https://tw.stock.yahoo.com/" }
      ],
      extensionCapability: "direct-fetch",
      webCapability: "bundled-or-sanitized-event-snapshot",
      missingPolicy: "官方事件資料優先；第三方日期衝突時標待複核。"
    },
    {
      id: "market-macro",
      label: "大盤與總經",
      decisionUse: "TAIEX、美股、VIX、殖利率曲線、Fed／CBC 與市場槓桿",
      cadence: "市場時段按需；收盤後摘要",
      ttlMinutes: 60,
      canonical: [
        { label: "TWSE", tier: 1, url: "https://www.twse.com.tw/" },
        { label: "Cboe", tier: 1, url: "https://www.cboe.com/" },
        { label: "U.S. Treasury", tier: 1, url: "https://home.treasury.gov/" },
        { label: "Federal Reserve", tier: 1, url: "https://www.federalreserve.gov/" },
        { label: "中央銀行", tier: 1, url: "https://www.cbc.gov.tw/" }
      ],
      fallback: [
        { label: "Yahoo／CME／MacroMicro 交叉核對", tier: 2, url: "https://finance.yahoo.com/" }
      ],
      extensionCapability: "direct-fetch",
      webCapability: "same-origin-delayed-market-snapshot",
      missingPolicy: "資料跨時區時分別顯示 asOf；過期值不可當成即時風險分數。"
    },
    {
      id: "industry-research",
      label: "產業與主題研究",
      decisionUse: "供應鏈位置、產品純度、需求驗證與研究優先序",
      cadence: "法說／月營收／產業事件後人工複核",
      ttlMinutes: 10080,
      canonical: [
        { label: "公司官網／法說／年報／MOPS", tier: 1, url: "https://mops.twse.com.tw/mops/web/index" },
        { label: "TWSE／TPEx 產業價值鏈", tier: 1, url: "https://ic.tpex.org.tw/" }
      ],
      fallback: [
        { label: "TrendForce／MoneyDJ／Goodinfo", tier: 2, url: "https://www.trendforce.com/" },
        { label: "使用者研究／Podcast／媒體敘事", tier: 3, url: "https://news.cnyes.com/" }
      ],
      extensionCapability: "links-and-imported-research",
      webCapability: "same-research-metadata",
      missingPolicy: "Tier 3 只能建立複核 queue，不直接改交易雷達分數。"
    },
    {
      id: "news-podcast",
      label: "新聞與 Podcast",
      decisionUse: "事件發現、管理層敘事與產業線索",
      cadence: "使用時更新；不佔收盤核心同步",
      ttlMinutes: 15,
      canonical: [
        { label: "公司重大訊息／法說／MOPS", tier: 1, url: "https://mops.twse.com.tw/mops/web/index" }
      ],
      fallback: [
        { label: "鉅亨／Yahoo／MoneyDJ 新聞", tier: 3, url: "https://news.cnyes.com/news/cat/tw_stock" },
        { label: "SoundOn／Firstory RSS", tier: 3, url: "https://feeds.soundon.fm/" }
      ],
      extensionCapability: "on-demand-fetch",
      webCapability: "bundled-metadata-and-safe-links",
      missingPolicy: "新聞與節目內容只作線索；必須回查公告、財報或第二獨立來源。"
    }
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function validate(rows = catalog) {
    const errors = [];
    const ids = new Set();
    for (const row of rows) {
      if (!row || typeof row !== "object") {
        errors.push("catalog row must be an object");
        continue;
      }
      if (!row.id) errors.push("catalog row missing id");
      if (ids.has(row.id)) errors.push(`duplicate id: ${row.id}`);
      ids.add(row.id);
      if (!row.label) errors.push(`${row.id || "unknown"} missing label`);
      if (!Array.isArray(row.canonical) || !row.canonical.length) errors.push(`${row.id || "unknown"} missing canonical source`);
      if (!row.extensionCapability || !row.webCapability) errors.push(`${row.id || "unknown"} missing runtime capability`);
      if (!Number.isFinite(Number(row.ttlMinutes)) || Number(row.ttlMinutes) <= 0) errors.push(`${row.id || "unknown"} invalid ttlMinutes`);
      for (const source of [...(row.canonical || []), ...(row.fallback || [])]) {
        if (![1, 2, 3].includes(Number(source.tier))) errors.push(`${row.id || "unknown"} invalid tier`);
        try {
          const parsed = new URL(source.url);
          if (parsed.protocol !== "https:") errors.push(`${row.id || "unknown"} source must use HTTPS`);
        } catch (_) {
          errors.push(`${row.id || "unknown"} invalid source URL`);
        }
      }
    }
    return { ok: errors.length === 0, errors, count: rows.length };
  }

  function get(id) {
    const row = catalog.find((item) => item.id === id);
    return row ? clone(row) : null;
  }

  function list() {
    return clone(catalog);
  }

  function summary() {
    return {
      domains: catalog.length,
      tier1Sources: catalog.reduce((sum, row) => sum + row.canonical.filter((source) => source.tier === 1).length, 0),
      fallbackSources: catalog.reduce((sum, row) => sum + row.fallback.length, 0),
      requiredProvenanceFields: [...REQUIRED_PROVENANCE_FIELDS]
    };
  }

  const api = Object.freeze({
    version: VERSION,
    schemaVersion: SCHEMA_VERSION,
    requiredProvenanceFields: REQUIRED_PROVENANCE_FIELDS,
    validate,
    get,
    list,
    summary
  });

  global.TwStockSourceCatalog = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
