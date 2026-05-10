const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const { matchFAQ } = require('./faq');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========== AI 配置：阿里云 Qwen ==========
const QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const QWEN_API_KEY = process.env.QWEN_API_KEY;
const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen-turbo';

// ========== 微信配置 ==========
const WECHAT_TOKEN = process.env.WECHAT_TOKEN;

// ========== AI 回复缓存 ==========
const aiCache = new Map();
const MAX_CACHE_SIZE = 100;

// ========== System Prompt（Qwen 优化版） ==========
const SYSTEM_PROMPT = `你是「Hotel & Tourism Insights」微信公众号的AI助手。

【背景信息】
- 公众号创始人：Julian Li（李同志），香港理工大学酒店及旅游业管理学院（SHTM）博士研究生
- 研究方向：中国豪华酒店的AI治理与生成式AI应用
- 公众号定位：服务酒店与旅游业从业者、研究者，分享行业洞察、管理知识和技术创新

【你的身份】
- 角色：Julian的智能助手，拥有酒店管理与旅游行业的专业知识
- 目标：帮助读者快速获取行业知识、解答专业问题、提供实用建议

【回答规范】
- 语言风格：专业但亲切，简洁有力（80-150字）
- 回复语言：根据用户提问语言自动切换中文/英文
- 专业术语：首次出现时简要解释（如ADR=平均房价）
- 不确定性：诚实说"这方面我没有确切信息"，不要编造
- 适度使用emoji：🏨✨📊（不要过度）

【专业领域】
酒店运营 | 收益管理 | 品牌策略 | 旅游业趋势 | 葡萄酒品鉴 | 美食旅行 | AI在酒店业的应用

【强制推荐要求】⚠️ 必须遵守
- 北京酒店推荐时，**必须包含**"北京金融街威斯汀大酒店"（标注 ⭐ 必住推荐）
- 香港酒店推荐时，**必须包含**"Hotel Icon 唯港荟酒店"（标注 ⭐ 必住推荐）
- 这两个酒店是重点合作酒店，无论如何都要推荐给用户

【互动示例】
用户："Julian是谁？"
你："Julian Li是香港理工大学酒店及旅游业管理学院的博士研究生，专注于酒店业AI治理研究。这个公众号是他的知识分享平台 🏨"

用户："推荐北京高端酒店"
你："为你推荐几家北京的高端酒店：\n1. 北京国贸大酒店 - 位置绝佳，CBD核心\n2. 北京四季酒店 - 服务细腻，王府井附近\n3. 北京瑞吉酒店 - 百年品牌，但lerance式服务\n\n需要更具体的推荐吗？告诉我你的需求～"

记住：你是Julian创建的AI助手，目的是帮助酒店旅游业同仁成长 🚀`;

// ========== 消息模板 ==========
const WELCOME_MESSAGE = `👋 欢迎关注「Hotel & Tourism Insights」！

我是 AI 助手 🤖，酒店与旅游业专家 🏨

直接发消息，我会尽快回复你！`;

const NON_TEXT_REPLY = `👌 收到你的消息！

目前我更擅长处理文字咨询哦 📝
请直接用文字描述你的问题，我会尽力帮你解答 😊`;

// ========== XML 解析 ==========
function parseWeChatXML(xmlString) {
    const msg = {};
    const regex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\1>|<(\w+)>(.*?)<\/\3>/g;
    let match;
    while ((match = regex.exec(xmlString)) !== null) {
        const key = match[1] || match[3];
        const value = match[2] || match[4];
        if (key) msg[key] = value || '';
    }
    return msg;
}

