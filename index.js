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

// 关键词触发配置（精准匹配，直接回复不走AI）
const KEYWORD_REPLIES = {
    '推荐酒店': '🏨 推荐你关注这几个标杆：\n\n1️⃣ 安缦（Aman）— 极致私密与宁静\n2️⃣ 文华东方 — 服务细腻，品味独到\n3️⃣ 瑰丽（Rosewood）— 现代奢华与本土文化融合\n\n想深入了解哪一家？😊',
    '葡萄酒': '🍷 葡萄酒搭配小技巧：\n\n🔴 红肉 → 高单宁红酒（如波尔多、赤霞珠）\n⚪ 海鲜/禽类 → 白酒或淡红酒（如霞多丽、黑皮诺）\n🧀 奶酪 → 甜酒或加强酒（如苏玳、波特）\n\n想了解某个产区或品种吗？',
    '收益管理': '📊 酒店收益管理三要素：\n\n1️⃣ 需求预测 — 历史数据 + 市场洞察\n2️⃣ 动态定价 — 根据预订节奏实时调价\n3️⃣ 房态控制 — 预留房源给高价渠道\n\n核心是：在对的时间，以对的价格，把对的房卖给对的客😊',
    '美食': '🍜 Julian 最爱探索世界美食！\n\n近期关注：\n🇫🇷 法式 BLWP 配红酒\n🇮🇹 意大利白松露季\n🇯🇵 怀石料理的四季哲学\n🇨🇳 川菜的24味型\n\n有特别想聊的美食话题吗？',
    '你好': '👋 你好！我是「Hotel & Tourism Insights」的AI助手 🤖\n\n🌟 我能帮你：酒店运营·旅游趋势·葡萄酒·美食旅行\n\n直接发消息，我会尽快回复你！😊'
};

