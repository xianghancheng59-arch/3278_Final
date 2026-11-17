# 商品照片：上传、更换与验证

本机检查版运行于 `http://localhost:3001`，分支 `codex/crud-review`。截图中的两条测试商品已替换成 NVIDIA GeForce RTX 5090（Electronics，演示价格 HK$18,000）和抽湿机（Dorm supplies，演示价格 HK$600）。厂家参考图片的来源记录在 [SOURCES.md](../frontend/public/images/products/SOURCES.md)；标题、分类、说明、价格和图片地址均存在数据库中。

## 卖家操作

1. 登录自己的账号，发布商品，或进入 **Your account → Edit**。
2. 点击 **Upload photo / Replace photo** 选择 JPEG、PNG 或 WebP；单张不超过 5 MiB，服务器上限 2500 万像素。也可以填写图片链接。
3. 预览照片，点击 **Publish listing / Save changes**。上传新照片会替换当前照片；只编辑文字或价格会保留原图。
4. 点击 **Remove photo → Save changes** 可移除照片。取消编辑不会改变数据库。

商品所属卖家才可以编辑。已有进行中订单或已售出的商品保持锁定。示例商品属于演示卖家，使用自己的账号新建商品即可练习上传与更新。

## 前端、接口与数据库

- React 表单处理预览、格式/大小提示、保存中状态；选文件时提交 multipart/form-data，字段名为 `photo`。浏览器自动生成 boundary，并附带原有 CSRF token。无文件时继续使用 JSON。
- `POST /api/items` 和 `PATCH /api/items/:id` 同时支持这两种请求；认证和 CSRF 校验先于上传解析。图片经实际解码验证，转换为最长1600像素的 JPEG，并去除原文件元数据。
- `items.image_url` 保存地址；`item_photos` 用 `item_id` 主键/外键保存 JPEG 二进制、版本和更新时间，一件商品最多一张上传照片。
- 商品字段与图片在同一事务内提交。错误文件或数据库写入失败不会留下半个商品或覆盖原图。替换时产生新版本地址和 ETag；`GET /api/items/:id/photo` 要求缓存重新验证。
- 清除照片或改用图片链接时删除旧二进制；硬删除商品时在同一事务内清理照片与收藏。任何订单历史仍阻止硬删除商品。
- MySQL 和 SQLite 均持久化照片，不依赖 Render 的临时文件系统。外部图片链接的可用性仍由图片来源决定。

## 部署已有数据库

Node.js 需要20.9或更新版本。安装新增依赖并构建：

```sh
npm ci
npm ci --prefix frontend
npm run build
```

备份并选择正确的 MySQL 数据库，在仓库根目录执行以下 SQL（这里是 mysql 客户端内的命令）：

```sql
USE campusswap;
SOURCE sql/migrations/2026-11-17-item-photos.sql;
-- 可选：补入两件参考产品，或更新截图中匹配的旧测试记录。
SOURCE sql/migrations/2026-11-17-gpu-dehumidifier.sql;
```

不要在已有数据库重跑 seed。全新数据库直接导入当前 schema.sql + seed.sql，含16件商品。已有 SQLite 数据库会在启动时添加照片表；如需添加参考产品，可以单独执行上述产品 SQL。`npm start` 启动；本机 `.env` 已配置3001端口。

## 已验证

| 验证范围 | 结果 |
| --- | --- |
| 浏览器上传5090图片并发布 | MySQL 存储图片，页面展示成功 |
| 浏览器更换为抽湿机图片 | 同一 item ID，数据库图片哈希和版本均改变 |
| 刷新、打开详情 | 新图片成功加载 |
| 只改价100→110 | 图片字节和地址保持不变 |
| 伪装为 jpg 的文本文件 | 页面提示不可读取，保存按钮禁用 |
| 浏览器移除照片并保存 | image_url 为 NULL，图片表零行，图片接口404 |
| 自动化权限及异常测试 | 非卖家、缺少CSRF、伪造格式、超5MiB或像素上限均被拒绝；事务故障回滚通过 |
| 持久化与升级 | SQLite重连后图片仍存在，旧库升级不清空记录 |
| 回归 | npm test 28通过；隔离MySQL 13通过；数据库专项37通过；production build通过 |

浏览器操作对应的 SQL 证据见 [photo-browser-evidence.json](../review/photo-browser-evidence.json)。临时测试商品已清理。CRUD验证脚本现在会隐藏其保留的订单历史测试商品，避免再次出现在默认商品列表中。
