(function initTwStockTraderWorkspace(global) {
  "use strict";

  const VERSION = "trader-workspace-v1.3";
  const DEFAULT_MAX_AGE_DAYS = 10;
  const CORE_LABELS = Object.freeze({
    quote: "報價",
    technical: "日線",
    institutional: "法人",
    margin: "資券",
    revenue: "營收",
    valuation: "估值"
  });

  function finiteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function dailyReady(ageDays, maxAgeDays = DEFAULT_MAX_AGE_DAYS) {
    const age = finiteNumber(ageDays);
    const maxAge = finiteNumber(maxAgeDays) ?? DEFAULT_MAX_AGE_DAYS;
    return age !== null && age >= -1 && age <= maxAge;
  }

  function datedLabel(label, ageDays, maxAgeDays = DEFAULT_MAX_AGE_DAYS) {
    const age = finiteNumber(ageDays);
    return age !== null && age > maxAgeDays ? `${label}(${age}天前)` : label;
  }

  function buildCoverage(input = {}) {
    const quote = input.quote || {};
    const technical = input.technical || {};
    const institutional = input.institutional || {};
    const margin = input.margin || {};
    const valuation = input.valuation || {};
    const checks = [
      {
        key: "quote",
        label: quote.freshnessLevel === "stale" && quote.freshnessLabel
          ? `${CORE_LABELS.quote}(${quote.freshnessLabel})`
          : CORE_LABELS.quote,
        ready: quote.hasPrice === true && ["fresh", "fallback"].includes(quote.freshnessLevel)
      },
      {
        key: "technical",
        label: datedLabel(CORE_LABELS.technical, technical.ageDays),
        ready: technical.ready === true && dailyReady(technical.ageDays)
      },
      {
        key: "institutional",
        label: datedLabel(CORE_LABELS.institutional, institutional.ageDays),
        ready: institutional.available === true && dailyReady(institutional.ageDays)
      },
      {
        key: "margin",
        label: datedLabel(CORE_LABELS.margin, margin.ageDays),
        ready: margin.available === true && dailyReady(margin.ageDays)
      },
      {
        key: "revenue",
        label: CORE_LABELS.revenue,
        ready: input.revenueAvailable === true
      },
      {
        key: "valuation",
        label: datedLabel(CORE_LABELS.valuation, valuation.ageDays),
        ready: valuation.available === true && dailyReady(valuation.ageDays)
      }
    ];
    const ready = checks.filter((row) => row.ready).length;
    return {
      ready,
      total: checks.length,
      status: ready >= 5 ? "good" : ready >= 3 ? "warn" : "bad",
      missing: checks.filter((row) => !row.ready).map((row) => row.label),
      checks: checks.map((row) => ({ ...row }))
    };
  }

  function technicalTone(input = {}) {
    if (input.ready !== true) return "flat";
    const state = String(input.tradingState || "");
    if (["avoid", "riskTriggered", "failedRecovery"].includes(state)) return "down";
    if (["attackCandidate", "reEntryCandidate"].includes(state)) return "up";
    const trendLabel = String(input.trendLabel || "");
    if (trendLabel.includes("多")) return "up";
    if (trendLabel.includes("空")) return "down";
    const score = finiteNumber(input.score);
    return score !== null && score <= 0 ? "down" : "flat";
  }

  function rewardRiskTone(value) {
    const rr = finiteNumber(value);
    if (rr === null) return "flat";
    return rr >= 2 ? "up" : rr >= 1 ? "flat" : "down";
  }

  function calculateRiskReward(input = {}) {
    const currentPrice = finiteNumber(input.currentPrice);
    const plannedEntryRef = finiteNumber(input.plannedEntryRef);
    const stopPrice = finiteNumber(input.stopPrice);
    const targetPrice = finiteNumber(input.targetPrice);
    const buyRangeLow = finiteNumber(input.buyRangeLow);
    const entryValues = [input.entryLow, input.entryHigh]
      .map(finiteNumber)
      .filter((value) => value !== null);
    const entryLower = entryValues.length ? Math.min(...entryValues) : null;
    const entryUpper = entryValues.length ? Math.max(...entryValues) : null;
    const hasEntryRange = entryLower !== null && entryUpper !== null;
    const withinEntryRange = hasEntryRange && currentPrice !== null
      && currentPrice >= entryLower * 0.995
      && currentPrice <= entryUpper * 1.005;

    let entryRef = plannedEntryRef ?? currentPrice;
    if (withinEntryRange) {
      entryRef = currentPrice;
    } else if (input.technicalEntryPresent !== true && buyRangeLow !== null && currentPrice !== null && currentPrice < buyRangeLow) {
      entryRef = buyRangeLow;
    }

    const riskPct = stopPrice !== null && entryRef !== null && stopPrice < entryRef
      ? (entryRef - stopPrice) / entryRef * 100
      : null;
    const rewardPct = targetPrice !== null && entryRef !== null && targetPrice > entryRef
      ? (targetPrice - entryRef) / entryRef * 100
      : null;
    const rr = riskPct !== null && rewardPct !== null && riskPct > 0 ? rewardPct / riskPct : null;
    const riskPerShare = stopPrice !== null && entryRef !== null && entryRef > stopPrice
      ? entryRef - stopPrice
      : null;
    const buyStatusDistance = finiteNumber(input.buyStatusDistance);
    const inBuyZone = hasEntryRange && currentPrice !== null
      ? withinEntryRange
      : buyStatusDistance === 0;
    const entryDistancePct = hasEntryRange && currentPrice !== null
      ? currentPrice > entryUpper
        ? (currentPrice - entryUpper) / entryUpper * 100
        : currentPrice < entryLower
          ? (currentPrice - entryLower) / entryLower * 100
          : 0
      : null;
    const buyStatusLabel = String(input.buyStatusLabel || "");
    const aboveBuy = entryDistancePct !== null ? entryDistancePct > 0 : buyStatusLabel.startsWith("高於買點");
    const belowBuy = entryDistancePct !== null ? entryDistancePct < 0 : buyStatusLabel.startsWith("低於買點");

    return {
      entryRef,
      entryLower,
      entryUpper,
      hasEntryRange,
      riskPct,
      rewardPct,
      rr,
      riskPerShare,
      inBuyZone,
      entryDistancePct,
      aboveBuy,
      aboveBuyFar: aboveBuy && (entryDistancePct !== null ? entryDistancePct > 6 : (buyStatusDistance ?? 0) > 6),
      belowBuy
    };
  }

  function executionTone(status) {
    if (status === "可執行") return "up";
    if (["等回測", "等突破", "觀察"].includes(status)) return "flat";
    return "down";
  }

  function executionSortScore(status) {
    if (status === "可執行") return 6;
    if (status === "等回測") return 5;
    if (status === "等突破") return 4;
    if (status === "觀察") return 3;
    if (status === "風報比不足") return 2;
    if (status === "資料不足") return 1;
    return 0;
  }

  function buildExecutionDecision(input = {}) {
    const tradePlan = input.tradePlan || null;
    const radar = input.radar || null;
    const eligibility = input.eligibility || null;
    const rr = finiteNumber(tradePlan?.rr);
    const riskPerShare = finiteNumber(tradePlan?.riskPerShare);
    const targetPrice = finiteNumber(tradePlan?.targetPrice);
    const candidateThreshold = finiteNumber(input.candidateThreshold);
    const hasCore = Boolean(tradePlan)
      && finiteNumber(tradePlan?.entryRef) !== null
      && finiteNumber(tradePlan?.stopPrice) !== null
      && riskPerShare !== null
      && riskPerShare > 0;
    if (eligibility && eligibility.allowExecution !== true) {
      const blocked = eligibility.allowDerived !== true;
      return {
        status: blocked ? "資料不可採信" : "僅供研究",
        tone: "down",
        sortScore: 0,
        price: input.price ?? null,
        entry: "-",
        stopPrice: null,
        targetPrice: null,
        riskPerShare: null,
        rr: null,
        blocker: eligibility.reason || "決策資料未通過可信度閘門",
        conclusion: blocked
          ? "舊快取或不可核對資料已鎖定，不顯示衍生交易結論"
          : "核心資料覆蓋不足，只保留研究視角，不列為可執行"
      };
    }
    let status = "觀察";
    let blocker = tradePlan?.actionNote || radar?.notes?.[0] || "";

    if (input.technicalReady !== true) {
      status = "資料不足";
      blocker = "日線尚未更新，不能定義有效停損";
    } else if (!hasCore) {
      status = "資料不足";
      blocker = "入場、停損或每股風險不足";
    } else if (tradePlan.action === "先避開" || radar?.stage === "先避開") {
      status = "先避開";
      blocker = tradePlan.actionNote || "結構不在做多主場";
    } else if (targetPrice === null || rr === null) {
      status = "資料不足";
      blocker = "目標價或風報比尚未定義，不能列為可執行";
    } else if (rr !== null && rr < 1) {
      status = "風報比不足";
      blocker = `R:R ${rr.toFixed(2)}R 偏低`;
    } else if (tradePlan.aboveBuyFar) {
      status = "等回測";
      blocker = "離買點過遠，不追價";
    } else if (tradePlan.action === "等突破確認") {
      status = "等突破";
      blocker = "等突破關鍵均線或壓力後再執行";
    } else if (tradePlan.inBuyZone && rr >= 1.2
      && candidateThreshold !== null && (finiteNumber(radar?.score) ?? 0) >= candidateThreshold) {
      status = "可執行";
      blocker = "價格在可控入場帶，停損與風報比已定義";
    } else if (["攻擊觀察", "候選追蹤"].includes(radar?.stage) && rr >= 1.2) {
      status = "可執行";
      blocker = tradePlan.actionNote || "雷達與交易計畫同向";
    } else if (tradePlan.action === "等回檔，不追價") {
      status = "等回測";
      blocker = tradePlan.actionNote || "等回到入場帶";
    }

    const conclusion = status === "可執行"
      ? "可列入今日候選，但仍需盤中價格與量價確認"
      : status === "等回測"
        ? "只等價格回到入場帶，不在延伸段追價"
        : status === "等突破"
          ? "等突破確認後再重新評估"
          : status === "風報比不足"
            ? "目標與停損距離不划算，先不硬做"
            : status === "先避開"
              ? "結構或風險條件不合，先保留現金"
              : "資料或條件未齊，先放觀察清單";

    return {
      status,
      tone: executionTone(status),
      sortScore: executionSortScore(status),
      price: input.price ?? null,
      entry: tradePlan?.entryHint || tradePlan?.entryText || "-",
      stopPrice: finiteNumber(tradePlan?.stopPrice),
      targetPrice,
      riskPerShare,
      rr,
      blocker,
      conclusion
    };
  }

  function summarizeChipStrength(input = {}) {
    const positives = [];
    const risks = [];
    const inst5TotalNet = finiteNumber(input.inst5TotalNet);
    const inst20TotalNet = finiteNumber(input.inst20TotalNet);
    const tdccDeltaPp = finiteNumber(input.tdccDeltaPp);
    const marginUsage = finiteNumber(input.marginUsage);
    const marginDelta = finiteNumber(input.marginDelta);
    const pricePct = finiteNumber(input.pricePct);
    const volumeRatio20 = finiteNumber(input.volumeRatio20);
    const shortMarginRatio = finiteNumber(input.shortMarginRatio);

    if (input.chipLevel === "good") positives.push("Chip Score 偏多");
    if (input.bigMoneyLevel === "good") positives.push(input.bigMoneyLabel);
    if (inst5TotalNet !== null && inst5TotalNet > 0 && inst20TotalNet !== null && inst20TotalNet > 0) positives.push("法人短中期同步買超");
    if (input.foreignSignal === "accumulation") positives.push("外資持股累積");
    if (tdccDeltaPp !== null && tdccDeltaPp > 0) positives.push("TDCC 大戶比率增加");
    if (marginUsage !== null && marginUsage <= 20) positives.push("融資使用率偏低");
    if (marginDelta !== null && marginDelta < 0 && (pricePct === null || pricePct >= -1)) positives.push("融資下降但價格未明顯轉弱");
    if (input.volumeAvailable === true && volumeRatio20 !== null && volumeRatio20 >= 1.3 && pricePct !== null && pricePct > 0 && inst5TotalNet !== null && inst5TotalNet > 0) positives.push("放量上漲且法人買超");

    if (input.chipLevel === "danger" || input.chipLevel === "warn") risks.push(`Chip Score ${input.chipLevelLabel || input.chipLevel}`);
    if (input.bigMoneyLevel === "danger" || input.bigMoneyLevel === "warn") risks.push(input.bigMoneyLabel);
    if (input.retailLevel === "danger" || input.retailLevel === "warn") risks.push(input.retailLabel);
    if (inst5TotalNet !== null && inst5TotalNet < 0 && inst20TotalNet !== null && inst20TotalNet < 0) risks.push("法人短中期同步賣超");
    if (marginUsage !== null && marginUsage >= 80) risks.push("融資使用率過熱");
    else if (marginUsage !== null && marginUsage >= 60) risks.push("融資使用率偏高");
    if (marginDelta !== null && marginDelta > 0 && pricePct !== null && pricePct < 0) risks.push("融資增加但價格下跌");
    if (marginDelta !== null && marginDelta > 0 && input.volumeAvailable === true && volumeRatio20 !== null && volumeRatio20 < 0.8) risks.push("融資增加但量縮");
    if (input.volumeAvailable === true && volumeRatio20 !== null && volumeRatio20 >= 1.5 && pricePct !== null && pricePct < 0) risks.push("放量下跌");
    if (shortMarginRatio !== null && shortMarginRatio >= 40) risks.push("券資比偏高，空方籌碼擁擠");

    let tone = "flat";
    let label = "籌碼中性，等待資料同步";
    if (risks.some((text) => /過熱|下跌|賣超|撤退|轉弱|偏熱|偏空/.test(text))) {
      tone = "down";
      label = risks.slice(0, 2).join("；");
    } else if (positives.length >= 2 && !risks.length) {
      tone = "up";
      label = positives.slice(0, 2).join("；");
    } else if (positives.length > risks.length) {
      tone = "up";
      label = positives.slice(0, 2).join("；");
    } else if (risks.length) {
      tone = "down";
      label = risks.slice(0, 2).join("；");
    }

    const sourceParts = Array.isArray(input.sourceParts) ? input.sourceParts.filter(Boolean) : [];
    const dataItems = finiteNumber(input.dataItems) ?? 0;
    return {
      label,
      tone,
      positives,
      risks,
      sourceText: sourceParts.join(" | ") || "主要籌碼資料待更新",
      confidence: dataItems >= 3 ? "medium" : dataItems >= 1 ? "low" : "very-low"
    };
  }

  function setupGrade(score) {
    if (score >= 8) return "A";
    if (score >= 6) return "B";
    if (score >= 4) return "C";
    return "D";
  }

  function scoreSetup(input = {}) {
    const trendLabel = String(input.trendLabel || "");
    const positionLabel = String(input.positionLabel || "");
    const checklistPasses = finiteNumber(input.checklistPasses);
    const rs21 = finiteNumber(input.rs21);
    const rs65 = finiteNumber(input.rs65);
    const revenueYoy = finiteNumber(input.revenueYoy);
    let score = 0;
    if (trendLabel === "多頭趨勢") score += 3;
    else if (positionLabel === "盤整突破候選") score += 2;
    else if (trendLabel === "盤整趨勢") score += 1;
    if (input.hasPlaybook === true) score += Math.min(checklistPasses ?? 0, 3);
    if (input.volumeHot === true) score += 2;
    else if (input.weakVolume === true) score -= 1;
    if (rs21 !== null && rs21 > 0) score += 1;
    if (rs65 !== null && rs65 > 0) score += 1;
    if (revenueYoy !== null && revenueYoy > 20) score += 1;
    else if (revenueYoy !== null && revenueYoy < 0) score -= 1;
    if (input.inBuyZone === true) score += 1;
    else if (input.aboveBuyFar === true) score -= 1;
    if (input.chipLevel === "danger") score -= 2;
    else if (input.chipLevel === "warn") score -= 1;
    else if (input.chipLevel === "good") score += 1;
    score = Math.max(0, Math.min(10, score));
    return { score, grade: setupGrade(score) };
  }

  function decideTradeAction(input = {}) {
    const trendLabel = String(input.trendLabel || "");
    const positionLabel = String(input.positionLabel || "");
    let action = "先觀察";
    let actionNote = "條件尚未完全共振，先等價格與量價訊號再決定。";
    if (input.technicalReady !== true || input.hasPlaybook !== true) {
      action = "待更新日線";
      actionNote = "先補日線後再看趨勢、位置與量價。";
    } else if (trendLabel === "空頭趨勢" || positionLabel === "盤整跌破候選") {
      action = "先避開";
      actionNote = "目前不是做多主戰場，除非你是明確做反彈策略。";
    } else if (positionLabel === "回後買上漲 / 攻擊段" && input.volumeHot === true && input.aboveBuyFar !== true) {
      action = "可列攻擊清單";
      actionNote = "帶量轉強且未明顯脫離買點，適合列入當日優先追蹤。";
    } else if (input.inBuyZone === true && trendLabel === "多頭趨勢") {
      action = "可分批布局";
      actionNote = "結構仍偏多，且價格就在原設定買點帶附近。";
    } else if (positionLabel === "盤整突破候選") {
      action = "等突破確認";
      actionNote = "優先等前高或壓力位帶量突破，再決定是否追價。";
    } else if (input.aboveBuyFar === true || positionLabel === "多頭高檔 / 壓力前") {
      action = "等回檔，不追價";
      actionNote = "已脫離舒服買點或接近壓力，先等回測。";
    } else if (input.belowBuy === true && input.technicalEntryPresent === true && finiteNumber(input.technicalEntryTrigger) !== null) {
      action = "等突破確認";
      actionNote = "還沒收盤站上講義價位，先等突破價與量價條件一起完成。";
    } else if (input.belowBuy === true) {
      action = "等重新站回買點帶";
      actionNote = "價格比原設定買點更低，不一定是便宜，先看是否轉強。";
    }
    return { action, actionNote };
  }

  const api = Object.freeze({
    version: VERSION,
    coreLabels: CORE_LABELS,
    dailyReady,
    buildCoverage,
    technicalTone,
    rewardRiskTone,
    calculateRiskReward,
    buildExecutionDecision,
    summarizeChipStrength,
    scoreSetup,
    decideTradeAction
  });

  global.TwStockTraderWorkspace = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
