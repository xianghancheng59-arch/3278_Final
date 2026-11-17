# CampusSwap VPS 部署记录

部署日期：2026-11-17。公网地址：**https://47.238.127.170:8443/**。

运行代码来自 `codex/crud-review` 的 `1ffb118`，包含图片分支合并、5090/抽湿机示例商品、卖家照片上传/替换/删除，以及 VPS 代理配置。通过该提交的 `git archive` 上传；没有部署本机 `.env`、真实用户数据库、`node_modules` 或未跟踪文件，也没有修改 `main`。

## 服务器与请求路径

Alibaba Cloud Linux 3，Node 20.20.2，MySQL 8.0.46，Nginx。

```text
浏览器 HTTPS :8443 → Nginx → Express 127.0.0.1:3001 → MySQL 127.0.0.1:3306
                              ├─ React 构建产物 dist/
                              └─ /api/*（包括数据库中持久保存的照片）
```

云防火墙开放 TCP 8443；TCP 80 的 `/.well-known/acme-challenge/` 用于证书申请/续期。原有 443 服务继续使用原端口，因此访问项目时必须带 **`https://` 和 `:8443`**。80 端口其他路径仍属于原有网站配置。

应用以独立 `campusswap` 系统用户运行，Node 和 MySQL 仅监听回环地址。Nginx 接受最多 8 MiB 请求，应用照片限制仍为 5 MiB。`NODE_ENV=production`、`HOST=127.0.0.1`、`TRUST_PROXY=loopback`；登录 Cookie 使用 Secure、HttpOnly、SameSite=Strict。

## 文件与数据

| 服务器路径 | 用途 |
| --- | --- |
| `/opt/campusswap/releases/1ffb118` | 本次源码、Linux 依赖和构建产物 |
| `/opt/campusswap/current` | 指向当前版本的符号链接 |
| `/etc/campusswap/campusswap.env` | 生产环境配置，仅 root 可读，含数据库密码和 JWT 密钥 |
| `/etc/systemd/system/campusswap.service` | 应用自动启动及异常重启 |
| `/etc/nginx/conf.d/campusswap.conf` | HTTPS 8443 反向代理 |
| `/etc/letsencrypt/live/campusswap-ip` | Let's Encrypt IP 证书与私钥 |
| `/var/backups/campusswap` | 包含照片二进制的压缩数据库备份，保留约 7 天 |
| `/root/campusswap-backups/nginx.conf.before-campus-20261117` | 改动前的 Nginx 主配置备份 |

数据库名为 `campusswap`，包含 `users`、`categories`、`items`、`item_photos`、`favorites`、`orders` 六张表。应用账号只有该库的 SELECT/INSERT/UPDATE/DELETE 权限。生产库从已提交的 schema 和虚构种子数据新建，未复制本地注册账户。种子用户密码不可登录；使用网页上的 **Create an account** 注册自己的 `@connect.hku.hk` 账号。

照片保存在 MySQL `item_photos.jpeg_bytes` 中，与商品更新在同一事务提交；更换服务器代码或重启应用不会删除照片。首次导入后的基线为 5 个虚构用户、5 个分类、16 个商品、4 条收藏、5 条订单。验收用的三个临时账号和临时商品已清理。

## 运维命令

先在终端连接服务器：

```sh
ssh root@47.238.127.170
```

以下命令在服务器上运行：

```sh
systemctl status campusswap mysqld nginx --no-pager
journalctl -u campusswap -n 100 --no-pager
systemctl restart campusswap
# 启动为异步过程；确认返回分类列表后再进行业务测试。
curl --fail http://127.0.0.1:3001/api/categories

mysql campusswap
/usr/local/sbin/campusswap-backup
systemctl list-timers 'campusswap*' --no-pager
```

`campusswap-backup.timer` 每天服务器时间 03:15 备份。`campusswap-certbot.timer` 每天两次检查续期，续期后自动 reload Nginx。IP 证书有效期约六天，因此应保留 80 端口的 ACME 路径和续期定时器。可查看续期日志：

```sh
journalctl -u campusswap-certbot --no-pager
/opt/campusswap-certbot/bin/certbot certificates
```

## 已完成验收

- VPS 上安装 Linux 原生依赖并成功完成 TypeScript/Vite 生产构建。
- 本地回归测试 29 项通过，1 项 MySQL 专项按设计跳过；照片/MySQL 专项在前一实现阶段已通过。
- 外网 HTTPS 证书验证正常，首页、分类及两张产品参考图返回 200。
- 浏览器实际注册、刷新保持会话、退出、重新登录及卖家上传表单正常。
- 外网 API 完成创建、读取、更新、删除：上传 5090 → 更换抽湿机 → 改价保留照片 → 拒绝伪 JPEG 并回滚 → 移除照片 → 重新上传。
- 校验 CSRF、非卖家修改/删除拒绝、JPEG 响应、版本 ETag/304 和数据库照片行。
- 重启应用并等待可用后，原会话、商品字段和照片字节保持一致；删除商品后照片接口返回 404。
- Let's Encrypt `renew --dry-run --run-deploy-hooks` 成功；自动启动、续证和备份定时器已启用。

可复用 `scripts/verify-vps-photo.cjs` 验证后续部署。它会创建两个临时账号和一个临时商品，状态文件必须放在仓库外并保持 0600 权限：

```sh
node scripts/verify-vps-photo.cjs prepare --base https://47.238.127.170:8443 --state /tmp/campusswap-new-smoke.json
# 重启服务器上的 campusswap，等待 /api/categories 返回 200。
node scripts/verify-vps-photo.cjs finish --state /tmp/campusswap-new-smoke.json
```

`finish` 清理临时商品并擦除状态文件中的会话秘密；账号需根据状态文件中记录的精确 ID/email，在确认无关联商品、收藏、订单后定向清理。不能按宽泛条件删除生产用户。

## 更新与回退

后续先从非 main 分支归档新提交，上传到新的 `/opt/campusswap/releases/<commit>` 目录；安装 Linux 依赖并构建，备份数据库后按实际变更执行增量迁移。切换 `current` 指向新目录后重启应用并运行冒烟测试。不要重新执行 `schema.sql` 或 `seed.sql` 覆盖生产库。

若需要回退代码，将 `current` 指回上一版本后重启。数据库迁移应单独评估兼容性，不要因代码回退直接覆盖用户新数据。本次首次部署的可回退版本为 `1ffb118`。
