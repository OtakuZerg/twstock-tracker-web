(function initTwStockAfterCloseProtocol(global) {
  "use strict";

  const VERSION = "after-close-protocol-v1";
  const ALARM_NAME = "twstock-after-close-sync-v1";
  const STORAGE_KEY = "twstockAfterCloseSchedulerV1";
  const DEFAULT_HOUR = 15;
  const DEFAULT_MINUTE = 0;
  const TAIPEI_OFFSET_MINUTES = 8 * 60;

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function taipeiParts(nowMs = Date.now()) {
    const shifted = new Date(Number(nowMs) + TAIPEI_OFFSET_MINUTES * 60 * 1000);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      weekday: shifted.getUTCDay(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes()
    };
  }

  function dateKey(nowMs = Date.now()) {
    const parts = taipeiParts(nowMs);
    return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  }

  function targetAt(parts, hour = DEFAULT_HOUR, minute = DEFAULT_MINUTE) {
    return Date.UTC(parts.year, parts.month - 1, parts.day, Number(hour) - 8, Number(minute), 0, 0);
  }

  function nextScheduledAt(nowMs = Date.now(), options = {}) {
    const hour = Number.isFinite(Number(options.hour)) ? Number(options.hour) : DEFAULT_HOUR;
    const minute = Number.isFinite(Number(options.minute)) ? Number(options.minute) : DEFAULT_MINUTE;
    const now = Number(nowMs);
    const parts = taipeiParts(now);
    let target = targetAt(parts, hour, minute);
    if (target <= now + 1000) target += 24 * 60 * 60 * 1000;
    return target;
  }

  function scheduledAtToday(nowMs = Date.now(), options = {}) {
    const hour = Number.isFinite(Number(options.hour)) ? Number(options.hour) : DEFAULT_HOUR;
    const minute = Number.isFinite(Number(options.minute)) ? Number(options.minute) : DEFAULT_MINUTE;
    return targetAt(taipeiParts(Number(nowMs)), hour, minute);
  }

  function createRequest(nowMs = Date.now(), scheduledTime = nowMs) {
    const requestedAt = new Date(Number(nowMs)).toISOString();
    return {
      id: `after-close-${dateKey(nowMs)}-${Math.max(0, Number(nowMs)).toString(36)}`,
      dateKey: dateKey(nowMs),
      status: "pending",
      scheduledTime: new Date(Number(scheduledTime)).toISOString(),
      requestedAt,
      startedAt: null,
      finishedAt: null,
      result: "",
      error: "",
      autoCreatedTabId: null
    };
  }

  function normalizeState(value) {
    const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const request = raw.request && typeof raw.request === "object" ? raw.request : null;
    return {
      version: VERSION,
      enabled: raw.enabled !== false,
      hour: Number.isFinite(Number(raw.hour)) ? Number(raw.hour) : DEFAULT_HOUR,
      minute: Number.isFinite(Number(raw.minute)) ? Number(raw.minute) : DEFAULT_MINUTE,
      nextScheduledAt: raw.nextScheduledAt || null,
      request: request ? {
        ...request,
        status: ["pending", "running", "completed", "failed", "skipped"].includes(request.status) ? request.status : "pending"
      } : null,
      updatedAt: raw.updatedAt || null
    };
  }

  function shouldDispatch(stateValue, nowMs = Date.now()) {
    const state = normalizeState(stateValue);
    if (!state.enabled) return { ok: false, reason: "disabled", state };
    const request = state.request;
    const today = dateKey(nowMs);
    if (request?.dateKey === today && ["pending", "running", "completed"].includes(request.status)) {
      return { ok: false, reason: `already-${request.status}`, state };
    }
    return { ok: true, reason: "due", state };
  }

  function catchUpDue(stateValue, nowMs = Date.now()) {
    const state = normalizeState(stateValue);
    const scheduledTime = scheduledAtToday(nowMs, state);
    if (Number(nowMs) < scheduledTime) {
      return { ok: false, reason: "before-schedule", scheduledTime, state };
    }
    const gate = shouldDispatch(state, nowMs);
    return { ...gate, scheduledTime, state: gate.state };
  }

  const api = Object.freeze({
    version: VERSION,
    alarmName: ALARM_NAME,
    storageKey: STORAGE_KEY,
    defaultHour: DEFAULT_HOUR,
    defaultMinute: DEFAULT_MINUTE,
    taipeiParts,
    dateKey,
    nextScheduledAt,
    scheduledAtToday,
    createRequest,
    normalizeState,
    shouldDispatch,
    catchUpDue
  });

  global.TwStockAfterCloseProtocol = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
