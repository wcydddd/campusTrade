# 前后端连接说明

前后端已通过统一 API 地址连接，按以下步骤即可同时运行并联调。

## 1. 配置说明

- **后端**：FastAPI，默认运行在 `http://localhost:8000`
- **前端**：Vite + React，默认运行在 `http://localhost:5173`
- **API 地址**：前端通过环境变量 `VITE_API_URL` 指定后端，未设置时默认为 `http://localhost:8000`
- 前端配置文件：`frontend/.env.development`（开发环境）、`frontend/src/api.js`（导出 `API_BASE`）

后端已在 `main.py` 中配置 CORS，允许来自 `http://localhost:5173` 和 `http://localhost:3000` 的请求。

## 2. 如何运行

### 方式一：用脚本（推荐，Windows）

在项目根目录下：

1. **先开一个终端/命令行**，运行：
   ```bat
   run_backend.bat
   ```
   或手动执行：
   ```bat
   cd backend
   pip install -r requirements.txt
   python main.py
   ```
   看到 `Uvicorn running on http://127.0.0.1:8000` 即表示后端已启动。

2. **再开另一个终端**，运行：
   ```bat
   run_frontend.bat
   ```
   或手动执行：
   ```bat
   cd frontend
   npm install
   npm run dev
   ```
   看到本地地址（如 `http://localhost:5173`）后，在浏览器打开即可。

### 方式二：手动在两个终端分别运行

**终端 1 - 后端：**
```bash
cd backend
# 若使用 venv：先激活虚拟环境
pip install -r requirements.txt   # 如尚未安装依赖
python main.py
```
后端会在 **8000** 端口启动，接口文档：http://localhost:8000/docs

**终端 2 - 前端：**
```bash
cd frontend
npm install   # 如尚未安装依赖
npm run dev
```
前端会在 **5173** 端口启动，在浏览器打开 http://localhost:5173 即可访问。

## 3. 已对接的接口

| 前端页面/功能 | 后端接口 |
|--------------|----------|
| 注册 | `POST /auth/register`（含 username） |
| 登录 | `POST /auth/login`，token 与 user 存 localStorage |
| 首页商品列表 | `GET /products`、`GET /products/categories`（默认排除已售商品） |
| 商品详情 | `GET /products/:id` |
| 购买商品 | `POST /orders`（body: `{ product_id }`），商品自动 reserved |
| 我的订单 | `GET /orders/my?role=buyer|seller` |
| 确认订单 | `POST /orders/{id}/confirm`（卖家） |
| 完成订单 | `POST /orders/{id}/complete`（买卖任一） |
| 取消订单 | `POST /orders/{id}/cancel`（买卖任一），商品恢复 available |
| 登出 | 清除 localStorage 中的 token 与 user |

## 4. 邮箱验证说明

当前后端邮箱验证流程为：**注册 → 发送验证码（需单独调用）→ 用户输入验证码 → `POST /auth/verify-email`**。  
前端 `VerifyEmail.jsx` 使用的是「链接里带 token」的方式（`GET /auth/verify?token=...`）。若要保持该方式，需在后端新增 `GET /auth/verify?token=xxx` 接口；否则可改为「输入验证码」页面并调用 `POST /auth/verify-email`。

## 5. 修改后端地址（如端口或域名）

- 开发环境：修改 `frontend/.env.development` 中的 `VITE_API_URL`
- 生产构建：在构建前设置环境变量 `VITE_API_URL`，或保持默认 `http://localhost:8000`
