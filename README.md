# Hotel & Tourism Insights - AI 自动回复系统

> 基于智谱 GLM-4 的微信公众号智能对话系统

## 🚀 快速部署到 Railway

### 第一步：准备 GitHub 仓库

```bash
# 1. 初始化 Git 仓库
cd wechat-ai
git init
git add .
git commit -m "Initial commit: WeChat AI Bot"

# 2. 在 GitHub 创建新仓库（不要初始化 README）
# 访问：https://github.com/new

# 3. 推送代码到 GitHub
git remote add origin https://github.com/你的用户名/wechat-ai.git
git push -u origin main
```

### 第二步：部署到 Railway

#### 方法 A：通过 Railway 网站（推荐）

1. 访问 [railway.app](https://railway.app) 并登录（可以用 GitHub 账号登录）
2. 点击 "New Project"
3. 选择 "Deploy from GitHub repo"
4. 选择你刚创建的 `wechat-ai` 仓库
5. Railway 会自动检测 `package.json` 并部署

#### 方法 B：使用 Railway CLI

```bash
# 1. 安装 Railway CLI
npm install -g @railway/cli

# 2. 登录
railway login

# 3. 初始化项目
railway init

# 4. 部署
railway up
```

### 第三步：设置环境变量

在 Railway 项目页面，点击 "Variables" 标签，添加以下变量：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `WECHAT_TOKEN` | 自定义字符串 | 微信验证 Token，例如：`hotel_ai_2026` |
| `ZHIPU_API_KEY` | 你的智谱 API Key | 从 https://open.bigmodel.cn/ 获取 |
| `ZHIPU_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4/` | 智谱 AI 接口地址 |

### 第四步：获取部署地址

部署成功后，Railway 会提供一个域名，类似：
```
https://wechat-ai-production.up.railway.app
```

**复制这个地址，用于配置微信公众号！**

---

## 🔧 本地开发测试

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填写：

```bash
cp .env.example .env
```

编辑 `.env`：
```
WECHAT_TOKEN=your_token_here
ZHIPU_API_KEY=你的智谱API_Key
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4/
PORT=3000
```

### 3. 启动服务

```bash
npm start
```

### 4. 测试健康检查

```bash
curl http://localhost:3000/health
```

应该返回：
```json
{
  "status": "ok",
  "service": "Hotel & Tourism Insights AI Bot",
  "model": "glm-4-flash",
  "timestamp": "2026-05-09T..."
}
```

---

## 📱 配置微信公众号

### 第一步：登录微信公众平台

访问：https://mp.weixin.qq.com

### 第二步：启用服务器配置

1. 进入「设置与开发」→「基本配置」
2. 点击「修改配置」
3. 填写以下信息：

| 字段 | 值 |
|------|-----|
| **URL** | `https://你的railway域名/` |
| **Token** | 与 `WECHAT_TOKEN` 环境变量相同 |
| **EncodingAESKey** | 点击「随机生成」 |
| **消息加密方式** | 选择「明文模式」 |

4. 点击「提交」

### 第三步：启用服务器

配置提交成功后，点击「启用」按钮。

**⚠️ 注意：启用后，自定义的自动回复将被 AI 自动回复替代！**

---

## 🧪 测试

1. 关注你的公众号
2. 发送任意消息（中文或英文）
3. AI 应该会智能回复

**测试示例：**
```
用户：推荐几个北京的五星级酒店
AI：很高兴为您推荐！北京的五星级酒店中，我特别推荐...

用户：How to improve hotel revenue management?
AI：Great question! Revenue management is crucial for hotels...
```

---

## 💰 成本预估

### 智谱 AI 费用

- **免费额度**：注册即送 100万 tokens
- **GLM-4-Flash 价格**：¥0.1/千 tokens
- **100万 tokens 可以做**：
  - 约 75万字 的输入输出
  - 相当于数千次对话

### Railway 费用

- **免费额度**：每月 $5 额度
- **足够运行**：小型 Node.js 应用
- **超出后**：$0.01/GB 流量 + $0.01/小时运行时长

**结论：初期几乎免费！**

---

## 🐛 故障排查

### 问题 1：Railway 部署失败

```bash
# 查看部署日志
railway logs

# 检查 package.json 中的 "start" 脚本
"start": "node index.js"
```

### 问题 2：微信验证失败

```
检查清单：
✅ URL 是否是 https:// 开头
✅ Token 是否与环境变量一致
✅ Railway 服务是否正在运行
✅ 防火墙是否阻止了请求
```

### 问题 3：AI 无回复

```bash
# 1. 检查智谱 API Key 是否正确
curl -H "Authorization: Bearer 你的Key" \
  https://open.bigmodel.cn/api/paas/v4/models

# 2. 查看 Railway 日志
railway logs

# 3. 检查环境变量是否设置
railway variables
```

### 问题 4：微信公众号提示"该公众号暂时无法提供服务"

```
原因：5秒内未响应
解决方案：
1. 检查 Railway 服务状态
2. 查看日志：railway logs
3. 优化 AI 响应速度（使用 GLM-4-Flash 模型）
4. 检查是否触发限流
```

---

## 📚 相关文档

- [智谱 AI 开放平台](https://open.bigmodel.cn/dev/api)
- [Railway 文档](https://docs.railway.app)
- [微信公众平台开发文档](https://developers.weixin.qq.com/doc/)

---

## 📞 获取帮助

如遇到任何问题，请检查：
1. Railway 部署日志
2. 环境变量是否正确设置
3. 微信公众号配置是否正确

---

*最后更新：2026-05-09*
*适用：Hotel & Tourism Insights 公众号*
