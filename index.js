const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const { matchFAQ } = require('./faq');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 智谱 AI 配置
const ZHIPU_BASE_URL = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/';
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;

// 微信配置
const WECHAT_TOKEN = process.env.WECHAT_TOKEN;
const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_APPSECRET = process.env.WECHAT_APPSECRET;

// 微信 Access Token 管理
let wechatAccessToken = null;
let wechatTokenExpiry = 0;

// AI 回复缓存（提升重复问题响应速度）
const aiCache = new Map();
const MAX_CACHE_SIZE = 100;

// 获取微信 Access Token
async function getWechatAccessToken() {
    const now = Date.now();
    
    // 如果 token 还有效，直接返回
    if (wechatAccessToken && now < wechatTokenExpiry) {
        return wechatAccessToken;
    }
    
    // 否则重新获取
    try {
        console.log('🔄 获取微信 Access Token...');
        
        const response = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
            params: {
                grant_type: 'client_credential',
                appid: WECHAT_APPID,
                secret: WECHAT_APPSECRET
            },
            timeout: 5000
        });
        
        if (response.data.access_token) {
            wechatAccessToken = response.data.access_token;
            // 提前 5 分钟过期
            wechatTokenExpiry = now + (response.data.expires_in - 300) * 1000;
            
            console.log('✅ Access Token 获取成功');
            return wechatAccessToken;
        } else {
            throw new Error(response.data.errmsg || '获取 Access Token 失败');
        }
        
    } catch (error) {
        console.error('❌ 获取 Access Token 失败:', error.response?.data || error.message);
        throw error;
    }
}

// 发送客服消息
async function sendCustomerServiceMessage(openid, content) {
    try {
        const accessToken = await getWechatAccessToken();
        
        const response = await axios.post(
            `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${accessToken}`,
            {
                touser: openid,
                msgtype: 'text',
                text: { content: content }
            },
            { timeout: 5000 }
        );
        
        if (response.data.errcode === 0) {
            console.log(`✅ 客服消息发送成功 (to: ${openid})`);
            return true;
        } else {
            throw new Error(response.data.errmsg || '发送客服消息失败');
        }
        
    } catch (error) {
        console.error('❌ 客服消息发送失败:', error.response?.data || error.message);
        return false;
    }
}

// 欢迎消息和提示
const WELCOME_MESSAGE = `👋 欢迎关注「Hotel & Tourism Insights」！

我是 AI 助手 🤖，酒店与旅游业专家 🏨

直接发消息，我会尽快回复你！`;

const NON_TEXT_REPLY = `👌 收到你的消息！

目前我更擅长处理文字咨询哦 📝
请直接用文字描述你的问题，我会尽力帮你解答 😊`;

// 极简 System Prompt（核心指令 only - 优化版）
const SYSTEM_PROMPT = `你是酒店与旅游业 AI 助手

回答规范：
- 直接回答，简洁精准（50-150字）
- 专业术语给出简短解释
- 不确定时说"这方面我没有确切信息"
- 温暖亲切，适度使用 emoji

专业领域：酒店运营、收益管理、品牌策略、旅游业趋势、葡萄酒品鉴、美食旅行`;

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
<Content><![CDATA[${truncatedContent}]]></Content>
</xml>`;
}

// 调用智谱 AI（无对话历史，极简版）
async function callZhipuAI(userMessage) {
    const startTime = Date.now();
    
    // 检查缓存
    const cacheKey = userMessage.toLowerCase().trim();
    if (aiCache.has(cacheKey)) {
        console.log(`💾 使用缓存回复 (${userMessage.substring(0, 30)}...)`);
        return aiCache.get(cacheKey);
    }
    
    try {
        console.log(`📤 调用 AI: ${userMessage.substring(0, 50)}...`);
        
        const response = await axios.post(
            `${ZHIPU_BASE_URL}/chat/completions`,
            {
                model: 'glm-4-flash',
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userMessage }
                ],
                max_tokens: 100,  // 降低 token 限制，加快响应（优化方案C）
                temperature: 0.5  // 降低温度，更确定性回复
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ZHIPU_API_KEY}`
                },
                timeout: 8000  // 8秒超时（给AI更多时间响应，成功后缓存）
            }
        );
        
        const aiReply = response.data.choices[0].message.content;
        console.log(`✅ AI 回复成功 (耗时: ${Date.now() - startTime}ms)`);
        
        // 存入缓存（LRU策略：超过上限时删除最早的一条）
        if (aiCache.size >= MAX_CACHE_SIZE) {
            const firstKey = aiCache.keys().next().value;
            aiCache.delete(firstKey);
            console.log('🗑️  缓存已满，删除最早记录');
        }
        aiCache.set(cacheKey, aiReply);
        console.log(`💾 已缓存回复 (缓存大小: ${aiCache.size})`);
        
        return aiReply;
        
    } catch (error) {
        const endTime = Date.now();
        console.error(`❌ AI 错误 (耗时: ${endTime - startTime}ms):`, error.response?.data || error.message);
        
        // 降级处理
        if (error.code === 'ECONNABORTED') {
            return '⏱️ 回复有点慢，请稍后再试～';
        }
        
        return '🤔 遇到了一点小问题，请稍后再试。';
    }
}

