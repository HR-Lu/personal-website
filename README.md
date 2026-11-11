# haoran.lu

个人网站。纯黑底 + 星空流场粒子（mos.caldis.me 一比一对齐），首页一句「我思 / 故我在。」，入口进去是「紫微命门」：浏览器内完成紫微斗数排盘，并由自建后端做 AI 流式解读。

纯静态、无框架、无构建步骤，一个 `index.html` + 三个脚本就是全部前端；后端独立部署在香港 VPS，只负责持有 LLM Key 并转发。

## 功能

- **星空背景**：流场粒子 + 拖尾擦除，鼠标附近有旋涡扰动；触屏设备不跟随手势，改为点按处起一圈涟漪
- **紫微命门**：称呼 / 性别 / 公历农历 / 早晚子时，本地引擎排十二宫，主星按庙旺得利平不闲陷分四档亮度，四化徽章、空宫借对宫、宫内自化
- **AI 解读**：SSE 流式，固定四段（性格 / 事业 / 感情 / 提醒），支持连续追问与快捷问题
- **响应式**：桌面端整屏不滚动；手机端整页一起滚、输入框不顶边、键盘弹出自动让位

## 目录

```
.
├── index.html              首页 + 紫微浮层（样式全部内联）
├── assets/
│   ├── ziwei-ui.js         紫微前端：表单 / 排盘渲染 / AI 流式对话
│   ├── ziwei.engine.js     排盘引擎（打好的 bundle，首次排盘才懒加载）
│   └── jelly-button.js     入口按钮的果冻物理
├── tools/
│   ├── build-deploy.sh     生成 EdgeOne 上传目录 deploy/
│   └── ziwei-entry.js      引擎打包入口
├── docs/                   开发记录、接入方案、域名记录、复用指南
└── deploy/                 构建产物（已 gitignore）
```

## 本地运行

```bash
python3 -m http.server 8000
```

打开 <http://localhost:8000>。不要双击 `index.html`（`file://` 下 Origin 为 `null`，后端 CORS 会拒绝）。

## 部署

前端（EdgeOne Pages）：

```bash
sh tools/build-deploy.sh      # 生成 deploy/
cd deploy && zip -r ../deploy.zip .
```

把 `deploy/` 或 `deploy.zip` 整体上传到 EdgeOne Pages 即可，静态资源无需构建。

后端（`api.haoran.lu`）：FastAPI + uvicorn + Caddy 自动 HTTPS，代码与配置不在此仓库，细节见 [docs/紫微接入方案.md](docs/紫微接入方案.md)。

## 一些约定

- 背景的粒子参数、配色、运动逻辑与 mos 原版保持一致，只做性能层面的优化（同色合并绘制、DPR 上限、非活跃标签页暂停）
- **不做任何排盘数据留存**：命盘只在浏览器内存里，AI 请求不落库；本地仅用 `localStorage` 记住上次填写的表单
- 所有设计决策、参数调整、踩坑记录都写在 [docs/开发记录.md](docs/开发记录.md)

## 文档

| 文档 | 内容 |
|---|---|
| [docs/开发记录.md](docs/开发记录.md) | 开发全过程、决策、踩坑与验证 |
| [docs/紫微接入方案.md](docs/紫微接入方案.md) | 排盘引擎选型与后端 AI 接入 |
| [docs/haoran.lu域名配置记录.md](docs/haoran.lu域名配置记录.md) | 域名与托管配置 |
| [docs/果冻按钮复用指南.md](docs/果冻按钮复用指南.md) | 入口按钮的弹性物理实现 |

## License

个人项目，代码仅供学习参考。
