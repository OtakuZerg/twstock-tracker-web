"use strict";

(function attachThemeRegime(globalScope) {
  const THEME_REGIME_VERSION = "theme-regime-v1.1";

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function mean(values) {
    const list = values.map(num).filter((value) => value !== null);
    return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
  }

  function median(values) {
    const list = values.map(num).filter((value) => value !== null).sort((a, b) => a - b);
    if (!list.length) return null;
    const mid = Math.floor(list.length / 2);
    return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
  }

  function ratio(count, total) {
    return total > 0 ? count / total : null;
  }

  function pct(value) {
    const n = num(value);
    return n === null ? "-" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
  }

  function latestDate(values) {
    const list = values
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .sort();
    return list.length ? list[list.length - 1] : "";
  }

  function confidenceLabel(coveragePct, count) {
    if (count < 4 || coveragePct < 40) return "very-low";
    if (coveragePct >= 76) return "medium";
    if (coveragePct >= 55) return "low";
    return "very-low";
  }

  function regimeInfo(score, metrics) {
    const dataLow = metrics.count < 3 || metrics.coveragePct < 35;
    const crowded = metrics.avgChange !== null
      && metrics.avgChange >= 2.8
      && (metrics.aboveMa20Ratio || 0) >= 0.68
      && ((metrics.chipDangerCount || 0) >= 2 || (metrics.advanceRatio || 0) >= 0.72);
    if (dataLow) {
      return {
        label: "資料待補",
        tone: "warn",
        stage: "先補資料",
        action: "先補報價、日線、月營收與籌碼，暫不把分數當趨勢結論。"
      };
    }
    if (crowded) {
      return {
        label: "擁擠過熱",
        tone: "warn",
        stage: "不追價",
        action: "主題仍強但容易洗盤，先看龍頭回測月線與籌碼是否退潮。"
      };
    }
    if (score >= 72 && (metrics.aboveMa20Ratio || 0) >= 0.6) {
      return {
        label: "主升擴散",
        tone: "up",
        stage: "主線候選",
        action: "優先看核心股與補漲品質；新增部位仍用回測與停損控風險。"
      };
    }
    if (score >= 60) {
      return {
        label: "升溫",
        tone: "up",
        stage: "列入主線",
        action: "觀察是否從少數龍頭擴散到中段供應鏈，避免只追最後一棒。"
      };
    }
    if (score >= 48 && ((metrics.aboveMa20Ratio || 0) >= 0.45 || (metrics.revMedianYoy || 0) > 0)) {
      return {
        label: "洗盤修復",
        tone: "flat",
        stage: "等確認",
        action: "等站回月線、量縮不破或法人賣壓收斂後再提高權重。"
      };
    }
    if (score <= 38 || ((metrics.avgChange || 0) < 0 && (metrics.aboveMa20Ratio || 0) < 0.42)) {
      return {
        label: "退潮",
        tone: "down",
        stage: "降權",
        action: "降低題材倉，僅保留基本面與現金流可交叉驗證的標的。"
      };
    }
    return {
      label: "盤整輪動",
      tone: "flat",
      stage: "觀察",
      action: "資金方向未明，先比較領漲股是否守住月線與成交量是否擴散。"
    };
  }

  function rotationInfo(metrics) {
    if (metrics.count < 3 || metrics.coveragePct < 35) return "資料待補";
    if ((metrics.aboveMa20Ratio || 0) >= 0.62 && (metrics.advanceRatio || 0) >= 0.55) return "龍頭擴散";
    if ((metrics.avgChange || 0) >= 1.2 && (metrics.advanceRatio || 0) < 0.45) return "少數龍頭";
    if ((metrics.avgChange || 0) < 0 && (metrics.aboveMa20Ratio || 0) >= 0.5) return "洗盤觀察";
    if ((metrics.avgChange || 0) < 0 && (metrics.aboveMa20Ratio || 0) < 0.45) return "資金退潮";
    if ((metrics.revMedianYoy || 0) >= 15 && (metrics.avgChange || 0) < 0.8) return "基本面先行";
    return "輪動中";
  }

  function stockScore(feature) {
    const quote = num(feature.quotePct) || 0;
    const rs = num(feature.rs65) || num(feature.rs21) || 0;
    const rev = num(feature.revenueYoy) || 0;
    const chip = num(feature.chipScore) || 0;
    const etf = num(feature.activeEtfScore) || 0;
    return quote + rs * 0.12 + clamp(rev, -30, 60) * 0.04 + chip * 1.8 + etf * 0.55;
  }

  function buildThemeRegimeRow(theme) {
    const features = Array.isArray(theme.features) ? theme.features : [];
    const count = features.length;
    const quoteRows = features.filter((row) => num(row.quotePct) !== null);
    const techRows = features.filter((row) => row.techReady);
    const revenueRows = features.filter((row) => num(row.revenueYoy) !== null);
    const chipRows = features.filter((row) => num(row.chipScore) !== null);
    const instRows = features.filter((row) => num(row.institutionalNet) !== null);
    const etfRows = features.filter((row) => num(row.activeEtfScore) !== null);

    const avgChange = mean(quoteRows.map((row) => row.quotePct));
    const advanceRatio = ratio(quoteRows.filter((row) => (num(row.quotePct) || 0) > 0).length, quoteRows.length);
    const aboveMa20Ratio = ratio(techRows.filter((row) => row.aboveMa20).length, techRows.length);
    const aboveMa60Ratio = ratio(techRows.filter((row) => row.aboveMa60).length, techRows.length);
    const avgRs65 = mean(techRows.map((row) => row.rs65));
    const revMedianYoy = median(revenueRows.map((row) => row.revenueYoy));
    const revPositiveRatio = ratio(revenueRows.filter((row) => (num(row.revenueYoy) || 0) > 0).length, revenueRows.length);
    const avgChip = mean(chipRows.map((row) => row.chipScore));
    const chipDangerCount = chipRows.filter((row) => row.chipLevel === "danger").length;
    const instBuyRatio = ratio(instRows.filter((row) => (num(row.institutionalNet) || 0) > 0).length, instRows.length);
    const avgEtf = mean(etfRows.map((row) => row.activeEtfScore));

    const coverageParts = [
      ratio(quoteRows.length, count),
      ratio(techRows.length, count),
      ratio(revenueRows.length, count),
      ratio(chipRows.length, count),
      ratio(instRows.length, count)
    ].filter((value) => value !== null);
    const coveragePct = coverageParts.length ? mean(coverageParts) * 100 : 0;

    const quoteScore = avgChange === null ? -4 : clamp(avgChange * 2.2, -16, 16)
      + (advanceRatio === null ? 0 : clamp((advanceRatio - 0.5) * 28, -10, 10));
    const techScore = aboveMa20Ratio === null ? -6 : clamp((aboveMa20Ratio - 0.5) * 34, -17, 17)
      + (aboveMa60Ratio === null ? 0 : clamp((aboveMa60Ratio - 0.45) * 20, -9, 9))
      + (avgRs65 === null ? 0 : clamp(avgRs65 * 0.16, -6, 6));
    const revScore = revMedianYoy === null ? -5 : clamp(revMedianYoy * 0.28, -10, 13)
      + (revPositiveRatio === null ? 0 : clamp((revPositiveRatio - 0.5) * 12, -5, 5));
    const chipScore = avgChip === null ? -3 : clamp(avgChip * 3.5, -9, 11)
      + (instBuyRatio === null ? 0 : clamp((instBuyRatio - 0.5) * 10, -4, 4))
      + (avgEtf === null ? 0 : clamp(avgEtf * 0.8, -3, 5))
      - Math.min(8, chipDangerCount * 1.5);
    const dataScore = clamp((coveragePct - 60) * 0.18, -7, 6);
    const score = Math.round(clamp(50 + quoteScore + techScore + revScore + chipScore + dataScore, 0, 100));

    const metrics = {
      count,
      quoteCount: quoteRows.length,
      techCount: techRows.length,
      revenueCount: revenueRows.length,
      chipCount: chipRows.length,
      instCount: instRows.length,
      coveragePct,
      avgChange,
      advanceRatio,
      aboveMa20Ratio,
      aboveMa60Ratio,
      avgRs65,
      revMedianYoy,
      revPositiveRatio,
      avgChip,
      chipDangerCount,
      instBuyRatio,
      avgEtf
    };
    const regime = regimeInfo(score, metrics);
    const rotation = rotationInfo(metrics);
    const missing = [];
    if (quoteRows.length < Math.max(2, count * 0.5)) missing.push("報價");
    if (techRows.length < Math.max(2, count * 0.45)) missing.push("日線");
    if (revenueRows.length < Math.max(2, count * 0.35)) missing.push("月營收");
    if (chipRows.length < Math.max(2, count * 0.35)) missing.push("籌碼");
    if (instRows.length < Math.max(2, count * 0.25)) missing.push("法人");

    const ranked = features
      .map((row) => ({ ...row, themeStockScore: stockScore(row) }))
      .sort((a, b) => b.themeStockScore - a.themeStockScore || String(a.code).localeCompare(String(b.code)));
    const laggards = [...ranked].reverse();

    return {
      key: theme.key,
      label: theme.label || theme.key,
      score,
      regime,
      rotation,
      action: regime.action,
      metrics,
      leaders: ranked.slice(0, 4),
      laggards: laggards.slice(0, 3),
      missing,
      confidence: confidenceLabel(coveragePct, count),
      latestAsOf: latestDate(features.flatMap((row) => [
        row.quoteDate,
        row.klineDate,
        row.revenueDate,
        row.institutionalDate,
        row.marginDate
      ])),
      methodVersion: THEME_REGIME_VERSION
    };
  }

  function buildThemeRegimeRows(themes) {
    return (Array.isArray(themes) ? themes : [])
      .map(buildThemeRegimeRow)
      .filter((row) => row.key)
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  }

  function actionQueueItem(row) {
    const metrics = row?.metrics || {};
    const missing = Array.isArray(row?.missing) ? row.missing : [];
    const confidence = String(row?.confidence || "low");
    const regimeLabel = row?.regime?.label || "";
    const holdingCount = Math.max(0, Math.round(num(row?.holdingCount) || 0));
    const score = num(row?.score) || 0;
    const coverage = num(metrics.coveragePct) || 0;
    const aboveMa20 = num(metrics.aboveMa20Ratio);
    const chipDanger = Math.max(0, Math.round(num(metrics.chipDangerCount) || 0));
    const leaders = Array.isArray(row?.leaders) ? row.leaders : [];
    const laggards = Array.isArray(row?.laggards) ? row.laggards : [];

    let category = "觀察";
    let tone = "flat";
    let priority = 45 + score * 0.25;
    let action = row?.action || "先觀察主題廣度、龍頭與籌碼是否同向。";

    if (regimeLabel === "資料待補" || confidence === "very-low" || missing.length >= 3 || coverage < 45) {
      category = "補資料";
      tone = "warn";
      priority = 92 + missing.length * 2 + (holdingCount ? 4 : 0);
      action = "先補官方報價、日線、月營收與籌碼；資料不足時不把 regime 當交易結論。";
    } else if (regimeLabel === "擁擠過熱") {
      category = holdingCount ? "持股風控" : "不追價";
      tone = "warn";
      priority = 86 + Math.min(8, holdingCount * 2) + Math.min(4, chipDanger);
      action = "主題仍強但擁擠，已有部位檢查停利 / 停損，新單等回測月線或量縮修復。";
    } else if (regimeLabel === "退潮") {
      category = holdingCount ? "持股降權檢查" : "降權觀察";
      tone = "down";
      priority = 80 + Math.min(10, holdingCount * 3) + Math.max(0, 55 - score) * 0.2;
      action = "降低題材倉權重；只保留基本面、現金流與官方資料可交叉驗證的標的。";
    } else if (regimeLabel === "主升擴散") {
      category = holdingCount ? "持股主線檢查" : "主線候選";
      tone = "up";
      priority = 76 + Math.min(8, (score - 70) * 0.35) + Math.min(6, holdingCount * 1.5);
      action = "優先檢查核心股與中段供應鏈是否同步；新增仍等回測或突破確認。";
    } else if (regimeLabel === "升溫") {
      category = "升溫觀察";
      tone = "up";
      priority = 66 + Math.min(7, (score - 58) * 0.35) + (holdingCount ? 3 : 0);
      action = "觀察資金是否從少數龍頭擴散，先列入盤前候選清單。";
    } else if (regimeLabel === "洗盤修復") {
      category = holdingCount ? "持股修復確認" : "修復確認";
      tone = "flat";
      priority = 58 + (aboveMa20 !== null ? Math.max(0, aboveMa20 - 0.45) * 16 : 0) + (holdingCount ? 4 : 0);
      action = "等站回月線、量縮不破或法人賣壓收斂後，再提高主題權重。";
    }

    const checklist = [];
    if (holdingCount) checklist.push(`持股曝險 ${holdingCount} 檔`);
    if (missing.length) checklist.push(`待補 ${missing.join(" / ")}`);
    if (aboveMa20 !== null) checklist.push(`月線廣度 ${Math.round(aboveMa20 * 100)}%`);
    if (chipDanger) checklist.push(`籌碼警示 ${chipDanger} 檔`);
    if (leaders[0]) checklist.push(`領漲 ${leaders[0].code}`);
    if (laggards[0]) checklist.push(`待修復 ${laggards[0].code}`);

    return {
      key: row.key,
      label: row.label || row.key,
      category,
      tone,
      priority: Math.round(clamp(priority, 0, 100)),
      action,
      checklist,
      score,
      regimeLabel,
      rotation: row.rotation || "",
      confidence,
      holdingCount,
      holdings: Array.isArray(row.holdings) ? row.holdings : [],
      missing,
      leaderText: leaders.slice(0, 3).map((item) => `${item.code} ${item.name || ""}`.trim()).join("、"),
      laggardText: laggards.slice(0, 3).map((item) => `${item.code} ${item.name || ""}`.trim()).join("、"),
      coveragePct: coverage,
      latestAsOf: row.latestAsOf || ""
    };
  }

  function buildThemeActionQueue(rows, options = {}) {
    const max = Math.max(1, Math.round(num(options.max) || 8));
    return (Array.isArray(rows) ? rows : [])
      .map(actionQueueItem)
      .filter((row) => row.key)
      .sort((a, b) => b.priority - a.priority || b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, max);
  }

  globalScope.TwStockThemeRegime = {
    version: THEME_REGIME_VERSION,
    buildThemeRegimeRow,
    buildThemeRegimeRows,
    buildThemeActionQueue,
    pct
  };
})(typeof self !== "undefined" ? self : window);
