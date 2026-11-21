# effect-atlas 安全模型（威胁模型）

本文件描述这个仓库面对的攻击者、要保护的东西和信任边界，安全扫描和代码审查都以它为准。维护者可以随时修改。

## 系统概述与信任边界
effect-atlas/effect-atlas 发布 53 个独立的纯前端动效文件夹（`effects/<slug>/`：`index.html`、`effect.js`、`effect.css`，部分附带资源）。使用者（或其 AI 编程助手）把整个文件夹复制进**自己的网站**，调用 `mountXxx(element, options)` 挂载。仓库本身没有后端、没有账号体系、没有服务器端代码；effectatlas.com 网站在别处维护（CONTRIBUTING.md），不在本文件范围内。

信任边界：
1. **接入网站 ↔ 动效代码**：动效在接入网站的页面源（origin）里运行，能做该页面 JS 能做的一切。传入的 options、`setItems` 数据和宿主 DOM 内容会进入 `innerHTML` / `insertAdjacentHTML` 等写入点（如 `local-clock-pill`、`stacked-frame-index`、`card-fan-intro`、`fluid-mask-hero`、`scroll-speed-scramble`、`smear-in-grid`），`destroy` 时还会把保存的 `element.innerHTML` 写回。
2. **仓库 ↔ AI 编程助手**：`effect.js` 头部注释、`docs/ai-integration*.md`、`catalog.json`、README 是写给 AI 读的操作说明，AI 会照做。
3. **第三方代码 ↔ 仓库**：内置 `three.min.js`（curved-gallery、disc-carousel、hold-to-burst）及嵌在部分 `effect.js` 里的 GSAP 3.12.5；没有 CDN 外链脚本。
4. **贡献者 ↔ CI**：`.github/workflows/check.yml` 在 push / pull_request 上运行 `node scripts/catalog.mjs --check`，`permissions: contents: read`。

## 组件
| 组件 | 覆盖代码 |
| --- | --- |
| Effect runtime | `effects/*/effect.js`、`effects/*/effect.css`（不含内置第三方库） |
| Demo pages | `effects/*/index.html` |
| Vendored libraries | `effects/*/three.min.js`、`effect.js` 内嵌的 GSAP |
| AI-facing docs | `effect.js` 头部说明、`docs/`、`catalog.json`、`README*.md`、`effects/README*.md` |
| Maintainer tooling & CI | `scripts/catalog.mjs`、`.github/workflows/` |

## 入口与可达性
- 挂载函数的 options / 数据参数、宿主元素已有 DOM：由接入网站的开发者（或其 AI）控制；其内容来源取决于接入网站。
- 页面事件（指针、滚动、键盘、resize、`Intl` 时区）：任何访问接入网站的访客。
- 仓库文件本身：维护者；外部贡献者通过 PR。
- `scripts/catalog.mjs`：维护者本地和 CI 运行，读取 `catalog.json` 路径（有 `safePath` 限制）并 `execFileSync(node --check)`。

## 资产与敏感性
- 接入网站访客的会话、Cookie、页面数据（动效运行于其 origin，XSS 影响最大）。
- 接入者的代码库与开发环境（AI 助手按仓库说明修改代码）。
- 仓库与发布内容的完整性（供应链：内置库、CI）。
- 动效本身不处理密钥或个人数据。

## 需要关注的攻击者
- **接入网站上的恶意访客**：动效公开供任何人复制，接入网站可能把访客可控内容（评论、昵称、CMS 内容）传给动效，经 HTML 写入点注入脚本。维护者未限定传入内容的来源，因此不排除这类攻击者。
- **恶意 PR 贡献者**：篡改内置库、植入恶意动效代码或面向 AI 的恶意说明。
- **针对 AI 助手的提示词注入**：通过头部注释/文档诱导接入方 AI 执行不安全操作。
- 维护者确认：上述三类风险（XSS/DOM 注入、供应链、提示词注入）**同样重要**。

## 现有控制
- CI 只读权限；不使用 `pull_request_target`，无密钥。
- `catalog.mjs` 用 `safePath` 拒绝绝对路径和越出仓库的路径，拒绝符号链接，`execFileSync` 不经 shell。
- 无网络请求、无 CDN 脚本、无存储 API；依赖全部本地内置。
- 多数 HTML 模板为静态字符串；部分效果使用 `textContent`（34 个文件）。

## 范围外 / 可接受风险（维护者确认）
- 维护者确认：**全部在范围内**，包括演示页 `index.html` 和内置第三方代码。

## 所有权（维护者确认）
- 维护者同时拥有 effectatlas.com 网站和本仓库；网站代码不在本仓库中。

## 待确认问题
- 暂无。
