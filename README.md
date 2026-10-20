# 金陵行前：南京旅行规划 WebGIS（课设展示版）

面向课程设计展示的南京旅行规划应用，使用 Vue 3、Vite 和 FastAPI。提供高德地图、40 个正式景点与照片、地铁专题、地点搜索、住宿安排、轻松／紧凑／鸭子三类行程、沿途餐饮蜂巢、南京鸭文化、23 步实机教程，以及方案 JSON 和 PNG 行程单导出。

当前运行代码与原项目 `ede906fb39ffd97f948913a35ecfa05c6fa63650`（2026-10-19提交，2026-10-20同步）同步，保留展示版独立的配置检查入口。

本仓库提供运行代码、正式静态数据、图片资源、依赖清单和Windows启动脚本。克隆后安装依赖、填写自己的API配置即可运行。

## 环境

- Python 3.12。
- Node.js 24 LTS（包含 npm）。
- Chrome 或 Edge，建议电脑窗口 1440×900 或 1280×800。
- 首次安装依赖以及在线地图、地点搜索、道路交通和天气查询需要网络。

## 1. 安装依赖

克隆仓库并在根目录打开 PowerShell：

```powershell
git clone https://github.com/tongyannya/nanjing-travel-webgis-course-demo.git
Set-Location nanjing-travel-webgis-course-demo
python -m venv backend/.venv
& backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
npm --prefix frontend ci
```

## 2. 自行填写 API 配置

```powershell
Copy-Item .env.example .env
notepad .env
```

需要使用自己的高德地图和和风天气账号申请配置；仓库不提供可直接使用的 Key。真实 `.env` 已加入忽略列表，不要提交到公开仓库。

| `.env` 配置项 | 用途 | 是否必填 |
|---|---|---|
| `VITE_AMAP_JS_KEY` | 高德“Web 端（JS API）”Key | 是 |
| `AMAP_JS_SECURITY_CODE` | 与上述 JS API Key 配套的安全密钥 `securityJsCode` | 是 |
| `AMAP_WEB_SERVICE_KEY` | 高德“Web 服务”Key，用于地点、酒店及交通查询 | 是 |
| `QWEATHER_API_HOST` | 和风天气控制台提供的 API Host，不带 `https://` | 否，与天气 Key 配套填写 |
| `QWEATHER_API_KEY` | 和风天气 API Key | 否，与天气 Host 配套填写 |

**三项高德配置缺少任一项，都不能进入应用。** 一键启动会提示缺失配置；即使手动启动并直接打开网页，也只显示配置提示页，不加载地图、规划界面或教程。填写后需要重启前后端，再刷新网页或点击“重新检查配置”。此检查确认配置已填写；Key 无效、权限不足、来源限制或额度耗尽仍会显示相应服务错误。

**天气配置可选。** 未填写 Host 或天气 Key 时，顶栏天气显示不可用，可查看提示并重试，地图、景点浏览、教程与行程规划仍可使用。使用和风天气每日预报接口，需为自己的账号开通相应权限。

高德 JS API Key 会按地图 SDK 的工作方式提供给浏览器；安全密钥、高德 Web 服务 Key 和天气 Key 由后端读取。请在服务商控制台按实际访问地址配置来源限制和额度。项目通过后端 `/_AMapService` 代理处理高德 JS API 安全校验；前端和后端都需要运行。

## 3. 启动

Windows 推荐双击根目录 **`启动项目.cmd`**。它检查依赖、三项高德配置和端口，启动前后端并打开浏览器。

也可在两个 PowerShell 窗口手动启动：

```powershell
# 窗口一：在项目根目录启动后端
& backend/.venv/Scripts/python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

```powershell
# 窗口二：在项目根目录启动前端
npm --prefix frontend run dev
```

- 页面：<http://127.0.0.1:5173>
- 后端 API 文档：<http://127.0.0.1:8000/docs>
- 停止服务：在各运行窗口按 `Ctrl+C`。

默认端口可在 `.env` 中修改；`VITE_API_BASE_URL` 留空时使用同源 `/api`，开发服务器自动代理到配置的后端地址。修改配置后重启服务。

## 展示流程

1. 进入地图后，从总览打开“使用教程”；首次统一准备资料，完成后切页和再次打开复用当前页面缓存。
2. 搜索“鸡鸣寺”等景点，点击带“收录景点”标签的结果，查看照片和资料。
3. 先安排住宿，再填写日期、人数、景点偏好和交通倾向，生成选定类型的行程。
4. 点击方案卡片查看单日顺序、时间轴和实际交通段。再按需生成鸭子方案，查看沿途预留的一小时用餐区域、分日鸭餐次数，以及格内普通／南京鸭店铺；开启南京鸭文化可浏览专题分布和文化介绍。
5. “作者的话”按时间顺序列出项目介绍、AI 使用说明、致谢和阶段总结；长文章在正文区独立滚动。
6. 使用“保存/导出方案”保存在当前浏览器，或导出 JSON 文件及 PNG 行程单。更换浏览器／电脑时通过 JSON 导入恢复；清理浏览器数据会删除本机保存。

景点、地铁、餐饮蜂巢和文化内容使用随仓库提供的静态资料，地图瓦片、地点搜索和道路交通依赖在线服务。景点票价、开放与预约信息及天气仅供课设演示参考，实际出行以官方最新公布为准。

## 目录与构建

```text
backend/app/          FastAPI 接口、行程规划与服务商查询
frontend/src/         Vue 界面、地图图层、教程和导出
frontend/public/      正式景点照片、地图图标、鸭向导和教程示例
data/formal/          运行所需的正式静态数据与图片来源映射
data/schemas/         运行时校验行程请求／结果所需的 JSON Schema
scripts/              Windows 本机启动脚本
.env.example          无密钥配置模板
```

构建前端：

```powershell
npm --prefix frontend run build
```

如需在本机用一个服务查看构建结果，可保持 `.env` 的 `VITE_API_BASE_URL` 为空后构建，再执行：

```powershell
& backend/.venv/Scripts/python.exe -m uvicorn backend.app.production:app --host 127.0.0.1 --port 8000
```

此时打开 <http://127.0.0.1:8000>，网页、API 和高德安全代理由同一个服务提供。只启动前端静态文件服务器不能替代后端。

## 资料来源

正式景点来源与核验日期保存在 `data/formal/attractions.json`，照片来源保存在 `data/formal/attraction_images.json`；鸭文化引用保存在 `data/formal/duck_culture.json`，界面也提供来源入口。第三方照片、地图和内容的权利归原作者或服务商所有，本仓库不对这些资源另行授予许可。
