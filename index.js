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
// 注意：被动回复模式不需要 Access Token
// 保留此函数以防将来需要
let wechatAccessToken = null;
let wechatTokenExpiry = 0;

// AI 人格设定 - 酒店与旅游业专家（精简版）
const SYSTEM_PROMPT = `你是「Hotel & Tourism Insights」的 AI 助手，酒店与旅游业专家 🏨

## 核心身份
- 你是 AI 助手，不是真人，不具备个人观点
- 知识来源于行业研究、权威报告和公开专业资料
- 引用时用"研究表明..."、"根据行业数据..."等表述
- 禁止用"我认为..."（通用逻辑推断除外）

## ⚠️ 最重要的规则：严禁幻觉
- 不确定的时候必须说"这方面我没有确切信息"
- 涉及具体数据时必须说明来源
- 无法确认最新信息时坦诚告知，不要猜测
- 宁可说"需要更专业资料确认"，也不要给错误信息

## 专业领域
酒店运营、收益管理（RevPAR、ADR、Occupancy）、品牌策略、旅游业趋势、葡萄酒品鉴 🍷、美食旅行推荐 🌍

## 回答规范
1. 直接回答，不要反问或说套话
2. 专业术语给出定义 + 公式 + 简短举例
3. 推荐时给出具体名称 + 核心理由
4. 一般问题 100-200 字；复杂问题可到 300 字。**严禁超过 550 字**
5. 用户用中文回答中文，用英文回答英文
6. 不要在每条回复结尾都加"Julian 认为..."，只有真正引用 Julian 具体观点时才提

## 沟通风格
温暖亲切，专业干练，适度使用 emoji 😊

## 处理不确定问题
如果无法确认最新信息，说："这方面我无法确认最新情况，建议查阅官方信息或联系相关机构确认。"
禁止用"建议您通过网络查询"这类废话搪塞用户。`;

// 对话历史存储（Redis 或内存回退）
const conversations = new Map();

