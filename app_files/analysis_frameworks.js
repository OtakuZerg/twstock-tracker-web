"use strict";

(function attachAnalysisFrameworks(globalScope) {
  const FRAMEWORK_VERSION = "twstock-win-rate-proxy-v1.1";
  const WALL_STREET_SOURCE_NOTES = [
    "CFA Institute equity research framing：估值、風險、投資論點與多模型交叉檢查。",
    "FINRA research analyst rules：研究需要揭露重大利益衝突，避免把評等當成無條件事實。",
    "SEC / Investor.gov：部位配置、分散與風險承受度是投資流程的一部分。"
  ];

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function pushFactor(factors, label, points, detail, bucket) {
    if (!points) return;
    factors.push({
      label,
      points: Math.round(points * 10) / 10,
      detail: String(detail || ""),
      bucket: bucket || (points > 0 ? "positive" : "risk")
    });
  }

  function liquidityAdjustment(tier) {
    if (tier === "giant" || tier === "large") return 2;
    if (tier === "mid") return 1;
    if (tier === "small") return -6;
    if (tier === "micro") return -12;
    return -3;
  }

  function analystWinRateLabel(score, missingCount) {
    if (missingCount >= 5 && score < 64) return { label: "資料不足，先補資料", tone: "warn", stage: "資料補齊" };
    if (score >= 78) return { label: "高勝率候選", tone: "up", stage: "優先研究" };
    if (score >= 65) return { label: "條件共振", tone: "up", stage: "可列清單" };
    if (score >= 52) return { label: "等待確認", tone: "flat", stage: "等訊號" };
    if (score >= 40) return { label: "只觀察", tone: "warn", stage: "降低權重" };
    return { label: "避開或資料不足", tone: "down", stage: "風險優先" };
  }

  function normalizeWinRate(value) {
    const n = num(value);
    if (n === null) return null;
    return n > 1 ? n / 100 : n;
  }

  function normalizeCalibrationMap(calibrations) {
    if (!calibrations) return {};
    if (Array.isArray(calibrations)) {
      return Object.fromEntries(calibrations
        .filter((row) => row && row.code)
        .map((row) => [String(row.code), row]));
    }
    if (typeof calibrations === "object") return calibrations;
    return {};
  }

  function analystCalibrationConfidence(count) {
    if (count >= 12) return "medium";
    if (count >= 6) return "low";
    if (count >= 3) return "very-low";
    return "unavailable";
  }

  function combineConfidence(primary, secondary) {
    const rank = { medium: 3, low: 2, "very-low": 1, unavailable: 0 };
    const left = rank[primary] ?? rank["very-low"];
    const right = rank[secondary] ?? rank["very-low"];
    return left <= right ? primary : secondary;
  }

  function analystWinRateCalibrationAdjustment(stats) {
    const count = Math.max(0, Math.round(num(stats?.count) || 0));
    const winRate = normalizeWinRate(stats?.winRate);
    const avgR = num(stats?.avgR);
    const maxDD = num(stats?.maxDD);
    const reasons = [];
    if (count < 3 || winRate === null || avgR === null) {
      return {
        available: false,
        adjustment: 0,
        confidence: "unavailable",
        label: "歷史樣本不足",
        tone: "warn",
        count,
        winRate,
        avgR,
        maxDD,
        reasons: ["近一年 playbook 多頭樣本不足 3 筆"]
      };
    }

    let adjustment = 0;
    if (winRate >= 0.6 && avgR >= 0.35) {
      adjustment += 10;
      reasons.push("歷史勝率與平均 R 同時偏強");
    } else if (winRate >= 0.55 && avgR > 0) {
      adjustment += 6;
      reasons.push("歷史樣本略優於基準");
    } else if (winRate <= 0.42 || avgR < -0.15) {
      adjustment -= 10;
      reasons.push("歷史勝率或平均 R 偏弱");
    } else if (winRate < 0.48 || avgR < 0) {
      adjustment -= 6;
      reasons.push("歷史樣本未形成正期望");
    } else {
      reasons.push("歷史樣本中性");
    }

    if (count < 6) {
      adjustment = adjustment > 0 ? Math.min(adjustment, 4) : Math.max(adjustment, -4);
      reasons.push("樣本偏少，限制校準幅度");
    }
    if (maxDD !== null && maxDD > 0.2) {
      adjustment -= 3;
      reasons.push("累計最大回撤偏高");
    }

    const cleanAdjustment = Math.round(clamp(adjustment, -12, 12));
    return {
      available: true,
      adjustment: cleanAdjustment,
      confidence: analystCalibrationConfidence(count),
      label: cleanAdjustment > 0 ? "歷史校準加分" : cleanAdjustment < 0 ? "歷史校準扣分" : "歷史校準中性",
      tone: cleanAdjustment > 0 ? "up" : cleanAdjustment < 0 ? "down" : "flat",
      count,
      winRate,
      avgR,
      maxDD,
      avgPnl: num(stats?.avgPnl),
      totalPnl: num(stats?.totalPnl),
      stopReason: num(stats?.stopReason),
      targetReason: num(stats?.targetReason),
      timeReason: num(stats?.timeReason),
      runAt: stats?.runAt || stats?.updatedAt || null,
      reasons
    };
  }

  function scoreAnalystWinRateFeature(row) {
    const factors = [];
    const missing = [];
    let score = 45;

    const radarScore = num(row.radarScore);
    if (radarScore !== null) {
      const pts = (radarScore - 50) * 0.18;
      score += pts;
      pushFactor(factors, "交易雷達", pts, `雷達 ${Math.round(radarScore)}/100`, "technical");
    } else {
      missing.push("交易雷達");
    }

    const setupScore = num(row.setupScore);
    if (setupScore !== null) {
      const pts = (setupScore - 5) * 2.1;
      score += pts;
      pushFactor(factors, "Setup", pts, `Setup ${setupScore}/10`, "technical");
    } else {
      missing.push("Setup");
    }

    const rr = num(row.rr);
    if (rr !== null) {
      const pts = rr >= 2 ? 8 : rr >= 1.5 ? 5 : rr >= 1 ? 2 : -6;
      score += pts;
      pushFactor(factors, "風報比", pts, `${rr.toFixed(2)}R`, "execution");
    } else {
      missing.push("R:R");
    }

    const rs21 = num(row.rs21);
    const rs65 = num(row.rs65);
    if (rs21 !== null || rs65 !== null) {
      let pts = 0;
      if ((rs21 ?? -999) > 0 && (rs65 ?? -999) > 0) pts = 6;
      else if ((rs21 ?? -999) > 0 || (rs65 ?? -999) > 0) pts = 3;
      else if ((rs65 ?? 0) < -10 || (rs21 ?? 0) < -8) pts = -6;
      score += pts;
      pushFactor(factors, "相對強弱", pts, `1M ${formatSigned(rs21)} / 3M ${formatSigned(rs65)}`, "technical");
    } else {
      missing.push("RS");
    }

    const revenueYoy = num(row.revenueYoy);
    const revenueMom = num(row.revenueMom);
    if (revenueYoy !== null) {
      let pts = revenueYoy > 20 ? 8 : revenueYoy > 5 ? 4 : revenueYoy > 0 ? 2 : -5;
      if (revenueMom !== null && revenueMom > 0) pts += 2;
      if (revenueMom !== null && revenueMom < -10) pts -= 2;
      score += pts;
      pushFactor(factors, "營收預期差 proxy", pts, `YoY ${formatSigned(revenueYoy)} / MoM ${formatSigned(revenueMom)}`, "fundamental");
    } else {
      missing.push("月營收");
    }

    const volumeZ = num(row.volumeZ);
    const quotePct = num(row.quotePct);
    if (volumeZ !== null) {
      let pts = 0;
      if (volumeZ >= 2 && quotePct !== null && quotePct > 0) pts = 3;
      else if (volumeZ >= 1 && quotePct !== null && quotePct > 0) pts = 2;
      else if (volumeZ >= 2 && quotePct !== null && quotePct < 0) pts = -4;
      score += pts;
      pushFactor(factors, "量價確認", pts, `${volumeZ.toFixed(1)}σ${quotePct !== null ? ` / ${formatSigned(quotePct)}` : ""}`, "technical");
    }

    const chipScore = num(row.chipScore);
    if (chipScore !== null) {
      const pts = chipScore * 3;
      score += pts;
      pushFactor(factors, "籌碼結構", pts, `Chip ${chipScore}`, "positioning");
    } else {
      missing.push("籌碼");
    }

    const bigMoneyScore = num(row.bigMoneyScore);
    if (bigMoneyScore !== null) {
      const pts = bigMoneyScore * 1.4;
      score += pts;
      pushFactor(factors, "大戶在場", pts, row.bigMoneyLabel || `score ${bigMoneyScore}`, "positioning");
    }

    const activeEtfScore = num(row.activeEtfScore);
    if (activeEtfScore !== null) {
      const pts = activeEtfScore * 1.2;
      score += pts;
      pushFactor(factors, "主動 ETF 共識", pts, row.activeEtfLabel || `score ${activeEtfScore}`, "positioning");
    }

    const retailHeat = num(row.retailHeatScore);
    if (retailHeat !== null) {
      const pts = retailHeat >= 5 ? -8 : retailHeat >= 3 ? -4 : retailHeat <= 0 ? 1 : 0;
      score += pts;
      pushFactor(factors, "散戶擁擠", pts, row.retailLabel || `heat ${retailHeat}`, "risk");
    }

    const dispositionRisk = num(row.dispositionRiskScore);
    if (dispositionRisk !== null) {
      const pts = dispositionRisk >= 90 ? -22 : dispositionRisk >= 70 ? -18 : dispositionRisk >= 45 ? -10 : dispositionRisk >= 28 ? -5 : 0;
      score += pts;
      pushFactor(factors, "處置 / 注意風險", pts, row.dispositionRiskLabel || `risk ${dispositionRisk}`, "risk");
    }

    const liqPts = liquidityAdjustment(row.liquidityTier);
    score += liqPts;
    pushFactor(factors, "流動性", liqPts, row.liquidityLabel || row.liquidityTier || "unknown", "risk");

    if (row.inBuyZone === true) {
      score += 4;
      pushFactor(factors, "執行位置", 4, "價格在計畫入場帶", "execution");
    }
    if (row.aboveBuyFar === true) {
      score -= 6;
      pushFactor(factors, "追價風險", -6, "已明顯脫離舒服買點", "execution");
    }
    if (row.technicalReady === false) {
      score -= 12;
      missing.push("日線");
      pushFactor(factors, "日線缺口", -12, "缺日線無法確認趨勢與停損", "risk");
    }

    const cleanScore = Math.round(clamp(score, 0, 100));
    const rankedFactors = factors.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
    const label = analystWinRateLabel(cleanScore, missing.length);
    return {
      code: String(row.code || ""),
      name: String(row.name || ""),
      score: cleanScore,
      label: label.label,
      tone: label.tone,
      stage: label.stage,
      positive: rankedFactors.filter((factor) => factor.points > 0).slice(0, 4),
      risk: rankedFactors.filter((factor) => factor.points < 0).slice(0, 4),
      factors: rankedFactors.slice(0, 8),
      missing,
      confidence: missing.length <= 2 ? "medium" : missing.length <= 4 ? "low" : "very-low",
      methodVersion: FRAMEWORK_VERSION
    };
  }

  function applyAnalystWinRateCalibration(row, stats) {
    const base = row && typeof row === "object" ? row : {};
    const calibration = analystWinRateCalibrationAdjustment(stats);
    if (!base.code) return { ...base, calibration };
    if (!calibration.available) {
      return {
        ...base,
        baseScore: base.baseScore ?? base.score,
        calibration,
        methodVersion: FRAMEWORK_VERSION
      };
    }
    const baseScore = Number.isFinite(Number(base.baseScore)) ? Number(base.baseScore) : Number(base.score) || 0;
    const score = Math.round(clamp(baseScore + calibration.adjustment, 0, 100));
    const label = analystWinRateLabel(score, Array.isArray(base.missing) ? base.missing.length : 0);
    const calibrationFactor = {
      label: "歷史回測校準",
      points: calibration.adjustment,
      detail: `${Math.round(calibration.winRate * 1000) / 10}% / ${Math.round(calibration.avgR * 100) / 100}R / n=${calibration.count}`,
      bucket: calibration.adjustment >= 0 ? "historical" : "risk"
    };
    const factors = [
      calibrationFactor,
      ...(Array.isArray(base.factors) ? base.factors : [])
    ].sort((a, b) => Math.abs(b.points || 0) - Math.abs(a.points || 0)).slice(0, 8);
    return {
      ...base,
      baseScore,
      score,
      label: label.label,
      tone: label.tone,
      stage: label.stage,
      calibration,
      factors,
      positive: factors.filter((factor) => factor.points > 0).slice(0, 4),
      risk: factors.filter((factor) => factor.points < 0).slice(0, 4),
      confidence: combineConfidence(base.confidence || "very-low", calibration.confidence || "very-low"),
      methodVersion: FRAMEWORK_VERSION
    };
  }

  function formatSigned(value) {
    const n = num(value);
    if (n === null) return "-";
    return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
  }

  function scoreAnalystWinRateBatch(rows, options = {}) {
    const limit = Math.max(0, Number(options.limit) || 0);
    const calibrations = normalizeCalibrationMap(options.calibrations);
    const scored = (Array.isArray(rows) ? rows : [])
      .map(scoreAnalystWinRateFeature)
      .map((row) => calibrations[row.code] ? applyAnalystWinRateCalibration(row, calibrations[row.code]) : row)
      .filter((row) => row.code)
      .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
    return limit ? scored.slice(0, limit) : scored;
  }

  function applyAnalystWinRateCalibrationBatch(rows, calibrations) {
    const map = normalizeCalibrationMap(calibrations);
    return (Array.isArray(rows) ? rows : [])
      .map((row) => map[row.code] ? applyAnalystWinRateCalibration(row, map[row.code]) : row)
      .filter((row) => row.code)
      .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));
  }

  globalScope.TwStockAnalysisFrameworks = {
    version: FRAMEWORK_VERSION,
    wallStreetSourceNotes: WALL_STREET_SOURCE_NOTES,
    scoreAnalystWinRateFeature,
    scoreAnalystWinRateBatch,
    analystWinRateCalibrationAdjustment,
    applyAnalystWinRateCalibration,
    applyAnalystWinRateCalibrationBatch
  };
})(typeof self !== "undefined" ? self : window);
