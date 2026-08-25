# 台股追蹤 Taiwan Equity Tracker

**版本：v19.1** ｜ **日期：2026-08-21** ｜ Chrome Extension (Manifest V3) + GitHub Pages PWA

> ⚠️ **資料正確性說明**：本 extension 的報價、估值、月營收、股利、法人與市場資料以 MOPS / TWSE / TPEx 等官方來源為優先；季報三率目前需匯入 MOPS 季損益表或已整理 CSV。Tide 板塊資金、情緒快照與其他外部網站只作第三方 proxy / 交叉核對入口，所有資料都要檢查來源日期、fallback 與缺漏狀態。
>
> ⚠️ **稅務與規模提示**：海外 ETF 配息來源組成（5 類）為一般化分類，**每期實際比例需以投信「收益分配通知書」核對**；ETF 規模 (AUM) / 日均成交量為 2026-05 概估，需以投信月報實際數值更新。最低稅負制 / 二代健保補充保費門檻會隨年度調整，請以財政部 / 衛福部公告為準。

---

## v19.1 盤後資料、來源 schema 與回測執行模型（2026-08-21）

- 沿用既有 `source_catalog.js`、source adapters、normalizers 與 state shards，將 provenance contract 升級為 schema v2；舊 `state.json` 仍可讀，載入時只做相容的 in-memory migration，不另建第二套 state store。每筆決策資料統一保留 `source`、`sourceTier`、`asOf`、`fetchedAt`、`fallbackUsed` 與 `confidence`。
- 既有 `build_market_snapshot.mjs` 擴充為隱私清理盤後快照：台北時間 15:00 後每日最多完成一次，公開 Web 的 16 檔中性示範清單會取得 TWSE／TPEx 官方收盤、6 個月日線、三大法人與資券；公開檔不含私人持股、成本、提醒或自訂研究。盤前執行時會以官方最近收盤日截斷 Yahoo 日線，避免把尚未收盤的當日 K 棒當成完整資料。
- Web 仍只抓 same-origin `data/live_market.json`，但載入後會把盤後資料合併回既有 `quotes / klines / institutional / margin`，直接重用同一套技術分析、Chip Score、作戰首頁與標的雷達，不新增平行 parser 或分析引擎。
- Playbook 回測升級為 `playbook-next-open-v2`：收盤訊號在下一交易日開盤成交、同一標的不允許重疊持倉、同根 K 棒同時碰停損與目標時採保守的停損優先，並納入每邊 10 bps 成本與 5 bps 滑價的可調研究假設。模型假設不等於實際券商費率或稅負；目前股池仍可能有存活者偏差與回測過度擬合，方法限制可對照 [CFA Institute Backtesting & Simulation](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/backtesting-and-simulation) 與 [Bailey et al. 的 backtest overfitting 論文](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2308659)。
- 作戰首頁與交易雷達的 R:R 閘門同步收緊：未定義目標價或 R:R 時只能標為資料不足／候選追蹤，不能顯示「可執行」或「攻擊觀察」。

---

## v18.2.1 資料請求上限熱修（2026-07-30）

- 修正中央 Request Broker 將未指定的 `null` 傳輸選項轉成 `0`，進而把一般回應誤限縮為 `1024 bytes` 的問題；Yahoo、TWSE 與 TAIFEX 不再因正常大小的回應同時失敗。
- 恢復既定安全預設：回應上限 8 MiB、timeout 12 秒、最大重試等待 15 秒，以及各來源預設並行數；呼叫端明確指定較低上限時仍會照常攔截。
- 新增 deterministic regression，涵蓋大於 1 KiB 的正常 JSON、`null` transport options 與暫時性 503 重試；實際快照驗證可取得 Yahoo 四大美股指數、TWSE MIS／MI_INDEX 與 TAIFEX 夜盤且無來源錯誤。
- 公開 Web App 的「重新讀取快照」會立即重畫大盤與期貨摘要；重畫期間保留原面板高度與捲動位置，避免手機畫面停在舊資料或突然跳動。

---

## v18.2 行動優先效能與手機 Web App 改造（2026-07-28）

- 大盤第一屏由四格「盤前作戰中樞」改為三段「今日市場導航」：大盤風險、今日主線族群、目前族群；依使用者需求移除第 4 格「目前個股」。
- 首頁不再計算或重掛單股技術、熱度、籌碼與營收。單股資料只在「個股研究」或「技術分析 & 籌碼」首次使用時載入，避免大盤頁替未觀看內容做重工。
- 今日主線先使用已載入報價計算族群平均漲跌、廣度與覆蓋；完整產業 Regime、營收與籌碼仍保留在按需載入的詳細面板，不改交易研究口徑。
- 手機版 13 個研究分頁改為 safe-area 底部橫滑導覽；期貨卡改橫滑，手機 sticky bar 停用 blur 與分頁進場動畫，並保留 44px 以上觸控區。
- PWA cache 分成啟動必要、小型背景暖快取與大型按需三層。technical、主動 ETF、legacy state 與大型安裝圖像仍可離線快取，但不再於開頁後主動下載；final optional warm 約 0.39 MiB，Save-Data 或 2G 類連線會完全略過。
- 卡片選股與跨頁前往改為單次 full render；technical shard 載入時會顯示頁內狀態，完成後同一工作階段不會重複 hydrate。

---

## v18.1 連線可靠度與快照治理（2026-07-28）

- Extension 與 Web 共用中央 Request Broker：來源 timeout、single-flight、併發限制、取消、回應大小上限、bounded retry、`Retry-After`、WAF／schema／空資料分類與 request trace。
- Extension 背景訊息加入 watchdog；來源排隊時間不再誤算為實際 request timeout。
- 個股報價依序使用 TWSE MIS、Yahoo、TWSE／TPEx 官方收盤資料與鉅亨備援；WantGoo／Goodinfo 保留人工核對入口，驗證頁不冒充資料成功。
- Web App 使用同源延遲快照；manifest 分開標示產生時間、資料時間、stale／fallback、錯誤與 market／state-core／research／podcast hash。
- PWA 採 required shell 與 optional best-effort 快取；單一非關鍵資產失敗不再阻止安裝。
- 資料健康中心保留 last success、失敗原因、next retry 與 circuit breaker，並可單獨重試失敗的背景任務。
- 新增 TWSE、TPEx、MOPS、Yahoo、TAIFEX、TDCC、總經與 Tide 的共用 adapter policy 與 deterministic schema／0-row gates。

---

## 安裝步驟（本機載入）

> 適合家人與自己使用，無需上架 Chrome Web Store。

### 第一步：下載專案

1. 點選本頁右上角綠色 **Code** 按鈕 → **Download ZIP**
2. 解壓縮到你習慣的資料夾（例如桌面的 `twStock_tracker` 資料夾）

### 第二步：在 Chrome 載入擴充功能

1. 開啟 Chrome，網址列輸入：`chrome://extensions`
2. 右上角開啟 **開發人員模式**（Developer mode）
3. 點選左上角 **載入未封裝項目**（Load unpacked）
4. 選擇剛才解壓縮的 `twStock_tracker` 資料夾（裡面要有 `manifest.json`）
5. 擴充功能列出現「台股追蹤」即代表安裝成功

### 第三步：開啟使用

- 點選 Chrome 右上角擴充功能圖示 → 點選「台股追蹤」
- 或將擴充功能釘選到工具列，之後直接點擊開啟

> **Edge 用戶**：步驟相同，網址改為 `edge://extensions`。

### 更新本機版 extension

本專案是「載入未封裝項目」，平常更新程式後不需要移除重載。

1. 開啟 `chrome://extensions`
2. 找到「台股追蹤 Taiwan Equity Tracker」
3. 點該卡片右下角的 **重新載入** 圖示（圓形箭頭）
4. 關掉已開啟的台股追蹤頁，再從擴充功能圖示重新打開

注意：

- Chrome 頁面上方的 **更新** 按鈕主要是更新已安裝套件 / 商店套件；對本機 unpacked extension 不一定等同重新載入目前資料夾。
- 不建議用「移除」再「載入未封裝」當日常更新方式，因為移除 extension 可能清掉本機快取、持股、自訂分類與設定。
- 若重新載入後看起來還是舊畫面，通常是開著舊分頁；關掉台股追蹤頁再重新打開即可。
- 若換了資料夾路徑，例如從舊 ZIP 解壓到新資料夾，Chrome 會把它視為另一個本機 extension；請固定載入同一個專案資料夾。

### GitHub Pages / iPhone、iPad Web App