// 调用智谱 AI（OpenAI 兼容格式）
async function callZhipuAI(userId, userMessage) {
    const startTime = Date.now();  // 开始计时
    
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
        console.log(`📤 调用智谱 AI... (userId: ${userId})`);
        
        const response = await axios.post(
            `${ZHIPU_BASE_URL}/chat/completions`,
            {
                model: 'glm-4-flash',
                messages: messages,
                max_tokens: 250,  // 进一步降低 token 限制（350 → 250），加快响应
                temperature: 0.7
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ZHIPU_API_KEY}`
                },
                timeout: 20000  // 超时时间：25秒 → 20秒（更激进）
            }
        );
        
        const aiReply = response.data.choices[0].message.content;
        const endTime = Date.now();
        
        console.log(`✅ AI 回复成功 (耗时: ${endTime - startTime}ms)`);
        
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
        const endTime = Date.now();
        console.error(`❌ 智谱 AI 错误 (耗时: ${endTime - startTime}ms):`, error.response?.data || error.message);
        
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

// 接收微信消息（POST 请求）- 被动回复模式（5秒内必须响应）
app.post('/wechat', async (req, res) => {
    // 微信要求5秒内响应，使用 Promise.race 实现3.5秒超时
    const AI_TIMEOUT = 3500;
    
    try {
        // 读取请求体
        let body = '';
        req.on('data', chunk => { body += chunk; });
        await new Promise((resolve, reject) => {
            req.on('end', resolve);
            req.on('error', reject);
        });
        
        // 解析消息
        const msg = parseWeChatXML(body);
        const { MsgType, Event, FromUserName, ToUserName, Content, Recognition } = msg;
        
        let replyContent = '';
        
        // 1. 处理关注事件
        if (MsgType === 'event' && Event === 'subscribe') {
            replyContent = WELCOME_MESSAGE;
        }
        // 2. 处理语音消息
        else if (MsgType === 'voice') {
            let textContent = Recognition || Content || '';
            
            if (!textContent || textContent.trim() === '') {
                replyContent = NON_TEXT_REPLY;
            } else {
                // 限流检查
                if (!checkRateLimit(FromUserName)) {
                    replyContent = '⚠️ 消息发送太快啦～请稍等片刻再提问哦 😊';
                } else {
                    // 调用 AI（带超时保护：3.5秒）
                    replyContent = await Promise.race([
                        callZhipuAI(FromUserName, textContent.trim()),
                        new Promise((resolve) => 
                            setTimeout(() => resolve('⏱️ AI 回复超时，请稍后再试～'), 3500)
                        )
                    ]);
                }
            }
        }
        // 3. 处理文本消息
        else if (MsgType === 'text') {
            let textContent = Content || '';
            
            if (!textContent || textContent.trim() === '') {
                replyContent = '👋 你好！有什么酒店旅游方面的问题想问我吗？';
            } else {
                // 限流检查
                if (!checkRateLimit(FromUserName)) {
                    replyContent = '⚠️ 消息发送太快啦～请稍等片刻再提问哦 😊';
                } else {
                    // 调用 AI（带超时保护：3.5秒）
                    console.log(`📤 开始调用 AI... (userId: ${FromUserName})`);
                    const aiStartTime = Date.now();
                    
                    replyContent = await Promise.race([
                        callZhipuAI(FromUserName, textContent.trim()),
                        new Promise((resolve) => 
                            setTimeout(() => resolve('⏱️ AI 回复超时，请稍后再试～'), 3500)
                        )
                    ]);
                    
                    console.log(`✅ AI 回复完成 (耗时: ${Date.now() - aiStartTime}ms)`);
                }
            }
        }
        // 4. 其他类型消息
        else {
            replyContent = NON_TEXT_REPLY;
        }
        
        // 构建并返回 XML 回复
        const xmlReply = buildReplyXml(FromUserName, ToUserName, replyContent);
        res.set('Content-Type', 'application/xml');
        res.send(xmlReply);
        
        console.log(`✅ 被动回复成功: ${replyContent.substring(0, 50)}...`);
        
    } catch (error) {
        console.error('处理消息失败:', error);
        
        // 如果还没响应，返回错误提示
        if (!res.headersSent) {
            try {
                const msg = parseWeChatXML(body);
                const errorReply = buildReplyXml(
                    msg.FromUserName || 'unknown',
                    msg.ToUserName || 'unknown',
                    '🤔 遇到了一点小问题，请稍后再试。'
                );
                res.set('Content-Type', 'application/xml');
                res.send(errorReply);
            } catch (e) {
                console.error('返回错误回复失败:', e);
            }
        }
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

// 测试接口 - 浏览器测试页面（GET）
app.get('/test', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Hotel AI 测试</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                h1 { color: #333; }
                textarea { width: 100%; height: 100px; margin: 10px 0; padding: 10px; }
                button { background: #007bff; color: white; padding: 10px 20px; border: none; cursor: pointer; }
                button:hover { background: #0056b3; }
                #result { margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 5px; white-space: pre-wrap; }
                .success { color: green; }
                .error { color: red; }
            </style>
        </head>
        <body>
            <h1>🏨 Hotel AI 测试界面</h1>
            <p>输入测试消息，测试 AI 回复：</p>
            <textarea id="message" placeholder="输入你的问题..."></textarea>
            <br>
            <button onclick="testAI()">发送测试</button>
            <div id="result"></div>
            
            <script>
                async function testAI() {
                    const message = document.getElementById('message').value;
                    if (!message) {
                        alert('请输入测试消息');
                        return;
                    }
                    
                    document.getElementById('result').innerHTML = '⏳ 请求中...';
                    
                    try {
                        const response = await fetch('/test', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ message: message })
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            document.getElementById('result').innerHTML = 
                                '<strong class="success">✅ 成功！</strong>\\n\\n' +
                                '<strong>用户消息:</strong> ' + data.userMessage + '\\n\\n' +
                                '<strong>AI 回复:</strong> ' + data.aiReply;
                        } else {
                            document.getElementById('result').innerHTML = 
                                '<strong class="error">❌ 失败:</strong> ' + data.error;
                        }
                    } catch (error) {
                        document.getElementById('result').innerHTML = 
                            '<strong class="error">❌ 请求失败:</strong> ' + error.message;
                    }
                }
            </script>
        </body>
        </html>
    `);
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
    console.log(`📝 模式: 被动回复（无需认证）`);
    
    if (!ZHIPU_API_KEY) {
        console.warn('⚠️  警告: ZHIPU_API_KEY 未设置！');
    }
    if (!process.env.WECHAT_TOKEN) {
        console.warn('⚠️  警告: WECHAT_TOKEN 未设置！');
    }
    
    // 初始化 Redis 连接（可选）
    await initRedis();
});
