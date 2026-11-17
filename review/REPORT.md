# CampusSwap 本地检查报告

检查日期：2026-11-17。基线：远端 main 的 `19a598e`。检查分支：`codex/crud-review`。

## 结论

数据库、Express API 和 React 前端已经能够连成真实 CRUD 流程，不需要再重写整个系统。检查分支在 `http://localhost:3001` 运行，使用独立数据库 `campusswap_review_1117`；前端未启用 localStorage 演示模式。

原工作目录 `/Users/scott/Desktop/COMP3278/repo` 及其本地 main 提交 `a09f223` 保持不变。检查目录为 `/Users/scott/Desktop/COMP3278/crud-review`。本次未合并或推送 main。

## 已完成验证

| 检查 | 结果 / 范围 |
| --- | --- |
| 干净安装、TypeScript 与 Vite production build | 通过 |
| npm test | 14 项通过；MySQL 顶层测试按设计跳过 |
| scripts/test-mysql.py | 11 项通过（10 个子测试和 1 个父测试），MySQL 8.0.43 |
| tests/verify_database.py | 修复临时 socket 配置后 37 项通过 |
| 浏览器注册与刷新恢复登录态 | 通过，测试账号写入真实 users 表 |
| 浏览器 Create | 新建 `CRUD Review Textbook`，MySQL price=150.00 |
| 浏览器 Read | 刷新后仍能看到商品，打开详情读取名称、描述、价格 |
| 浏览器 Update | 同一条记录 price 更新为 120.00，独立 SQL 查询确认 |
| 浏览器 Delete | 在检查分支的页面内确认框先取消、再确认；页面清空、SQL 返回零条、GET 详情返回 404 |
| 已部署 HTTP 服务 + 独立 SQL 查询 | 新增/筛选/改价/删除、非所有者写入拒绝、收藏及删除清理、订单确认/取消及历史保护、登出/重新登录全部通过 |
| 并发/事务 | 两个买家竞争只产生一个订单；注入故障后回滚；已完成/已取消订单历史保留（集成测试） |

浏览器记录证据见 `crud-evidence.json`；独立 HTTP 验证证据见 `http-crud-evidence.json`。它们来自不同测试商品，分别验证网页与部署后服务。没有声称全部订单交互都经过浏览器测试；订单权限和状态流程主要由真实 MySQL API 测试验证。

## 已在检查分支修正

1. **真实商品与演示图片错配。** `frontend/src/types.ts` 曾根据商品 ID 自动套用演示图片，例如数据库中的教材 101 被配上耳机照片；这些相对图片路径还会被带入 type=url 的编辑输入框。真实 API 转换现在只使用真实记录的图片字段；演示模式的显式图片保持可用。
2. **本机数据库验证脚本无法与已有 MySQL 共存。** `tests/verify_database.py` 原来默认占用 `/tmp/mysql.sock`；现在使用临时目录下独立 socket 和 PID 文件，37 项验证成功运行。
3. **删除演示的浏览器兼容性。** 原生 window.confirm 在本次内嵌浏览器自动化中阻塞，无法可靠确认；这不证明 Chrome 手动删除也失败。检查分支改为 HTML dialog，保留确认步骤、取消按钮、提交中禁用、失败反馈和键盘取消。已实际确认删除及 SQL 结果。

## 尚待决定 / 完成

| 优先级 | 缺口 | 建议 |
| --- | --- | --- |
| 展示前 | 新增家居商品只存在于 frontend/src/api.ts 的演示数组，真实 seed.sql 仍是 10 件旧商品且无照片 | 若要展示家居商品，补充与真实数据库一致的可重复 seed；不要开 VITE_DEMO_MODE=true 冒充数据库操作 |
| P2 | 已确认订单可由卖家通过 API 取消，但前端 confirmed 状态仅显示 Mark exchange complete | 补 Cancel 按钮或明确缩小前端功能范围；部署后 API 测试已验证 confirmed→cancelled 可用 |
| P2 | requirements.md 仍要求修改姓名/联系方式，但没有对应 profile 更新接口和页面 | 实现该功能，或更新范围说明；不影响商品 CRUD 的课程演示 |
| P2 | 列表 API 默认最多 50 条，而前端无分页/加载更多；我的商品按状态各取第一页 | 数据量增加时添加分页；当前小样本不阻碍演示 |
| 文档 | database.md 的部分措辞仍称认证/并发工作未完成；原架构删除规则与实际“任何订单历史都禁止硬删除”有差异 | 按当前实现统一文档，说明订单锁定/删除规则，避免讲稿与演示冲突 |
| 开发环境 | npm audit 报告 frontend 的 Vite high / esbuild moderate，两项均来自开发依赖 | 另分支升级并回归。当前演示用构建后的静态页面 + Express，不运行 Vite dev server；未执行破坏性强制升级 |
| 交付物 | 本次仓库清单未见最终 PPT 或演示视频 | 准备 5 分钟全员展示、最多 2 分钟 CRUD 视频，并展示 SQL 行变化；若已在仓库外制作无需重复 |

其他边界：目前只检查邮箱格式/域名，不验证邮箱所有权；登出清除浏览器 cookie，JWT 没有服务端撤销列表。这些是产品限制，不应在答辩中宣称为已实现的邮箱验证或全面会话撤销。

## 本机运行及复查

当前 `.env` 只保存在检查目录，已被 Git 忽略，指向专用测试数据库和限权 MySQL 账号。原服务的 3000 端口不需要停止。

```sh
cd /Users/scott/Desktop/COMP3278/crud-review
npm start
# 打开 http://localhost:3001
```

从全新克隆部署：按根 README 创建 MySQL 空库并导入 `sql/schema.sql`、`sql/seed.sql`，执行 `npm ci`、`npm ci --prefix frontend`，配置 `.env`，然后 `npm run build && npm start`。复制配置时改用自己的数据库用户和随机 JWT_SECRET。

验证指令：

```sh
npm test
python3 scripts/test-mysql.py --mysql-bin /usr/local/mysql/bin
python3 tests/verify_database.py --mysql-bin /usr/local/mysql/bin
node scripts/verify-running-crud.js
```

最后一个脚本要求服务已启动，默认 127.0.0.1:3001，只允许本地地址和 `campusswap_review_` 开头的数据库。它为每次运行创建独立测试账号，删除专用于 CRUD 的商品，保留一件含已取消订单的演示商品用于核对历史保护；不会清空已有记录。不要把此脚本指向生产数据库。
