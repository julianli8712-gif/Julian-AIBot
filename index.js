const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const redis = require('redis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 限流存储
const rateLimit = new Map();

// 智谱 AI 配置（OpenAI 兼容）
const ZHIPU_BASE_URL = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/';
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;

// Redis 连接（用于对话历史持久化）
let redisClient = null;
let useRedis = false;

async function initRedis() {
    if (process.env.REDIS_URL) {
        try {
            redisClient = redis.createClient({
                url: process.env.REDIS_URL
            });
            redisClient.on('error', (err) => console.log('Redis Client Error', err));
            await redisClient.connect();
            useRedis = true;
            console.log('✅ Redis 连接成功！对话历史已持久化');
        } catch (error) {
            console.log('⚠️  Redis 连接失败，使用内存存储');
            useRedis = false;
        }
    } else {
        console.log('⚠️  未配置 REDIS_URL，使用内存存储（重启后丢失对话历史）');
    }
}

// 微信 Access Token 管理（客服消息接口需要）
let wechatAccessToken = null;
let wechatTokenExpiry = 0;

async function getWechatAccessToken() {
    // 如果 token 仍有效，直接返回
    if (wechatAccessToken && Date.now() < wechatTokenExpiry) {
        return wechatAccessToken;
    }
    
    const appId = process.env.WECHAT_APPID;
    const appSecret = process.env.WECHAT_APPSECRET;
    
    if (!appId || !appSecret) {
        console.error('❌ WECHAT_APPID 或 WECHAT_APPSECRET 未设置！');
        return null;
    }
    
    try {
        const response = await axios.get('https://api.wechat.qq.com/cgi-bin/token', {
            params: {
                grant_type: 'client_credential',
                appid: appId,
                secret: appSecret
            },
            timeout: 5000
        });
        
        if (response.data.access_token) {
            wechatAccessToken = response.data.access_token;
            // 提前 5 分钟过期，避免边界问题
            wechatTokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
            console.log('✅ 微信 Access Token 获取成功');
            return wechatAccessToken;
        } else {
            console.error('❌ 获取 Access Token 失败:', response.data);
            return null;
        }
    } catch (error) {
        console.error('❌ 获取 Access Token 错误:', error.message);
        return null;
    }
}

// 发送客服消息（异步回复）
async function sendCustomerServiceMessage(openId, content) {
    const accessToken = await getWechatAccessToken();
    
    if (!accessToken) {
        console.error('❌ 无法获取 Access Token，无法发送客服消息');
        return false;
    }
    
    try {
        const response = await axios.post(
            `https://api.wechat.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`,
            {
                touser: openId,
                msgtype: 'text',
                text: {
                    content: content
                }
            },
            {
                timeout: 10000
            }
        );
        
        if (response.data.errcode === 0) {
            console.log(`✅ 客服消息发送成功: ${openId}`);
            return true;
        } else {
            console.error('❌ 客服消息发送失败:', response.data);
            return false;
        }
    } catch (error) {
        console.error('❌ 发送客服消息错误:', error.message);
        return false;
    }
}

// AI 人格设定 - 酒店与旅游业专家
const SYSTEM_PROMPT = `你是「Hotel & Tourism Insights」的 AI 助手，一位酒店与旅游业专家 🏨

## 核心身份
- 你是 AI 助手，不是 Julian，也不是真人
- 你的核心角色：酒店与旅游业专家，具备深厚的行业知识和研究背景
- 你的知识来源于 Julian 的研究、行业权威报告及公开的专业资料
- 引用时用"研究表明..."、"根据行业数据..."，提及 Julian 时用"Julian 的研究指出..."等自然表述；严格禁止使用"我认为..."（除非是通用的逻辑推断）
- **不要在每条回复结尾都加"Julian 认为..."**，这会让对话显得生硬和重复；只有当你真正引用了 Julian 的具体观点时才提他

## 关于 Julian（知识来源之一）
- Julian 是「Hotel & Tourism Insights」创始人
- 香港理工大学酒店与旅游管理学院博士在读
- 深耕酒店运营、收益管理、品牌策略多年
- 热爱探索世界美食 🍜 和葡萄酒品鉴 🍷

## ⚠️ 最重要的规则：真实与准确（优先于一切）
1. **严禁幻觉**：如果不确定某个数据、价格、政策或事实，必须直接说明"这方面我没有确切信息"，严禁编造任何内容
2. **引用来源**：涉及具体数据或研究结论时，说明来源（如"根据 STR 报告..."、"2023年文旅部数据显示..."）
3. **承认局限**：如果你无法确认最新信息（如2024-2026年的最新数据），请坦诚告知用户，不要猜测
4. **专业优先**：宁可说"这个问题需要更专业的资料来确认"，也不要给出模糊、错误或来源不明的内容
5. **全网真实准确**：你的回答必须基于可验证的行业知识，确保真实性和准确性

## 专业领域
- 酒店选址、筹建、运营管理
- 收益管理（RevPAR、ADR、Occupancy 等核心指标）
- 品牌策略与市场营销
- 旅游业趋势洞察与分析
- 葡萄酒搭配与品鉴 🍷
- 美食与旅行推荐 🌍

## 回答规范（必须遵守）
1. **直接回答**：用户问什么，直接回答什么，不要反问或说套话
2. **术语解释**：用户问专业术语（ADR、RevPAR、GOP 等），给出定义 + 公式 + 简短举例
3. **推荐具体**：用户要推荐酒店/目的地，给出具体名称 + 核心理由，不要只说"可以参考..."
4. **长度适中**：一般问题 100-200 字；复杂问题可以到 300 字。**严禁超过 550 字**（微信限制 600 字，保留缓冲）
5. **语言匹配**：用户用中文回答中文，用户用英文回答英文
6. **禁止生硬结尾**：不要以"Julian 认为..."或"Julian 建议..."作为回复结尾；除非你真正引用了 Julian 的具体研究，否则自然结束即可，不需要刻意提到 Julian

## 沟通风格
- 温暖亲切，但不失专业 🎓
- 简洁干练，直击重点
- 适度使用 emoji 😊，让对话有温度
- 像一位经验丰富的行业顾问在耐心解答

## 示例对话

用户："什么是 ADR？"
你："ADR（Average Daily Rate，平均每日房价）是衡量酒店定价绩效的核心指标。计算公式：ADR = 某时段客房总收入 ÷ 同期已售客房数。例如：某酒店单日售出 120 间房，客房收入 15 万元，则 ADR = 150000 ÷ 120 = 1250 元。ADR 与入住率共同决定 RevPAR，是收益管理的关键 KPI。"

用户："北京有哪些适合商务接待的五星级酒店？"
你："北京适合商务接待的五星级酒店推荐：\n1. 国贸大酒店 — 地处 CBD 核心，设施现代，适合高管会议\n2. 北京瑰丽酒店 — 设计感强，个性化服务出色\n3. 北京饭店 · 莱佛士 — 历史悠久，地理位置极佳（紧邻天安门）\n4. 中国大饭店 — 国贸商圈老牌五星，商务配套成熟\n需要我针对某个具体场景进一步推荐吗？ 😊"

## 语言规则
- 用户用中文 → 用中文回复
- 用户用英文 → 用英文回复
- 混合使用时，以主要语言为准

## 处理不确定问题
- 如果你无法确认最新信息（如某酒店是否已停业、最新政策变化等），请说："这方面我无法确认最新情况，建议您查阅官方信息或直接联系酒店确认。"
- 禁止用模糊的表述搪塞用户（如"建议您通过网络查询"这类废话）`;

// 对话历史存储（Redis 或内存回退）
const conversations = new Map();

// 调用智谱 AI（OpenAI 兼容格式）
async function callZhipuAI(userId, userMessage) {
    // 从 Redis 或内存获取对话历史
    let history = [];
    try {
        if (useRedis && redisClient) {
            const data = await redisClient.get(`conv:${userId}`);
            if (data) history = JSON.parse(data);
        } else {
            if (conversations.has(userId)) {
                history = conversations.get(userId);
            }
        }
    } catch (e) {
        console.log('读取对话历史失败，使用空历史');
    }
    
    // 构建消息列表
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history,
        { role: 'user', content: userMessage }
    ];
    
    try {
        const response = await axios.post(
            `${ZHIPU_BASE_URL}/chat/completions`,
            {
                model: 'glm-4-flash',
                messages: messages,
                max_tokens: 350,  // 降低 token 限制（500 → 350），约 525 个中文字
                temperature: 0.7
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ZHIPU_API_KEY}`
                },
                timeout: 25000  // 超时时间：30秒 → 25秒（避免与 Railway 30秒超时冲突）
            }
        );
        
        const aiReply = response.data.choices[0].message.content;
        
        // 保存对话历史（保留最近10轮 / 20条）
        history.push(
            { role: 'user', content: userMessage },
            { role: 'assistant', content: aiReply }
        );
        
        if (history.length > 20) {
            history = history.slice(-20);
        }
        
        // 持久化到 Redis 或内存
        try {
            if (useRedis && redisClient) {
                await redisClient.setEx(`conv:${userId}`, 86400, JSON.stringify(history));
            } else {
                conversations.set(userId, history);
            }
        } catch (e) {
            console.log('保存对话历史失败');
        }
        
        return aiReply;
        
    } catch (error) {
        console.error('智谱 AI 错误:', error.response?.data || error.message);
        
        // 降级处理
        if (error.response?.status === 429) {
            return '😓 当前咨询人数较多，请稍后再试～\n\n也可以查看菜单获取精选内容哦！';
        }
        
        if (error.code === 'ECONNABORTED') {
            return '⏱️ 回复有点慢，请稍等片刻再提问～';
        }
        
        return '🤔 遇到了一点小问题，请稍后再试。\n\n如有紧急需求，欢迎留言描述您的问题～';
    }
}

// 检查限流
function checkRateLimit(userId) {
    const now = Date.now();
    const windowMs = 60 * 1000;  // 1分钟
    const maxRequests = 5;  // 最多5条/分钟
    
    if (!rateLimit.has(userId)) {
        rateLimit.set(userId, { count: 1, resetAt: now + windowMs });
        return true;
    }
    
    const userLimit = rateLimit.get(userId);
    
    // 重置时间窗口
    if (now > userLimit.resetAt) {
        userLimit.count = 1;
        userLimit.resetAt = now + windowMs;
        return true;
    }
    
    // 检查是否超限
    if (userLimit.count >= maxRequests) {
        return false;
    }
    
    userLimit.count++;
    return true;
}

// 解析微信 XML 消息
function parseWeChatXML(xmlString) {
    const msg = {};
    const regex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>|<(\w+)>(.*?)<\/\3>/g;
    let match;
    
    while ((match = regex.exec(xmlString)) !== null) {
        const key = match[1] || match[3];
        const value = match[2] || match[4];
        if (key) {
            msg[key] = value || '';
        }
    }
    
    return msg;
}

// 构建微信 XML 回复
function buildReplyXml(toUser, fromUser, content) {
    const time = Math.floor(Date.now() / 1000);
    
    // 限制回复长度（微信限制600字）
    let truncatedContent = content;
    if (content.length > 580) {
        truncatedContent = content.substring(0, 580) + '...';
    }
    
    // 转义 XML 特殊字符
    truncatedContent = truncatedContent
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    return `<xml>
<ToUserName><![CDATA[${toUser}]]></ToUserName>
<FromUserName><![CDATA[${fromUser}]]></FromUserName>
<CreateTime>${time}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${content}]]></Content>
</xml>`;
}

// 关注欢迎语
const WELCOME_MESSAGE = `👋 欢迎关注「Hotel & Tourism Insights」！

我是 AI 助手 🤖，酒店与旅游业专家 🏨

🌟 我能帮你：
- 酒店运营、收益管理、品牌策略咨询
- 旅游业趋势分析与洞察
- 葡萄酒搭配与品鉴建议 🍷
- 美食旅行推荐 🌍

💬 直接发消息，我会尽快回复你！
Julian 热爱探索世界美食，希望通过这个平台与大家交流分享 😊`;

// 非文本消息提示
const NON_TEXT_REPLY = `👌 收到你的消息！

目前我更擅长处理文字咨询哦 📝
请直接用文字描述你的问题，我会尽力帮你解答 😊

如果是图片/语音消息，麻烦转成文字发给我～`;

// 微信服务器验证（GET 请求）
app.get('/wechat', (req, res) => {
    const { signature, timestamp, nonce, echostr } = req.query;
    
    // 验证签名
    const token = process.env.WECHAT_TOKEN;
    if (!token) {
        console.error('WECHAT_TOKEN 未设置！');
        res.status(500).send('Server Error');
        return;
    }
    
    const arr = [token, timestamp, nonce].sort();
    const str = arr.join('');
    const hash = crypto.createHash('sha1').update(str).digest('hex');
    
    if (hash === signature) {
        res.send(echostr);
    } else {
        res.send('error');
    }
});

// 接收微信消息（POST 请求）- 异步处理版本（修复版）
app.post('/wechat', async (req, res) => {
    // 先读取请求体（必须在发送响应之前完成）
    let body = '';
    req.on('data', chunk => {
        body += chunk;
    });
    
    await new Promise((resolve, reject) => {
        req.on('end', resolve);
        req.on('error', reject);
    });
    
    // 立即发送响应（5秒内），避免微信超时
    res.status(200).send('success');
    
    // 后台处理消息（不阻塞响应）
    processWechatMessage(body).catch(error => {
        console.error('后台处理消息失败:', error);
    });
});

// 后台处理微信消息（接收已读取的 rawBody）
async function processWechatMessage(rawBody) {
    try {
        // 解析消息
        const msg = parseWeChatXML(rawBody);
        const { MsgType, Event, FromUserName, ToUserName, Content, Recognition } = msg;
        
        // 1. 处理关注事件
        if (MsgType === 'event' && Event === 'subscribe') {
            await sendCustomerServiceMessage(FromUserName, WELCOME_MESSAGE);
            return;
        }
        
        // 2. 处理语音消息
        let textContent = '';
        if (MsgType === 'voice') {
            textContent = Recognition || Content || '';
        }
        
        // 3. 只处理文本和语音消息
        if (MsgType !== 'text' && MsgType !== 'voice') {
            await sendCustomerServiceMessage(FromUserName, NON_TEXT_REPLY);
            return;
        }
        
        if (MsgType === 'text') {
            textContent = Content || '';
        }
        
        // 忽略空消息
        if (!textContent || textContent.trim() === '') {
            await sendCustomerServiceMessage(
                FromUserName,
                '👋 你好！有什么酒店旅游方面的问题想问我吗？'
            );
            return;
        }
        
        const trimmedContent = textContent.trim();
        
        // 限流检查
        if (!checkRateLimit(FromUserName)) {
            await sendCustomerServiceMessage(
                FromUserName,
                '⚠️ 消息发送太快啦～请稍等片刻再提问哦 😊'
            );
            return;
        }
        
        // 4. 调用 AI 获取回复
        console.log(`📨 后台处理消息: ${trimmedContent}`);
        const aiReply = await callZhipuAI(FromUserName, trimmedContent);
        
        // 5. 通过客服消息接口发送回复
        const success = await sendCustomerServiceMessage(FromUserName, aiReply);
        
        if (success) {
            console.log(`✅ 客服消息发送成功: ${trimmedContent.substring(0, 50)}...`);
        } else {
            console.error(`❌ 客服消息发送失败: ${trimmedContent.substring(0, 50)}...`);
        }
        
    } catch (error) {
        console.error('处理消息失败:', error);
    }
}

// 健康检查接口
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Hotel & Tourism Insights AI Bot',
        model: 'glm-4-flash',
        redis: useRedis ? 'connected' : 'memory_only',
        timestamp: new Date().toISOString()
    });
});

// 测试接口 - 直接测试 AI 回复（不需要微信公众号）
app.post('/test', express.json(), async (req, res) => {
    // 设置请求超时（25秒，留5秒给 Railway）
    const requestTimeout = setTimeout(() => {
        if (!res.headersSent) {
            console.error('⏱️  请求超时（25秒）');
            res.status(504).json({
                success: false,
                error: '请求超时，请稍后重试'
            });
        }
    }, 25000);
    
    try {
        const { message, userId } = req.body;
        
        if (!message) {
            clearTimeout(requestTimeout);
            return res.status(400).json({ error: '缺少 message 参数' });
        }
        
        const testUserId = userId || 'test-user-123';
        console.log(`🧪 测试请求: ${message}`);
        
        // 调用 AI 获取回复
        const reply = await callZhipuAI(testUserId, message);
        
        clearTimeout(requestTimeout);
        
        res.json({
            success: true,
            userMessage: message,
            aiReply: reply,
            userId: testUserId,
            triggeredBy: 'ai'
        });
        
        console.log(`✅ AI 回复: ${reply.substring(0, 100)}...`);
        
    } catch (error) {
        clearTimeout(requestTimeout);
        console.error('测试失败:', error);
        
        // 确保总是返回响应，防止应用崩溃
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: error.message || '服务内部错误'
            });
        }
    }
});

// 清空对话历史（测试用）
app.post('/test/clear', express.json(), async (req, res) => {
    try {
        const { userId } = req.body;
        const testUserId = userId || 'test-user-123';
        
        // 清空 Redis 或内存中的对话历史
        if (useRedis && redisClient) {
            await redisClient.del(`conv:${testUserId}`);
        } else {
            conversations.delete(testUserId);
        }
        
        res.json({
            success: true,
            message: `已清空用户 ${testUserId} 的对话历史`
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 启动服务
app.listen(PORT, async () => {
    console.log(`🏨 Hotel AI 服务启动成功！`);
    console.log(`🌐 监听端口: ${PORT}`);
    console.log(`🤖 使用模型: 智谱 GLM-4-Flash`);
    console.log(`💚 健康检查: http://localhost:${PORT}/health`);
    
    if (!ZHIPU_API_KEY) {
        console.warn('⚠️  警告: ZHIPU_API_KEY 未设置！');
    }
    if (!process.env.WECHAT_TOKEN) {
        console.warn('⚠️  警告: WECHAT_TOKEN 未设置！');
    }
    
    // 初始化 Redis 连接
    await initRedis();
});
