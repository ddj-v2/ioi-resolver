# hydrooj-ioi-resolver

HydroOJ 的 IOI/StrictIOI 封榜滾榜插件。

此插件會新增一個排行榜檢視 `IOI Resolver`，可在比賽結束後逐步揭曉封榜期間提交，並在每一步揭曉後即時重排名次。

## 功能特色

- 新增排行榜檢視：`IOI Resolver`
- 支援賽制：`ioi`、`strictioi`
- 封榜後逐步揭曉（step-by-step reveal）
- 每一步揭曉後即時重算排名
- 支援部分分數更新（例如 `P30 -> P70 -> AC`）
- 支援鍵盤操作：`Right Arrow` / `N` / `Space` 下一步

## 安裝

將本套件放在 Hydro 插件目錄後，在本資料夾安裝依賴：

```bash
npm install
```

## 設定

可選設定如下：

```yaml
ioi-resolver:
  requireEditPerm: true
```

- `requireEditPerm: true`（預設）
  需要 `PERM_EDIT_CONTEST` 才能開啟滾榜頁。
- `requireEditPerm: false`
  改為需要 `PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD`。

## 使用方式

1. 進入已結束的 IOI/StrictIOI 比賽排行榜。
2. 在 scoreboard view selector 選擇 `IOI Resolver`。
3. 使用鍵盤控制滾榜：
   - `Right Arrow` / `N` / `Space`：揭曉下一步

## 計分與揭曉規則

- 封榜前：每題採目前最佳分數。
- 封榜後：先以凍結狀態顯示（`舊分數 + [凍結提交數]`）。
- 揭曉時：
  - 該題分數更新為封榜區間內最佳分數（若更高才更新）。
  - 隊伍總分只加上差額（delta），避免重複計分。
  - 同步重排名次。

範例：某題從 `30` 分揭曉到 `70` 分，總分只增加 `40`；再從 `70` 到 `100`，總分只再增加 `30`。

## 注意事項

- 只能在「比賽結束後」使用滾榜。
- 本插件是 IOI 分數制滾榜，不適用 ACM/ICPC 罰時解題數模型。
- 打星隊伍（`unrank`）仍可顯示於榜單，但不計正式名次。
