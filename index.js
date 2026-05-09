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

// 极简 System Prompt（核心指令 only）
const SYSTEM_PROMPT = `你是酒店与旅游业 AI 助手 🏨

## 回答规范
- 直接回答，简洁精准（50-200字）
- 专业术语给出简短解释
- 不确定时说"这方面我没有确切信息"
- 温暖亲切，适度使用 emoji 😊

## 专业领域
酒店运营、收益管理、品牌策略、旅游业趋势、葡萄酒品鉴 🍷、美食旅行推荐 🌍`;

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
                max_tokens: 150,  // 降低 token 限制，加快响应
                temperature: 0.7
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ZHIPU_API_KEY}`
                },
                timeout: 5000  // 5秒超时（与微信限制对齐）
            }
        );
        
        const aiReply = response.data.choices[0].message.content;
        console.log(`✅ AI 回复成功 (耗时: ${Date.now() - startTime}ms)`);
        
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
app.post('/wechat', async (req, res) => {
    const AI_TIMEOUT = 3500;  // 3.5秒超时（微信要求5秒内响应）
    
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
            replyContent = `👋 欢迎关注！

我是 AI 助手 🤖，酒店与旅游业专家 🏨

直接发消息，我会尽快回复你！`;
        }
        // 2. 处理语音消息（转文字）
        else if (MsgType === 'voice') {
            const textContent = Recognition || Content || '';
            
            if (!textContent || textContent.trim() === '') {
                replyContent = '👌 收到语音消息！请直接文字描述你的问题～';
            } else {
                // 🆕 先检查预定义问答
                const faqAnswer = matchFAQ(textContent);
                
                if (faqAnswer) {
                    // 匹配到预定义问答，直接返回（无需调用 AI）
                    replyContent = faqAnswer;
                    console.log(`📚 使用预定义回答 (语音消息)`);
                } else {
                    // 没有匹配，调用 AI（带超时保护）
                    replyContent = await Promise.race([
                        callZhipuAI(textContent.trim()),
                        new Promise((resolve) => 
                            setTimeout(() => resolve('⏱️ 回复有点慢，请稍后再试～'), AI_TIMEOUT)
                        )
                    ]);
                }
            }
        }
        // 3. 处理文本消息
        else if (MsgType === 'text') {
            const textContent = Content || '';
            
            if (!textContent || textContent.trim() === '') {
                replyContent = '👋 你好！有什么可以帮你的吗？';
            } else {
                // 🆕 先检查预定义问答
                const faqAnswer = matchFAQ(textContent);
                
                if (faqAnswer) {
                    // 匹配到预定义问答，直接返回（无需调用 AI）
                    replyContent = faqAnswer;
                    console.log(`📚 使用预定义回答 (user: ${FromUserName})`);
                } else {
                    // 没有匹配，调用 AI（带超时保护）
                    console.log(`📤 开始调用 AI... (user: ${FromUserName})`);
                    
                    replyContent = await Promise.race([
                        callZhipuAI(textContent.trim()),
                        new Promise((resolve) => 
                            setTimeout(() => resolve('⏱️ 回复有点慢，请稍后再试～'), AI_TIMEOUT)
                        )
                    ]);
                    
                    console.log(`✅ AI 回复完成`);
                }
            }
        }
        // 4. 其他类型消息
        else {
            replyContent = '👌 收到你的消息！请直接文字描述你的问题～';
        }
        
        // 构建并返回 XML 回复
        const xmlReply = buildReplyXml(FromUserName, ToUserName, replyContent);
        res.set('Content-Type', 'application/xml');
        res.send(xmlReply);
        
        console.log(`✅ 回复成功: ${replyContent.substring(0, 50)}...`);
        
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
        service: 'WeChat AI Bot (Simplified)',
        model: 'glm-4-flash',
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
        
        // 调用 AI 获取回复
        const reply = await callZhipuAI(message);
        
        res.json({
            success: true,
            userMessage: message,
            aiReply: reply
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
app.listen(PORT, () => {
    console.log(`🤖 WeChat AI Bot 启动成功！`);
    console.log(`🌐 监听端口: ${PORT}`);
    console.log(`🤖 使用模型: 智谱 GLM-4-Flash`);
    console.log(`💚 健康检查: http://localhost:${PORT}/health`);
    console.log(`📝 模式: 极简版（无对话历史）`);
    
    if (!ZHIPU_API_KEY) {
        console.warn('⚠️  警告: ZHIPU_API_KEY 未设置！');
    }
    if (!process.env.WECHAT_TOKEN) {
        console.warn('⚠️  警告: WECHAT_TOKEN 未设置！');
    }
});