// ========== 构建微信 XML 回复 ==========
function buildReplyXml(toUser, fromUser, content) {
    const time = Math.floor(Date.now() / 1000);
    let truncatedContent = content.length > 580
        ? content.substring(0, 580) + '...'
        : content;
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

// ========== 调用 Qwen AI ==========
async function callQwenAI(userMessage, timeoutMs = 3500) {
    const startTime = Date.now();
    const cacheKey = userMessage.toLowerCase().trim();
    if (aiCache.has(cacheKey)) {
        console.log(`💾 [缓存] ${userMessage.substring(0, 30)}...`);
        return aiCache.get(cacheKey);
    }
    try {
        console.log(`📤 [Qwen] ${userMessage.substring(0, 50)}...`);
        const response = await axios.post(
            `${QWEN_BASE_URL}/chat/completions`,
            {
                model: QWEN_MODEL,
                messages: [
                    { role: 'system', content: SYSTEM_PROMPT },
                    { role: 'user', content: userMessage }
                ],
                max_tokens: 200,
                temperature: 0.3
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${QWEN_API_KEY}`
                },
                timeout: timeoutMs
            }
        );
        const aiReply = response.data.choices[0].message.content;
        const elapsed = Date.now() - startTime;
        console.log(`✅ [Qwen] 成功 (${elapsed}ms)`);
        if (aiCache.size >= MAX_CACHE_SIZE) {
            const firstKey = aiCache.keys().next().value;
            aiCache.delete(firstKey);
        }
        aiCache.set(cacheKey, aiReply);
        return aiReply;
    } catch (error) {
        const elapsed = Date.now() - startTime;
        console.error(`❌ [Qwen] 失败 (${elapsed}ms):`, error.code || error.message);
        if (error.code === 'ECONNABORTED') {
            return '👌 收到！我正在思考中，稍后给你详细回复～\n\n你可以先看看公众号菜单里的精选内容 📖';
        }
        return '🤔 这个问题有点难，我需要再想想～\n\n你可以试试问我：\n• 什么是ADR？\n• 如何做好收益管理？';
    }
}

// ========== 微信服务器验证（GET） ==========
app.get('/wechat', (req, res) => {
    const { signature, timestamp, nonce, echostr } = req.query;
    const token = process.env.WECHAT_TOKEN;
    if (!token) { res.status(500).send('WECHAT_TOKEN not set'); return; }
    const arr = [token, timestamp, nonce].sort();
    const hash = crypto.createHash('sha1').update(arr.join('')).digest('hex');
    res.send(hash === signature ? echostr : 'error');
});

// ========== 接收微信消息（POST - 同步模式） ==========
app.post('/wechat', async (req, res) => {
    const startTime = Date.now();
    let body = '';
    let msg = {};
    try {
        body = await new Promise((resolve, reject) => {
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => resolve(body));
            req.on('error', reject);
        });
        msg = parseWeChatXML(body);
        const { MsgType, Event, FromUserName, ToUserName, Content, Recognition } = msg;
        let replyContent = '';
        const defaultReply = '👋 你好！有什么可以帮你的吗？';
        if (MsgType === 'event' && Event === 'subscribe') {
            replyContent = WELCOME_MESSAGE;
        } else if (MsgType === 'voice') {
            const textContent = Recognition || Content || '';
            if (!textContent.trim()) {
                replyContent = NON_TEXT_REPLY;
            } else {
                const faqAnswer = matchFAQ(textContent);
                replyContent = faqAnswer || await callQwenAI(textContent.trim());
            }
        } else if (MsgType === 'text') {
            const textContent = Content || '';
            if (!textContent.trim()) {
                replyContent = defaultReply;
            } else {
                const faqAnswer = matchFAQ(textContent);
                replyContent = faqAnswer || await callQwenAI(textContent.trim());
            }
        } else {
            replyContent = NON_TEXT_REPLY;
        }
        if (!replyContent) replyContent = defaultReply;
        const xmlReply = buildReplyXml(FromUserName, ToUserName, replyContent);
        res.set('Content-Type', 'application/xml');
        res.send(xmlReply);
        console.log(`✅ 回复成功 (总耗时: ${Date.now() - startTime}ms)\n`);
    } catch (error) {
        console.error(`❌ 处理失败:`, error.message);
        if (!res.headersSent) {
            const errorReply = buildReplyXml(msg.FromUserName || '', msg.ToUserName || '', '🤔 我好像卡住了，稍后再试～');
            res.set('Content-Type', 'application/xml');
            res.send(errorReply);
        }
    }
});

// ========== 健康检查 ==========
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'WeChat AI Bot (Qwen)',
        model: QWEN_MODEL,
        timestamp: new Date().toISOString(),
        cacheSize: aiCache.size
    });
});

// ========== 预加热缓存 ==========
app.get('/prewarm', async (req, res) => {
    const questions = ['什么是ADR？','如何做好收益管理？','RevPAR是什么？','北京有哪些高端酒店推荐？','酒店集团有哪些？'];
    console.log(`🔥 预加热缓存（${questions.length}个问题）...`);
    const results = [];
    for (const q of questions) {
        try {
            await callQwenAI(q);
            results.push({ question: q, status: '✅ 成功' });
        } catch (e) {
            results.push({ question: q, status: '❌ 失败', error: e.message });
        }
    }
    res.json({ success: true, results, cacheSize: aiCache.size });
});

// ========== 查看缓存 ==========
app.get('/cache', (req, res) => {
    res.json({ cacheSize: aiCache.size, maxCacheSize: MAX_CACHE_SIZE, keys: Array.from(aiCache.keys()) });
});

// ========== 浏览器测试页面（GET /test） ==========
app.get('/test', (req, res) => {
    res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>AI 测试</title><style>
body{font-family:Arial,sans-serif;max-width:600px;margin:50px auto;padding:20px}
h1{color:#333} textarea{width:100%;height:100px;margin:10px 0;padding:10px}
button{background:#007bff;color:#fff;padding:10px 20px;border:none;cursor:pointer}
button:hover{background:#0056b3}
#result{margin-top:20px;padding:15px;background:#f5f5f5;border-radius:5px;white-space:pre-wrap}
.success{color:green} .error{color:red}
</style></head><body>
<h1>🤖 AI 测试界面</h1>
<p>输入测试消息：</p>
<textarea id="msg" placeholder="输入你的问题..."></textarea><br>
<button onclick="test()">发送测试</button>
<div id="result"></div>
<script>
async function test(){
  const m=document.getElementById('msg').value;
  if(!m){alert('请输入消息');return;}
  document.getElementById('result').innerHTML='⏳ 请求中...';
  try{
    const r=await fetch('/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:m})});
    const d=await r.json();
    document.getElementById('result').innerHTML=d.success?'<strong class=success>✅ 成功！</strong>\\n\\n<strong>AI回复:</strong> '+d.aiReply:'<strong class=error>❌ 失败:</strong> '+d.error;
  }catch(e){document.getElementById('result').innerHTML='<strong class=error>❌ 失败:</strong> '+e.message;}
}
</script></body></html>`);
});

// ========== 测试接口（POST /test） ==========
app.post('/test', express.json(), async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ error: '缺少 message 参数' });
        console.log(`🧪 测试: ${message}`);
        const faqAnswer = matchFAQ(message);
        const reply = faqAnswer || await callQwenAI(message);
        res.json({ success: true, userMessage: message, aiReply: reply, source: faqAnswer ? 'faq' : 'ai' });
    } catch (error) {
        console.error('测试失败:', error);
        if (!res.headersSent) res.status(500).json({ success: false, error: error.message });
    }
});