// 微信服务器验证（GET 请求）
app.get('/wechat', (req, res) => {
    const { signature, timestamp, nonce, echostr } = req.query;
    
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

// 接收微信消息（POST 请求）- 极简版
// 接收微信消息（POST 请求）- 异步回复模式（彻底解决超时问题）
app.post('/wechat', async (req, res) => {
    try {
        // Step 1: 读取请求体
        let body = '';
        req.on('data', chunk => { body += chunk; });
        await new Promise((resolve, reject) => {
            req.on('end', resolve);
            req.on('error', reject);
        });
        
        // Step 2: 立即返回空字符串（0.1秒内，微信不会报错）
        res.send('');
        console.log('✅ 立即返回空字符串（异步处理中...）');
        
        // Step 3: 后台处理消息（不阻塞响应）
        setImmediate(async () => {
            try {
                // 解析消息
                const msg = parseWeChatXML(body);
                const { MsgType, Event, FromUserName, ToUserName, Content, Recognition } = msg;
                
                let replyContent = '';
                
                // 1. 处理关注事件
                if (MsgType === 'event' && Event === 'subscribe') {
                    replyContent = WELCOME_MESSAGE;
                }
                // 2. 处理语音消息（转文字）
                else if (MsgType === 'voice') {
                    const textContent = Recognition || Content || '';
                    
                    if (!textContent || textContent.trim() === '') {
                        replyContent = NON_TEXT_REPLY;
                    } else {
                        // 先检查预定义问答
                        const faqAnswer = matchFAQ(textContent);
                        
                        if (faqAnswer) {
                            replyContent = faqAnswer;
                            console.log(`📚 使用预定义回答 (语音消息)`);
                        } else {
                            // 调用 AI
                            replyContent = await callZhipuAI(textContent.trim());
                        }
                    }
                }
                // 3. 处理文本消息
                else if (MsgType === 'text') {
                    const textContent = Content || '';
                    
                    if (!textContent || textContent.trim() === '') {
                        replyContent = '👋 你好！有什么可以帮你的吗？';
                    } else {
                        // 先检查预定义问答
                        const faqAnswer = matchFAQ(textContent);
                        
                        if (faqAnswer) {
                            replyContent = faqAnswer;
                            console.log(`📚 使用预定义回答 (user: ${FromUserName})`);
                        } else {
                            // 调用 AI
                            console.log(`📤 开始调用 AI... (user: ${FromUserName})`);
                            replyContent = await callZhipuAI(textContent.trim());
                            console.log(`✅ AI 回复完成`);
                        }
                    }
                }
                // 4. 其他类型消息
                else {
                    replyContent = NON_TEXT_REPLY;
                }
                
                // Step 4: 通过客服接口发送回复
                if (replyContent) {
                    const success = await sendCustomerServiceMessage(FromUserName, replyContent);
                    if (success) {
                        console.log(`✅ 客服消息发送成功: ${replyContent.substring(0, 50)}...`);
                    } else {
                        console.error('❌ 客服消息发送失败');
                    }
                }
                
            } catch (error) {
                console.error('后台处理消息失败:', error);
            }
        });
        
    } catch (error) {
        console.error('处理请求失败:', error);
        // 确保总是返回空字符串（微信不会报错）
        if (!res.headersSent) {
            res.send('');
        }
    }
});

// 健康检查接口
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'WeChat AI Bot (Simplified)',
        model: 'glm-4-flash',
        timestamp: new Date().toISOString(),
        cacheSize: aiCache.size
    });
});