- 正式網站入口：[https://otakuzerg.github.io/twstock-tracker-web/](https://otakuzerg.github.io/twstock-tracker-web/)
- 公開成品倉庫：[OtakuZerg/twstock-tracker-web](https://github.com/OtakuZerg/twstock-tracker-web)。原始碼倉庫維持 private；公開倉庫只保存經過白名單建置與隱私掃描的 55 個成品、README 雙輸出與自動化檔案。
- private 原始碼倉庫的 GitHub Actions 先建立並用 Chrome 驗證 artifact；通過後使用只對公開成品倉庫有效的 deploy key 自動發布。公開倉庫再用 GitHub Pages workflow 部署 PWA。
- 原始碼 `main` 更新並通過檢查後，網站會隨公開 artifact 自動更新；iPhone / iPad 主畫面 Web App 會由 Service Worker 接收新版。這不會自動更新家中電腦的 unpacked extension，該版本仍需同步專案資料夾並在 `chrome://extensions` 按「重新載入」。
- 網頁版使用瀏覽器的 IndexedDB / localStorage 儲存持股與設定；Chrome extension 與網站資料彼此獨立，不會自動同步。
- 網站封面與主畫面圖示使用「精算鳥：長期投資，穩健致富」圖像。

#### 加到 iPhone / iPad 主畫面

1. 用 **Safari** 開啟上方網站。
2. 點 Safari 的 **分享** 按鈕。
3. 選 **加入主畫面**；若畫面提供選項，開啟 **以 Web App 打開**。
4. 回到主畫面點「台股追蹤」，之後會以近似原生 App 的獨立視窗開啟。

Apple 官方操作說明：[將網站加入 iPhone 主畫面](https://support.apple.com/en-gb/guide/iphone/iphea86e5236/ios)。本專案亦提供 Web App Manifest、Apple touch icon 與離線 shell 快取。

#### 部署、隱私與功能邊界

- Pages build 採明確 allowlist，公開倉庫只接收 55 個必要成品 / 自動化檔案；實際 Pages 上傳會排除 `.github/` 與 `scripts/`，因此瀏覽器端只提供 53 個執行成品。`data/state*.json` 會在建置時改成中性示範持股並清除成本、提醒及個人設定，原始私人 seed 不會放進公開 artifact。
- 建置器會拒絕常見 token / private key、本機絕對路徑、owner identifier、未預期檔案與未清空的個人化 state；公開頁另有 CSP、HTTPS fetch host allowlist、請求 / 回應大小限制及 URL protocol 驗證。
- **網站是公開的**：任何知道或猜到網址的人都能存取；`robots.txt` / `noindex` 只降低搜尋引擎收錄機率，不是登入或親友限定機制。不要輸入密碼、API key、醫療資料或其他敏感資訊。
- 公開 PWA 的大盤行情不再由瀏覽器直接跨站抓 Yahoo / TWSE / TAIFEX，而由 GitHub Actions 約每 15 分鐘抓取固定 host/path 白名單並產生同來源 `data/live_market.json`。GitHub 排程與上游來源都可能延遲，因此畫面會同時顯示快照產生時間、行情資料時間與 fallback，不宣稱逐筆即時。
- 網頁版的外部核對連結使用瀏覽器原生新分頁並加上 `noopener noreferrer`；extension 仍用受限的 Chrome tabs 流程。這只修正「開啟來源網站」，不會繞過來源網站本身的登入、地區或可用性限制。
- Service Worker 只快取明列的 App shell 與發布基線；動態 `live_market.json` 不固定進 shell cache，重新讀取時優先向同來源 Pages 取得新版。離線時不保證有最新行情。
- 維護者可執行 `node scripts/build_pages.mjs --output /tmp/twstock-pages-preview` 產生與正式部署相同的本機 artifact，再用 `scripts/web_context_smoke.mjs` 驗證 GitHub project subpath。
- 完整 finding、剩餘風險與驗證證據見 [資安檢視報告](docs/security_best_practices_report.md)（[HTML](docs/security_best_practices_report.html)）。

---

## 功能總覽

目前介面只使用一套「現行整合方法」。版本號只用於程式發版與下方 changelog，不代表同一頁存在多套互相競爭的研究建議。

| 分頁 | 現行用途 |
|------|----------|
| 作戰首頁 | 選取個股的現價、技術多空、籌碼強弱、執行結論、入場、停損、目標、R:R 與六層資料完整度；開頁先讀本機快取。 |
| 主題總覽 | 主題股池、AI factory 供應鏈標註、分類純度、產業趨勢、Tide 板塊資金 / 情緒摘要與補資料優先級；持股詳表改為按需載入，預設先看作戰摘要。 |
| 標的雷達 | 先過濾流動性與市值，再整合 Setup、R:R、RS、月營收、籌碼、事件與處置風險。 |
| 個股決策 | 產業位置、月營收、季報三率、估值、技術、籌碼與交易計畫共用同一份資料狀態。 |
| 技術籌碼 | 初始畫面收斂成「技術 × 籌碼決策摘要」、事件新鮮度、修復、KD / 背離、Chip Score 摘要、來源入口與成本 / 提醒；資料覆蓋卡、Chip Score 分項、個股籌碼強弱、逐日法人、融資券、TDCC、TAIFEX、SBL 詳表改由「載入詳細籌碼」按需載入。 |
| 標的找尋 | 用流動性、市值、技術、籌碼、基本面與題材條件建立左側、右側及避開清單。 |
| 處置股 | TWSE / TPEx 官方處置、注意風險與未來兩個月放出日曆。 |
| 除權息 | TWSE / TPEx 官方除權息交易日日曆，標出未來兩個月追蹤股 / ETF 股價參考價調整日；Yahoo 台灣與鉅亨網作交叉核對。 |
| 其他 | ETF、新聞、總體經濟、Podcast 與說明 / 版本日誌。 |

## v19.0 Trader-first 全面重構第一階段（2026-08-13）

- 首頁改為操盤手順序：先看單一標的的價格、技術多空、籌碼強弱、執行狀態，再看入場、停損、目標、R:R 與資料缺口。這些訊號只作研究排序與風險提示，不是獲利保證或自動下單。
- 操盤首頁保留在第一順位，但 13 個研究分頁全部直接顯示：作戰首頁、主題總覽、標的雷達、個股決策、個股營收、技術籌碼、標的找尋、處置股、除權息、催化劑與新聞、總體經濟與風險、Podcast、資料健康。桌機頂部分頁列與手機 safe-area 底部 dock 都可橫向捲動，不再把八個功能藏進「更多研究」。
- 新增 `app_files/core/source_catalog.js`，將報價、日線、估值、基本面、法人、資券、外資持股、TDCC、衍生品、公司事件、總經、產業研究及新聞／Podcast 分成 13 個決策領域，列出 canonical source、fallback、TTL、Extension／Web 能力與缺值規則。
- Extension 新增台北時間 15:00 盤後同步排程，讓收盤與盤後資料一起進入研究流程。Chrome alarms 可安排指定時間，但裝置休眠時不會被喚醒，錯過的 alarm 會在喚醒後執行，因此畫面會保留排程／完成狀態，而不宣稱準時到秒；詳見 [Chrome alarms 官方文件](https://developer.chrome.com/docs/extensions/reference/api/alarms)。
- Web App 維持 same-origin snapshot：跨站抓取由 GitHub Actions 產生延遲快照。GitHub 說明排程可能在高負載時延遲，所以正式畫面會標示 Web 延遲快照，而不包裝成逐筆即時；詳見 [GitHub Actions workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) 與 [scheduled workflow troubleshooting](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows)。
- 本階段採 strangler migration：新 shell 與新核心模組先接管第一屏，既有分析器與 parser 暫時沿用；等新模組完成對等測試並取得刪除確認後，才拆除舊入口或檔案。
- R6a–R6e2a 已把資料完整度、技術多空、R:R、Setup 分數、交易動作、執行狀態與籌碼強弱摘要移到 `app_files/features/trader_workspace.js`，由 61 個 deterministic cases 保護。報價、日線與估值由 `app_files/sources/market_data_normalizers.js` 正規化（42 cases）；法人、資券、TDCC 與 TAIFEX 由 `app_files/sources/chip_data_normalizers.js` 接管純解析（58 cases）；月營收與季報三率由 `app_files/sources/fundamental_data_normalizers.js` 接管（55 cases）；TWSE 大盤、VIX、美債殖利率、融資餘額、央行匯率、Fed RSS／SEP 與 FedWatch 由 `app_files/sources/macro_data_normalizers.js` 接管（67 cases）。四個來源模組都沿用既有 `source_adapters.js` 契約或其來源政策，會攔截 0 筆、無效 JSON、schema drift 與錯誤 payload；缺值固定顯示為缺資料，不會視為中性或低風險。作戰首頁的 selector 與安全 renderer 已分別由 35 cases 保護，並加入可橫向捲動的持股快切與 ETF／個股檔數摘要；這份清單只供快速切換與研究排序，不要求張數、均價或損益。私人 Extension seed 可保存個人持股，但公開 Pages build 會強制換成中性示範清單並清空成本、提醒與自訂研究。
- R6e2b 已把「標的找尋」的候選分組／排序與外資連買選擇器移到 `app_files/store/discovery_workspace_selectors.js`，並把 hero、四層篩選說明、摘要／詳表 gate 與左側／右側／避開三張表移到 `app_files/ui/discovery_workspace_renderer.js`。左側 50 分、右側 55 分、高風險 24 點、表格 5／12 檔與外資連買至少 3 日等既有口徑不變；selector 28 cases、renderer 38 cases，以及 390px 的 badge／按鈕不可逐字直排或相交 geometry gate 共同保護。Extension 與 Web 共用相同模組，Service Worker cache 為 `v19.1-pwa-1`。

### 資料儲存與更新

- `data/state_core.json`：新安裝初始畫面核心 seed，不在每次啟動解析完整歷史。
- `data/state.json`：相容舊版的綜合 seed / 同步狀態檔；執行期以本機快取較新的資料為準。
- `data/research_data.json`：月營收歷史、季報三率、現行方法與 cache policy 的單一長期資料基線。
- `data/live_market.json`：公開 PWA 的大盤與隱私清理盤後延遲快照；由固定來源 GitHub Actions 排程產生，包含來源、資料時間、fallback 與抓取紀錄。Extension 不依賴此檔，仍保留原生背景抓取。
- K 線、量化校準與業績長期資料優先放 IndexedDB；設定 `data/` 後會同步 `state.json` 與 `research_data.json`。
- 啟動時先顯示核心 state 與初始畫面，大盤 / 主題等 UI 不再等待 `research_data.json`、同步檔與 IndexedDB 業績資料層全部讀完；業績資料層完成後會重繪需要月營收 / 三率的作用中分頁。
- v17.9 只保留一個「收盤後同步」主按鈕：先完成報價／官方估值／市值與日線；大盤、期貨、法人、處置、除權息、月營收、ETF、總經、Tide、記憶體與股利依 TTL 排入最多兩路背景佇列，未到期自動略過。
- 月營收由 MOPS 官方資料自動解析並保留最多 36 個月；季報三率 parser 已完成，但目前是 CSV 手動匯入，不是自動下載。
- 除權息日曆以 TWSE TWT48U 與 TPEx `tpex_exright_prepost` 為 canonical source；日期是股價參考價調整的交易日，不是股東會日或股利入帳日。
- 記憶體主題會追蹤 TrendForce / DRAMeXchange 公開 DDR4 / DDR5 現貨、合約與模組報價；HBM 沒有公開逐日現貨價，因此只顯示供需 / 合約狀態。
- Tide 板塊資金潮汐讀取 `https://tide-tw.app/data/latest.json`、`daily_brief.json` 與 `daily_digest.json`，只儲存 top 買超 / 賣超 / 逆勢買超、panic index、避風港板塊、法人異常買賣與連續買超摘要；面板會直接提供 Tide 原站、三個 JSON 與 TWSE / TPEx 官方核對連結，來源層級標為第三方市場資料，需回 TWSE / TPEx 三大法人日報與既有 Market Heat / 廣度 / 期權資料核對。
- 主題總覽的 Tide 區塊只讀既有快取並顯示情緒與板塊摘要；完整 Tide 排行與自動更新保留在大盤總覽，避免同一批第三方 proxy 在兩個首頁區域重複鋪滿或重複觸發網路更新。
- 技術分析 & 籌碼預設只載入決策摘要、Chip Score 摘要、來源入口與成本 / 提醒；資料覆蓋、Chip Score 分項、個股籌碼強弱與詳細籌碼表仍可按「載入詳細籌碼」產生，再回官方 / 第二來源入口核對，不把缺值或第三方 proxy 包裝成結論。
- 主題總覽採分批渲染：先顯示持股作戰摘要、記憶體報價、類股概況、研究框架與分類稽核，再載入退休情境、排行、一般個股卡片與快照；逐檔月營收 / 三率診斷、持倉損益與倉位試算改由「載入持股詳表」按需產生。
- 開啟 Extension 與切換分頁不再自動跨站抓資料；舊版曾開啟的盤中定時及開頁背景完整更新也不再恢復。資料過期時仍會降 confidence 並提示收盤後同步，不把舊快取當今日訊號。
- 頂部期貨水位列的「台指期夜盤 TXF」會直接連到 TAIFEX 官方盤後交易股價指數期貨頁；「台指期夜盤｜TXF」市場卡片內會用超連結顯示 CMoney TXF1 `https://www.cmoney.tw/forum/futures/TXF1?s=p` 與 WantGoo WTXP `https://www.wantgoo.com/futures/wtxp` 第二來源，底部另保留 TAIFEX 行情資訊首頁、日盤頁、Yahoo、CMoney 與 WantGoo 備援核對入口。
- 外部超連結只在來源 chip、台指期夜盤卡片與外部來源列套用受限流程；extension 使用 Chrome tabs，公開網頁則交回瀏覽器原生新分頁並強制 `noopener noreferrer`，不再讓 Web adapter 攔截後失敗。
- 大盤 / 總經 / TAIFEX 快取若超過可接受日期，不再當作即時現值或急殺雷達輸入；舊 `41790` 類內建快照會改顯示待更新 / 待複核，避免看起來仍是 4 萬點。
- v18.2 起大盤第一屏收斂為「今日市場導航」，固定動線為大盤風險 → 今日主線族群 → 單一族群；單股線型、籌碼、營收與 R:R 回到個股研究／技術分頁按需計算。資料健康、Tide、更新流程、結算提醒、概念輪動與法人排行維持按需載入。
- 急殺雷達新增「採信狀態」：資料過期、覆蓋率不足或自動更新失敗時會標示低信心 / 不採信，不讓舊快取分數看起來像今日訊號；分數相同時仍需看各因子 `asOf`。
- YouTube 股市心得資料層新增 Gooaye 與理財達人秀 EBCmoneyshow 頻道層框架；目前為 Tier 3 metadata-only / framework-only，只作部位風控、線型 checklist 與交叉比對入口，未取得本機逐字稿前不進交易雷達加權。
- TAIFEX 期貨水位會分開顯示「全市場未平倉」、「外資多方 / 空方 OI」與「外資淨未平倉」；八萬多口若是全市場 OI 或外資單邊空方 OI，不會被寫成外資淨空單。
- 風險情緒核對入口新增台灣 VIXTWN 來源：WantGoo、MacroMicro 台灣 VIXTWN 與永豐 VIXTWN 說明；目前先作人工交叉核對入口，不直接把未驗證網頁值寫進分數。
- 若舊資料已在 `data/state.json`，可執行 `node scripts/update_research_data.mjs` 增量搬入 `data/research_data.json`；`--check` 只檢查、不寫檔。

<details>
<summary><strong>歷史版本功能脈絡</strong>（僅供追溯，非多套現行建議）</summary>

### 主功能分頁

| 分頁 | 說明 |
|------|------|
| 大盤總覽 | 新首頁：台灣加權指數現值 / 漲跌 / 漲跌幅 / 開高低昨收 / 成交金額（億）與盤中線圖；v12.6 強化「急殺風險雷達」：慢性分數看乖離 / 融資 / 廣度，panic override 另外監控台指期夜盤、美股科技、外資空單、法人賣壓與期權避險，並新增風險意識管理與文獻映射；v12.5 新增「急殺風險雷達」，用大紅字整合台指期領跌、外資期貨淨空、法人退場 proxy、TWSE 融資退潮、TAIEX 高乖離、追蹤池廣度轉弱與 VIX risk-off，優先提醒保護獲利與降槓桿；v12.4 將背景完整更新改成手動 opt-in、full bundled state 不再自動合併，startup auto refresh 分批排程以避免網頁無回應；v12.3 將啟動後自動抓取延後到 idle、下修 bundled K 線 / heavy cache inline 數量並按需載入主動 ETF seed；v12.0 起保留 v11.9 的 K 線 IndexedDB hot cache、heavy hot subset 與中央 TTL scheduler，scheduler 另加入 retry/backoff 診斷；v10.4 新增 Market Heat Score，整合 TAIEX 技術線型、追蹤池廣度、TWSE 融資券、TAIFEX 期權與總經外部壓力；下方接 TAIFEX 台指期夜盤、道瓊、S&P 500、NASDAQ、費城半導體線圖；並顯示資料健康總分、今日概念股輪動、處置風險 Top 5、台指期結算日提醒、日常完整更新流程、ETF NAV / 折溢價 / 持股展開 / 法人30日快取 / v5.2 技術卡片健康檢查 |
| 主題總覽 | 全部個股報價、漲跌、成交量、月營收、交易雷達分；v15.2 新增 AI factory 核心10、Energy + Infrastructure、零組件重估鏈、台積電外溢鏈、Models + Applications、未發酵 10 方向與優先級 1–7 標籤，並把 MOSFET / Driver IC / PMIC / 車用整流二極體拆開標註；v14.7 將金融股從「好老闆」候選池拆出，新增左側獨立「金融股」股池並放在「防守現金流」上方，收錄富邦金、國泰金、中信金、兆豐金、玉山金、第一金、合庫金、元大金、臺企銀、新產，金融股面板改以資本適足 / RBC / BIS、逾放比、覆蓋率、承保損益、股利能力、匯率避險與法遵風險作複核框架；v14.5 在「好老闆」面板新增候選擴充池，將聯發科、聯詠、亞德客-KY、旭隼、信邦、儒鴻、精測、華碩、和碩標成待複核候選，列出候選理由、主要風險、官方複核項目與候選 CSV 匯出；v14.4 將「好老闆」升級為經營品質矩陣，加入文化、接班、資本配置、技術壁壘、坦率度五軸研究分、資料覆蓋率、複核優先級、下一步規則與 CSV 匯出；v14.3 左側新增「好老闆」主題股池，收錄台積電、大立光、致新、台達電、研華、川湖，並在選取該主題時顯示治理型態、列入理由、主要風險與 MOPS / 官方核對入口；v14.2 在產業趨勢雷達新增「盤前主線行動佇列」，依 regime、confidence、持股曝險與缺資料排序主線候選、持股風控、不追價、降權與補資料，並可匯出 CSV；v14.1 新增「產業趨勢雷達」，以報價廣度、日線 MA20 / MA60、月營收中位 YoY、籌碼與主動 ETF 共識判斷主題 regime（主升擴散 / 升溫 / 擁擠過熱 / 洗盤修復 / 退潮），並顯示 confidence、缺資料、領漲候選與弱勢待修復；v14.0 在補資料優先清單上方新增「批次補資料佇列」，依目前 worklist 缺口產生補報價、補日線、補月營收、補估值、補籌碼與分類待複核入口；v13.9 在分類稽核表上方新增「補資料優先清單」，依分類待複核、缺報價 / 日線 / 月營收 / 估值 / 法人 / 融資券、fallback 與 low confidence 加權排序，並可匯出 worklist CSV；v13.8 新增 Goodinfo-style 主題分類稽核表，逐檔標示核心 / 延伸 / 待複核、資料覆蓋、confidence、fallback 與 TWSE / TPEx / MOPS 官方核對入口，並可匯出完整 CSV；v13.2 依 Goodinfo 式掃描邏輯重整左側分類，將 AI Server 散熱 / 電源與重電 / 電網拆開，防守現金流與景氣高息觀察拆開，並新增 PCB、記憶體、CPO、機器人待複核股池；v13.1 在技術頁新增 K 線 / 漲跌停合法價位試算、量能 Regime / 相對量，以及個股籌碼強弱卡；v13.0 抽出版本日誌並延後到說明頁開啟時載入，`main.html` shell 約從 247KB 降到 125KB，並把 shell size / startup budget 納入 smoke gate；v12.9 加入全頁重複顯示 smoke 稽核與效能診斷面板，先把誤判與卡頓風險納入 release gate；v12.8 收斂技術 × 籌碼卡的重複籌碼提示並加入 derived signal cache 加速載入；v12.7 在「目前持股」的持股作戰室直接顯示 MA5 / MA20（月線）失守警告，若有跌破會標示「目前有問題」與目前價 / 均線 / 乖離；v12.2 在左側「記憶體」分類優先顯示 DDR4 / DDR5 報價與 HBM 狀態；v11.7 新增第 06「先進封裝CoWoS/CoPoS」與玻璃基板 / GCS / TGV 多重標籤；v11.6 新增「持股作戰室」，先看目前持股資料覆蓋率、曝險前五主題與優先補資料 / 熱度檢查清單；v11.4 併入快照與籌碼趨勢、主題技術排行，顯示近幾筆報價、成交量、14 日法人買賣超、外資持股累積 / 出清、Chip Score 與月季年乖離排行；個股卡片新增**流動性等級**（巨型 / 大型 / 中型 / 小型 / 過小） |
| 量化篩選 | Setup、R:R、RS、可執行欄位、交易狀態欄、事件新鮮度欄、事件續航摘要、今日行動清單；v12.1 讓「勝率 proxy」可讀取最近歷史校準結果，v12.0 新增勝率欄位與排序並用 windowed rendering 降低大量清單 DOM 負擔；新增處置風險排序欄；v9.5 新增大戶在場 / 散戶熱度排序欄；sticky 第一欄顯示流動性 chip |
| 個股研究 | 分析師視角、操盤手交易計畫、講義價位框架、部位建議、執行紀律；內嵌 TWSE / TPEx 交易所 PE、PBR、殖利率、股利與估值推論卡 |
| 技術分析 & 籌碼 | 只顯示目前選取個股；v13.1 新增 K 線 / 台股 10% 漲跌停與升降單位試算（含 142 元→156.0 / 128.0 範例）、量能 Regime / 相對量卡（不用過去絕對張數門檻硬套現在成交量環境）、個股籌碼強弱卡（融資增減、融資使用率、融券增減、法人 5/20 日、大戶 / 散戶 proxy）；MA5/10/20/60/120/240、RSI、MACD、KD、布林通道、支撐壓力、朱家泓 × 林穎講義方法學、最近行情欄位、講義式趨勢與進出場價位、大量 K 高低攻防、v11.3 月線 / 季線 / 年線多週期乖離 profile、v11.2 月線乖離分位解讀說明、v11.1 個股 MA20 乖離歷史分位與減碼買回紀律、v11.0 三大法人逐日明細預設收合、v10.7 放大現價 / 漲跌 / 過熱深跌提示、v10.6 個股過熱 / 深跌超賣訊號（價格附近、數字摘要、技術籌碼拆解卡）、v8.8 事件後續航統計、v8.7 技術事件新鮮度、v8.6 交易狀態機 / 今日技術事件、v8.5 失守後修復 / 再進場判讀、KD / 背離 Checklist、ATR 風控 / 週線大量 K / POC 成本區；三大法人近30日快取 / 多週期累計、法人買賣超、漲跌停鎖單強度、融資融券、Chip Score、v9.5 大戶仍在場 / 散戶情緒溫度計；跨個股排行移至主題總覽 |
| 標的找尋 | 在 v11.4 精簡分頁基礎上新增，用流動性、市值、MA5/10/20/60/120/240、RSI、MACD、量能、ATR、布林、20/60/120 日高低、法人買賣超、月營收 YoY、殖利率與 AI 題材做組合條件，分成左側交易、右側交易與避開清單；v12.1 新增 Top 候選 playbook 歷史校準，v12.0 新增工具內勝率 proxy，整合預期差、估值與風險、技術確認、籌碼定位、R:R 與執行紀律，並由 worker 批次排序。Podcast transcript 不產生個股勝率。 |
| 處置股 | TWSE / TPEx 官方處置清單、注意累計異常、今日注意交易、量價 proxy、5 / 20 分鐘分盤、處置期間與兩個月放出日曆；v10.2 起分成已處置、官方累計高風險、今日注意、量價 proxy 四層 |
| ETF 追蹤 | 上方分頁不再另放 ETF 追蹤；左側第 13 主題只顯示**台灣主動式 ETF**，第 15 主題只顯示**國外 ETF**（海外主動 / 美股 / 日股 / 美債）。內容包含日股 ETF、Buffett 商社配置、美債 ETF 燈號、海外 ETF 配息課稅、操盤手工具入口、主動 ETF 持股快照、換股比對與今日投信共同買賣 Top 5 |
| 催化劑 & 新聞 | 上區：Anue 即時台股新聞 Top 10（15 分鐘快取）；下區：個股新聞入口、法說、財報、大股東 |
| 總體經濟與風險 | 直接顯示 TWSE 指數、Cboe VIX、U.S. Treasury 殖利率曲線；v13.5 新增總經來源稽核面板，集中顯示 FedWatch、Fed SEP、VIX、Treasury、CBC USD/TWD、TWSE 融資券的來源層級、asOf、fetchedAt、confidence、fallback 與錯誤；v13.4 已加入 CME 最近成功快取 fallback 與 Fed policy gap 趨勢表，將市場隱含利率、Fed SEP / dot plot 官方中位數、政策落差方向接入 Market Heat Score；保留官方 + 第二來源交叉比對入口，並整合 12 項風險矩陣與全市場融資融券水位入口 |
| Podcast | 股癌、兆華與股惑仔、M觀點、財報狗、美股投資學等 RSS；Podcast、新聞、SBL 與深度法人回補皆改為使用時才抓，不佔用收盤後核心同步。 |

#### 鍵盤快捷鍵

- `Cmd/Ctrl + 1` 大盤總覽
- `Cmd/Ctrl + 2` 主題總覽
- `Cmd/Ctrl + 3` 量化篩選
- `Cmd/Ctrl + 4` 個股研究
- `Cmd/Ctrl + 5` 技術分析 & 籌碼
- `Cmd/Ctrl + 6` 處置股
- `Cmd/Ctrl + 7` 催化劑 & 新聞
- `Cmd/Ctrl + 8` 總體經濟與風險
- `Cmd/Ctrl + 9` Podcast
- `Cmd/Ctrl + 0` 說明 & 版本日誌

按住 `Cmd/Ctrl` 會在分頁列上顯示快捷鍵數字。

### 左側主題分類（01–23）

- v15.2 起新增 AI factory 研究標籤：核心10、Energy + Infrastructure、AI factory 零組件重估鏈、台積電外溢鏈、Models + Applications、下一波三層、未發酵 10 方向與優先級 1–7。這些標籤是研究排序與複核 queue，不是買賣建議；涉及產業位置、營收純度或供應鏈敘事時，仍需回 TWSE / TPEx / MOPS、法說與第二來源交叉比對。
- v15.2 起功率半導體拆細標註：純 MOSFET（富鼎、杰力、大中、茂矽、尼克森、元隆、力士）、功率元件平台（強茂、台半）、HVDC / SiC / GaN 待複核（強茂、台半、德微、漢磊、嘉晶、朋程）、Driver IC 非 MOSFET（茂達、廣閎科）、PMIC 非 MOSFET（矽力-KY、致新、力智），避免把 MOSFET 本體、driver IC、PMIC 與車用整流二極體混看。
- v13.2 起採更接近 Goodinfo 類股 / 概念股掃描的分類方式：左側主題仍允許一檔股票多重歸屬，但會把「核心受惠」「延伸觀察」「低純度 / 待複核」拆成子分類標籤。
- v14.7 起「金融股」從「好老闆」候選池拆出，成為左側獨立股池並放在「防守現金流」上方；金融股不看製造業毛利率，而是優先複核資本適足 / RBC / BIS、逾放比、覆蓋率、承保損益、股利能力、壽險匯率避險與法遵風險。
- v14.6 曾把金融股放入好老闆候選分組；v14.7 已依分類語意修正，金融股不再列入好老闆候選表，也不混入防守現金流或退休核心。
- v14.5 起「好老闆」新增候選擴充池：聯發科、聯詠、亞德客-KY、旭隼、信邦、儒鴻、精測、華碩、和碩只標為待複核候選，需通過 MOPS / 年報 / 法說 / 公司治理與第二來源交叉比對後才可升級。
- v14.4 起「好老闆」新增經營品質矩陣：用文化、接班、資本配置、技術壁壘、坦率度五軸建立研究分，並依資料覆蓋與風險等級產生複核優先級、下一步規則與 CSV 匯出；這是研究排序，不是買賣建議。
- v14.3 起左側新增「好老闆」：收錄台積電、大立光、致新、台達電、研華、川湖，分成制度與接班 / 長期規劃、保守直接 / 少畫餅、技術壁壘 / 財務紀律。選取此主題時會顯示列入理由、主要風險與官方核對入口；財務數字是研究註記，需以 MOPS / 年報 / 法說複核。
- v14.2 起產業趨勢雷達新增盤前主線行動佇列：依 regime、資料信心、持股曝險與缺口，把主題分成主線候選、持股風控、不追價、降權與補資料，並可匯出 CSV；此佇列是研究排序，不是買賣建議。
- v14.1 起主題總覽新增產業趨勢雷達：用既有資料判斷主題 regime、輪動型態、資料 confidence、缺口、領漲候選與弱勢待修復；此分數是工具內 derived proxy，不是買賣建議。
- v14.0 起分類稽核表新增批次補資料佇列：依 worklist 缺口產生補報價、補日線、補月營收、補估值、補籌碼與分類待複核入口；報價、日線、估值、籌碼會限制在目前 worklist 前 24 檔高優先標的。
- v13.9 起分類稽核表新增補資料優先清單：把待複核、缺資料、fallback 與 low confidence 轉成 worklist score，先處理最會影響交易判讀的資料缺口。
- v13.8 起主題總覽新增分類稽核表：目前範圍逐檔列出核心 / 延伸 / 待複核、資料覆蓋、confidence、fallback 與 TWSE / TPEx / MOPS 核對入口，CSV 匯出會包含完整目前範圍。
- `AI Server 散熱 / 電源` 不再混入重電；`重電 / 電網` 獨立追蹤華城、中興電、士電、亞力、大同、東元與電線電纜鏈。
- `金融股` 是獨立股池；`防守現金流` 只放 ETF、電信與防守型配息個股；`景氣高息觀察` 放航運、航空與景氣循環配息股，避免誤當退休核心。
- `被動元件` 移除台達電這類低純度個股；大同、環科、能率網通、福華保留在「廣義低純度 / 待複核」。
- 新增待複核擴充：PCB / CCL 加入定穎投控、瀚宇博、高技；記憶體加入晶豪科、鈺創、點序；CPO / 光通訊強化眾達-KY、前鼎；機器人 / 自動化強化亞德客-KY、台灣精銳、大銀微系統、和椿。

</details>

---

## v18.0 PCB／ABF／CCL 原料供應鏈（2026-07-19）

- `PCB` 主題新增 19 檔原料與需求驗證名單，依「玻纖紗／布 → 銅箔＋高速樹脂／添加劑 → CCL → ABF 載板／PCB／耗材」呈現；南亞只列一次，但保留跨玻纖布、環氧樹脂、銅箔與 CCL 的垂直整合位置。
- 第一組缺料／漲價主軸依使用者研究順序列出台玻、富喬、金居、雙鍵、國精化；第二組為南亞、長興；第三組以台光電、台燿、欣興、南電、景碩、尖點驗證下游需求。這些順位只安排研究時間，不進交易雷達分數。
- 延伸名單納入建榮、德宏、榮科、永光、奇鈦科、聯茂；搜尋標籤新增 `PCB／ABF／CCL原料`、`PCB玻纖布`、`PCB高階銅箔`、`高速CCL樹脂` 與 `高階CCL`。
- 台積電主題新增 `封測（台積電相關）` 子分類，共 13 檔：日月光投控、京元電子、力成、欣銓、矽格、台星科、精材、超豐、頎邦、南茂、福懋科、華東、華泰。此標籤表示封測／測試研究池，不代表各公司已揭露台積電營收占比或直接供應關係。
- 官方核對入口優先連回公司或交易所資料，例如[台玻纖維事業](https://www.taiwanglass.com/about.php?sid=2)、[南亞電子材料](https://www.npc.com.tw/j2npc/zhtw/prodcate/Electronic%20Material)、[建榮](https://ic.tpex.org.tw/company_chain.php?stk_code=5340)、[德宏](https://ic.tpex.org.tw/company_list.php?stk=5475&stkName=%E5%BE%B7%E5%AE%8F&t=company_product)與[國精化產品頁](https://www.qualipoly.com/zh-tw/product.html)。規格認證、AI 營收純度、缺料／漲價、M7／M8／M9 對應仍需用法說、年報、月營收與第二來源持續複核。
- 銅箔卡加入 `RTF／VLP → HVLP1 → HVLP2／3 → HVLP4` 研究階梯，但明示規格升級不等於獲利必然上升，仍須追蹤認證、良率、產能與產品組合。Extension 與 Web App 共用同一面板；Web 仍遵守 `same-origin-snapshot-only`，不額外跨站抓取。

## v17.9 收盤後同步與資料可靠度中心（2026-07-18）

- 使用者主要情境改為「收盤後研究」：開啟 App 只讀本機快取，停用開頁雷達跨站更新、盤中 5／10／15 分鐘定時更新與開啟後背景完整更新；Web 仍只讀 GitHub Actions 同來源延遲快照。
- 頂部更新入口只保留「收盤後同步」：先等待報價、TWSE／TPEx 官方估值、市值與全部日線完成；其他資料以最多兩路背景佇列執行，避免 15 個來源同時送出請求。
- 背景 TTL 任務包含大盤、期貨、總經／VIX、Tide、法人前 10、法人近 30 日、處置／注意、除權息、月營收、ETF NAV、主動 ETF 持股、美債燈號、記憶體與股利。月營收只有預期公告月份尚未取得時才下載；Podcast、新聞、SBL 與深度法人回補維持使用時才抓。
- 新增 `app_files/update_reliability.js`：按來源記錄 `lastAttempt`、`lastSuccess`、HTTP、bytes、latency、連續失敗、錯誤分類與 `nextRetryAt`；可辨識 rate limit、timeout、HTTP、network、schema、no-data、runtime boundary。
- 來源連續三次「可重試」失敗才開啟 circuit breaker；只暫停該來源，並在資料健康中心提供解除入口。背景 retry 使用 exponential backoff + jitter，避免失敗來源形成重試風暴。
- 更新按鈕收斂不影響研究功能導覽：大盤總覽、主題總覽、量化篩選、個股研究、個股營收、技術分析與籌碼、標的找尋、處置、除權息、新聞、總經、Podcast、資料健康與版本共 13 個分頁全部維持直接可見；資料健康頁先顯示覆蓋率與失敗摘要，來源明細、效能診斷、版本日誌與來源表再按需展開。

## v17.8 AWS 供應鏈與來源分層（2026-07-18）

- 新增獨立 `AWS 供應鏈` 主題，依晶片／ASIC、ODM／AI 伺服器、電源、網通、散熱、PCB、CCL／PCB、機構件與 BBU 九個環節整理 11 檔：世芯-KY、緯穎、光寶科、智邦、奇鋐、邁科、金像電、高技、勤誠、AES-KY、順達。
- 2026-07-17 收盤已逐檔用 [TWSE](https://www.twse.com.tw/zh/)／[TPEx](https://www.tpex.org.tw/zh-tw/) 官方日成交資訊核對，11 檔均與使用者輸入一致；每張卡保留可直接開啟的個股官方價格連結。
- AWS 營收占比與 2027E EPS 沒有附公司法說或券商原始報告，統一標成「使用者研究快照／待複核」，不進交易雷達分數；邁科、高技、順達未提供 EPS，畫面顯示「未提供」，不把缺值視為低風險。
- 為避免主題總覽再度變亂，卡片首層只顯示供應環節、7/17 收盤、AWS 占比與 2027E EPS；來源、客戶集中／預估落空風險及四個核對入口預設收合。既有 01–22 主題編號維持不變，AWS 放在 23。
- Web App 仍採 `same-origin-snapshot-only`：公開網站只重新讀取 GitHub Actions 延遲快照；Extension 才能依 host permissions 跨站更新。兩者能力不同，不能把 Web 的跨站限制誤判成單一 parser 故障。

## v17.7 顯示與執行效能優化（2026-07-17）

- Extension 與 GitHub Pages Web App 共用的設備股卡改成「關鍵數字先看、說明按需展開」：六檔卡片保留股價／累計營收／EPS 脫鉤狀態與個股研究按鈕，研究論點、風險及四個核對連結收進可觸控展開區。390px 手機畫面改用三欄指標，實測六張卡的收合高度上限為 464px。
- 脫鉤卡的詳細判讀與下一步預設收合，警示標題與三個比較值仍直接可見；所有官方與第二來源連結仍保留安全的新分頁屬性，不因收合而移除。
- 個股營收頁改為分段渲染：先顯示營收儀表板與核對連結，下一個畫面週期載入公司體質快篩，再下一個週期載入供應鏈動能，降低切入分頁時的同步長任務與手機滑動卡頓。
- 月營收歷史整理新增以資料物件身分失效的 bounded cache；同期間股價比較由每次複製、過濾、排序整份日線，改為單次掃描與 240 組 bounded cache。設備股缺日線時改用單次批次 hydration 佇列，避免六卡重複排程。
- 重型卡片使用 `content-visibility: auto` 與 intrinsic size，瀏覽器可略過螢幕外繪製。回歸測試新增收合數、卡片高度、content visibility、快取命中與營收分段狀態 gates。
- 32-file Pages artifact 完整 project-subpath smoke 通過：app shell 1,627ms（預算 2,500ms），六檔設備股、全分頁、手機導覽、外部連結、PWA 同來源快照與既有資料品質 gates 均為 `ok:true`。

## v17.6 股價 × 基本面脫鉤檢查（2026-07-17）

- 設備股卡與一般「公司體質快篩」新增同期間的股價／基本面比較。累計營收以同月份集合計算；股價採前一年底到最新累計營收月份月底，避免拿不同期間硬比。
- 警示規則不把單一數字當結論：股價漲幅至少 70%，且比目前較強的累計營收／EPS 成長再高 40 個百分點，才標「股價明顯領先基本面」；股價先大幅領先營收、但 EPS 預估可能解釋時，改標「獲利假設待驗證」。缺任一關鍵資料則顯示待補，不視為低風險。
- 六檔設備股的 2026 上半年漲幅已用 TWSE／TPEx 官方日成交資訊核對：[京鼎 +19.1%](https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20260601&stockNo=3413&response=json)、[帆宣 +101.5%](https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20260601&stockNo=6196&response=json)、[萬潤 +174.2%](https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=6187&date=2026%2F06%2F01&id=&response=json&type=Monthly)、[鴻勁 +88.9%](https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20260601&stockNo=7769&response=json)、[中砂 +92.2%](https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20260601&stockNo=1560&response=json)、[昇陽半導體 +78.1%](https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20260601&stockNo=8028&response=json)。依目前使用者提供的 2026E EPS 與官方累計營收，帆宣、萬潤、中砂觸發明顯領先；昇陽半導體為股價領先營收、EPS 預估待驗證；京鼎與鴻勁未觸發。
- 警示會要求回查 EPS 是否上修、毛利率／營益率、訂單、產能與比較基期；這是估值與市場預期的風險提示，不等同基本面造假、確定賣出訊號或投資建議。手機版維持單欄卡片、可讀的三欄數字與安全官方來源連結。

## v17.5 台積法說後設備股研究 / 手機 PWA（2026-07-17）

- 「台積電相關」主題新增法說後設備股研究卡：京鼎 3413、帆宣 6196、萬潤 6187、鴻勁 7769、中砂 1560、昇陽半導體 8028；六檔均可搜尋、進個股研究，並納入「法說後設備觀察」子分類。
- 事件日期已校正：台積電 2Q26 法說已於 2026-07-16 結束。專區顯示公司官方 2Q26 實績（營收 US$40.20B、毛利率 67.7%、營益率 60.3%）與 3Q26 展望（營收 US$44.6–45.8B、毛利率 65–67%），原始資料見 [TSMC 2Q26 Results](https://investor.tsmc.com/english/quarterly-results/2026/q2)。
- 截圖中的 115 年 6 月單月／累計營收年增，已逐檔與 [TWSE 上市公司月營收 API](https://openapi.twse.com.tw/v1/opendata/t187ap05_L) 及 [TPEx 上櫃公司月營收 API](https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O) 核對，四捨五入後一致。截圖未附券商原始報告，因此本益比、2026E EPS 與成長率仍標為「使用者研究快照／待複核」，不進交易雷達分數。
- 法說後「台積整理 → 設備股波動放大 → 台積與設備重新轉強」只作待回測的情境假設；鴻勁「兩項市占逾五成」也維持待公司法說或公開說明書逐項核對，不包裝成確定事實。
- 手機版預設收合統計、股池與持股管理，只保留品牌、搜尋與可橫滑主題列；「主題 / 股池」按鈕可隨時展開。表格與研究流程支援觸控橫滑，設備股卡改為單欄、44px 觸控目標與兩欄來源連結。
- Web runtime 不再等待檔案同步 timeout；設備股的 Yahoo、TWSE / TPEx、官方月營收與 MOPS 連結均使用安全原生新分頁。390×844 Playwright 實測 console 0 error / 0 warning，TWSE 京鼎連結可開新分頁且原 App 保留。
- 瀏覽器 smoke 新增六檔 universe / theme / card / source / safe-link / mobile collapse gate；除權息 fixture 改用動態未來日期，避免測試日期過後出現假失敗。32-file Pages artifact 與完整 project-subpath smoke 均通過。

## v17.4 Web 快照邊界 / Chrome CORS 修正（2026-07-14）

- 實際在 GitHub Pages 用 Chrome 長時間驗證時，發現畫面雖能讀到快照，仍會啟動 extension 專用的 TAIFEX、Fed、Cboe、TPEx、Tide 等背景更新鏈，造成大量 CORS `Failed to fetch` 與重試。
- 公開 PWA 現在採 `same-origin-snapshot-only`：瀏覽器只讀同網域的 `data/live_market.json`，跨站行情由公開成品倉庫的 GitHub Actions 約每 15 分鐘產生；Pages 成品 CSP 也收斂為 `connect-src 'self'`，整套部署不需要 Cloudflare。
- Chrome extension 保留原本的 host permissions、background service worker 與跨站更新功能；Web runtime 的限制不會停用 extension 的資料更新能力。
- 網頁版「智慧更新」改名為「重新讀取快照」，extension 專用的完整跨站更新按鈕會明確標示並停用；TWSE、TAIFEX 與其他原始來源連結仍可安全開新分頁交叉核對。
- 新增瀏覽器回歸 gate：檢查 Web runtime 政策、啟動期間零跨站資料嘗試、網頁控制項狀態與同來源快照可讀，避免 CORS 重試風暴復發。

## v17.3 GitHub Pages 延遲快照 / 安全外部連結 / 自動發布（2026-07-13）

- 公開網站的大盤行情改讀同來源 `data/live_market.json`，不再從 iPhone / iPad / Chrome 網頁直接跨站呼叫 Yahoo、TWSE 或 TAIFEX，避免瀏覽器 CORS 造成整排 `Failed to fetch`。
- 公開成品倉庫的 GitHub Actions 約每 15 分鐘執行固定來源快照器；TWSE 官方優先，Yahoo 提供市場線圖，TAIFEX 失敗時才使用 CMoney 固定頁面備援，來源不一致會標待複核。
- 快照器拒絕任意 URL，只允許 HTTPS 固定 host/path、GET / POST 白名單、16 KB request body、15 秒 timeout、8 MB response 與禁止 redirect，避免把排程做成公開 proxy 或 SSRF 入口。
- 網頁版來源連結改回原生 `<a target="_blank" rel="noopener noreferrer">` 行為；extension 保留 `chrome.tabs.create`，兩種 runtime 不再共用會失敗的假 tabs adapter。
- 私有原始碼 Actions 通過靜態、隱私與瀏覽器 smoke gate 後，以單一公開倉庫 deploy key 自動發布 32 檔 allowlist artifact；公開倉庫使用最小 `pages: write` / `id-token: write` 權限部署。
- 排程可能被 GitHub 延遲，網站清楚標示「非逐筆即時行情」、快照產生時間與行情更新時間；交易判讀仍需開官方 / 第二來源交叉核對。

## v17.2 大盤作戰中樞 / 雷達採信層 / YouTube 線型框架（2026-07-09）

- 盤前作戰中樞：大盤第一屏改成四步驟摘要——大盤風險、今日主線族群、目前族群、目前個股；點主線族群可切主題，點「個股研究 / 線型籌碼」可回單檔，讓大盤 → 族群 → 個股的切換邏輯固定。
- 摘要優先載入：資料健康、Tide、更新流程、結算提醒、概念輪動與法人排行改為「載入完整大盤面板」後才渲染；今日快訊、持股作戰室、今日族群與產業趨勢雷達也跟著按需載入，避免切回大盤時同步鋪滿重面板。
- 急殺雷達採信層：新增「可採信 / 低信心 / 不採信舊快取」判斷；當覆蓋率低、資料過期或自動更新失敗時，不把總分包裝成今日訊號，並提示先智慧更新或重新抓取雷達。
- 主題 regime 短效快取：作戰中樞與產業趨勢雷達共用 1.8 秒短效計算結果，減少同一次切頁重複計算造成的卡頓。
- YouTube 心法資料層：新增 Gooaye 頻道層部位 / 風控框架與理財達人秀 EBCmoneyshow 線型 / 量價 checklist；皆為 Tier 3 metadata-only / framework-only，需指定影片逐字稿與官方 / 第二來源交叉比對後才能升級信心，不直接進交易雷達加權。
- 版本一致性：`APP_VERSION`、manifest、`main.html` 與 bundled `data/state.json` / `state_core.json` 頂層 version 同步為 `17.2`，避免內建 seed 顯示舊版造成混淆。

## v17.1 30% 年增門檻 / 利空判斷框架 / 持股調整（2026-07-07）

- 持股調整（使用者指定）：持股 seed 改為指定 16 檔——金寶 2312、華通 2313、台積電 2330、南亞科 2408、大立光 3008、欣興 3037、穩懋 3105、健策 3653、貿聯-KY 3665、廣明 6188、台燿 6274、台表科 6278、光聖 6442、均華 6640、緯穎 6669、尖點 8021；移除舊 seed 的 0050 / 00981A / 光寶科 2301 / 台達電 2308 / 奇鋐 3017 / 聯亞 3081 / 達明機器人 4585 / 啟碁 6285。⚠️ 這是「新安裝 / 重置」的預設；若你的 extension 已存舊持股，請在持股管理移除那 8 檔，或重置後套用。
- 30% 年增門檻（影片 youtu.be/CogGe_rVfV8 概念，台灣上市櫃平均年增長約 30%）：新增 `thirtyPercentGrowthCheck()`——**營收年增 ≥ 30% 且 獲利（EPS）年增 ≥ 30%** 才算「贏過平均的高成長」。
  - 營收儀表板直接給「有沒有成長」一句話：≥30%＝有成長、0–30%＝成長但未達門檻、≤0＝沒有成長（衰退）；並列綜合（營收 + 獲利）判定。
  - 公司體質快篩新增「30% 年增門檻」卡：營收年增 ✓/✗、EPS 年增 ✓/✗、綜合（雙軌達標 / 單軌 / 未達 / 衰退）。營收年增取累計年增優先、EPS 年增用研究欄位 2025→2026E。
- 利空 / 回檔判斷框架（影片 youtube b5jM_x7dQbo 概念）：公司體質快篩底部新增框架提示——不能只看營收成長或股價回檔就買賣，遇利空 / 回檔要先判斷**利空是否真的破壞未來獲利**（改變成長假設），還是短線題材 / 情緒 / 一次性因素；給三個檢查點（未來假設是否被砍、結構性 vs 可回復、估值是否已反映最壞），三者都指向「未來獲利未被破壞 + 估值回到買進帶」時回檔才是機會。
- Smoke coverage：持股 seed 16 檔（portfolio gate 24→16、移除 0050 / ETF 專屬斷言）、30% 門檻卡與營收「有沒有成長」gate（fixture 33% 達標）、利空判斷框架 gate。
- 萬元股候選：⚠️ 待與你確認定義（股價可望破萬的高價候選？名單來源？）後再入觀察名單（見 TODO v17.1）。

## v17.0 大改版：資訊分層（大盤 / 今日族群 / 單一族群 / 個股）（2026-07-07）

- 使用者回饋：extension 把個股、族群、大盤的東西混在一起，很亂。v17 把資訊依「由大到小」分層，打開先看大盤 → 今日族群 → 單一族群 → 個股：
  - **大盤總覽（全市場 + 今日族群）**：把原本散在「主題總覽」的全市場 / 跨族群面板集中過來——今日操盤手快訊、持股作戰室、今日族群｜類股概況（點卡片可篩該主題並切到主題總覽）、產業趨勢雷達；既有大盤 / 急殺雷達 / Tide 板塊 / 期貨 / 法人排行不變。
  - **主題總覽（只看左側選取的單一族群）**：移除今日快訊 / 持股作戰室 / 今日族群 / 產業雷達 / Tide 等全市場面板，只保留左側主題（02–22）對應的個股卡片、排行、技術排行、快照，以及該族群專屬框架（記憶體報價 / 金融股 / 好老闆 / 退休 / 美債情境）。頂部加註「只顯示左側選取的單一族群」。
  - **量化篩選 / 個股研究 / 技術籌碼 / 個股營收**：本來就依左側選取的族群 / 個股連動，維持不變。
  - 操作動線：打開 → 大盤總覽（大盤 + 今日哪個族群強）→ 左側切到想看的族群 → 主題總覽看該族群 → 點個股 → 個股研究 / 營收 / 技術。
- 營收儀表板欄位順序修正（使用者回饋）：月營收明細表欄位由「月份 / 營收 / YoY / MoM / 3月均YoY」改為符合閱讀習慣的「月份 / 營收 / MoM 月增 / YoY 年增 / 3月均YoY」（月增緊接月份、再年增）；季表 QoQ / YoY、年表 YoY 維持；月 → 季 → 年由上而下依序顯示。
- Smoke coverage：v17 分頁分層 gate（大盤含 todaySignals / portfolio / themeSummary / themeRegime 且有內容、主題總覽不再含這些全市場容器、無載入失敗）；Tide gate 移除 overview 半段（已集中大盤）；持股作戰室與產業趨勢雷達 gate 改指向大盤總覽。

## v16.10 優化（2026-07-06）

- 合理本益比價位估算（使用者問：怎麼評估合理 PE 落在哪個價位？要用河流圖嗎）：個股營收「公司體質快篩」新增「合理價估算（EPS × PE 情境帶）」卡——低 / 中 / 高 = EPS × PE×0.75 / 1.00 / 1.25（就是河流圖 PE band 的概念，只是用當前 EPS × 歷史 PE 區間算成三個價位），並標情境買進帶（中性價 ×0.85–0.92）與目前價位落在買進 / 中性 / 減碼哪一帶。**答**：不需要另外開河流圖網站，工具已內建同概念的 PE 情境帶；河流圖適合看「歷史 PE 區間」長相，本工具的情境帶則直接把它換算成可操作價位，兩者互補。複用個股研究既有 `buildValuationPriceModel` 引擎、口徑一致。
- 風險報酬比 R:R（使用者需求：加入風險報酬比因子）：同卡新增「風險報酬比 R:R」——R:R = 潛在漲幅 ÷ 潛在跌幅（進場參考 / 停損 / 目標由技術面 playbook 推定），一般研究上 ≥ 2R 才值得參與；複用個股研究既有 `buildTradePlan`（量化篩選也用同一引擎）。
- 先探講堂族群框架融入（使用者提供蔡明翰 2026-07-06 分析）：新增研究標籤可搜尋——記憶體封測（南茂 8150 / 福懋科 8131）、先進封裝前測試（矽格 6257 / 京元電 2449 / 欣銓 3264）、BBU 三雄（新盛力 4931 / 順達 3211 / AES-KY 6781，法人認同純度高）、BBU 概念（全漢 3015 / 新普 6121 / 加百裕 3323 / 西勝 3625，基本面較弱）。新增缺漏股福懋科 8131 / 捷敏-KY 6525 / 加百裕 3323 / 西勝 3625 / 新盛力 4931 / 順達 3211；封測歸記憶體主題、BBU 電池歸 AI Server 散熱 / 電源主題。
- Smoke coverage：公司體質快篩合理價帶 + R:R 卡 gate、先探族群標籤（bbuTrio / memoryOsat）與主題歸類（4931→thermal、8131→memory）、新股 universe。

## v16.9 優化（2026-07-06）

- 除權息日曆全市場（使用者回饋：除權息檔數太少、只抓股池無法找新標的）：TWSE / TPEx 官方預告 parser 移除「只留追蹤股」過濾，改為**全市場**（未來兩個月數百檔），追蹤股以 ★ 高亮；新增「全市場 / 僅追蹤股」範圍切換鈕；日曆與清單、行為分析可看非追蹤股（清單前 150 筆、行為分析前 80 檔）。
- 處置日曆修正（使用者回饋：日曆有一堆 `(../../mainboard/...)` 連結、位置要置頂）：新增 `sanitizeSecurityName()` 清掉 TWSE 新官網名稱欄位夾帶的相對路徑 / markdown / HTML 語法（除權息名稱同步套用）；處置頁把「正常交易推定日曆」移到注意風險面板**之上**，比照除權息一目瞭然。
- 公司體質快篩（使用者回饋：個股營收判斷指標太少）：個股營收分頁新增「公司體質快篩」卡，全部用本機既有資料——估值（官方 PE / 近四季殖利率 / 累計營收年增）、獲利三率（毛利 / 營益 / 淨利 + 與前季 ▲▼）、籌碼（法人近 5 / 10 日 + RS vs 加權 65 日）、股利體質（連續配息 / 近 5 年均現金殖利率 / 業外檢查）；缺項標「待補 / 待更新」不留白，金融股與 ETF 有專屬邊界提示。
- 「高風險 UI 健康檢查」改名「資料就緒檢查（debug）」並從大盤頁移到「說明 & 版本日誌」分頁效能診斷下方——它只是檢查各畫面依賴資料是否抓齊的除錯工具，與買賣判斷無關，放大盤頁造成混淆。
- 股池擴充（使用者兩批匯入，去重後歸類 03–16，無法歸類放 21 其他觀察）：新增八方雲集 2753、長興 1717、毛寶 1732、泰博 4736、信紘科 6667、東洋 4105、台灣虎航 6757、騰雲 6870、元太 8069、永道-KY 6863、邁達特 6112、晶華 2707，及「台灣世界第一」清單缺漏的可成 2474、巨大 9921（捷安特）、美利達 9914。長興 / 信紘科→材料耗材（PCB 主題）、永道-KY→網通，其餘無明確主題歸 21 其他觀察。
- Smoke coverage：除權息全市場 gate（未追蹤股 9988 保留 + tracked=false + ★ + 範圍切換隱藏）、`sanitizeSecurityName` 消毒 fixture、公司體質快篩卡 gate、新股池 universe 檢查。

## v16.8 優化（2026-07-05）

- 更新入口整併（使用者回饋：一下完整更新一下快速更新一下雷達更新，太亂）：
  - 頂部主鈕「快速更新」改為「**智慧更新**」：一鍵更新即時報價，並自動依 TTL 判斷哪些來源過期需要抓——大盤、期貨、總經 / VIX、Tide、法人前10、處置注意股、除權息日曆、月營收（內建公告月份判斷）、ETF NAV、記憶體報價共 11 項全部納入，仍新鮮的自動略過；完成後狀態列明講「更新了哪些、略過哪些」。
  - 「完整更新」保留為第二顆（強制全部重抓，含日線 / 股利 / 法人30日 / ETF 持股）；兩顆按鈕 tooltip 重寫，分工明確。
  - 面板內的散落更新鈕（更新大盤 / 期貨 / 總經 / Tide / 記憶體…約 20 顆）全部保留為「局部重抓」用途，但因智慧更新已涵蓋，日常不需要再逐顆按。
  - 背景自動化不變且持續有效：雷達開大盤頁 TTL 自動更新、記憶體每日快照、Tide 30 分鐘 TTL、啟動延遲批次載入。
- Smoke coverage：智慧更新 gate（按鈕文字 / tooltip、任務清單涵蓋 11 個來源、每個任務具 ttl / timestamp / run）。

## v16.7 優化（2026-07-04）

- 營收 5 年比較（使用者需求：要跟過去 5 年比 YoY / MoM / 季增 / 年增，寫出趨勢）：
  - 「回補 5 年營收（Yahoo）」按鈕：一鍵抓 Yahoo 個股月營收頁（2026-07-04 實測內嵌近 60 個月完整欄位：單月營收 / 月增 / 去年同月 / 年增 / 累計 / 累計年增），Tier 2 資料、既有 MOPS 官方月份優先保留，重疊月份差異 > 2% 會計數標待複核；歷史上限 36 → 72 個月。MOPS 官方歷史彙總（`nas/t21` 與 `ajax_t05st10_ifrs`）2026-07-04 再測仍被 WAF 擋，維持無官方回補端點結論。
  - 儀表板升級：36 個月長條圖、**季營收表（近 8 個完整季：QoQ 季增 / YoY 年增）**、**年營收表（近 5 年年增；未滿年以「去年同月份集合」口徑避免比到不完整年度）**、**歷年同月比較（看季節性）**、**「趨勢判讀」一句話**（月 YoY 連 N 月方向 + 最新季 QoQ / YoY + 年累計年增 → 成長且動能上行 / 放緩 / 衰退收斂 / 衰退）。
- 市場風險雷達全面翻修（使用者需求：每次都長一樣不對、過熱與急殺重複要合一）：
  - **合而為一**：「市場過熱 / 回檔風險」併入急殺雷達成單一「市場風險雷達（急殺 × 過熱）」——大分數 = 一週內急殺共振；慢性過熱降為面板內折疊「慢性過熱 / 回檔風險溫度計」（分數 + 主要升溫因子 + 完整因子群組明細保留），大盤頁不再有兩個重疊面板。
  - **連續計分**：七個急殺因子從粗階梯門檻（平靜盤勢下多數因子恆為 0，分數數學上必然天天一樣）改為 piecewise-linear 連續計分，分數隨台指期跌幅、VIX、法人賣壓張數、融資水位百分位等實際數值每日微動；因子卡一律顯示當前數值，不再只寫「未觸發」。
  - **雷達日誌與對照**：每日自動記一筆分數 / 因子快照（上限 120 筆、persist 進本機 state 不會因重開而消失），面板顯示分數 sparkline、「與昨日 Δ ±x.x」與變動最大因子；沒有昨日紀錄時退而與「今日首筆」比較；若真的完全相同會明講「輸入值未變（來源尚未發新資料），請看各因子 asOf」，把「長一樣」變成可解釋狀態；因子卡並列昨日分數。
  - **歷史回推（不用等累積）**：雷達分數本來就是即時輸入算出來的；趨勢線改用本機已有的 TAIEX 日線（6 個月）、追蹤池日線與 VIX 120 天序列**逐日回推過去約 90 天的分數**（技術乖離 / 廣度 / 加權跌幅 / VIX 子集，約佔全因子權重 4 成、口徑已在 UI 標示），打開第一天就有整條趨勢線，實錄全因子日誌逐日覆蓋其上；缺昨日實錄時 Δ 對照也會退用昨日回推值（標「口徑不同僅供參考」）。「趨勢線累積中」的空窗畫面自此消失。
- Smoke coverage：Yahoo 月營收 parser 確定性 fixture（60 月欄位順序、416,975,163 / +1.52% / +30.09%）、儀表板季 / 年 / 同月表列數與趨勢判讀 gate、`crashRiskRamp` 線性內插確定性斷言、雷達日誌 Δ fixture（昨日對照 +2.5 / 因子 Δ +1.5、今日首筆 fallback）、合一結構 gate（雷達內含溫度計、全頁僅一個過熱面板）。

## v16.6 優化（2026-07-04）

- 記憶體報價趨勢強化（使用者需求：記憶體重點是趨勢）：
  - 新增 TrendForce `flash/flash_spot` NAND 公開表抓取（2026-07-04 實測 HTTP 200、欄位與 DRAM 三表同形）：NAND Flash 現貨（SLC / MLC）、NAND 合約摘要（每月底更新，細項需會員）、Wafer 現貨（512Gb / 256Gb / 128Gb TLC）；DRAM 抓取失敗才整體失敗，NAND 失敗只記 errors 不擋 DRAM。
  - 每日自動快照：啟動後與快速 / 完整更新的背景排程會每天自動抓一筆記憶體報價（台北曆日判定、一天最多一次），趨勢線不再依賴使用者剛好開記憶體面板才累積。
  - 記憶體面板新增 NAND 現貨 / Wafer 與 NAND 合約兩張表、NAND 512Gb TLC Wafer 與 MLC 64Gb 現貨計量卡與趨勢 sparkline、「NAND 現貨 / Wafer」交易映射列（群聯 / 旺宏 / 威剛 / 十銓 / 創見）。
  - 來源連結列補齊：TrendForce NAND Flash Price、DRAMeXchange、TrendForce Press Center（漲跌原因 / 供需新聞）、Stanford DAM 長期 $/GB 歷史（Tier 3、零售最低價口徑非合約價，適合看歷史週期）。
- 個股營收儀表板（使用者需求：所有投資都要有數字、一目瞭然）：「個股營收」分頁上半改為本機 MOPS 官方數字優先——近 24 個月營收長條圖（紅柱 YoY 正成長 / 綠柱衰退、hover 看數字）、近 12 個月明細表（營收 / YoY / MoM / 3月均YoY）、YoY 連 N 月正成長（衰退）chip、3 月 YoY 動能差 chip；外部連結降為深入 / 交叉核對用。歷史由每月更新累積（上限 36 個月；MOPS 歷史彙總檔 2026-07-04 實測被 WAF 阻擋、無官方回補端點，更長期趨勢用財報狗 / Goodinfo 連結）。
- 供應鏈拉貨動能 proxy（使用者需求：供應鏈拉貨期）：新增全主題面板（台積電 / CPO / PCB / 先進封裝 / 網通 / 記憶體 / 散熱電源 / 重電 / IC 設計 / EMS / 機器人 / 被動元件），每主題計算「當月 YoY 轉正家數比率 + YoY 中位數」月度趨勢與近 13 月 sparkline；多檔同月轉強＝拉貨期啟動的研究 proxy，非買賣訊號；樣本 < 4 檔標樣本不足；資料全部來自本機 MOPS 官方月營收。
- Smoke coverage：NAND parser 確定性 fixture（現貨 29.068 / +3.14%、Wafer 20.069 / −1.77%、合約 26.508 / +9.73%、updatedAt / period 斷言）、營收儀表板 synthetic fixture（14 個月 YoY 連正、動能差 +3 pt、12 列明細、長條 SVG）、拉貨動能 fixture（記憶體主題 4 檔樣本、轉正比率 75%）、schema normalize 舊快取防禦斷言。

## v16.5 優化（2026-07-04）

- 資訊減噪「摘要優先、詳表按需」補完三分頁（延續 v15.7–v16.0 模式）：
  - 催化劑 & 新聞：初始畫面只保留熱門新聞即時列表與「個股快速入口」（TWSE 資訊揭露、Google / 鉅亨 / Goodinfo 新聞、財報狗），完整連結入口（公告 / 法說除息 / 財報 / 新聞搜尋 / 董監 / 外部線圖 / 媒體清單）改按「載入完整連結入口」後顯示。
  - 總體經濟與風險：初始畫面保留總經來源稽核、Fed 政策路徑、USD/TWD、總經快照與全市場融資 / 融券水位；風險矩陣、財報行事曆、回測排名、指數成分股同步、儲存層管理與官方 / 交叉比對來源卡改按「載入詳細面板」後顯示。
  - 標的找尋：初始畫面保留篩選摘要、外資連續買超與左側 / 右側 / 避開清單前 5 檔；「勝率 proxy / 歷史校準」與每張清單前 12 檔完整詳表改按「載入完整詳表」後顯示。
  - 載入詳表後在同一分頁維持顯示（背景資料更新重繪不會洗回摘要），切換分頁後回到摘要優先初始畫面。
- 重複指標稽核擴充（canonical placement）：同一指標只在一個 canonical 分頁完整呈現——全市場融資 / 融券水位、財報行事曆、風險矩陣在總經分頁；外資連續買超、勝率 proxy 在標的找尋分頁；smoke 新增跨分頁 canonical placement audit。同步移除永遠不會執行的舊「催化劑與風險」死碼（其融資券 / VIX 連結入口與總經分頁、急殺雷達重複）。
- 外部來源列統一：催化劑 & 新聞與熱門新聞面板的散落 link-chip 全部改走 `renderExternalSourceLinks()` 統一樣式（`data-external-source-links` context 可稽核），連結一律開新分頁、以原站資料為準。
- host_permissions 稽核：移除只作外部連結、不再本機抓取的 host（`statementdog.com`、`etfedge.xyz`、`www.dramexchange.com`、`www.trendforce.com.tw`、cloudfront Podcast CDN 舊項）；純連結開新分頁不需要 host 權限。仍在抓取路徑上的 host（主動式 ETF 持股快照來源 MoneyDJ / ETF資訊網 / WantGoo / Investing / CMoney / Pocket、TrendForce DRAM 現貨、Anue API、投信官網群等）全數保留。
- Smoke coverage：新增減噪 gate（三分頁 compact / detail 斷言 + 初始 textLength 預算：催化劑 1200 / 總經 12000 / 標的找尋 16000）、canonical placement audit；標的找尋 gate 改為「載入完整詳表」後斷言勝率 proxy 面板與歷史校準。

## v16.4 優化（2026-07-03）

- 除息行為分析新增「填息 proxy」：逐次除息事件計算「除息日起第 N 個交易日收盤 ≥ 除息前收盤」（Yahoo 未還原收盤、Tier 2；掃描上限 60 個交易日），研究口徑取 20 個交易日內填息。表格新增「填息 / 息前20日」欄，顯示 20 日內填息次數 / 樣本數與填息平均日數；「近五年除息日開盤紀錄」逐次同步標注 N日填息（紅）/ 20日內未填息（綠）/ 填息觀察中。
- 除息行為分析新增「除息前 20 日弱勢震盪統計」：逐次事件統計除息前 20 個交易日累計漲跌幅與收黑日數並取平均，作「買黑不買紅」分批研究參考。歷史統計非預測、非買賣建議。
- 殖利率欄新增「近 3 年平均現金殖利率」並列近 5 年均（口徑一致＝各曆年股利合計 ÷ 該年日收盤均價取平均，僅含現金股利）；近五年官方 TWT49U 有除權（股票股利）事件者標注「均值僅含現金股利」；多年殖利率以明細表 Goodinfo 股利政策連結交叉核對，不一致以待複核處理。
- 樣本不足標示強化：開盤傾向樣本 < 3 次與填息樣本 < 3 次都會標「樣本不足」，只作研究統計不作訊號；綜合傾向 tooltip 的研究提示加入填息統計。
- 除權息分頁修復：修正 v16.3 迭代殘留舊 schema 分析快取造成整區「此區塊載入失敗（undefined.map）」；normalize 層補齊缺欄位預設值，舊快取不需清除即可正常顯示。
- Smoke coverage：新增 28 根 K 的填息 / 息前20日確定性 fixture（填息第 3 日、息前累計 -3.85%、黑K 20 日）、既有年配開高 fixture 補填息與近 3 年均殖利率斷言、legacy 舊 schema record gate、DOM gate 檢查「填息 / 息前20日」表頭與口徑註解。

## v16.3 優化（2026-07-02）

- 新增「個股營收」分頁（頂部導覽、個股研究旁）：輸入股號或點目前持股，一秒前往月營收 / 三率 / EPS / 股利外部頁面。連結涵蓋 MOPS 官方、財報狗、玩股網 WantGoo、Yahoo 台股與 Goodinfo，URL 樣式已於 2026-07-02 逐一驗證；本機已有月營收 / 三率快取時同頁顯示（含來源與更新時間），缺資料只顯示連結、不顯示空表。MacroMicro 無可驗證的個股營收頁，不列入。
- 除權息分頁新增「除息行為分析」：按需逐檔分析近五年除息日開盤 vs 除權息參考價（還原權息口徑），表格顯示股利內容（現金 / 股票股利、現金發放日）、殖利率（本次 / 官方近四季 / 近5年平均現金殖利率含逐年明細 tooltip）、配息頻率與「連 N 年配息」、每次開高 / 開低與漲跌幅、綜合傾向、業外檢查（本機三率 proxy：稅後淨利率 ≥ 營益率標「疑有業外」＝假配息風險初篩）。研究口徑與來源 / 核對改為表格下方註解——歷史多開高 → 可研究除息前弱勢分批（買黑不買紅）至最後買進日；歷史多開低 → 研究上傾向不參與除息。統計為研究排序與風險提示，非買賣建議；樣本不足會明確標示。
- 除息行為資料來源：Yahoo Finance 股利事件 + 日線開盤（Tier 2）為主；上市股以 TWSE `TWT49U` 除權除息計算結果表（官方前收 / 參考價）交叉核對，上櫃股因 TPEx 無官方歷史端點一律標「待複核」。分析結果含完整 provenance（source / sourceTier / asOf / fetchedAt / confidence）並快取 7 天。
- 除權息明細表新增「最後買進日（估）」欄（除權息日前一交易日；僅排除週末、未扣國定假日，UI 有標示）與「殖利率」欄（本次現金股利 ÷ 最新報價的單次口徑，並列交易所官方近四季殖利率對照，兩者口徑不同已標注）。
- 除權息語意文案明確化：分頁說明與日曆標題改為「標示日＝除權息交易日：當天開盤參考價已扣股利（機制性下修，不是下跌訊號）；參與配息最晚需在前一交易日買進」。
- 除權息交叉核對連結擴充：逐檔加 Goodinfo 股利政策 / 除權息日程；底部來源列加 TWSE 除權除息計算結果表與玩股網除權息行事曆（`https://www.wantgoo.com/stock/ex-dividend`）。
- 急殺風險雷達新增「關鍵利空檢查」：利空一「維持高利率（≥5% 警戒）」以 CME FedWatch 最近會期隱含政策利率判斷（Tier 2 市場預期，附 FedWatch 核對入口）；利空二「外資大量賣超」以官方 T86 前 10 法人排行 proxy 與外資大台淨部位判斷（≤ −30,000 張警戒、≤ −12,000 張留意）。兩者為警示顯示，不改雷達計分權重。
- 急殺風險雷達新增「月份季節性參考」折疊區：近10年還原加權指數各月平均漲跌幅（1–12月，6 / 7 月為除權息行情月份、歷史均值最高 +2.96% / +3.38%），突顯本月；來源為使用者提供之財經週刊簡報整理（Tier 3，⚠️ 待複核、不併入雷達分數）。
- 急殺風險雷達首次開啟修正：大盤頁為作用中分頁時，啟動期間不再等 15 秒啟動預算，約 1.2 秒後即自動更新雷達輸入資料；若偵測到雷達輸入完全缺資料則立即更新，修正「一開始連線雷達不更新、只顯示舊快取」問題。
- 除權息分頁新增「真假高殖利率股檢核」折疊表：績優高殖利率股（本業穩定、配發率一致、歷年皆高殖利率 → 可研究參與除權息）vs 一次性高殖利率股（一次性業外、僅今年高配、過往殖利率偏低 → 除息前賺價差 / 不參與）；含工具對應入口（個股營收分頁、Goodinfo 股利政策）。來源為使用者提供之簡報整理（Tier 3 研究框架）。
- 標的找尋新增「外資連續買超」面板：依本機三大法人日資料列出外資連續 ≥ 3 個交易日買超的追蹤股（連買天數、期間累計張數、最近資料日），作為趨勢資金 proxy 研究排序；明示不是買進訊號，並附 TWSE T86 / TPEx 官方核對連結。
- Smoke coverage：新增 revenue tab gate（五組連結來源 URL 樣式、輸入框、無 MacroMicro 個股連結）、除權息新欄位 gate（最後買進日 / 殖利率表頭、行為分析面板與按鈕、真假高殖利率檢核）、`estimateLastBuyDateKey` 週末回推 fixture、除息行為 synthetic fixture（年配開高傾向含「買黑不買紅」提示、上櫃單樣本開低傾向含「待複核」與樣本不足）、雷達關鍵利空檢查與月份季節性 gate、外資連續買超 synthetic fixture（4 日連買 540 張）。

## v16.2 優化（2026-07-01）

- 台灣用語整理：目前使用者可見文案統一使用「更新、初始畫面、儲存、資料、前往、完整更新」等台灣慣用詞；已移除不合台灣慣用的舊詞。
- 夜盤連結修正：來源 chip、台指期夜盤卡片與外部來源列改走專用開新分頁流程，CMoney TXF1 與 WantGoo WTXP 點擊時會直接開新分頁；全頁 `<a>` 不再被整批攔截。
- 急殺雷達效能調整：自動更新 TTL 從 5 / 15 分鐘放寬為盤中 15 分鐘、非活躍時段 60 分鐘；背景自動更新改為分批執行，且批次期間不重複重繪大盤頁。
- 過期快取防呆：大盤 dashboard、總經 TWSE 指數與 TAIFEX 期貨若是舊快取，會改成待更新 / 待複核，不再把 4 萬點或舊期貨水位放進急殺雷達。
- 期貨口徑修正：台指期卡片分開列全市場未平倉、外資多方 / 空方 OI 與外資淨未平倉，避免把八萬多口 OI 誤讀成外資淨空單。
- VIXTWN 來源整合：風險情緒核對入口加入 WantGoo VIXTWN、MacroMicro 台灣 VIXTWN 與永豐 VIXTWN 說明；目前作第二來源核對，不直接作交易結論。
- UI 微調：急殺雷達「重新抓取雷達」按鈕字級放大，較容易點選。
- Smoke coverage：新增 TXF inline link 點擊會走外部連結 handler 的 gate，並把雷達文案 gate 改為「雷達自動更新」。

## v16.1 優化（2026-06-30）

- 急殺雷達重做更新邏輯：大盤總覽開啟時會自動用 TTL 輕量抓「大盤 / 夜盤 / 美股、TAIFEX 期貨 / P-C、總經 / VIX / 融資、三大法人前 10」並重新計算雷達，不再只顯示舊快取的新鮮度提示。
- 快取優先加速：初始畫面先用已存最佳資料渲染，背景資料抓回後自動重繪雷達；線上來源失敗時保留快取並顯示部分失敗，不要求每次手動完整更新。
- 雷達面板新增「雷達自動更新」狀態 chip 與「重新抓取雷達」按鈕；手動重新抓取只更新雷達必要輸入，不跑完整日常更新。
- 台指期夜盤第二來源位置再修正：CMoney TXF1 與 WantGoo WTXP 直接顯示在「台指期夜盤｜TXF」卡片標題下方的超連結 chip，位置在台股大盤卡下方、道瓊工業指數左邊那張卡片內。
- Smoke coverage：新增 TXF inline card links、急殺雷達自動更新狀態與重新抓取按鈕 gate。

## v16.0 優化（2026-06-30）

- 初始畫面加速：啟動時不再等待 `research_data.json`、同步資料夾與 IndexedDB 業績資料層全部載入完成；核心 state 先渲染，業績資料層完成後只重繪需要月營收 / 三率的作用中分頁。
- 主題總覽減噪：持股區預設只顯示作戰摘要、資料覆蓋、均線風控、營收動能與資料缺口提示，不再一開始鋪滿月營收 / 三率逐檔診斷、持倉損益表與倉位試算。
- 持股詳表按需載入：新增「載入持股詳表」gate，點擊後才產生月營收缺口診斷、三率缺口診斷、持倉損益總覽與倉位計算器。
- 台指期夜盤第二來源位置修正：TAIFEX 官方盤後交易頁仍是 canonical link；CMoney TXF1 `https://www.cmoney.tw/forum/futures/TXF1?s=p` 與 WantGoo WTXP `https://www.wantgoo.com/futures/wtxp&` 保留在「台指期夜盤｜TXF」market card 的行情來源列，不放在擁擠的頂部期貨水位列。
- 急殺風險雷達新鮮度：面板新增「資料新鮮度」chip；若來源日期不是今天，會標示昨日資料或過期天數，避免舊快取看起來像每日更新結果。
- 日曆多檔顯示：除權息 / 處置股日曆同一天超過 4 檔時，日期格會顯示總檔數，`+N` 會列出額外代號並提供完整 tooltip。
- 勝率 proxy 邊界：標的找尋的候選卡改名為「勝率 proxy / 歷史校準」，不再使用外部節目或機構作來源品牌；Podcast transcript 不用來產生個股勝率。
- 效能診斷保留：業績資料層載入狀態寫入 performance state，方便後續判斷是 seed、IndexedDB、同步檔或 render block 造成延遲。
- Smoke coverage：web smoke 更新 holdings gate，先確認初始持股詳表 gate 存在，再點擊載入並驗證 24 檔月營收 / 三率診斷仍完整；shell gate 固定檢查 CMoney TXF1 / WantGoo WTXP 深連位於 market card，不在頂部期貨列；除權息 gate 增加同日多檔 overflow 檢查。

## v15.9 優化（2026-06-28）

- TXF 夜盤連結修正：台指期夜盤超連結改指向 TAIFEX 官方 `AfterHoursSession/EquityIndices/FuturesDomestic` 盤後交易股價指數期貨頁，不再只丟到行情首頁。
- 外部資料連結規範：新增共用 `renderExternalSourceLinks()`，只接受 http/https、會去重並加上 smoke 可檢查的 `data-external-source-links`。
- Tide 來源就近顯示：Tide 板塊資金潮汐標題列新增 Tide 原站，摘要旁顯示 `daily_brief.json`，情緒快照旁顯示 `daily_digest.json`，並保留 TWSE / TPEx 官方三大法人核對入口。
- 行情卡來源列一致化：台指期夜盤 / 日盤備援 / CMoney 備援都使用同一組來源連結；Market index 卡統一顯示「行情來源 / 核對連結」。
- Smoke coverage：web smoke 會檢查 TXF 是否為 TAIFEX 夜盤深連，也會檢查 Tide full / compact 面板都有 Tide、`daily_brief.json`、`daily_digest.json`、TWSE 與 TPEx 連結。

## v15.8 優化（2026-06-28）

- 籌碼卡再合併：technical tab 初始畫面移除「個股籌碼強弱」卡，保留單一「技術 × 籌碼決策摘要」作為籌碼與技術的主判讀入口，減少融資 / 外資 proxy 重複顯示。
- 詳細籌碼按需載入：新增「載入詳細籌碼」按鈕；點擊後才 render 資料覆蓋、Chip Score 分項、三大法人多週期表、融資券、TDCC、TAIFEX 與 SBL 詳細段落。
- 共用 chip context：新增 `buildChipDecisionContext()`，決策卡共用同一份大戶、散戶與過熱 / 深跌 derived context，降低 compact 初始畫面的重複計算與口徑漂移。
- Tide 快取摘要：主題總覽 Tide 面板不再主動觸發 refresh，只讀既有快取 compact summary；大盤總覽與手動「更新 Tide」仍保留完整更新。
- Smoke coverage：web smoke 新增 lazy details / compact gate，確認初始 technical tab 有載入按鈕、沒有預設渲染個股籌碼強弱卡，也沒有三大法人多週期完整表。

## v15.7 優化（2026-06-28）

- 技術 / 籌碼切頁加速：`renderInstitutionalTab()` 新增 compact mode，technical tab 初始畫面不再同步產生多週期法人表、逐日明細、融資券、TDCC、TAIFEX 與 SBL 詳細段落。
- 指標收斂：保留「技術 × 籌碼決策摘要」、個股籌碼強弱、Chip Score 摘要、漲跌停鎖單、來源入口與成本 / 提醒；資料覆蓋卡、Chip Score 分項、重複量價教學與 detailed chip table 改為不預設載入。
- Tide 去重：主題總覽改顯示 compact 情緒 / 板塊摘要，完整 Tide 排行只放在大盤總覽，避免兩個首頁分區重複鋪同一組第三方 proxy。
- 來源邊界保留：這次是 UI / DOM 收斂，不刪原始資料與核對入口；交易判讀仍須回 TWSE / TPEx / MOPS / TAIFEX 或第二來源複核。
- Smoke coverage：web smoke 新增 technical compact gate，確認初始 technical tab 有「籌碼明細已收斂」提示，且不載入三大法人多週期完整表。

## v15.6 優化（2026-06-28）

- Tide 情緒快照：延伸 v15.5 Tide 整合，新增 `daily_digest.json` parser，讀取 panic index、極端情緒標籤、上漲 / 下跌家數與下跌占比。
- 避風港 / 逆勢承接：顯示 Tide digest 的 safe harbor 板塊與 1 日法人買超，輔助觀察下跌日資金是否轉向防守或低接板塊。
- 法人異常個股：顯示 abnormal buy、abnormal sell 與連續買超名單；正向資金仍用台股紅色，負向資金仍用綠色。
- 來源邊界：Tide panic index 是第三方情緒 proxy，不直接併入 Market Heat Score；UI 標示待複核，並保留 Tide、TWSE T86 與 TPEx 三大法人日報入口。
- Smoke coverage：web smoke 的 Tide gate 擴充到 digest parser / UI，確認 panic index、避風港、異常買賣與 `daily_digest.json` 連結存在。

## v15.5 優化（2026-06-27）

- Tide 網頁解析整合：新增「Tide 板塊資金潮汐」面板，讀取 Tide 公開 JSON 的板塊法人資金流向、每日摘要與 asOf / fetchedAt。
- 資金排序：顯示 5 日法人買超、5 日法人賣超、逆勢買超 / 避風港與 20 日累積買超板塊；正向資金採台股紅色、負向資金採綠色。
- 來源邊界：Tide 標示為 Tier 2 第三方市場資料 / proxy，不作官方結論；面板提供 Tide 原站、TWSE T86 與 TPEx 三大法人日報核對入口。
- 快取控制：extension 只儲存摘要與來源診斷，不打包 Tide 完整 `latest.json`；30 分鐘 TTL，按鈕可手動重新抓取。
- Smoke coverage：web smoke 新增 synthetic Tide parser / UI gate，確認板塊排序、待複核文案與來源連結存在。

## v15.4 優化（2026-06-25）

- 除權息日曆：新增獨立分頁，以 TWSE TWT48U 與 TPEx `tpex_exright_prepost` 顯示追蹤股 / ETF 未來兩個月的除權息交易日。
- 日期定義：日曆標示股價參考價調整的交易日；不以董事會決議日、股東會日或現金股利入帳日替代。
- 交叉核對：官方日期為 canonical source，每筆另提供 Yahoo 台灣與鉅亨網入口；來源錯誤會保留並標示待複核。
- 記憶體報價：主題面板明示自動追蹤狀態，進入記憶體主題後優先背景更新 DDR4 / DDR5 公開報價。
- 速度改善：主題總覽較重區塊拆成多批渲染；研究框架與分類稽核保持立即可用，退休情境、排行、一般個股卡片與快照延後載入。
- TXF 直連：期貨水位列新增「台指期夜盤 TXF」超連結，直接開啟 TAIFEX 官方即時行情。

## v15.3 優化（2026-06-24）

- 現行方法收斂：量化篩選、個股研究、技術與籌碼畫面移除 v8.x–v13.x 並列標題，版本差異只保留在 changelog。
- 長期業績資料層：新增 `data/research_data.json`，集中儲存現行方法、月營收、營收歷史、季報三率與 cache policy。
- 增量快取：業績資料會儲存到 IndexedDB；設定 `data/` 後另同步 `research_data.json`，避免每次啟動依賴大型 `state.json`。
- 月營收去重：日常完整更新若已有預期公告月份或最近 6 小時已檢查，會沿用快取；手動更新可強制重新抓取。
- 資料狀態透明化：持股作戰室明示月營收為官方資料自動解析、季報三率為 CSV 匯入，並顯示基線 / IndexedDB / data 同步狀態。

## v15.2 優化（2026-06-22）

- AI factory 研究地圖：新增核心10、Energy + Infrastructure、AI factory 零組件重估鏈、台積電外溢鏈、Models + Applications、下一波三層與未發酵 10 方向標籤。
- 優先級 1–7：大電流連接 / busbar / 線纜、AI rack 機櫃 / 整櫃工程、高速 CCL / PCB / 背板材料、功率元件細分、rack telemetry / sensor、enterprise SSD / AI storage、AI 應用 / 工業 AI。
- 功率半導體邊界：被動元件延伸區新增純 MOSFET、功率元件平台、HVDC / SiC / GaN 待複核、Driver IC 非 MOSFET、PMIC 非 MOSFET，並補入 朋程 作車用整流二極體 / HVDC 待複核。
- 新增觀察股 metadata：凡甲、AES-KY、迎廣、南俊國際、安碁資訊、叡揚、敦陽科、醫揚、長佳智能與慧榮（海外上市 / quote-disabled）等會進入對應主題與搜尋標籤。
- Smoke coverage：分類稽核 smoke 新增 AI factory labels、優先級代表股、未發酵方向、MOSFET 排序、HVDC / Driver IC / PMIC 邊界與新股 metadata 檢查。

## v15.1 優化（2026-06-21）

- 季財報三率資料層：新增 `financialRatioMeta` 與三率 CSV parser，可吃「公司代號、期間、營業收入、營業毛利、營業利益、本期淨利」或已計算的毛利率 / 營益率 / 淨利率欄位。
- 持股三率缺口診斷：持股作戰室新增「三率缺口診斷」表，逐檔顯示三率三升 / 三率三降 / 三率分歧、最新三率、較前季變化、來源與原因 / 下一步。
- 金融 / ETF 邊界：金融股不套製造業毛利率，改看資本適足、RBC / BIS、逾放比、覆蓋率、淨利差、承保損益與 ROE / PBR；ETF 仍標示不適用。
- 匯入入口：診斷表提供「匯入三率 CSV」與 MOPS `t163sb04` 財報入口；本版先完成可靠匯入與判讀層，不把月營收替代三率。
- Smoke coverage：web / extension smoke 新增季報三率 parser fixture，驗證 6669 兩季資料可判成「三率三升」，並檢查三率診斷表列數與匯入入口。

## v15.0 優化（2026-06-21）

- 持股月營收缺口診斷：持股作戰室新增「月營收缺口診斷」表，逐檔列出已取得、缺月營收、尚未更新、ETF / 不適用，並顯示月份、當月營收、YoY / MoM、來源與原因 / 下一步。
- ETF 邊界：ETF / 基金不公告公司月營收，診斷表會明確標成「ETF / 不適用」，避免誤判為月營收抓取失敗；ETF 仍應改看 NAV、折溢價、成分持股、費用率與配息來源。
- Smoke coverage：web 與 extension context smoke 都新增診斷表 gate，檢查「月營收缺口診斷」、逐檔列數、ETF 不適用、MOPS `t187ap05` 來源與原因欄位。
- Release gate：保留真實 Chrome unpacked extension reload QA，需在 `chrome://extensions` 重新載入後確認 v15.0、持股診斷表、月營收更新與 6669 持股流程。

## v14.9 優化（2026-06-20）

- 月營收來源修正：月營收改以 MOPS 官方 open data `t187ap05_L.csv` / `t187ap05_O.csv` 為 canonical source；TWSE / TPEx OpenAPI 只作備援，避免 OpenAPI 端點失效時整批缺資料。
- 缺資料診斷：新增 `revenueMeta`，儲存來源筆數、錯誤、目前持股缺資料清單與缺資料原因；持股營收卡會顯示 MOPS 來源摘要。
- 持股加入 UX：輸入既有持股（例如 `6669`）時，狀態列會明確顯示「已切換到目前持股」，並保留目前持股篩選與選取狀態。
- 法人 / 產業報告入口：個股研究頁新增公開研究入口，包含 WebPro / 公司 IR、法說簡報、出貨量、訂單能見度、交期 / lead time、法人報告片段與產業報告搜尋。
- Smoke coverage：新增 MOPS 月營收 CSV parser fixture、6669 UI 加入 / 切換持股流程與 MOPS 來源文字檢查。

## v14.8 優化（2026-06-20）

- 持股營收動能：持股作戰室新增「持股營收動能」卡，優先顯示目前持股的月營收 YoY / MoM、連三月改善或轉弱與缺資料狀態。
- 月營收 provenance：TWSE / TPEx OpenAPI 月營收更新會儲存 `yearMonth`、來源、來源層級與 fallback 狀態，避免把抓取時間誤當營收月份。
- 三率三升邊界：三率三升需季財報毛利率、營益率與淨利率；目前先在 UI 標示「三率待補」，不以月營收替代三率結論。
- Smoke coverage：持股作戰室 smoke 新增營收卡與三率邊界檢查。

## v14.7 優化（2026-06-19）

- 金融股獨立股池：左側新增「金融股」主題，位置放在「防守現金流」上方，收錄富邦金、國泰金、中信金、兆豐金、玉山金、第一金、合庫金、元大金、臺企銀、新產。
- 好老闆邊界修正：金融股不再出現在「好老闆」候選分組與候選 CSV；好老闆保留制度型經營、保守直接、少畫餅、技術壁壘與財務紀律公司。
- 金融股專屬面板：選取「金融股」時顯示獨立研究框架、子分類、複核優先、主要風險、官方核對入口與「匯出金融股 CSV」。
- 存股池去混淆：「防守現金流」與「退休核心」移除金融股，只保留 ETF、電信與防守型配息個股；金融股若作存股研究，改由獨立金融股面板判讀。
- Smoke coverage：web smoke 新增 financials gate，並檢查好老闆 panel 不含金融股、金融股不混入防守現金流或退休核心、左側序號為「15. 金融股」「16. 防守現金流」。

## v14.6 優化（2026-06-18）

- 候選分組：好老闆候選池曾新增分組摘要，將原本科技 / 工業 / 製造候選與新金融股候選分開看；v14.7 起金融股已拆為獨立股池。
- 金融股候選：新增富邦金、國泰金、中信金、兆豐金、玉山金、第一金、合庫金、元大金、臺企銀、新產。
- 金融複核框架：金融股不以毛利率判斷，改看資本適足 / RBC / BIS、逾放比、覆蓋率、承保損益、股利能力、壽險匯率避險與法遵風險。
- 候選 CSV：候選匯出新增「候選分組」欄位，方便匯出後單獨篩金融股。
- Smoke coverage：good boss gate 擴充檢查候選分組、金融股、RBC / BIS 文案與十檔金融候選代碼。

## v14.5 優化（2026-06-18）

- 候選擴充池：好老闆面板新增待複核候選清單，收錄聯發科、聯詠、亞德客-KY、旭隼、信邦、儒鴻、精測、華碩、和碩。
- 候選邊界：候選不列入核心好老闆股池；每檔都標示待複核候選、候選型態、為何候選、主要風險、來源註記與官方核對入口。
- 複核優先：候選池依資料覆蓋、fallback、風險等級與複核項目產生高 / 中 / 低優先級，避免把尚未驗證的管理品質當成結論。
- 候選 CSV：新增「匯出候選 CSV」，輸出候選狀態、複核優先分、風險等級、複核項目、下一步規則、候選理由與官方連結。
- Smoke coverage：good boss gate 擴充檢查候選擴充池、待複核候選、匯出候選 CSV 與九檔候選代碼。

## v14.4 優化（2026-06-18）

- 經營品質矩陣：好老闆面板新增文化、接班、資本配置、技術壁壘、坦率度五軸研究分。
- 複核優先級：結合風險等級、資料覆蓋、fallback 與使用者研究註記，標示高 / 中 / 低複核優先。
- 操盤下一步：每檔顯示 1-2 條下一步規則，例如估值提前反映、資本支出、客戶集中、殖利率外推或毛利率驗證。
- CSV 匯出：新增「匯出好老闆 CSV」，輸出研究分、五軸檢核、資料覆蓋、複核項目、下一步規則、列入理由、風險與官方核對入口。
- Smoke coverage：good boss gate 擴充檢查經營品質矩陣、匯出按鈕、研究分、複核優先與 CSV 相關文案。

## v14.3 優化（2026-06-17）

- 好老闆主題：左側新增「好老闆」，收錄台積電、大立光、致新、台達電、研華、川湖。
- 專屬研究表：選取好老闆主題時，主題總覽新增「好老闆研究框架」表格，顯示治理型態、為何列入、主要風險與核對入口。
- 分類語意：好老闆主題拆成制度與接班 / 長期規劃、保守直接 / 少畫餅、技術壁壘 / 財務紀律。
- Provenance：使用者提供的 EPS、配息、公司治理評鑑等數字只作研究註記，UI 明確要求回 MOPS / 年報 / 法說 / 官方公告交叉複核。
- Smoke coverage：web smoke 新增 good boss gate，確認左側 filter、股池管理選項、好老闆 panel、六檔股票、MOPS 核對入口與卡片清單都有渲染。

## v14.2 優化（2026-06-17）

- 盤前主線行動佇列：產業趨勢雷達新增 action queue，依 regime、score、confidence、缺資料與持股曝險產生主線候選、升溫觀察、持股風控、不追價、降權觀察與補資料排序。
- 持股曝險接入：每個主題 row 會標示目前持股曝險檔數與持股清單，避免只看產業分數而忽略倉位集中。
- 主線 CSV：新增「匯出主線 CSV」，輸出行動分類、優先分、Regime、輪動、confidence、持股、覆蓋率、缺資料、領漲候選、弱勢待修復與行動口徑。
- Smoke coverage：web smoke 擴充 theme regime radar gate，檢查盤前主線行動佇列、匯出主線 CSV 與 action rows 渲染。

## v14.1 優化（2026-06-17）

- 產業趨勢雷達：主題總覽在類股概況下方新增 regime 面板，整合報價廣度、日線 MA20 / MA60、RS、月營收中位 YoY、Chip Score、法人偏買與主動 ETF 共識。
- Regime 分類：依 score 與廣度拆成主升擴散、升溫、擁擠過熱、洗盤修復、盤整輪動、退潮與資料待補，並顯示下一步操作口徑。
- 產業內拆解：每個主題顯示領漲候選、弱勢 / 待修復、資料覆蓋率、最新日期、缺資料欄位與 confidence，避免只看單一漲跌幅。
- 模組化：新增 `app_files/theme_regime.js`，把主題 regime scoring 從 `main.js` 拆出為可重用純彙總模組。
- Smoke coverage：web smoke 新增 theme regime radar gate，確認產業趨勢雷達、Top 6、Regime、輪動型態、資料信心、領漲候選與弱勢待修復都有渲染。

## v14.0 優化（2026-06-16）

- 批次補資料佇列：補資料優先清單上方新增操作入口，依目前 worklist 自動彙整補報價、補日線、補月營收、補估值、補籌碼與分類待複核項目。
- 目標股限制：報價、日線、估值、籌碼補資料只處理 worklist 前 24 檔高優先標的，避免每次操作都重跑全股池。
- 既有流程接線：補報價沿用單檔官方報價 / 估值流程；補日線沿用日線更新；補估值沿用 TWSE / TPEx 官方估值與市值級距；補籌碼沿用三大法人、融資券、外資持股與 TDCC。
- Smoke coverage：classification audit UI gate 新增批次補資料佇列與補報價 / 補日線 / 補月營收按鈕檢查；驗證不點擊更新按鈕，避免 smoke 觸發網路抓取。

## v13.9 優化（2026-06-16）

- 補資料優先清單：分類稽核表上方新增 worklist，依分類待複核、缺報價 / 日線 / 月營收 / 估值 / 法人 / 融資券、fallback 與 low confidence 加權排序。
- 下一步行動：每列顯示具體補資料動作，例如先跑報價更新、補日線、補月營收、補估值或回 MOPS / 法說確認分類。
- Worklist CSV：新增「匯出補資料清單 CSV」，輸出優先級、優先分、缺口、下一步與官方核對入口。
- Smoke coverage：classification audit UI gate 同步檢查補資料清單、主要缺口、下一步與 worklist 匯出按鈕。

## v13.8 優化（2026-06-15）

- 主題分類稽核表：主題總覽新增 Goodinfo-style 分類稽核，逐檔標示核心 / 延伸 / 待複核、主題子分類、分類理由、資料覆蓋與 confidence。
- 官方核對入口：每檔提供 TWSE / TPEx 基本資料與 MOPS 月營收 / 財報入口；ETF 則優先顯示投信官方或 TWSE ETF e添富入口。
- CSV 匯出：新增「匯出分類稽核 CSV」，輸出完整目前主題 / 搜尋範圍，不受畫面前 24 檔限制。
- Smoke coverage：web smoke 新增 DOM gate，檢查分類稽核表、MOPS / 官方核對入口與匯出按鈕存在。

## v13.7 優化（2026-06-15）

- YouTube 心得資料層：新增 `data/youtube_market_lessons.json`，Podcast 頁優先讀取此 seed；若檔案缺失才回到內建 fallback。
- 本機轉錄摘要 pipeline：新增 `scripts/update_youtube_market_lessons.py`，支援 `--transcript 影片ID=檔案`、`--audio 影片ID=音檔 --transcribe-backend auto`、`--check`；摘要只輸出分類後的 signals / cross-checks / provenance，不把完整逐字稿打包進 extension。
- UI provenance：Podcast YouTube panel 顯示資料層來源、generatedAt、pipelineStatus、影片 confidence、transcriptStatus 與建議交叉比對項。
- Smoke coverage：web smoke 持續檢查 YouTube panel，並要求資料層 / pipeline / 交叉比對文案存在。

## v13.6 優化（2026-06-14）

- YouTube 股市心得來源卡：Podcast 頁新增使用者指定影片區，收錄 Gooaye 股癌 EP670 / EP669、李兆華River 週報 ep259 與 Gooaye channel 入口。
- 轉錄狀態防呆：三支影片皆無公開字幕，本機 macOS Speech 轉錄未完成；UI 明確標示 `low / metadata-only`、`待轉錄` 與 `待複核`，不把未核實影片內容當成交易結論。
- 方法論映射：暫時只把可驗證的 metadata / 描述線索映射到大盤位置、台指期夜盤、投信買盤、部位控管、AI 過熱回撤與事件前規劃，後續需逐字稿與 TWSE / TAIFEX / 法人資料交叉比對後才能升級。
- Smoke coverage：web smoke 新增 Podcast YouTube panel gate，檢查 Gooaye、EP670、EP669、43000、待轉錄、metadata 與交叉比對文案。

## v13.5 優化（2026-06-14）

- 總經來源稽核：總經頁頂部新增 source audit panel，集中列出會影響 Market Heat、Fed regime 與風險矩陣的來源層級、asOf、fetchedAt、confidence、fallback 狀態與核對入口。
- 來源分層防呆：官方來源（Federal Reserve、U.S. Treasury、Cboe、CBC、TWSE）與市場預期來源（CME FedWatch）分開顯示；CME 快取 fallback 會標示「快取待複核」，不會包裝成最新官方資料。
- 缺資料透明：若 FedWatch、SEP、USD/TWD 或 TWSE 融資券尚未抓到，來源稽核表會列為待更新，避免缺資料被誤解成低風險。
- Smoke coverage：Fed policy synthetic gate 同步檢查總經來源稽核 panel，確認 CME FedWatch fallback 會出現在稽核表。

## v13.4 優化（2026-06-14）

- CME FedWatch fallback：CME 即時端點失敗時，若 7 天內有最近一次成功解析的 FedWatch 快取，總經頁會暫用該快取、降為低信心並顯示「快取 / 待複核」，避免整個 Fed path 因 CME timeout 消失。
- Fed policy gap 趨勢：`macroCache.history` 會保留 FedWatch 隱含年末利率、Fed SEP 本年中位數與市場-Fed 落差摘要；總經頁新增「政策落差趨勢」表，判斷市場相對 Fed 更鴿 / 更鷹 / 變化不大。
- Market Heat 延續：使用即時 FedWatch 或近期快取時仍可計算 Fed 政策落差，但 fallback 會明確降信心並要求人工核對 CME；若沒有可用快取，仍列為缺資料而不是低風險。
- Smoke coverage：Fed policy synthetic gate 加入 fallback 與 trend 檢查，驗證總經頁顯示「政策落差趨勢」「市場相對 Fed 更鴿」與 CME 快取狀態。

## v13.3 優化（2026-06-14）

- FedWatch × 點陣圖：總經頁新增 Fed policy path 面板，分開顯示 CME FedWatch 市場預期、Fed SEP / dot plot 官方參與者評估、兩者的年末政策利率落差與台股資產映射。
- Policy gap 接入 Market Heat：若 CME FedWatch 與 Fed SEP 都可解析，會把「市場比 Fed 更鴿 / 更鷹」的落差轉成總經 / 外部風險因子；若 CME 失敗，只標示待複核，不把缺資料當低風險。
- Fed SEP parser：自 Fed FOMC calendar 找最新 projection materials accessible version，解析 federal funds rate median、central tendency、range 與可用的點陣圖分布；目前 fallback 為 2026-03-18 Fed SEP。
- 來源分層：Fed SEP / FOMC / H.15 屬官方來源；CME FedWatch 屬市場預期來源；MacroMicro / Investing 仍只作圖表與日曆交叉比對。
- Smoke coverage：`scripts/web_context_smoke.mjs` 新增 synthetic Fed policy regime gate，驗證總經頁 FedWatch × 點陣圖面板與 Market Heat 的 Fed 政策落差因子。

## v13.2 優化（2026-06-09）

- 左側分類重整：參考 Goodinfo 的類股 / 概念股掃描邏輯，把分類從單純主題清單推進到可掃描、可待複核的多層股池。
- 拆分散熱與重電：`散熱 / 電源 / 重電 / 電網` 改為 `AI Server 散熱 / 電源` 與 `重電 / 電網` 兩個主題。
- 拆分現金流：`防守現金流` 與 `景氣高息觀察` 分離，航運 / 航空 / 循環高息不再混入退休核心。
- 股池增減：新增 PCB 待複核 3715 / 5469 / 5439、記憶體待複核 3006 / 5351 / 6485、CPO 光通訊 4977 / 4908、機器人自動化 1590 / 4583 / 4576 / 6215；被動元件主題移除 2308 台達電。
- Smoke coverage：`scripts/web_context_smoke.mjs` 新增 classification audit，驗證重電、景氣高息、防守現金流、PCB / 記憶體 / CPO 擴充與被動元件降噪。

## v13.1 優化（2026-06-09）

- K 線 / 漲跌停定義：技術頁新增台股普通交易 10% 漲跌幅與升降單位試算，說明以當日開盤競價基準 / 參考價格為核心；142 元範例固定顯示合法範圍 128.0 至 156.0。
- 量能 Regime：新增個股 20 / 60 日相對量、近一年量能分位、成交金額、20 日均成交金額與大盤成交金額環境，避免用過去絕對張數門檻直接判讀現在台股量能。
- 個股籌碼強弱：籌碼分析頂部新增融資增減、融資使用率、融券增減、券資比、法人 5 / 20 日合計、Chip Score、大戶 / 散戶 proxy 與來源日期。
- 載入編排：技術頁共用同一輪 `calculateTechnical()` 結果，新增卡片只吃既有 state / 日線 derived data，不新增啟動網路抓取流程。
- Smoke coverage：`scripts/web_context_smoke.mjs` 新增 technical education gate，檢查 K 線 / 漲跌停卡、量能 Regime 卡、個股籌碼強弱卡，以及 142 元試算函式回傳 156 / 128。

## v13.0 優化（2026-06-07）

- 版面載入加速：將原本內嵌在 `main.html` 的大型版本日誌抽到 `app_files/changelog.html`，只在開啟「說明 & 版本日誌」時 lazy load；`main.html` shell 從約 247KB 降到 124.6KB。
- Hidden tab 降負擔：主要分頁容器加入 layout / paint containment 與 `content-visibility`，降低瀏覽器初次排版與隱藏分頁重排成本。
- Release gate 收緊：`scripts/web_context_smoke.mjs` 新增 `main.html < 160KB` 與 `appShellMs < 2500ms` gate，並驗證 changelog lazy load、v13.0 日誌、全頁重複稽核與效能診斷面板。
- 驗證結果：standard web smoke 通過，回報 `appShellMs=1200ms`、`mainHtmlBytes=124555`、`changelogLazy=loaded`、duplicateAudit `ok=true`。
- 真實 extension context：CLI extension-context smoke 仍受目前 `x86_64 / osx-64` Rosetta 限制；最後仍需在 Chrome UI 重新載入 unpacked extension 後人工比對 IndexedDB / `chrome.storage` 快取。

## v12.9 優化（2026-06-07）

- 全頁重複稽核：`scripts/web_context_smoke.mjs` 會掃主要分頁的標題與 label，排除表格 / 重複卡片 / 來源與資料日期等合理重複，其他疑似重複會讓 smoke fail。
- 效能診斷面板：說明頁新增 `v12.9 效能診斷`，顯示 state seed 載入時間、active tab render 時間、`calculateTechnical()`、`filteredStocks()`、搜尋 cache hit / miss，以及最慢前 10 個 render block。
- 低風險拆分：新增 `app_files/performance_diagnostics.js`，先把 diagnostics helper 從 `main.js` 拆出；本版不改資料抓取流程。
- 真實 extension context：web smoke 已通過；CLI extension-context smoke 仍受目前 `x86_64 / osx-64` Rosetta 環境限制，最後仍需在 Chrome UI 重新載入 unpacked extension 後人工比對。

## v12.8 優化（2026-06-07）

- 籌碼重複提示收斂：技術 × 籌碼決策摘要主卡只保留一列「籌碼心態」，大戶 / 散戶 / 連買賣 / 投信認養 / 借券回補 / 鎖單強度集中到可展開拆解區，避免同一張卡重複顯示。
- 載入速度加速：`calculateTechnical()` 對同一檔同一批日線加入 signature cache，切換主題、量化篩選、今日變化摘要與技術排行時不再反覆重算日線 derived signals。
- 熱度訊號重用：個股過熱 / 深跌訊號會沿用同一輪已算好的大戶 / 散戶訊號，避免技術 × 籌碼卡內重複計算。
- Smoke coverage：web smoke 新增初始畫面時間預算、籌碼重複提示檢查與展開拆解區存在檢查。

## v12.7 優化（2026-06-06）

- 持股作戰室新增 MA5 / MA20（月線）失守警告：只要目前持股低於 5 日線或月線，就在作戰室上方直接顯示「目前有問題」。
- 警告優先於資料缺口：持股均線風控訊號會先顯示，資料補齊與熱度 / 深跌檢查改為後續卡片，避免開盤前看不到重點。
- 價位與來源透明：每檔列出目前價、對應均線、距離百分比，並標示「今日跌破」或「低於」；資料來源為本機日線 MA5 / MA20 與最新報價。
- Smoke coverage：web smoke 合成 0050 跌破 MA5 / MA20，要求 UI 顯示「均線警告」「目前有問題」與該股號。

## v12.6 優化（2026-06-06）

- Panic override：慢性平均分數之外新增硬觸發 floor。台指期夜盤 `<= -2%` 至少 78、`<= -4%` 至少 88、`<= -6%` 至少 95，避免真急殺被其他正常資料平均稀釋。
- 外部科技鏈風險：費半、NASDAQ、S&P 500、VIX 與台指期共振時直接升級；特別針對台股電子權值與 AI 高 beta 曝險。
- 籌碼與槓桿共振：外資期貨高淨空、融資高水位、法人賣壓擴散、TXO P/C 避險需求升溫會進入 hard trigger。
- 風險意識管理：新增強制風控 / 高風險控倉 / 警告 / 注意四層清單，將取消追價、停止攤平、降槓桿、保護獲利、開盤等待 30-60 分鐘結構寫成 UI 行動提示。
- 文獻映射：面板加入一週內急跌風險理論來源：Chen/Hong/Stein 2001（成交量 + 過去漲多）、Hong/Stein 2003（意見分歧與放空限制）、Brunnermeier/Pedersen 2009（流動性螺旋）、ARCH/GARCH（波動叢聚）、Pan/Poteshman 2006（期權資訊）、Kelly/Jiang 2014（tail risk）。
- Smoke coverage：新增 synthetic 台指期夜盤 `-6.68%` 測試，必須觸發 panic override 且總分 `>=95`。

## v12.5 優化（2026-06-06）

- 大盤急殺風險雷達：放在大盤總覽上方，以大紅字顯示急殺風險分數、風險等級與當下行動提示，協助先保護獲利與降低追價 / 滿倉風險。
- 大戶 / 籌碼 / 資金 proxy：整合 TAIFEX 外資大台淨空、小 / 微台非法人 proxy、TWSE / TPEx 法人前 10 賣壓、TWSE 融資水位與融資退潮。
- 乖離與廣度監控：TAIEX 20 日 / 60 日乖離、RSI、布林上緣、MACD 柱縮、追蹤池月線 / 季線廣度轉弱會一起納入急殺共振判斷。
- 資料缺口透明：若 TAIFEX、TWSE 融資、法人排行、VIX 或 TAIEX 日線不足，面板會列出缺口，不把缺資料包裝成低風險。
- Smoke coverage：`scripts/web_context_smoke.mjs` 新增大盤急殺雷達渲染檢查。

## v12.4 優化（2026-06-06）

- 無回應熱修：開啟 extension 時不再自動解析 / 合併完整 `data/state.json`；fresh profile 只讀 `data/state_core.json`，完整資料靠手動更新或既有本機快取補齊。
- 背景完整 opt-in：`背景完整` 預設關閉，避免剛開頁 15 秒後自動跑日常完整更新造成 Chrome 無回應；使用者手動開啟後仍會按原本節奏自動排入。
- 手動快路徑保留：按「完整更新」仍立即跑既有日常完整更新流程，不套用 startup 背景延遲。
- 自動更新分散：大盤、法人排行、總經、處置、記憶體報價與 Podcast 等 startup auto refresh 改成 15 秒後分批執行，避免同一秒集中 fetch / render。

---

## v12.3 優化（2026-06-05）

- 初始畫面加速：大盤、總經、處置、Podcast、記憶體報價等自動更新改為啟動後 idle 延遲，先顯示本機快取與互動畫面。
- Bundle 瘦身：`data/state.json` 的 K 線 hot cache 從 40 檔下修到 16 檔，heavy cache inline 上限從 80 檔下修到 64 檔，另新增 746KB 的 `data/state_core.json` 作為 fresh profile 初始畫面核心 seed；完整資料仍透過 IndexedDB / idle hydration / runtime 更新補齊。
- 主動 ETF seed 按需載入：大型 `data/active_twETF_weekly_snapshots.json` 不再每次開啟都排程讀取，只在 ETF 分頁或 active ETF 篩選需要時載入。
- 渲染收斂：主題卡片 window 從 120 筆降到 96 筆、量化篩選 window 從 90 筆降到 72 筆，降低大量清單初次 render 的 DOM 壓力。
- 結構盤點：目前未發現 `function` / `const` 重複宣告；主要技術債是 `app_files/main.js` 單檔過大與 tracked macOS `Icon\r` 檔案，刪檔需使用者確認後再清。

---

## v12.2 優化（2026-06-04）

- 記憶體報價中控：左側點「記憶體」後，主題總覽前段會優先顯示 DDR4 / DDR5 現貨、DRAM 合約價與模組現貨表。
- Runtime 抓價：新增 TrendForce / DRAMeXchange host permission，透過現有 background fetch helper 解析 TrendForce 公開 DRAM Price 頁；若抓取或解析失敗，顯示最後公開核對快照並標明 fallback。
- 報價趨勢線：每次更新都會把 DDR4 / DDR5 / 合約價 / 模組價 snapshot 存入 `memoryMarketCache.history`，面板用本機累積資料畫近幾筆均價線圖；剛開始只有 1 筆，需連續使用幾天後才有趨勢判讀價值。
- HBM 狀態拆分：HBM 沒有公開逐日現貨價，面板改列 HBM3e / HBM4、長約議價、產能排擠與台股映射，避免把 DDR 現貨表誤當 HBM 報價。
- 交易判讀防呆：面板把 DDR4 現貨、DDR5 合約 / RDIMM、模組現貨、HBM 狀態分開解讀；記憶體分類仍需用月營收、法說、庫存與官方公告交叉複核。

---

## v12.1 優化（2026-06-04）

- 勝率 proxy 歷史校準：Top 候選會用既有 `backtestPlaybook()`（近 1 年、2ATR 停損、3ATR 目標、20 日上限）補上歷史勝率、平均 R、樣本數與校準加減分。
- 校準邊界：這是過去 playbook 訊號的 proxy 校準，不是未來實際勝率；樣本少於 3 筆會標示樣本不足，樣本偏少時限制加減分幅度。
- 快取與速度：校準只跑前段候選並非同步排程，結果持久化到 `state.analystWinRateCalibration` 與 cache repository；reload 後可先用快取，避免每次打開標的找尋都重算。
- Worker / 共享框架：`app_files/analysis_frameworks.js` 升級到 `twstock-win-rate-proxy-v1.1`，worker 可接收 calibration map，主程式與 worker 使用同一套加減分規則。
- Native ARM QA：新增 `scripts/extension_native_arm_smoke.mjs`。若 Rosetta CLI 無法 discover unpacked MV3 service worker，可用此腳本尋找 arm64 Node 並重新跑 extension smoke；找不到時輸出 JSON 診斷，不會安裝系統依賴。

```bash
node scripts/extension_native_arm_smoke.mjs
```

---

## v12.0 優化（2026-06-04）

- 勝率研究 proxy：新增 `app_files/analysis_frameworks.js`，把研究流程抽象成「預期差 / 修正動能 / 估值與風險 / 催化劑 / 籌碼定位 / R:R / 執行紀律」；Podcast transcript 不產生個股勝率，也不代表任何個股建議。
- 標的找尋面板：新增「勝率 proxy / 歷史校準」Top 候選，列出加分因子、扣分因子、缺資料與信心等級；此分數是工具內研究排序，不是外部來源模型、實際勝率或買賣建議。
- 量化篩選欄位：新增「勝率」欄位與排序，和既有交易雷達、Setup、R:R、RS、籌碼、處置風險交叉檢查。
- Worker 實作：`app_files/perf_worker.js` 支援 `analystWinRateBatch` 與 `windowRows`，worker 不可用時主執行緒 fallback。
- P1 渲染：主題卡片與量化篩選表改為 windowed rendering；完整排序仍以全清單計算，但 DOM 一次只掛目前視窗。
- P2 架構：新增 `app_files/cache_repository.js` 作為 IndexedDB KV cache repository，先用於勝率排序結果與 health 診斷；scheduler 加入 retry/backoff 與 finished/failed 狀態。
- P0 診斷：`scripts/extension_context_smoke.mjs` 失敗時輸出 Node / OS / Chrome 架構、Rosetta translation、Chrome binary info 與手動驗證指引。
- 方法參考：CFA Institute《Equity Research Report Essentials》、FINRA Research Analyst Rules、Investor.gov Risk Tolerance / Diversification；交易資料仍以 TWSE / TPEx / MOPS 等 Tier 1 來源為準。

---

## v11.9 優化（2026-06-04）

- 重快取 hot subset v2：儲存 `chrome.storage` / `data/state.json` 時，`snapshots`、`institutional.history`、`foreignOwnershipHistory`、`tdccHistory` 與 `activeEtf.snapshots` 只保留目前持股、選取個股、目前主題與大盤等常用 subset；完整資料可由更新端點重新抓取。
- 中央排程：快速更新後的 ETF NAV、大盤、期貨、注意風險，以及 Podcast RSS 自動更新都改走同一套 scheduler，會在 `state.performance.updateScheduler` 記錄 started / skipped / failed 與 TTL。
- 渲染加速：主題總覽個股卡片與量化篩選表先渲染前 180 筆；排序與行動清單仍以完整篩選結果計算，搜尋或切左側主題可縮小結果。
- 啟動分段：K 線 IndexedDB hydration、Podcast seed、主動 ETF seed 與 Web Worker health check 都排到初始畫面後 idle 執行，降低開啟 extension 時一次做太多事的卡頓。
- Worker fallback：新增 `app_files/perf_worker.js` 與 health check；若 web / extension 環境不支援 Worker，會記錄 fallback，不阻斷 UI。

---

## v11.8 優化（2026-06-03）

- 載入加速：K 線改為 `IndexedDB + hot cache` 分層。完整 K 線優先寫入 IndexedDB，`chrome.storage` / `data/state.json` 只保留目前持股、選取個股、目前主題與大盤等常用 subset。
- 舊快取遷移：載入舊版大型 state 時會排程把完整 K 線寫入 IndexedDB，下一次儲存只留下 hot K 線，降低重開 extension 時的 JSON 解析負擔。
- Bundled state 瘦身：`data/state.json` 從約 17.5 MB 降到約 5.4 MB；K 線由 279 檔改為 38 檔 hot cache，其他資料來源仍保留原始 `asOf` / `fetchedAt`。
- 快速更新加速：報價更新後，大盤、期貨、ETF NAV 與注意風險若 5 分鐘內已更新，會略過背景重新抓取，降低外部 API 與 service worker 壓力。
- 資料安全：日線更新會等待 IndexedDB 寫入完成後再儲存瘦身 state，避免剛更新完立刻關閉時遺失完整 K 線。

---

## v11.7 優化（2026-06-03）

- 左側分類第 `03` 改為「台積電相關」；新增第 `06`「先進封裝CoWoS/CoPoS」，原第 `06`「網通 / 衛星通訊 / 量子」起全部往後順延。
- 新增玻璃基板 / GCS 觀察股：`1802` 台玻、`8027` 鈦昇、`6207` 雷科、`3583` 辛耘、`3131` 弘塑、`6196` 帆宣、`3580` 友威科、`3167` 大量、`6187` 萬潤、`3481` 群創、`6405` 悅城、`3149` 正達、`3615` 安可、`6742` 澤米、`3037` 欣興、`8046` 南電、`3189` 景碩。
- 依使用者指定新增 GCS 第一梯隊標籤：`8027` 鈦昇、`6207` 雷科、`3131` 弘塑、`3583` 辛耘。
- CoWoS 核心受惠股同步標成多重研究標籤：`2330` 台積電、`3131` 弘塑、`3583` 辛耘、`6187` 萬潤、`6640` 均華、`2467` 志聖、`2449` 京元電子、`6223` 旺矽、`6515` 穎崴、`3037` 欣興、`8046` 南電、`3189` 景碩。
- 搜尋 alias 擴充 `玻璃基板`、`GCS`、`Glass Core Substrate`、`TGV`、`CoWoS核心設備`、`CoWoS測試`、`光電玻璃加工`；同一個股可同時顯示一個以上研究標籤。

---

## v11.6 優化（2026-06-02）

- 將目前持股 preset 更新為使用者指定 24 檔：`0050`、`00981A`、`2301`、`2308`、`2312`、`2313`、`2330`、`2408`、`3008`、`3017`、`3037`、`3081`、`3105`、`3653`、`3665`、`4585`、`6188`、`6274`、`6278`、`6285`、`6442`、`6640`、`6669`、`8021`。
- 4585 依 TWSE 個股資料校正為「達明機器人」；6188 才是「廣明」。既有舊快取會套用本版 `holdingsPresetVersion`，重新載入 extension 後「目前持股」會更新。
- 主題總覽新增「持股作戰室」：顯示持股檔數、報價 / 日線 / 籌碼覆蓋率、曝險前五主題，以及優先補資料或熱度 / 深跌檢查清單。
- 初始畫面載入加速：若已有 `chrome.storage.local` 或 data 同步快取，開啟 extension 時先渲染畫面，再用 idle time 延後讀取大型 bundled `data/state.json` 補資料，降低初始畫面卡頓。

---

## v11.5 優化（2026-05-29）

- 在 v11.4 精簡上方分頁後新增 `標的找尋`，取代舊比較圖的導覽位置，用於找左側 / 右側候選與避開清單。
- `標的找尋` 採組合條件：先過濾流動性與市值，再整合 MA5/10/20/60/120/240、RSI、MACD、量能均線、ATR、布林通道、20/60/120 日高低、法人買賣超、月營收 YoY、殖利率與 AI 題材標籤。
- 左側交易偏向好公司倒楣事、回測月季線、底部翻揚與高股息低波；右側交易偏向突破整理、均線多頭排列與籌碼轉強；高風險列出量縮創高、RSI 過熱、融資偏熱、法人轉賣、跌破 20MA 放量與處置風險 proxy。
- 修正 `退休存股` 無法從股池管理新增股票的問題：HTML 下拉原本缺少 `retirement` 選項，現已補上；退休現金流頁也會納入使用者自行加入的退休標的。
- 將 `0050 元大台灣50` 加入退休存股核心台股曝險，補上 ETF 基本資訊、官方來源連結與退休現金流頁角色說明。

## v11.4 優化（2026-05-28）

- 縮減上方主分頁，避免「大盤總覽」那排因為選項增加而超出畫面；舊的 `比較圖`、`估值資料`、`快照趨勢` 分頁入口移除。
- `快照與籌碼趨勢` 併入 `主題總覽`，同一個主題頁直接看個股卡、近幾筆快照、14 日法人買賣超、外資持股累積 / 出清與 Chip Score 排名。
- `比較圖` 原頁面沒有實際內容，已從導覽與互動入口移除；舊狀態若指到 comparison 會自動回到主題總覽。
- `估值資料與假設` 獨立頁與 inline 編輯表移除；交易所 PE / PBR / 殖利率資料層保留，仍供個股研究、交易雷達、市場熱度與股利 / 估值卡使用。
- `技術排行` 從 `技術分析 & 籌碼` 移到 `主題總覽` 的 `主題技術排行`，讓族群掃描與單檔研究分開；技術分析頁只看目前選取個股。
- 快捷鍵同步重排：`Cmd/Ctrl + 6` 處置股、`7` 催化劑、`8` 總體經濟與風險、`0` 說明。

## v11.3 優化（2026-05-28）

- 技術分析新增 `月季年乖離`：同時計算 MA20（月線）、MA60（季線）、MA240（年線）乖離、方向分位、P90 / P95 門檻、樣本數與缺資料狀態。
- 個股過熱 / 深跌分數納入季線與年線乖離：月線仍代表短線追價與減碼紀律，季線看波段延伸 / 中期深跌，年線看長線位置；缺資料不視為低風險。
- 「月 / 季 / 年線乖離 / 減碼紀律」卡新增三條均線明細，技術數字摘要新增 MA240 與月季年乖離卡。
- 主題技術排行新增「月季年正乖離 Top 5」與「月季年負乖離 Top 5」，方便直接找過熱延伸與深跌候選。
- 版本同步到 `v11.3`：`app_files/main.js`、`main.html`、`manifest.json`、README、頁面 changelog 與共享計劃文件。

## v11.2 優化（2026-05-27）

- 「月線乖離 / 減碼紀律」卡新增預設收合的「解讀口徑」，將乖離分位、減碼比例與買回紀律直接寫進 extension 內。
- 分位說明補上 `<75%ile`、`75-90%ile`、`90-95%ile`、`>=95%ile` 的判讀階層，降低只看固定乖離率造成的誤判。
- 補明買回紀律：若減碼後沒有拉回、反而漲到卡片列出的買回價，應認錯買回，不要錨定原賣價。
- 版本同步到 `v11.2`：`app_files/main.js`、`main.html`、`manifest.json`、README、頁面 changelog 與共享計劃文件。

## v11.1 優化（2026-05-27）

- 技術分析新增「乖離水位」：用每檔個股自身近 480 根可用日線的 MA20 乖離分位判斷水位，避免把台積電與高波動 AI 股套同一個固定百分比。
- 選取個股新增「月線乖離 / 減碼紀律」卡：顯示目前 MA20 乖離、個股自身歷史分位、P90 / P95 正乖離門檻、趨勢是否仍完整、拉回觀察區與買回紀律價。
- 減碼紀律以工具內研究 proxy 呈現：高正乖離且長線趨勢仍完整時，滿倉才提示可討論減碼 2-3 成並保留超過 2/3 核心部位；若以現價減碼，預設列出 +15% 認錯買回參考價。
- 個股過熱 / 深跌分數的 MA20 乖離因子改優先參考自身歷史分位；資料不足時才退回固定 5 / 8 / 12% proxy。
- 版本同步到 `v11.1`：`app_files/main.js`、`main.html`、`manifest.json`、README、頁面 changelog 與共享計劃文件。

## v11.0 優化（2026-05-27）

- 技術分析 & 籌碼頁的三大法人逐日買賣超表改成預設收合的「逐日明細（核對用）」，避免 2026/05/07、2026/05/06 這類單日列誤導成主要籌碼訊號。
- 主畫面以多週期累計表為主：1 / 2 / 3 / 5 / 7 / 10 / 14 / 30 / 60 / 90 / 130 日仍保留完整法人買賣超累計，較符合短中期籌碼判讀。
- 保留逐日表的外資、投信、自營與合計欄位，展開後仍可核對單日資料來源與紅綠色買賣超語意。
- 版本同步到 `v11.0`：`app_files/main.js`、`main.html`、`manifest.json`、README、頁面 changelog 與共享計劃文件。

## v10.9 優化（2026-05-27）

- 搜尋 debounce 後改用 `render({ scope: "active" })`：搜尋 / 清除搜尋時只重繪目前分頁內容，不再每次重畫 hero、filter、股池管理、持股管理與期貨水位列。
- 保留完整重繪保護：若搜尋清空時 `ensureRenderableFilter()` 觸發無效主題 / 空主題自動回退，會自動升級為 full render，讓左側主題狀態同步。
- render queue 新增 scope 合併：同一個 animation frame 內若已有 full render 需求，會保留 full render；active render 不會覆蓋更高層級的重繪需求。
- 版本同步到 `v10.9`：`app_files/main.js`、`main.html`、`manifest.json`、README、頁面 changelog 與共享計劃文件。

## v10.8 優化（2026-05-26）

- `filteredStocks()` 新增結果快取：依搜尋字、目前主題與自訂類股加入 / 移除簽名快取，降低同一次 render 內大盤總覽、主題總覽、量化篩選、技術排行等重複掃 watchlist 的成本。
- 搜尋下拉候選新增 query-level cache：同一搜尋字、同一 index 簽名、同一候選上限可直接重用結果；保留 v10.7 的股號快速路徑。
- 搜尋索引簽名更精準：自訂類股加入 / 移除個股內容會納入 signature，不再只看物件 key 數量，避免自訂名單異動後沿用舊候選或舊篩選結果。
- 版本同步到 `v10.8`：`app_files/main.js`、`main.html`、`manifest.json`、README、頁面 changelog 與共享計劃文件。

## v10.7 優化（2026-05-26）

- 股號搜尋新增快速路徑：輸入數字 / 股號型字串時，先走 `codeSearch` index，支援完全相符、前綴與 3 碼以上包含查詢，避免每次輸入都掃完整文字欄位與 fuzzy match。
- 搜尋篩選 debounce 調整：股號型查詢縮短到 120ms，一般文字搜尋維持較保守節奏；下拉選單保留命中理由、排序與 Enter 前往。
- 技術分析 & 籌碼頁可讀性提高：技術線圖價格列、最近行情卡、技術數字摘要與籌碼持倉現價 / 過熱深跌提示字級放大；手機寬度仍切成單欄避免擠壓。
- 版本同步到 `v10.7`：`app_files/main.js`、`main.html`、`manifest.json`、README、頁面 changelog 與共享計劃文件。

## v10.6 優化（2026-05-26）

- 技術分析 & 籌碼頁新增「個股過熱 / 深跌超賣」derived signal，放在價格附近：線圖價格列、技術數字摘要第一排、最近行情與同業 PE 卡都會直接顯示。
- 分數拆成 `過熱` 與 `深跌` 兩條 0–100 proxy：整合 RSI14、布林通道位置、MA20 乖離、單日漲跌、量能比、KD 高低檔、大量 K 高低攻防、失守後修復、Chip Score、大戶仍在場、散戶情緒與融資使用率。
- 技術分析 & 籌碼頁新增完整拆解卡：列出升溫 / 過熱因子、深跌 / 修復因子、來源、信心與缺資料原因；籌碼決策摘要也會同步顯示同一個熱度 chip。
- 資料口徑延續交叉比對規則：日線 / 報價 / 融資券 / 法人 / 外資持股 / TDCC 等仍以 TWSE、TPEx、TDCC、TAIFEX 或本機官方快取為主；若缺資料，不會把缺值當成低風險。
- 技術門檻是市場常見教育口徑而非保證訊號：RSI 70 / 30 可參考 Fidelity RSI 說明；布林通道預設 20 期、2 個標準差且需和其他指標搭配，可參考 Fidelity Bollinger Bands；KD / stochastic 80 / 20 可參考 Fidelity stochastic 說明。來源：<https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/RSI>、<https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/bollinger-bands>、<https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/fast-stochastic>。
- 版本同步到 `v10.6`：`app_files/main.js`、`main.html`、`manifest.json`、README、AGENTS、頁面 changelog、共享計劃文件與 bundled `data/state.json` 頂層版本；`data/state.json` 內部報價 / asOf / fetchedAt 保留原始時間，避免舊資料看起來像今日資料。

## v10.5 優化（2026-05-26）

- 小版本維護，重點是 release gate 與交接文件收斂，不新增交易判讀功能。
- `log/PLANS.md` 的 Now 區改聚焦目前出貨阻塞：v10.4 Market Heat Score、v10.3 外資持股趨勢、v10.2 月營收 / 處置風險回歸、紅綠色語意與快速 / 完整更新。
- `log/TODO.md` 的 Current Priorities 改成 v10.5 必過項目、Regression Matrix 與 Parking Lot，避免 v4-v9 歷史 GUI 檢查長期混在目前 release gate。
- 交易判讀功能的驗收口徑收斂為：資料來源 / fallback / asOf / fetchedAt / confidence / 缺資料原因需可見，缺資料不得被誤判成低風險。
- 版本同步到 `v10.5`：`app_files/main.js`、`main.html`、`manifest.json`、README、頁面 changelog 與共享計劃文件。

## v10.4 優化（2026-05-26）

- 大盤總覽新增「Market Heat Score 市場過熱 / 回檔風險」：把 TAIEX RSI、20 日均線乖離、布林上緣、追蹤池站上月線 / 季線比例、追蹤池 RSI>=70 比例、TWSE 融資券、TAIFEX 期貨分歧、TXO Put/Call Ratio、VIX、美債 10Y、USD/TWD 與追蹤池估值樣本整合成 0–100 分研究 proxy。
- 評分分成「技術線型、廣度 / 擴散、槓桿 / 期權、總經 / 外部」四層；每個因子顯示分數、來源、日期、信心與缺資料，避免把資料未更新誤判成低風險。
- 資料來源延續交叉比對規則：TAIEX / 融資券以 TWSE 為主，期貨 / P/C 以 TAIFEX 為主，VIX 以 Cboe 為主，美債殖利率以 U.S. Treasury 為主，USD/TWD 以中央銀行為主；追蹤池廣度與估值樣本明確標示為本機樣本 proxy。
- 技術指標門檻（例如 RSI 70 作為常見過熱參考）屬市場教育口徑，需搭配背離、量價、均線與官方資料；可參考 Fidelity RSI 說明：<https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/RSI>。
- 版本同步到 `v10.4`：`app_files/main.js`、`main.html`、`manifest.json`、README 與頁面 changelog。

## v10.3 優化（2026-05-26）

- 快照趨勢新增「外資持股趨勢排名」：依最近 5 筆外資持股比率變化、歷史筆數與官方來源小幅加權，列出主題內累積 / 出清強度排序。
- 排名列保留起迄日期、來源、Tier 1 / 待複核、信心等級與可用筆數，方便回 TWSE / TPEx 複核。
- 將 `Next Buildout` 的「外資累積 / 出清訊號做成主題層排名」收斂為已實作；Chrome extension context 實測仍待執行。
- 版本同步到 `v10.3`：`app_files/main.js`、`main.html`、`manifest.json`、README 與頁面 changelog。

## v10.2 優化（2026-05-25）

- 降低卡頓：一般互動儲存改成 900ms 合併寫入，畫面重繪改為同一 frame 合併，避免連續點擊 / 切分頁造成重複重畫。
- 處置風險 v2：新增「已處置 / 官方累計高風險 / 今日注意 / 量價 proxy」四層，處置股頁新增綜合排行、風險分、量能、今日漲跌與下一步提示。
- 紅綠字修正：保留「空、空頭、做空」等綠色，但避免把「空白、空主題」這類非交易語意誤染。
- 版本同步到 `v10.2`：`app_files/main.js`、`main.html`、`manifest.json`、README 與頁面 changelog。

## v10.1 優化（2026-05-25）

- 新增「可能進處置」：抓 TWSE / TPEx 官方注意累計異常，標示隔日再被公告注意時可能進入處置的股票。
- 處置股頁新增今日注意交易與本機量價 proxy，保留 `source`、`sourceTier`、`asOf`、`fetchedAt`、`confidence` 與錯誤訊息。
- 大盤總覽新增處置風險 Top 5；量化篩選新增處置風險欄，並可排序。
- 交易雷達新增處置 / 注意扣分：處置中與注意累計異常會偏向「先避開」，今日注意與量價 proxy 會提示需官方複核。
- 快速更新背景同步注意交易風險；完整更新流程新增「處置 / 注意風險」步驟。
- 修正舊月營收快取含 null 時可能觸發 `Cannot read properties of null (reading 'yoyPct')` 的區塊載入失敗。
- 版本同步到 `v10.1`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

## v10.0 優化（2026-05-21）

- 左側新增第 17 類「退休存股」，收錄 `00713`、`0056`、`00929`、`2412`、`9911`、`2850`、`6803`、`2603`。
- 主題總覽新增退休現金流面板：分成月配、季配、年度配息與循環型彈性標的，顯示報價、殖利率、ETF 折溢價與買入條件。
- 買入時機改用研究規則：殖利率達標、折溢價接近淨值、價格靠近季線、除息後支撐確認；避免只為領息在除息前追高。
- 新增稅後總報酬提醒：ETF 收益分配需核對股利所得、利息所得、收益平準金與已實現資本利得；資本利得與證交稅需回財政部 / 券商資料確認。
- 版本同步到 `v10.0`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

## v9.9 優化（2026-05-21）

- 大盤總覽新增「今日變化摘要」：集中列出目前主題 / 搜尋範圍內 Top 變化個股。
- 每檔整合今日漲跌、量能 Z-score、技術新事件、RS、月營收 YoY、ETF 共識、大戶仍在場與散戶熱度。
- 摘要列標示動能轉強、價格異動、籌碼分歧或風險升高，並用原因 chip 顯示主要觸發訊號。
- 點摘要列可直接跳到個股研究，降低在多張表之間來回找變化的時間。
- 版本同步到 `v9.9`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

## v9.8 優化（2026-05-21）

- 「開啟後日常完整」改為背景完整更新：開啟 extension 後自動排入日常完整流程，不再要求 5 秒無操作。
- 點擊、輸入、滾動或切分頁不會取消背景完整更新；只有按「停止本次」才會停止。
- 若正在快速更新或其他任務執行，背景完整會每 15 秒重試，最多等待 12 次；逾時才標示可手動重跑。
- Hero 與日常完整更新流程卡改顯示背景待命 / 背景執行 / 本日已完整，降低「卡住沒動」的誤讀。
- 版本同步到 `v9.8`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

## v9.7 優化（2026-05-20）

- 大盤總覽新增「資料健康總分」，集中檢查報價 / 估值、日線 / 大盤、籌碼30日、ETF NAV / 持股、月營收與大盤 / 期貨六層快取。
- 每層顯示覆蓋率、最新日期或來源摘要，讓缺資料時可直接知道是哪一層拖累判讀。
- 更新建議會自動分流：報價、大盤、期貨或 ETF NAV 落後時提示「快速更新」；日線、籌碼、月營收或主動 ETF 持股不足時提示「完整更新」。
- 月營收用月資料節奏判斷，不再用每日更新邏輯誤判；日常完整流程仍保留逐步狀態，顯示本日完成 / 部分完成 / 上次完成。
- 日常完整流程 log、輕量定時與開啟後自動更新設定會寫入 state payload，重開後可沿用本日完成狀態。
- 版本同步到 `v9.7`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

## v9.6 優化（2026-05-20）

- 更新入口收斂成兩個主要按鈕：「快速更新」與「完整更新」。
- 「快速更新」定位為盤中看盤用：更新即時報價，並在背景同步大盤總覽、期貨水位與 ETF NAV / 折溢價；不重新抓取日線、月營收、股利、法人近30日或 ETF 持股。
- 「完整更新」直接啟動日常完整流程：報價 / 官方估值 / 市值、全部日線、月營收、股利、期貨、法人近30日、大盤、三大法人前10、美債燈號、ETF NAV、主動 ETF 持股。
- 日線、籌碼、ETF 持股、月營收、股利、期貨與 data 設定移到「單項 / 維護」，保留給除錯或補特定資料使用。
- 日常完整更新流程狀態改成「本日已完成 / 本日部分完成 / 上次完成 / 待執行」，不再每次開啟都把已完成的流程看起來像全部沒更新。
- 修正手動日常完整更新常見錯誤：`TAIEX_CODE is not defined`。原因是流程診斷階段引用了未宣告的大盤代碼常數，已補成 `^TWII`。

## v9.5 新增功能（2026-05-20）

- 新增「大戶仍在場」derived signal：整合三大法人近 5 / 10 日、投信認養、外資持股趨勢、TDCC 大戶集中度與價格防線，直接標示大戶仍在場、大戶偏在場、大戶換手、大戶轉弱、大戶撤退或疑似散戶接手。
- 新增「散戶情緒溫度計」：整合融資使用率、融資增減、小台 / 微台非法人代理、量價異常與漲跌停鎖單情緒，標示散戶槓桿過熱、散戶偏熱、情緒升溫、中性或偏冷。
- 量化篩選新增「大戶在場」與「散戶熱度」欄位，支援排序；交易雷達卡同步顯示兩個訊號，方便盤中快速掃描籌碼心態。
- 技術 × 籌碼決策摘要新增 v9.5 籌碼心態拆解；若大戶撤退且散戶偏熱，會優先降級為風險狀態。
- 這兩個訊號皆為研究 proxy，不是官方散戶 / 大戶分類；資料來源與限制沿用 TWSE / TPEx / TDCC / TAIFEX 官方優先與交叉比對規範。
- 版本同步到 `v9.5`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

## v9.4 優化（2026-05-17）

- 技術分析頁線圖改回預設開啟，符合盤中看圖習慣。
- 圖上不再直接堆滿大量高低、週大量、ATR、POC、修復半價等文字；改集中到線圖上方「關鍵價位」列，圖中只保留水平線與滑鼠提示，避免文字互相重疊。
- 搜尋延續 v9.3 的高對比與命中理由，但改用預先建立的搜尋索引、下拉候選限制前 8 筆，並把主畫面篩選延後到停止輸入後再重繪，降低輸入時卡頓。
- 版本同步到 `v9.4`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

---

## v9.3 優化（2026-05-17）

- 搜尋框放大、提高字級與對比，避免左側搜尋欄文字太小或顏色太淡。
- 搜尋結果改成可讀卡片列：顯示股號、名稱、主題、產業與命中理由，並高亮命中文字，讓你馬上知道為什麼會搜尋到這檔。
- 搜尋輸入時先即時顯示候選清單，主畫面篩選改為短延遲重繪，降低每打一個字就重建整頁造成的卡頓。
- 單檔技術線圖預設改成「技術數字摘要」：現價 / 收盤、趨勢、MA20、MA60、RSI、KD、MACD、量能比、支撐壓力、大量高低、ATR 停損與 POC 成本區先用數字呈現。
- 大型 SVG K 線圖與多層疊圖改成手動顯示；需要看圖時按「顯示線圖」，不需要時維持數字摘要以提升穩定性。
- 版本同步到 `v9.3`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

---

## v9.2 熱修（2026-05-17）

- 啟動時正規化舊快取中的 `search`、`filter`、`selectedCode` 與 `holdings`，避免舊狀態 schema 漂移造成股票清單或整頁 render 中斷。
- 若持股清單資料壞掉或被清成不可用格式，會回到內建持股 seed；空主題仍會自動切回可渲染股池。
- 大盤總覽的「今日概念股輪動」在沒有報價 / 量能 / 焦點族群資料時只顯示空狀態，不再拖垮其他區塊。
- ETF 判斷移除對後宣告 `STOCK_MAP` 的依賴，降低 extension 開啟時的初始化中斷風險。
- 版本同步到 `v9.2`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

---

## v9.1 新增功能（2026-05-17）

- 大盤總覽新增「今日概念股輪動」：依本機已更新個股報價計算主題平均漲跌、漲跌家數、報價覆蓋率與量能比，快速看今天資金輪到哪些概念。
- 輪動主題納入台積電相關 / Terafab、CPO / 矽光子、PCB、網通、記憶體、散熱、IC 設計、EMS、機器人與被動元件；點擊輪動 chip 會切到對應主題總覽。
- 預設顯示 CPO / 矽光子族群狀況與前五強弱個股，方便盤中直接檢查矽光子 / CPO 是否仍有族群性。
- 新增台指期結算日提醒：依 TAIFEX 臺股期貨契約規格推算每月第三個星期三，T-3 起在大盤總覽顯示提醒，T-1 / 當日若瀏覽器允許通知會提醒檢查期貨、選擇權與現股曝險；遇休市或交易所公告調整時需以 TAIFEX 公告為準。
- 分類改採多標籤補強：3008 大立光同步標示「光學鏡頭」「蘋概股」「CPO光學觀察」，並在 CPO 子分類新增「光學鏡頭 / 蘋概觀察」。
- 新增 Podcast / 搜尋關鍵字「蘋概 / 光學鏡頭」，並把 CPO 關鍵字擴充到 FAU、光學耦合、準直鏡等詞。
- 版本同步到 `v9.1`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

---

## v9.0 新增功能（2026-05-17）

- 左側新增第 15 主題「被動元件」，第 12 主題維持台灣主動式 ETF，第 14 主題維持海外 / 美日股 / 美債 ETF，其他觀察順延為第 16。
- 被動元件股池以國巨（2327）固定第一，其後依核心平台、電容 / MLCC / 鋁電 / 固態、電阻 / 保護元件、電感 / 磁性元件、材料 / 上游 / 通路、濾波 / 振盪器、廣義低純度 / 待複核分層。
- 新增被動元件研究標籤與 Podcast 關鍵字，讓國巨、華新科、禾伸堂、凱美、鈺邦、信昌電、臺慶科等消息能被主題歸類。
- 名單主幹依 TPEx 產業價值鏈「被動元件」整理，並用近期 EBC、商周與玉山證券產業整理補強 AI 伺服器題材常看的股票；已下市併入國巨的奇力新，以及已明顯轉型、不再適合作被動元件研究主軸的天揚 / 馥鴻不納入內建主題。
- 版本同步到 `v9.0`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

---

## v8.9 新增功能（2026-05-17）

- 更新入口收斂成三種模式：`輕量定時`、`日常完整更新流程`、`單項手動更新`。
- Hero 的排程按鈕改名為「輕量定時」：台股盤中更新報價 / 官方估值 / 市值，美股盤前或盤中更新大盤總覽；不是完整流程。
- 大盤總覽流程卡改名為「日常完整更新流程」：包含報價 / 官方估值 / 市值、全部日線、月營收、股利、期貨、法人近30日、大盤、三大法人前10、美債燈號、ETF NAV、主動 ETF 持股。
- 日常完整流程明確標示不包含 Podcast RSS、逐字稿、借券 SBL 完整回補、法人 60 / 90 / 130 日深度回補。
- 上方原「完整更新」按鈕改名為「報價估值」，只代表單項更新報價、官方估值與市值；日線、籌碼、ETF、月營收等仍各自用單項按鈕。
- 版本同步到 `v8.9`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

---

## v8.8 新增功能（2026-05-17）

- 新增「事件後續航」：針對目前最重要的新鮮 / 有效技術事件，回看同一檔股票過去相似事件後 1 / 3 / 5 / 10 日的續航率、平均報酬與逆風幅度。
- 支援大量 K 高低 / 半價、週線大量 K、POC、MA20 與 ATR 追蹤停損等事件類型，樣本少於 3 筆時只提示樣本不足，不強行下結論。
- 技術分析頁新增 v8.8 事件後續航卡，顯示焦點事件、樣本數、信心等級與各期間統計。
- 技術排行新增「事件續航偏強 Top 5」與「事件失敗風險 Top 5」；量化篩選新事件欄同步顯示 5 日續航率與平均報酬。
- 交易雷達卡、主題訊號卡與籌碼決策摘要同步顯示事件續航，方便把訊號新鮮度與歷史延續性一起看。
- 版本同步到 `v8.8`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

---

## v8.7 新增功能（2026-05-17）

- 新增「技術事件新鮮度」：回看最近 20 根日線，判斷大量 K 高低 / 半價、週線大量 K、POC 成本區、MA20 與 ATR 追蹤停損的收盤穿越是今日、近 3 日、近 5 日或延續。
- 每個事件會標示「仍有效 / 已失效」，避免把幾天前的突破或跌破誤當成今天的新訊號。
- 技術分析頁新增 v8.7 事件新鮮度卡，顯示總結、方向分、近 5 日事件數、有效事件數與事件時間軸。
- 技術排行新增「近3日風險事件 Top 5」與「近3日攻擊 / 修復事件 Top 5」。
- 量化篩選新增「新事件」欄與事件新鮮度排序；交易雷達卡、主題訊號卡與籌碼決策摘要同步顯示事件新鮮度。
- 版本同步到 `v8.7`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

---

## v8.6 新增功能（2026-05-17）

- 新增「交易狀態機」：把大量 K 高低攻防、失守後修復、ATR 追蹤停損、週線大量 K、POC 成本區、KD / 背離與 RSI 過熱整理成停損觸發、等待修復、再進場候選、攻擊候選、持有觀察等狀態。
- 新增「今日技術事件」：集中列出跌破大量低、站上大量高、反彈測低未收復、ATR 停損、POC 成本區、KD 交叉、RSI / MACD 背離等事件。
- 技術分析頁新增 v8.6 交易狀態卡，直接顯示狀態、動作、部位規則、風控規則、下一步檢查與事件 badges。
- 技術排行新增「交易狀態優先 Top 5」與「今日技術事件警示 Top 5」；量化篩選新增「交易狀態」欄與排序。
- 籌碼頁的「技術 × 籌碼決策摘要」同步納入 v8.6 交易狀態與今日技術事件。
- 版本同步到 `v8.6`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

---

## v8.5 新增功能（2026-05-16）

- 新增「失守後修復 / 再進場判讀」：大量 K 低點若曾失守，會依收盤是否重新站回大量低、半價與大量高，分成未修復、假修復、初步修復、修復確認與強修復。
- 新增 KD / 背離 Checklist：整合 KD 黃金 / 死亡交叉、低檔翻揚、高檔轉弱、RSI / MACD 底背離或頂背離、MACD 柱狀體改善 / 轉弱。
- v8.5 技術決策層把修復階段與 KD / 背離納入確認條件與阻礙 / 風險；失守未修復時會先降級，修復確認且動能未轉弱時才列入再進場觀察。
- 個股技術分析頁新增「失守後修復」與「KD / 背離」卡；線圖新增修復半價水平線與 KD chip。
- 技術排行新增「失守後修復候選 Top 5」「反彈未收復警示 Top 5」「KD / 背離轉強 Top 5」；籌碼頁的技術 × 籌碼決策摘要同步顯示 v8.5 決策層。
- 版本同步到 `v8.5`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

---

## v8.4 新增功能（2026-05-16）

- 新增「技術決策層」：把日線大量 K、週線大量 K、ATR 初始 / 追蹤停損與 Volume Profile POC 成本區合併成同一個判讀卡。
- 個股技術分析頁新增 v8.4 決策卡，會直接輸出總結、執行提示、確認條件與阻礙 / 風險。
- 線圖新增 ATR 追蹤停損線、週線大量高 / 大量低水平線，並在 legend chip 顯示 ATR 停損與 POC。
- 講義價位框架納入 ATR 停損與 POC 成本區；Checklist 新增週線大量低未失守、POC 成本區與 ATR 風控條件。
- 技術排行新增「POC 成本區站上 Top 5」與「ATR 風險警示 Top 5」；籌碼頁的技術 × 籌碼決策摘要同步顯示 v8.4 決策層。
- 版本同步到 `v8.4`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

---

## v8.3 新增功能（2026-05-16）

- 新增「大量 K 高低攻防」：最近 60 根日線中，找相對前 20 日均量達 1.5 倍且有明顯價格波動的 K 棒作錨點。
- 技術分析頁會直接回答「上漲有沒有收盤站上大量高」與「下跌有沒有收盤跌破大量低」，並顯示大量 K 日期、高點、低點、半價與量能倍數。
- 線圖疊加「大量高 / 大量低」水平線；個股報告與講義價位框架會把大量 K 高低點納入支撐壓力。
- 做多候選排序新增大量 K 攻防權重：站上大量高加分，跌破大量低扣分；技術排行新增「站上大量高 Top 5」與「跌破大量低警示 Top 5」。
- 版本同步到 `v8.3`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

---

## v8.2 新增功能（2026-05-16）

- 新增「漲跌停鎖單強度」：官方 MIS 報價解析五檔委買委賣、漲停價與跌停價，計算鎖住張數 / 發行股數代理流通張數。
- Chip Score 新增「漲跌停鎖單」分項；籌碼頁新增鎖單強度卡，顯示鎖價方向、鎖住張數、分母來源、鎖單比與可信度。
- 量化篩選籌碼欄、大盤三大法人買賣超前 10 對目前股池內有報價的個股顯示鎖單 chip，方便把法人買賣超與真假鎖單一起檢查。
- 分母目前先用官方可取得的發行股數 / TDCC 總股數作 proxy，尚未扣除董監、大股東、庫藏股或長期鎖定持股；後續版本可再接 MOPS / 股權資料補真正 free float。
- 版本同步到 `v8.2`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

---

## v8.1 新增功能（2026-05-16）

- ETF 追蹤入口收斂：移除上方 ETF 追蹤 tab，改由左側第 12 主題開啟台灣主動式 ETF，第 14 主題開啟國外 ETF。
- 第 12 主題只保留台灣主動式 ETF，不再混入台股被動 ETF；第 14 主題保留海外主動、美股、日股與美債 ETF 面板。
- Podcast RSS 更新鍵移到「Podcast 產業趨勢」頁面標題右側；開啟 Podcast 頁時若 RSS 快取為空或超過 6 小時會自動背景更新。
- 大盤總覽新增「今日三大法人全市場買賣超前 10」：以 TWSE T86 + TPEx 官方三大法人日報為來源，分別列出外資、投信、自營商與三大法人合計的買超 / 賣超 Top 10。
- 自動更新流程新增「三大法人前10」步驟，並同步版本到 `v8.1`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog。

---

## v8.0 新增功能（2026-05-15）

- 全站時間顯示統一改為 24 小時制。
- 大盤總覽的美股四大指數改為同時顯示「當地美東時間」與「台北抓取時間」，避免盤後 / 盤中資料時間混淆。
- 籌碼流程新增「法人近30日快取」：例行籌碼更新以近 30 個交易日為預熱目標，自動更新流程也會補這個快取，讓後續更新主要補最新日期。
- ETF 共識面板改為「今日投信共同買賣 Top 5」：分別列出共同買進 / 加碼與共同賣出 / 減碼前五名，依共同異動 ETF 檔數排序，並顯示合計權重變化與各 ETF 明細。
- 版本同步到 `v8.0`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog 同步更新。

---

## v7.9 新增功能（2026-05-15）

- 新增 / 校正使用者指定股：3305 昇貿、2059 川湖、3665 貿聯-KY、2449 京元電子。
- 分類口徑：昇貿歸入 `ABF / PCB / CCL / 電子組裝材料`，川湖歸入 `EMS / AI Server 機構件`，貿聯-KY 維持 `CPO / 高速連接 / 線束`，京元電子維持 `台積電相關 / 封測OSAT` 與 `記憶體封測`。
- 新增研究標籤：`PCB / 組裝材料`、`AI Server 機構件`、`高速連接 / 線束`，搜尋焊錫、錫球、伺服器滑軌、機構件、線束等關鍵字可直接定位。
- 版本同步到 `v7.9`：`app_files/main.js`、`manifest.json`、README 與頁面 changelog 同步更新。

---

## v7.5 新增功能（2026-05-14）

- 自動更新流程補上每一步耗時、資料覆蓋率、來源摘要與錯誤訊息，方便 Chrome 實測時定位卡住的資料層。
- 報價、日線、月營收、股利、期貨、大盤、美債燈號、ETF NAV、主動 ETF 持股都會在流程卡片顯示可用筆數或主要來源。
- 高風險 UI 健康檢查升級到 v7.5，延續 ETF NAV、折溢價、持股展開與法人回補狀態追蹤。

---

## v7.4 新增功能（2026-05-13）

- 新增「自動更新流程」面板：可看到報價、日線、月營收、股利、期貨、大盤、美債燈號、ETF NAV、主動 ETF 持股目前跑到哪一步。
- 自動更新新增「停止本次」與「立即跑一次」，並記錄每一步完成、失敗、停止或待重試狀態。
- 盤中 5 分鐘自動更新會避開 idle 完整更新與其他 busy 任務，避免一開 extension 同時跑兩套重任務。
- ETF 追蹤表格的「現價 / 折溢價」升級為「現價 / NAV / 折溢價」，明列 NAV 日期；缺 NAV 時直接提供「更新 NAV」。
- 統一介面用語為「更新」，避免混用其他同義詞。

---

## v7.3 新增功能（2026-05-13）

- 依 Claude 稽核結果修正 TWSE50 / MID100 市值分類：6278、2376、3481、2344、2105 等不再被誤標大型；T50 與 MID100 重複代碼移除。
- `stockScaleInfo()` 加上市值防呆：TWSE50 若已知市值低於 300 億、MID100 若低於 50 億，回落到市值門檻判斷。
- 技術線圖新增價格英雄列：現價、漲跌、資料來源、時間戳與今日 OHLCV，週 K 模式顯示週 K 標籤。
- Hero 與大盤總覽加入台股 / 美股 / 日股市場狀態；美股盤中或盤前會同步更新大盤總覽，非交易時段延長 TTL 至 30 分鐘。

---

## v7.0 新增功能（2026-05-13）

- 新增「開啟 extension 後 5 秒無操作自動更新」：依序更新報價、日線、月營收、股利 / 本期淨利、期貨、大盤、美債 ETF 燈號、ETF NAV 與主動 ETF 持股；偵測到點擊、輸入、滾動或快捷鍵會略過本次或在目前步驟完成後停止。
- 快速報價與完整更新加入 TWSE / TPEx 官方日收盤表備援：MIS 與 Yahoo 都失敗時仍可補收盤價、開高低、成交量與成交金額，並保留來源與日期。
- 報價與日線分母改用「可自動報價標的」：興櫃 / 未上市櫃待複核觀察股會明列略過，不再讓快速報價看起來卡在 280/298。
- 依 TWSE / TPEx 官方日收盤表校正多檔市場別 suffix，00403A 更新為「主動統一升級50」。
- 股池補強：記憶體主題顯式加入 2337 旺宏，IC 設計加入 8081 致新，存股 / 現金流加入 1476 儒鴻，並維持股號去重。

---

## v6.9 新增功能（2026-05-13）

- 新增最左側「大盤總覽」分頁，整合台灣加權指數、台指期夜盤與美股四大指數線圖。
- 台股成交金額優先以 TWSE 官方收盤統計補強；盤中線圖採 Yahoo chart API，畫面會保留來源與更新時間。
- 台指期夜盤讀取 TAIFEX 盤後交易即時行情，因 API 不提供完整分時，線圖以昨收 / 開 / 高 / 低 / 現作 OHLC proxy。
- 新增高風險 UI 健康檢查：ETF NAV、折溢價、ETF 持股展開、法人回補、v5.2 技術分析卡片。
- ETF 持股列改用專屬前往邏輯，避免從 ETF 研究頁誤跳到技術線圖。

---

## v6.1 新增功能（2026-05-11）

### 自動更新 + 台股時段感知

側欄新增**市場狀態 badge**（開盤中 / 收盤 / 盤前 / 休市）與**自動更新**切換按鈕。開啟後：
- 僅在台灣股市開盤時段（**09:00–13:30，週一–五**）自動呼叫「更新報價」
- 可切換 **5 / 10 / 15 分鐘**更新間隔，並顯示下次更新倒計時
- 設定持久化，重啟 extension 後保留上次選擇

### 月營收整合

- **股票卡片**：每張卡片加入月營收 YoY / MoM 百分比（綠/紅顯示方向）
- **估值表**：新增「月營收 YoY」與「MoM」兩欄
- **今日操盤快訊**：加入月營收 YoY 成長 Top 5 與衰退 Top 5（需先按「月營收」更新）

### 持倉損益總覽（v6.1）

主題總覽頁新增「持倉損益總覽」面板：
- 彙整所有已設定成本均價的個股，顯示成本總計、市值合計、**未實現損益 + 總報酬率**
- 依報酬率排序，按欄位可跳至個股研究頁
- **距停損 < 5%** 的個股以紅色警示框獨立標示
- 設定方式：個股研究頁 → 籌碼分析 tab → 輸入「成本均價」與「張數」

### 倉位計算器（v6.1）

持倉面板下方新增風控倉位計算器：
- 輸入：帳戶資金（萬元）、每筆最大風險 %、進場價、停損價
- 輸出：**最大可買張數**、每張虧損、停損幅度、部位名目、佔帳戶比例
- ⚠️ 為估算工具，請依個人財務狀況調整

---

### v5.3–v5.9 核心觀念

#### 1. 所有股票流動性評估（個股 + ETF）

採「**日均成交張數**」為主、「**日均交易金額**」為輔，**取兩者較嚴格者**為最終分級（最近 20 日 kline 計算）：

| 等級 | 日均成交張數（主要） | 日均交易金額（輔助） | 對應策略 |
|------|---------------------|---------------------|----------|
| **巨型流動性** | ≥ 5,000 張/日 | ≥ 5 億元/日 | 藍籌股級別，自由進出 |
| **大型** | 1,000 - 5,000 張/日 | 1 - 5 億元/日 | 流動性佳 |
| **中型** | 500 - 1,000 張/日 | 3,000 萬 - 1 億/日 | **500 張為實務分水嶺**，可進可出 |
| **小型** | 100 - 500 張/日 | 1,000 - 3,000 萬/日 | 低於 500 張水位，大單易拉開買賣價差 |
| **過小** | < 100 張/日 | < 1,000 萬/日 | TWSE 流動量偏低區間，建議避開或小額 |

**範例**：
- `5209` 新鼎（價 ~80 元、量 ~100 張） → 過小流動性 ⚠️
- `2330` 台積電（價 ~1,300 元、量 ~30,000 張） → 巨型流動性

**文獻 / 實務來源**（⚠️ unverified — please cross-check）：
1. **TWSE「流動量偏低之有價證券」**：每月成交筆數低於約 200 筆視為偏低
2. **實務分水嶺 500 張**：MoneyDJ / 財報狗 / CMoney 等實務分析常見門檻
3. **學術文獻**：Amihud (2002) illiquidity ratio、Kyle (1985) market depth
4. **ETF 規模 (AUM)** 額外標示：巨型 (>1,000 億)、大型 (300-1,000 億)、中型 (100-300 億)、小型 (30-100 億)、過小 (<30 億)；例如 `00679B` 元大美債20年（4,200 億）vs `00955` 中信日本商社（40 億）規模差距明顯

第 15 主題的「流動性評估方法學」面板會直接列出分級門檻、輔助分級與來源連結。

#### 2. 海外 ETF 配息來源 5 類 × 課稅口徑

每檔海外 / 美日股 / 美債 ETF 顯示配息組成（一般化）：
- **股利所得**（境內 ETF 才會出現；可選合併申報享 8.5% 抵扣，上限 8 萬，或分離 28%）
- **利息所得**（債券型 ETF 主要來源；境內 / 海外性質不同）
- **海外所得**（美國 / 日本股利、利息屬此類；個人最低稅負制 670 萬基本所得額之外才課 20%；單戶全年 100 萬以上才計入）
- **資本利得**（ETF 內持股換股實現的價差）
- **收益平準金**（用以維持配息率穩定，**不算當期實際收益**；高配息 ≠ 高總報酬）

**買賣價差課稅**：
- 在台掛牌股票型 ETF 受益憑證：證所稅停徵 + 證交稅 0.1%
- 在台掛牌**債券型 ETF**：依證交稅條例 §2-1 暫停徵證交稅 + 證所稅停徵
- 個人配息單筆 2 萬以上：扣繳 + 二代健保補充保費 2.11%（年度上限 1,000 萬）

每檔 ETF 都附「投信收益分配通知書」官方入口讓使用者核對。

#### 3. Buffett 日本商社替代投資途徑

第 15 主題日股 ETF 面板列出 4 種途徑比較：

| 途徑 | 優點 | 缺點 | 適合對象 |
|------|------|------|----------|
| 00955 / 00949（台灣掛牌） | 台幣計價、買賣免證所稅、複委託免出國 | 規模 30-40 億偏小、流動性低、費用率 0.9% | 小額試水溫、稅務簡單者 |
| 直接買東京掛牌個股（8058 三菱商事 / 8001 伊藤忠 / 8031 三井物產 / 8002 丸紅 / 8053 住友商事） | 無 ETF 費用、流動性極佳、完整配息 | 需複委託 / 海外券商；JPY 交割匯差；日本扣繳 15.315% | 長期持有、想自選商社者 |
| Berkshire Hathaway BRK.B（美國掛牌） | 巴菲特親自配置；流動性極高 | 商社僅佔 BRK 部位 5-7%，曝險被稀釋 | 想跟巴菲特做整體配置者 |
| 美國掛牌日股 ETF（DXJ / EWJ / BBJP） | 規模大、流動性佳、費用較低 | USD 計價、海外所得課稅；需美股戶 | 有美股帳戶者 |

#### 4. 操盤手工具入口（外部直通車）

第 15 主題新增 6 類操盤手日常缺口的權威外連：

- **個股借券 / 融券放空**：TWSE 個股借券當日明細 / 借券每日餘額、TPEx 借券、Goodinfo
- **券商分點 / 主力進出**：CMoney 籌碼 K 線、WantGoo 主力進出、MOPS 重大訊息
- **半導體 / 產業景氣 lead indicator**：SEMI 北美 BB Ratio、WSTS、DRAMeXchange、TrendForce、TSMC 法說
- **日股總經 / Buffett 商社**：日本銀行 BOJ、Tankan 景氣調查、JPX 行事曆、Berkshire 13F、USD/JPY
- **匯率 / 全球金流**：央行 USD/TWD、DXY 美元指數、USD/JPY、美 10Y FRED
- **IR 行事曆 / 法說 / 除權息**：MOPS 法人說明會、MOPS 股利分派、TWSE 除權息預告

---

| # | 主題 | 代表股 |
|---|------|--------|
| 01 | 全部 | 全 watchlist |
| 02 | 目前持股 | 0050、00981A、台積電、台達電、欣興、均華、尖點等 |
| 03 | 台積電相關 | 台積電、漢唐、聖暉、帆宣、亞翔、京元電子等 |
| 04 | CPO / 矽光子 | 光聖、波若威、聯鈞、訊芯-KY、貿聯-KY 等 |
| 05 | ABF / PCB / CCL | 欣興、南電、景碩、台光電、聯茂、昇貿等 |
| 06 | 先進封裝CoWoS/CoPoS | 玻璃基板 / GCS、CoWoS 設備、測試、探針卡、ABF 載板 |
| 07 | 網通 / 衛星通訊 / 量子 | 啟碁、兆赫、昇達科、金寶等 |
| 08 | 記憶體 | 南亞科、華邦電、群聯、創見等 |
| 09 | 散熱 / 電源 / 重電 / 電網 | 奇鋐、雙鴻、台達電、華城等 |
| 10 | IC 設計 / 高速介面 | 聯發科、瑞昱、聯詠、祥碩等 |
| 11 | EMS / 系統整合 | 金寶、正崴、德律、川湖等 |
| 12 | 機器人 / 工具機 / 無人機 | 所羅門、上銀、達明等 |
| 13 | 台灣主動式 ETF | 00981A、00980A、00984A、00985A 等 |
| 14 | 存股 / 現金流 | 臺企銀、中華電、長榮航等穩定配息股 |
| 15 | 海外 / 美日股 / 美債 ETF | 海外主動 ETF、美股 ETF、日股 ETF、美債 ETF |
| 16 | 被動元件 | 國巨、華新科、禾伸堂、雷科等 |
| 17 | 其他觀察 | 大學光、中光電等 |
| 18 | 退休存股 | 0050、00713、0056、00929、中華電、新產等 |

---

## 資料來源與驗證原則

> ⚠️ **重要**：資料正確性是最優先事項。

| 資料類型 | 主要來源 | 驗證 / 備援 |
|----------|----------|------------|
| 即時報價 | TWSE MIS / TPEx | Yahoo Finance（保留實際 regularMarketTime，並標示落後狀態） |
| 日線 K 線 | TWSE STOCK_DAY / TPEx 日成交 | Yahoo Finance 18mo |
| 官方估值 (PE/殖利率/PBR) | TWSE `BWIBBU_d` / TPEx `pera_result` | Goodinfo 河流圖（外部連結） |
| 三大法人 | TWSE T86 / TPEx dailyTrade | — |
| 融資融券 | TWSE MI_MARGN / TPEx margin | Goodinfo 融資總覽（外部） |
| 外資持股 | TWSE MI_QFIIS / TPEx qfii | — |
| 集保分布 | TDCC 公開資料 | — |
| 處置股 | TWSE 公布處置有價證券資訊 / TPEx 上櫃處置有價證券資訊 | 官方 HTML 頁面核對 |
| 財報 / EPS / 股利 | MOPS 股利分派 CSV / TWSE-TPEx 官方估值 | Yahoo 股利、Goodinfo、財報狗（外部交叉核對） |
| 期貨水位 | TAIFEX 即時行情 API / 三大法人期貨未平倉 CSV | 小台 / 微台非法人水位以三大法人反向估算，需回 TAIFEX 核對 |
| 籌碼深度 | **財報狗**（外部連結） | Yahoo 大戶籌碼（外部） |
| 主動 ETF 換股 | **ETF Edge**（外部連結） | 各投信官方頁 |
| 總經指標 | TWSE MI_INDEX / Cboe VIX / U.S. Treasury Yield Curve | MacroMicro、Investing.com、NDC、MOEA、SEMI |
| 美債 ETF 燈號 | Fed monetary policy RSS / U.S. Treasury Yield Curve / 央行 USD/TWD | 投信 ETF 淨值、折溢價、公開說明書與財政部稅務法規 |
| 海外 ETF 配息與課稅（v5.3） | 各投信收益分配通知書 / 財政部 海外所得 Q&A / 證交稅條例 §2-1 / 二代健保補充保費 | 投信投顧公會、所得稅法 §4-1 |
| 日股 / Buffett 商社（v5.3） | 日本銀行 BOJ / Tankan 景氣調查 / JPX 行事曆 / Berkshire Hathaway 13F | USD/JPY、日經 225 |
| 半導體景氣（v5.3） | SEMI 北美 BB Ratio / WSTS 全球月報 / TrendForce / DRAMeXchange | TSMC 法說會 |
| 個股借券 / 分點（v5.3） | TWSE 個股借券當日明細 / 借券每日餘額 / TPEx 借券查詢 | CMoney 籌碼 K 線、WantGoo 主力進出 |
| 流動性評估（v5.3） | 個股：本機 kline 最近 20 日日均交易金額 ／ ETF：投信公告 AUM + TWSE / TPEx 月報 | 由本工具自訂分級（巨型 / 大型 / 中型 / 小型 / 過小） |
| 即時新聞 | **鉅亨 (Anue) API**（15 分鐘快取） | Yahoo 財經、CMoney 等連結 |
| 個股過熱 / 深跌超賣（v10.6） | 本機 TWSE / TPEx 日線、報價、三大法人、融資券、外資持股、TDCC、TAIFEX proxy | Fidelity RSI / Bollinger / stochastic 技術門檻作教育參考；仍需搭配官方籌碼、量價與公司基本面複核 |

**多重驗證方式**：
1. 籌碼/財報數字 → 優先對照財報狗，本 extension 僅作初步篩選
2. ETF 持股 → 以 ETF Edge 及各投信公開說明書為準
3. 估值數字 → 若顯示「-」代表當日交易所未提供（如近四季 EPS ≤ 0），請至 Goodinfo 或財報狗查閱
4. 新聞 → 以原始來源頁面為準，本 extension 僅為入口彙整
5. 處置股 / 注意交易 → 處置清單與注意累計以 TWSE / TPEx 官方公告為準；量價 proxy 只作低可信度提示，放出日以處置迄日後下一個平日推定並需回官方核對

---

## Podcast 更新（維護者用）

```bash
# 日常快速更新 RSS metadata（不碰音檔）
python scripts/update_podcast_digest.py --refresh-only

# 重建本機 500 字摘要（不需 Gemini API）
python scripts/update_podcast_digest.py --rebuild-existing

# 驗證 YouTube 股市心得資料層 schema
python3 scripts/update_youtube_market_lessons.py --check

# 用本機逐字稿更新單集心得摘要（不打包完整逐字稿）
python3 scripts/update_youtube_market_lessons.py --transcript szA2MSO_qTo=/path/to/EP670.txt --print-summary

# 若本機已有 whisper / faster-whisper / whisper.cpp，可由音檔轉錄後產生摘要
python3 scripts/update_youtube_market_lessons.py --audio szA2MSO_qTo=/path/to/EP670.m4a --transcribe-backend auto --print-summary
```

---

## 版本紀錄

| 版本 | 日期 | 重點 |
|------|------|------|
| **v19.1** | **2026-08-21** | **來源 schema v2 相容 migration、隱私清理盤後 Web 快照、next-open 非重疊回測與 R:R 執行閘門** |
| **v19.0** | **2026-08-13** | **Trader-first 作戰首頁、五個主入口、13 領域來源目錄、15:00 Extension 自動同步，並整合 v18.1–v18.2.1 request broker、source adapters、state sharding 與 Web refresh 修正** |
| **v18.2.1** | **2026-07-30** | **修正 null transport options 誤套 1024-byte 上限，恢復 8 MiB／12 秒／重試與來源並行預設** |
| **v18.2** | **2026-07-28** | **三段式今日市場導航、移除首頁目前個股、手機底部研究導覽、PWA 大型資料按需快取與單次跳頁渲染** |
| **v18.1** | **2026-07-28** | **中央連線治理、第三方備援、快照 provenance、局部重試與來源 adapter gates** |
| **v18.0** | **2026-07-19** | **PCB／ABF／CCL 原料 19 檔、封測（台積電相關）13 檔、研究優先序與官方來源分層** |
| **v17.9** | **2026-07-18** | **收盤後單一同步、背景 TTL 佇列、來源健康／circuit breaker；完整研究分頁列維持可見** |
| **v17.8** | **2026-07-18** | **AWS 供應鏈 11 檔／9 環節、官方 7/17 收盤核對、AWS 占比與 2027E EPS 來源分層** |
| **v17.7** | **2026-07-17** | **設備股手機卡片收合、營收頁分段渲染、月營收／股價衍生快取與螢幕外繪製優化** |
| **v17.6** | **2026-07-17** | **股價 × 累計營收／EPS 脫鉤警示、六檔設備股官方上半年漲幅、一般個股快篩整合** |
| **v17.5** | **2026-07-17** | **台積法說後設備股研究卡、六檔官方月營收交叉核對、手機 PWA 導覽與安全連結優化** |
| **v17.4** | **2026-07-14** | **Web / Extension 執行邊界、Chrome CORS 重試修正、GitHub-only 同來源快照 PWA** |
| **v17.3** | **2026-07-13** | **GitHub Pages 延遲行情快照、安全原生外部連結、私有原始碼到公開 PWA 自動發布** |
| **v17.2** | **2026-07-09** | **盤前作戰中樞、摘要優先載入、急殺雷達採信層、Gooaye / EBCmoneyshow 心法與線型框架** |
| **v17.1** | **2026-07-07** | **30% 年增門檻（有沒有成長 = 營收 + 獲利 YoY ≥ 30%）、利空判斷框架、持股調整為指定 16 檔** |
| **v17.0** | **2026-07-07** | **大改版：資訊分層（大盤 / 今日族群 / 單一族群 / 個股），主題總覽只看左側選取族群；營收欄位順序修正** |
| **v16.10** | **2026-07-06** | **合理價 PE 情境帶（河流圖概念）與風險報酬比 R:R 加入公司體質快篩、先探族群框架（封測 / BBU）** |
| **v16.9** | **2026-07-06** | **除權息全市場找新標的、處置日曆清理置頂、公司體質快篩、資料就緒檢查移位、股池擴充** |
| **v16.8** | **2026-07-05** | **智慧更新一鍵整併：11 個來源依 TTL 自動判斷、新鮮自動略過；與完整更新分工明確** |
| **v16.7** | **2026-07-04** | **營收 5 年比較（Yahoo 回補、季增 / 年增 / 同月 / 趨勢判讀）、市場風險雷達合一翻修（連續計分 + 每日日誌對照 + 90 天歷史回推）** |
| **v16.6** | **2026-07-04** | **記憶體 DRAM / NAND 報價趨勢每日快照、個股營收儀表板（YoY / MoM / 動能）、全主題供應鏈拉貨動能 proxy** |
| **v16.5** | **2026-07-04** | **資訊減噪：催化劑 / 總經 / 標的找尋摘要優先詳表按需、canonical placement 稽核、外部來源列統一、host_permissions 收斂** |
| **v16.4** | **2026-07-03** | **除息行為分析延伸：20 日填息 proxy、除息前 20 日弱勢統計、近 3 / 5 年平均殖利率並列與舊快取 schema 修復** |
| **v16.3** | **2026-07-02** | **新增個股營收連結中樞分頁與除息行為分析（最後買進日、殖利率、近五年開高開低、連年配息與業外檢查）** |
| **v16.2** | **2026-07-01** | **台灣用語統一、外部連結開新分頁修正、急殺雷達自動更新降頻並批次重繪** |
| **v16.1** | **2026-06-30** | **急殺雷達自動 TTL 輕量更新並重算、快取優先加速、TXF 第二來源改為夜盤卡片內超連結** |
| **v16.0** | **2026-06-30** | **啟動延後業績資料層、主題總覽持股詳表按需載入、TXF 第二來源移入夜盤卡、急殺雷達新鮮度、日曆多檔顯示與勝率 proxy 邊界修正** |
| **v15.9** | **2026-06-28** | **修正 TAIFEX 台指期夜盤深連，Tide / 外部資料引用補齊來源連結與 smoke gate** |
| **v15.8** | **2026-06-28** | **新增詳細籌碼按需載入、共用 chip context，主題總覽 Tide 只讀快取摘要** |
| **v15.7** | **2026-06-28** | **收斂 technical 籌碼明細與 Tide 重複摘要，加速切頁並降低重複指標** |
| **v15.6** | **2026-06-28** | **新增 Tide 情緒快照：panic index、避風港板塊、法人異常買賣與 daily_digest 來源複核** |
| **v15.5** | **2026-06-27** | **新增 Tide 板塊資金潮汐摘要、5/20 日法人資金排序、逆勢買超板塊與 TWSE / TPEx 核對入口** |
| **v15.4** | **2026-06-25** | **新增官方除權息日曆、Yahoo / 鉅亨交叉核對、記憶體報價追蹤狀態、主題總覽分批載入與 TXF 官方直連** |
| **v15.3** | **2026-06-24** | **收斂現行研究方法，新增 research_data.json 長期業績基線、IndexedDB 增量儲存與月營收去重下載** |
| **v15.2** | **2026-06-22** | **新增 AI factory 核心10、未發酵 10 方向與優先級 1–7 標籤；功率半導體拆分 MOSFET / Driver IC / PMIC / HVDC 待複核** |
| **v15.1** | **2026-06-21** | **新增季財報三率 CSV 匯入與持股三率缺口診斷：三率三升 / 三降、金融股不適用邊界與 smoke fixture** |
| **v15.0** | **2026-06-21** | **持股作戰室新增月營收缺口診斷表：逐檔拆分已取得、缺資料、尚未更新與 ETF 不適用，並納入 web / extension smoke gate** |
| **v14.9** | **2026-06-20** | **月營收改用 MOPS t187ap05 官方 CSV、補 revenueMeta 缺資料診斷、修正 6669 持股加入回饋並新增法人 / 產業報告入口** |
| **v14.8** | **2026-06-20** | **持股作戰室新增營收動能卡：月營收 YoY / MoM、連三月改善或轉弱、三率三升待季財報資料邊界與 smoke gate** |
| **v14.7** | **2026-06-19** | **金融股從好老闆拆出成獨立左側股池：放在防守現金流上方、金融股專屬研究框架、CSV 匯出與 smoke gate** |
| **v14.6** | **2026-06-18** | **好老闆候選池新增金融股分組：十檔金融候選、資本適足 / RBC / BIS、逾放比、配息能力與候選分組 CSV** |
| **v14.5** | **2026-06-18** | **好老闆新增候選擴充池：九檔待複核候選、候選型態、主要風險、複核優先級、下一步規則與候選 CSV 匯出** |
| **v14.4** | **2026-06-18** | **好老闆新增經營品質矩陣：五軸研究分、資料覆蓋、複核優先級、下一步規則與 CSV 匯出** |
| **v14.3** | **2026-06-17** | **左側新增好老闆主題：台積電、大立光、致新、台達電、研華、川湖，並顯示治理型態、列入理由、主要風險與官方核對入口** |
| **v14.2** | **2026-06-17** | **產業趨勢雷達新增盤前主線行動佇列：依 regime、confidence、持股曝險與缺資料排序主線候選、持股風控、降權與補資料，並可匯出 CSV** |
| **v14.1** | **2026-06-17** | **主題總覽新增產業趨勢雷達：以報價廣度、日線、月營收、籌碼與主動 ETF 共識判斷主題 regime、輪動型態與資料 confidence** |
| **v14.0** | **2026-06-16** | **分類稽核新增批次補資料佇列：依 worklist 缺口產生補報價、補日線、補月營收、補估值、補籌碼與分類待複核入口** |
| **v13.9** | **2026-06-16** | **分類稽核新增補資料優先清單：依缺資料、fallback、low confidence 與待複核分類排序，並可匯出 worklist CSV** |
| **v13.8** | **2026-06-15** | **主題總覽新增 Goodinfo-style 分類稽核表與 CSV 匯出：逐檔標示核心 / 延伸 / 待複核、資料覆蓋、confidence、fallback 與 TWSE / TPEx / MOPS 官方核對入口** |
| **v13.7** | **2026-06-15** | **新增 YouTube 股市心得資料層與本機轉錄摘要 pipeline：Podcast 頁讀取 JSON seed，腳本可由本機 transcript / audio 產生 signals、confidence 與交叉比對項** |
| **v13.6** | **2026-06-14** | **Podcast 頁新增 YouTube 股市心得來源卡：收錄 Gooaye / River 指定影片，標示無公開字幕、待轉錄、metadata-only 與交叉比對限制** |
| **v13.5** | **2026-06-14** | **總經頁新增來源稽核面板：集中顯示 FedWatch、Fed SEP、VIX、Treasury、CBC、TWSE 融資券的來源層級、日期、confidence、fallback 與待複核狀態** |
| **v13.4** | **2026-06-14** | **FedWatch × 點陣圖新增 CME 最近成功快取 fallback 與政策落差趨勢表，避免 CME timeout 時 Fed path 消失，並追蹤市場相對 Fed 更鴿 / 更鷹方向** |
| **v13.3** | **2026-06-14** | **總體經濟與風險新增 FedWatch × 點陣圖 regime：分開顯示 CME 市場預期、Fed SEP 官方中位數、政策落差與台股資產映射，並接入 Market Heat Score** |
| **v13.2** | **2026-06-09** | **參考 Goodinfo 類股 / 概念股掃描邏輯重整左側分類：拆分 AI Server 散熱 / 電源、重電 / 電網、防守現金流、景氣高息觀察，並補 PCB / 記憶體 / CPO / 機器人待複核股池** |
| **v13.1** | **2026-06-09** | **技術頁新增 K 線 / 漲跌停合法價位、量能 Regime / 相對量、個股籌碼強弱與融資增減判讀，並納入 smoke gate** |
| **v13.0** | **2026-06-07** | **版面載入加速：抽出版本日誌並 lazy load，`main.html` shell 降到 124.6KB，新增 shell size / startup budget gate** |
| **v12.9** | **2026-06-07** | **建立 v12.9 release gate：全頁重複顯示稽核、效能診斷面板、diagnostics helper 拆分；真實 extension context 仍需 Chrome UI reload 比對** |
| **v12.8** | **2026-06-07** | **收斂技術 × 籌碼卡重複提示，新增 derived signal cache 與 smoke 載入速度 / 去重檢查** |
| **v12.7** | **2026-06-06** | **目前持股新增 MA5 / MA20（月線）失守警告，跌破時直接顯示「目前有問題」與價位乖離** |
| **v12.6** | **2026-06-06** | **急殺雷達新增 panic override、台指期夜盤硬觸發、外部科技風險、融資/外資空單共振、風險意識管理與文獻映射** |
| **v12.5** | **2026-06-06** | **大盤總覽新增急殺風險雷達：台指期領跌、期貨籌碼、法人退場、融資退潮、乖離過大、廣度轉弱與 VIX risk-off 合成警示** |
| **v12.4** | **2026-06-06** | **修正開啟後背景任務造成網頁無回應：full state 不自動合併、背景完整改 opt-in、手動完整更新維持快路徑、startup auto refresh 分散排程** |
| **v12.3** | **2026-06-05** | **啟動加速、core seed、bundled state 瘦身、背景更新延後、主動 ETF seed 按需載入與 repo 忽略規則整理** |
| **v12.2** | **2026-06-04** | **新增記憶體 DDR4 / DDR5 報價中控、TrendForce 公開表格 runtime 解析、本機報價趨勢線與 HBM 狀態分流判讀** |
| **v12.1** | **2026-06-04** | **新增勝率 proxy 歷史校準、校準快取、共享框架 v1.1 與原生 ARM extension smoke runner** |
| **v12.0** | **2026-06-04** | **新增工具內勝率 proxy、量化篩選勝率欄位、worker 批次排序、windowed rendering、cache repository 與 extension preflight 診斷** |
| **v11.9** | **2026-06-04** | **Hot cache v2：snapshots / 法人 history / 主動 ETF 快照分層儲存，中央排程 TTL，主題卡片與量化表渲染軟上限，startup idle bootstrap 與 worker health check** |
| **v11.8** | **2026-06-03** | **改善載入與抓資料速度：K 線改 IndexedDB hot cache 分層、bundled state 瘦身、快速更新背景同步加 TTL 避免短時間重新抓取** |
| **v11.7** | **2026-06-03** | **新增第 06「先進封裝CoWoS/CoPoS」與玻璃基板 / GCS / TGV 多重標籤；第 03 改為「台積電相關」，網通起分類序號往後順延** |
| **v11.6** | **2026-06-02** | **更新目前持股 preset 為 24 檔，新增持股作戰室，並延後讀取 bundled state 以加快初始畫面載入** |
| **v11.5** | **2026-05-29** | **新增標的找尋左側 / 右側候選與避開清單，修正退休存股股池新增並加入 0050 作核心台股曝險** |
| **v11.4** | **2026-05-28** | **精簡上方主分頁，將快照籌碼與主題技術排行併入主題總覽，移除空的比較圖與獨立估值資料頁，讓個股研究 / 技術分析只顯示選取個股** |
| **v11.3** | **2026-05-28** | **新增月線 / 季線 / 年線多週期乖離 profile，接入個股過熱 / 深跌分數、技術數字摘要與正負乖離排行** |
| **v11.2** | **2026-05-27** | **月線乖離 / 減碼紀律卡新增分位解讀口徑與買回紀律說明，將操作邏輯直接寫進 extension** |
| **v11.1** | **2026-05-27** | **技術分析新增個股 MA20 乖離歷史分位與減碼買回紀律卡，避免用固定乖離率套所有股票並降低賣飛後心理錨定** |
| **v11.0** | **2026-05-27** | **技術分析 & 籌碼頁將三大法人逐日買賣超改為預設收合核對區，主畫面聚焦多週期累計，降低日期列誤讀** |
| **v10.9** | **2026-05-27** | **搜尋 debounce 後改成只重繪目前分頁，並讓 render queue 保留 full render 優先權，降低搜尋時固定 UI 重繪成本** |
| **v10.8** | **2026-05-26** | **新增搜尋候選與 filteredStocks 篩選結果快取，並讓搜尋索引簽名納入自訂類股內容，降低搜尋 / 切主題後重複重算** |
| **v10.7** | **2026-05-26** | **股號搜尋改走快速 code index，縮短股號型查詢 debounce；放大技術 / 籌碼頁現價、漲跌與過熱 / 深跌提示字級** |
| **v10.6** | **2026-05-26** | **技術分析 & 籌碼新增個股過熱 / 深跌超賣訊號，放在價格附近並拆解 RSI、布林、MA20 乖離、量價、KD、大量 K、修復、大戶 / 散戶與融資資料來源** |
| **v10.5** | **2026-05-26** | **收斂 release gate、Current Priorities 與回歸矩陣；目前出貨阻塞聚焦 v10.4 / v10.3 / v10.2 extension context 回歸、紅綠色語意與更新流程；網站化維持 Parking Lot** |
| **v10.4** | **2026-05-26** | **大盤總覽新增 Market Heat Score 市場過熱 / 回檔風險，整合 TAIEX 技術線型、追蹤池廣度、TWSE 融資券、TAIFEX 期權、VIX、美債 10Y、USD/TWD 與估值樣本，並顯示來源、日期、信心與缺資料** |
| **v10.3** | **2026-05-26** | **快照趨勢新增主題層外資持股趨勢排名，顯示最近 5 筆變化、起迄日期、來源、信心與可用筆數；收斂外資累積 / 出清主題層 ranking 待辦** |
| **v10.2** | **2026-05-25** | **降低儲存 / 重繪卡頓；處置風險 v2 分層與綜合排行；修正「空」字過度染色；網站化暫緩，先集中維護 extension** |
| **v10.1** | **2026-05-25** | **新增官方注意累計異常 / 今日注意交易與處置風險欄；大盤總覽、量化篩選與交易雷達同步接入；修正月營收 null yoyPct 載入錯誤** |
| **v10.0** | **2026-05-21** | **新增第 17 類退休存股，整合 00713、0056、00929 與防守現金流個股；主題總覽新增月配 / 季配 / 年度配息骨架、買入條件、折溢價與稅後總報酬提醒** |
| **v9.9** | **2026-05-21** | **大盤總覽新增今日變化摘要，集中顯示 Top 變化個股、主要原因、大戶在場與散戶熱度** |
| **v9.8** | **2026-05-21** | **日常完整更新改為背景完整更新，不再等待 5 秒無操作，也不因點擊 / 輸入 / 滾動取消；忙碌時自動重試等待** |
| **v9.7** | **2026-05-20** | **大盤總覽新增資料健康總分，集中檢查報價、日線、籌碼30日、ETF、月營收與大盤 / 期貨，並分流快速更新 / 完整更新建議；完整流程狀態寫入 state payload** |
| **v9.6** | **2026-05-20** | **更新入口收斂為快速更新 / 完整更新；單項更新移入維護；日常完整流程改顯示本日狀態；修正 TAIEX_CODE is not defined** |
| **v9.5** | **2026-05-20** | **新增大戶仍在場與散戶情緒溫度計；量化篩選新增大戶在場 / 散戶熱度排序欄，籌碼決策卡加入 v9.5 籌碼心態拆解** |
| **v9.4** | **2026-05-17** | **技術線圖預設開啟，圖中文字改集中到關鍵價位列避免重疊；搜尋改預建索引與延後主畫面重繪，降低輸入卡頓** |
| **v9.3** | **2026-05-17** | **搜尋框放大與高對比、搜尋結果顯示命中理由與高亮；技術線圖預設改數字摘要，線圖與多層疊圖手動顯示以降低卡頓** |
| **v9.2** | **2026-05-17** | **啟動自癒熱修：正規化舊快取 search / filter / holdings，概念輪動空資料防呆，ETF 判斷移除宣告順序風險，避免空白頁或看不到股票** |
| **v9.1** | **2026-05-17** | **大盤總覽新增今日概念股輪動、CPO / 矽光子族群強弱與台指期結算日提醒；分類改採多標籤補強，3008 大立光同步標示光學鏡頭、蘋概股與 CPO 光學觀察** |
| **v9.0** | **2026-05-17** | **新增第 15 主題「被動元件」：國巨固定第一，整合 MLCC、電阻、電容、電感、材料與濾波 / 振盪器相關股票；同步研究標籤、Podcast 關鍵字、股池管理選單與版本文件** |
| **v8.9** | **2026-05-17** | **更新入口收斂：輕量定時、日常完整更新流程、上方單項更新三者拆清楚；原「完整更新」改名「報價估值」，流程卡標示包含與不包含的資料層** |
| **v8.8** | **2026-05-17** | **新增事件後續航統計：用同股過去相似事件估計 1 / 3 / 5 / 10 日續航率、平均報酬與逆風幅度，接入技術分析卡、技術排行、量化篩選新事件欄、交易雷達與籌碼決策摘要** |
| **v8.7** | **2026-05-17** | **新增技術事件新鮮度：回看近 20 根日線，標示大量 K / 週線大量 K / POC / MA20 / ATR 穿越是今日、近3日、近5日或延續，並接入技術分析卡、技術排行、量化篩選新事件欄與籌碼決策摘要** |
| **v8.6** | **2026-05-17** | **新增交易狀態機與今日技術事件：整合大量 K、修復、ATR、POC、KD / 背離與 RSI 過熱，接入技術分析卡、技術排行、量化篩選交易狀態欄與籌碼決策摘要** |
| **v8.5** | **2026-05-16** | **新增失守後修復 / 再進場判讀、KD / 背離 Checklist、修復候選與反彈未收復排行，並整合到 v8.5 技術決策層、線圖與籌碼決策摘要** |
| **v8.4** | **2026-05-16** | **新增技術決策層：整合 ATR 初始 / 追蹤停損、週線大量 K 攻防與 Volume Profile POC 成本區，接入個股技術分析、線圖、講義價位、Checklist、籌碼決策摘要與技術排行** |
| **v8.3** | **2026-05-16** | **新增大量 K 高低攻防：判斷上漲是否站上大量高、下跌是否跌破大量低，整合個股技術分析、線圖水平線、講義支撐壓力、Checklist 與技術排行** |
| **v8.2** | **2026-05-16** | **新增法人買賣超 × 漲跌停鎖單強度：官方 MIS 五檔鎖單張數除以發行股數代理流通張數，整合 Chip Score、籌碼頁、量化篩選與大盤法人排行** |
| **v8.1** | **2026-05-16** | **ETF 追蹤入口改由左側第 12 / 第 14 主題驅動；Podcast 更新鍵移到 Podcast 頁且支援開頁自動更新；大盤總覽新增 TWSE + TPEx 三大法人外資 / 投信 / 自營商 / 合計買賣超前10** |
| **v8.0** | **2026-05-15** | **全站 24 小時制；美股四大指數顯示當地美東時間 + 台北抓取時間；新增法人近30日快取預熱；ETF 共識改為今日投信共同買進 / 共同賣出 Top 5 並顯示權重變化明細** |
| **v7.9** | **2026-05-15** | **新增 / 校正 3305 昇貿、2059 川湖、3665 貿聯-KY、2449 京元電子分類；新增 PCB / 組裝材料、AI Server 機構件、高速連接 / 線束研究標籤；同步 app version、manifest、README 與頁面 changelog** |
| **v7.8** | **2026-05-15** | **全 WATCHLIST 回測排名、K 棒型態與背離線圖標記、TWSE50 / MID100 自動同步、TDCC 大戶歷史趨勢、TAIFEX TXO OI 熱力圖、CSV 匯出與 IndexedDB K 線快取管理** |
| **v7.5** | **2026-05-14** | **自動更新流程新增每步耗時、來源摘要、資料覆蓋率與錯誤明細，讓 Chrome 實測時可直接定位報價 / 日線 / ETF / 法人等資料層問題** |
| **v7.4** | **2026-05-13** | **新增自動更新流程面板、停止本次 / 立即跑一次、步驟狀態紀錄、避免自動更新任務重疊；ETF 表格改顯示現價 / NAV / 折溢價與 NAV 日期；介面用語統一為更新** |
| v7.3 | 2026-05-13 | Claude 完成市值分類稽核、防呆門檻、技術線圖價格英雄列、台股 / 美股 / 日股市場狀態與美股盤中大盤更新 |
| **v7.0** | **2026-05-13** | **新增開啟後 5 秒 idle 自動更新、TWSE / TPEx 官方日收盤表報價備援、報價 / 日線分母排除興櫃與未上市櫃待複核觀察股、校正多檔市場別 suffix，並補入 2337 旺宏、8081 致新、1476 儒鴻** |
| v6.9 | 2026-05-13 | 新增最左側「大盤總覽」分頁、台灣加權指數 / 台指期夜盤 / 美股四大指數線圖與 ETF NAV / 折溢價 / 持股展開 / 法人回補 / v5.2 技術卡片健康檢查 |
| **v5.3** | **2026-05-10** | **第 14 主題改名「海外 / 美日股 / 美債 ETF」並新增日股 ETF（00955 中信日本商社、00949 復華日本龍頭）+ Buffett 商社 80/20 配置建議 + 替代投資途徑表（直接買日股 / Berkshire BRK.B / 美國掛牌 DXJ EWJ BBJP）+ 東京掛牌五大商社快速參考（8058 三菱商事 / 8001 伊藤忠 / 8031 三井物產 / 8002 丸紅 / 8053 住友商事）+ USD/JPY × 日股 ETF 雙層匯率影響鏈；每檔海外 ETF 新增配息 5 類來源（股利 / 利息 / 海外 / 資本利得 / 收益平準金）+ 個人課稅口徑（最低稅負制 670 萬、二代健保 2.11%、證交稅 0.1%）+ 投信收益分配通知書連結；所有股票（個股 + ETF）新增複合流動性評估，依日均張數（主，500 張為實務分水嶺）+ 日均金額（輔），取較嚴格者；流動性扣分整合到雷達分（過小扣 8 / 小型扣 4）；量化篩選新增流動性過濾（全部 / 排過小 / 排過小+小型 / ≥ 500 張 / ≥ 1,000 張）；新增操盤手工具入口（借券、券商分點、半導體景氣 SEMI / WSTS、日股總經 BOJ Tankan JPX Berkshire 13F、匯率 USD/TWD JPY DXY、IR 行事曆）；分頁切換新增 Cmd/Ctrl + 1..9 / 0 鍵盤快捷鍵；流動性方法學面板含 TWSE / Amihud / Kyle 學術文獻引用** |
| v5.2 | 2026-05-09 | 技術分析分頁新增朱家泓 × 林穎講義方法學來源與程式映射、最近行情欄位與本益比/同業平均 PE；三大法人擴成當日、2/3/5/7/10/14/30 日、1/3/6 個月與累計；新增 AI / 半導體 / 電力基建供應鏈股池並以股號去重 |
| v5.1 | 2026-05-09 | 美債 ETF 面板新增 Fed / FOMC 官方 RSS、U.S. Treasury 殖利率曲線與中央銀行 USD/TWD 自動抓取，輸出紅黃綠燈號、最佳買進情境排名、實務判斷表與台灣可能稅務提示 |
| v5.0 | 2026-05-09 | 美債 ETF 主題總覽新增利率 × 匯率情境圖，將 Y 拆成 Y1 台幣配息與 Y2 台幣本金帳面價值，列出核心公式、四象限情境與 X–Y 因子表；TWSE 處置股查詢改回看最近 60 天，避免健策 3653 這類剛處置結束個股被預設查詢漏掉 |
| v4.9 | 2026-05-09 | 將總體經濟與風險矩陣整併為「總體經濟與風險」；總經與上市融資 / 融券快照開始累積趨勢圖；個股估值改成 EPS × PE 低 / 中 / 高情境並顯示公式、來源、可信度與資料缺口；熱門新聞新增 Yahoo / MoneyDJ / 經濟日報 / 工商 / CMoney 交叉核對入口 |
| v4.8 | 2026-05-09 | 新增報價新鮮度檢查，Yahoo fallback 改用實際 regularMarketTime；上方新增大台 / 小台 / 微台期貨報價與多空水位解讀；個股研究新增估值買進/賣出帶與 MOPS 配股配息 / 本期淨利；金寶補入量子電腦與低軌衛星標籤 |
| v4.7 | 2026-05-09 | 新增處置股分頁與兩個月放出日曆；修正 Anue 新聞 API 解析；總經頁直接顯示 TWSE / Cboe / U.S. Treasury 數值；ETF 第 12 / 14 主題分類重整；三大法人新增 7 / 14 / 30 日摘要與主動 ETF 大量賣股提示 |
| v4.6 | 2026-05-07 | 依《朱家泓 × 林穎 技術分析初階班》補強講義價位框架：進場 1 / 2、停損、目標 1 / 2、大量 K 半價支撐壓力、切線近似，並將百分點差異完整顯示為「百分點」 |
| v4.5 | 2026-05-07 | 新增「總體經濟」頁（官方來源 + MacroMicro / Investing 交叉比對）、即時熱門新聞 Top 10（Anue API）、ETF Edge 換股比對、融資融券水位移入風險矩陣 |
| v4.4 | 2026-05-07 | 主題 12-15 重整（台股主被動 ETF / 存股 / 海外 / 美股 / 美債 ETF）、搜尋即時候選下拉、主題展開收起 Grid、官網連結修正、6442 分類修正 |
| v4.3 | 2026-05-06 | 前一版 |
| v4.2 | 2026-05-05 | 股池管理、四類一鍵更新、籌碼 5 日窗口、ETF 費用率 |
| v4.1 | 2026-05-03 | 美債 ETF 區塊（5 檔） |
| v4.0 | 2026-05-03 | 名詞說明元件、分頁記憶、IC 設計擴充至 15 檔 |
| v3.x | 2026-04-25 起 | 交易雷達、市值級距、主動式 ETF 整合 |

---

## 注意事項

- 所有訊號（外資累積 / 出清、Chip Score、交易雷達分、大戶仍在場、散戶情緒溫度計）為**工具內自訂研究排序規則**，非官方訊號，不保證報酬。
- 財報、股利、EPS 等財務資料請**以財報狗等外部網站為準**，本 extension 僅提供連結入口。
- 本工具快照預設保留 180 天；完整資料存於 `chrome.storage.local`，`localStorage` 僅儲存小型偏好備援。
