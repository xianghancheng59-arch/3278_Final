# 2 分钟真实数据库 CRUD 演示

使用检查分支的 `http://localhost:3001`。页面和 API 同源，SERVE_FRONTEND=true，VITE_DEMO_MODE 不启用。注册自己的新测试账号，seed 中 Alice 等账号的 `!` 不是可登录密码。

## 录制前

1. 注册并登录卖家账号；准备商品标题 `CRUD Demo Textbook`，价格 150，分类 Textbooks，地点 Main Library。
2. 打开 MySQL 客户端/Workbench，用检查目录 `.env` 的数据库配置连接。不要把凭据和 password_hash 显示在视频里。
3. 商品用于纯 CRUD，不要给它下单。任何订单历史（包括已取消订单）都会阻止硬删除，这是正确的数据完整性保护。订单演示另建商品。

## 录制顺序

| 时间 | 网页操作 | 数据库证据 | 英文旁白 |
| --- | --- | --- | --- |
| 0:00–0:30 | Sell an item，填写并发布商品 | 按标题查到新增行，price=150.00，记住 id | We create a new listing. The backend inserts a record into MySQL and links it to the signed-in seller. |
| 0:30–0:55 | 刷新主页，搜索标题，打开详情 | 用记下的 id 再查一次 | After refreshing, the listing is still available. This shows that the information is stored in the database. |
| 0:55–1:25 | Edit your listing，将价格改成120并保存 | 同一个 id 的 price=120.00 | We update the price from one hundred and fifty to one hundred and twenty dollars. The same database record now contains the new value. |
| 1:25–2:00 | Your account → Delete → Delete permanently | 按 id 查不到记录；列表也消失 | Finally, we permanently delete this unused listing. The database returns no matching row. This is DELETE, rather than simply changing its status. |

## 建议展示的 SQL

```sql
SELECT id, title, price, seller_id, status
FROM items
WHERE title = 'CRUD Demo Textbook';

-- Copy the id from the CREATE result and reuse it for every step.
SET @demo_item_id = 'REPLACE_WITH_THE_ACTUAL_ID';
SELECT id, title, price, seller_id, status
FROM items
WHERE id = @demo_item_id;

-- After DELETE, both results should be zero.
SELECT COUNT(*) AS remaining_item_rows FROM items WHERE id = @demo_item_id;
SELECT COUNT(*) AS remaining_favorites FROM favorites WHERE item_id = @demo_item_id;
```

这些查询只读数据库。新增、改价和删除必须通过网页触发，才能展示“前端 → API → MySQL”的完整路径。

## 可选订单演示

用两个新账号和另一件商品：卖家发布 → 买家 Request to buy → 卖家 Orders 中 Confirm request → Mark exchange complete。对应数据库：orders pending → confirmed → completed，items available → reserved → sold。不要对 sold 商品强行删除。