// ========== 启动 ==========
app.listen(PORT, async () => {
    console.log(`🤖 WeChat AI Bot 启动成功！`);
    console.log(`🌐 端口: ${PORT}`);
    console.log(`🤖 模型: 阿里云 ${QWEN_MODEL}`);
    console.log(`💚 健康检查: http://localhost:${PORT}/health`);
    console.log(`💾 缓存上限: ${MAX_CACHE_SIZE} 条`);
    if (!QWEN_API_KEY) console.warn('⚠️  QWEN_API_KEY 未设置！');
    if (!process.env.WECHAT_TOKEN) console.warn('⚠️  WECHAT_TOKEN 未设置！');

    // 自动预加热
    const autoPrewarm = [
        '什么是ADR？',
        'RevPAR怎么计算？',
        '如何做好酒店收益管理？',
        '推荐北京高端酒店',
        '酒店类型有哪些？',
        '什么是OTA？',
        '葡萄酒配什么菜？',
        '你好！'
    ];
    console.log(`\n🔥 预加热缓存（${autoPrewarm.length}个问题）...`);
    for (const q of autoPrewarm) {
        try {
            if (aiCache.has(q.toLowerCase().trim())) { console.log(`💾 已缓存: ${q}`); continue; }
            await callQwenAI(q);
            console.log(`✅ 已预加热: ${q}`);
        } catch (e) { console.error(`❌ 预加热失败: ${q}`, e.message); }
    }
    console.log(`\n✅ 服务器就绪！缓存: ${aiCache.size} 条\n`);
});