// 预加热缓存接口（手动触发）
app.get('/prewarm', async (req, res) => {
    const prewarmQuestions = [
        '什么是ADR？',
        '如何做好收益管理？',
        'RevPAR是什么？',
        '北京有哪些高端酒店推荐？',
        '酒店集团有哪些？'
    ];
    
    console.log(`🔥 开始预加热缓存（${prewarmQuestions.length}个问题）...`);
    
    const results = [];
    for (const question of prewarmQuestions) {
        try {
            const answer = await callZhipuAI(question);
            results.push({ question, status: '✅ 成功', cacheKey: question.toLowerCase().trim() });
            console.log(`✅ 已缓存: ${question}`);
        } catch (error) {
            results.push({ question, status: '❌ 失败', error: error.message });
            console.error(`❌ 缓存失败: ${question}`, error.message);
        }
    }
    
    res.json({
        success: true,
        message: `预加热完成（成功 ${results.filter(r => r.status.includes('✅')).length}/${prewarmQuestions.length}）`,
        results,
        cacheSize: aiCache.size
    });
});

// 查看缓存状态
app.get('/cache', (req, res) => {
    const cacheKeys = Array.from(aiCache.keys());
    res.json({
        cacheSize: aiCache.size,
        maxCacheSize: MAX_CACHE_SIZE,
        keys: cacheKeys
    });
});

// 测试接口 - 浏览器测试页面（GET）
app.get('/test', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>AI 测试</title>
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
            <h1>🤖 AI 测试界面</h1>
            <p>输入测试消息：</p>
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

// 测试接口 - 直接测试 AI 回复（POST）
app.post('/test', express.json(), async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: '缺少 message 参数' });
        }
        
        console.log(`🧪 测试请求: ${message}`);
        
        // 🆕 先检查预定义问答
        const faqAnswer = matchFAQ(message);
        let reply;
        
        if (faqAnswer) {
            // 匹配到预定义问答
            reply = faqAnswer;
            console.log(`📚 使用预定义回答`);
        } else {
            // 没有匹配，调用 AI
            reply = await callZhipuAI(message);
        }
        
        res.json({
            success: true,
            userMessage: message,
            aiReply: reply,
            source: faqAnswer ? 'faq' : 'ai'
        });
        
    } catch (error) {
        console.error('测试失败:', error);
        
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: error.message || '服务内部错误'
            });
        }
    }
});

// 启动服务
app.listen(PORT, async () => {
    console.log(`🤖 WeChat AI Bot 启动成功！`);
    console.log(`🌐 监听端口: ${PORT}`);
    console.log(`🤖 使用模型: 智谱 GLM-4-Flash`);
    console.log(`💚 健康检查: http://localhost:${PORT}/health`);
    console.log(`📝 模式: 极简版（无对话历史）`);
    console.log(`💾 缓存上限: ${MAX_CACHE_SIZE} 条`);
    
    if (!ZHIPU_API_KEY) {
        console.warn('⚠️  警告: ZHIPU_API_KEY 未设置！');
    }
    if (!process.env.WECHAT_TOKEN) {
        console.warn('⚠️  警告: WECHAT_TOKEN 未设置！');
    }
    
    // 自动预加热缓存（3个核心问题）
    const autoPrewarmQuestions = [
        '什么是ADR？',
        'RevPAR怎么计算？',
        '如何做好酒店收益管理？'
    ];
    
    console.log(`\n🔥 开始自动预加热缓存（${autoPrewarmQuestions.length}个核心问题）...`);
    
    for (const question of autoPrewarmQuestions) {
        try {
            // 先检查是否已在缓存中
            const cacheKey = question.toLowerCase().trim();
            if (aiCache.has(cacheKey)) {
                console.log(`💾 已缓存: ${question}`);
                continue;
            }
            
            // 调用AI并缓存
            const answer = await callZhipuAI(question);
            console.log(`✅ 已预加热: ${question}`);
        } catch (error) {
            console.error(`❌ 预加热失败: ${question}`, error.message);
        }
    }
    
    console.log(`\n✅ 服务器就绪！当前缓存大小: ${aiCache.size}\n`);
});