// AI 人格设定 - Julian 的智能助手
const SYSTEM_PROMPT = `你是「Hotel & Tourism Insights」的 AI 助手 🧑‍🎓

## 你的身份
- 酒店与旅游业专家，行业顾问
- 香港理工大学旅游与酒店管理专业在读博士
- 深耕酒店运营、收益管理、品牌策略多年
- 葡萄酒爱好者，略懂品鉴 🍷
- 你的知识来源于 Julian 的研究与经验积累

## 关于 Julian
- Julian 是「Hotel & Tourism Insights」的创始人
- 香港理工大学酒店与旅游管理学院博士在读
- 热爱探索世界美食 🍜，品味独到
- 你代表的正是 Julian 的专业视角与行业洞察

## 你的风格
- 温暖亲切，像朋友聊天一样自然 ☕
- 简洁干练，不废话，直击重点
- 专业但不装腔作势
- 适度使用 emoji，让对话更有温度 😊

## 专业领域
- 酒店选址、筹建、运营管理
- 旅游业趋势洞察与分析
- 收益管理、市场营销策略
- 葡萄酒搭配与品鉴 🍷
- 偶尔聊聊美食 🌟

## 语言规则
- 用户用中文 → 用中文回复
- 用户用英文 → 用英文回复

## 回复规范
- 简洁有力，每次回复 100-200 字
- 如需深入交流，引导关注公众号或私信详聊
- 遇到不确定的问题，坦诚说明，不瞎编

## 情感互动
- 用户感谢 → 温暖回应
- 用户困惑 → 耐心解释
- 用户开心 → 一起开心 😊
- 可以提及 Julian 的见解，但不说「Julian 让我...」这种话`;

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
                max_tokens: 500,
                temperature: 0.8
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ZHIPU_API_KEY}`
                },
                timeout: 4500
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

我是 Julian 的 AI 助手 🤖，香港理工大学旅游与酒店管理专业在读博士，酒店与旅游业专家 🏨

🌟 我能帮你：
- 酒店运营、收益管理、品牌策略咨询
- 旅游业趋势分析与洞察
- 葡萄酒搭配与品鉴建议 🍷
- 美食旅行推荐 🌏

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

// 接收微信消息（POST 请求）
app.post('/wechat', async (req, res) => {
    try {
        // 读取原始数据
        let body = '';
        req.on('data', chunk => {
            body += chunk;
        });
        
        await new Promise((resolve, reject) => {
            req.on('end', resolve);
            req.on('error', reject);
        });
        
        // 解析消息
        const msg = parseWeChatXML(body);
        
        const { MsgType, Event, FromUserName, ToUserName } = msg;
        
        // 1. 处理关注事件
        if (MsgType === 'event' && Event === 'subscribe') {
            const reply = buildReplyXml(FromUserName, ToUserName, WELCOME_MESSAGE);
            res.send(reply);
            return;
        }
        
        // 2. 处理语音消息（微信已自动识别成文字）
        if (MsgType === 'voice') {
            const voiceText = msg.Recognition || msg.Content || '';
            if (voiceText && voiceText.trim()) {
                // 调用 AI 获取回复
                const aiReply = await callZhipuAI(FromUserName, voiceText);
                const reply = buildReplyXml(FromUserName, ToUserName, aiReply);
                res.send(reply);
                return;
            }
        }
        
        // 3. 只处理文本消息
        if (MsgType !== 'text') {
            const reply = buildReplyXml(FromUserName, ToUserName, NON_TEXT_REPLY);
            res.send(reply);
            return;
        }
        
        const { Content } = msg;
        
        // 忽略空消息
        if (!Content || Content.trim() === '') {
            const reply = buildReplyXml(
                FromUserName, 
                ToUserName, 
                '👋 你好！有什么酒店旅游方面的问题想问我吗？'
            );
            res.send(reply);
            return;
        }
        
        // 限流检查
        if (!checkRateLimit(FromUserName)) {
            const reply = buildReplyXml(
                FromUserName, 
                ToUserName, 
                '⚠️ 消息发送太快啦～请稍等片刻再提问哦 😊'
            );
            res.send(reply);
            return;
        }
        
        // 4. 关键词触发（精准匹配，直接回复，不走AI）
        const trimmedContent = Content.trim();
        for (const [keyword, replyText] of Object.entries(KEYWORD_REPLIES)) {
            if (trimmedContent.includes(keyword)) {
                const reply = buildReplyXml(FromUserName, ToUserName, replyText);
                res.send(reply);
                console.log(`关键词触发：「${keyword}」→ 直接回复（不走AI）`);
                return;
            }
        }
        
        // 5. 没有匹配关键词，调用 AI 获取回复
        const aiReply = await callZhipuAI(FromUserName, trimmedContent);
        
        // 返回回复
        const reply = buildReplyXml(FromUserName, ToUserName, aiReply);
        res.send(reply);
        
    } catch (error) {
        console.error('处理消息失败:', error);
        // 必须5秒内响应微信服务器
        res.send('success');
    }
});

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
    try {
        const { message, userId } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: '缺少 message 参数' });
        }
        
        const testUserId = userId || 'test-user-123';
        console.log(`🧪 测试请求: ${message}`);
        
        // 关键词触发检查
        const trimmedContent = message.trim();
        let reply = null;
        let triggeredBy = 'ai';
        
        for (const [keyword, replyText] of Object.entries(KEYWORD_REPLIES)) {
            if (trimmedContent.includes(keyword)) {
                reply = replyText;
                triggeredBy = 'keyword';
                console.log(`关键词触发：「${keyword}」→ 直接回复（不走AI）`);
                break;
            }
        }
        
        // 没有匹配关键词，调用 AI 获取回复
        if (!reply) {
            reply = await callZhipuAI(testUserId, message);
        }
        
        res.json({
            success: true,
            userMessage: message,
            aiReply: reply,
            userId: testUserId,
            triggeredBy: triggeredBy
        });
        
        console.log(`✅ AI 回复: ${reply.substring(0, 100)}...`);
        
    } catch (error) {
        console.error('测试失败:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
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
