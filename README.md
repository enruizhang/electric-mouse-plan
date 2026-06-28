# 电鼠行动记录 PWA

这是一个独立的离线优先 PWA，用来记录计划、周期事项、重要事项和已经做过的统计。数据保存在当前浏览器本地，不需要后端。

当前版本包含便签式模块和任务、可拖拽电鼠、每日 12:00 的“只有今日做的事”自动归档、往日任务补打卡、关键字对比和离线缓存。

## 本地打开

最简单方式：直接双击 `index.html` 查看页面。

更接近真实 PWA 的测试方式：在当前文件夹启动一个本地静态服务器，例如：

```powershell
python -m http.server 8080
```

然后打开：

```text
http://localhost:8080/
```

Service Worker 和安装体验通常需要通过 `http://localhost` 或 HTTPS 测试，直接打开本地文件时离线缓存能力可能不会完整启用。

## GitHub Pages 部署

1. 在 GitHub 新建一个仓库。
2. 把本文件夹里的这些文件提交并推送到仓库：`index.html`、`style.css`、`app.js`、`manifest.webmanifest`、`service-worker.js`、`README.md`、`icon-192.png`、`icon-512.png`。
3. 打开仓库的 `Settings`。
4. 进入 `Pages`。
5. `Build and deployment` 选择 `Deploy from a branch`。
6. Branch 选择 `main`，目录选择 `/root`，保存。
7. 稍等 GitHub Pages 生成网址后访问。

## 手机安装

Android Chrome：打开 GitHub Pages 地址，点浏览器菜单，选择“添加到主屏幕”或“安装应用”。

iPhone Safari：打开 GitHub Pages 地址，点分享按钮，选择“添加到主屏幕”。

更新后如果手机端仍显示旧版本，可以先在浏览器刷新页面，再关闭并重新打开 PWA；必要时删除桌面图标后重新添加。代码更新时也要同步更新 `service-worker.js` 里的缓存版本号。

## 每日 12:00 逻辑测试

网站会使用本机时间，不联网。行动日期以每天 12:00 为分界：12:00 之后进入新日期；如果用户 12:00 之后才打开页面，也会在启动时检查并归档旧日期。

测试方式：

1. 在“只有今日做的事”里添加几条任务。
2. 打开浏览器开发者工具，找到 LocalStorage 里的 `electric_mouse_plan_v1_state`。
3. 把里面的 `activeDay` 临时改成更早的日期，例如 `2026-06-27`。
4. 刷新页面。
5. 当前任务会进入“往日任务”，今日任务区会清空并开启新日期。

也可以临时调整电脑本机时间跨过 12:00 后刷新页面测试。测试完记得把系统时间改回正常。

## 数据说明

本网站使用新的本地存储前缀：

- `electric_mouse_plan_v1_state`
- `electric_mouse_plan_v1_history`
- `electric_mouse_plan_v1_settings`
- `electric_mouse_plan_v1_speech`
- `electric_mouse_plan_v1_background`

不会使用旧购物清单网站的存储 key。
