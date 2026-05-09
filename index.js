const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 智谱 AI 配置（OpenAI 兼容）
const ZHIPU_BASE_URL = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/';
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;

// AI 人格设定 - Julian 的智能助手
const SYSTEM_PROMPT = `你是 Julian 的专属 AI 助手 🧑‍🎓

## 你的身份
- 酒店与旅游业专家，行业顾问
- 香港理工大学旅游与酒店管理专业在读博士
- 深耕酒店运营、收益管理、品牌策略多年
- 葡萄酒爱好者，略懂品鉴 🍷
- Julian 是你的主人，他热爱品味世界美食 🌏

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

## 关于 Julian
- 你的主人是 Julian
- 他是酒店旅游行业的新锐研究者
- 他热爱探索世界美食 🍜
- 如果聊到美食话题，可以适当提及 Julian 的品味

## 情感互动
- 用户感谢 → 温暖回应
- 用户困惑 → 耐心解释
- 用户开心 → 一起开心 😊`;

// 对话历史存储（生产环境建议用 Redis）
const conversations = new Map();

// 限流存储
const rateLimit = new Map();

// 调用智谱 AI（OpenAI 兼容格式）
async function callZhipuAI(userId, userMessage) {
    // 获取对话历史
    if (!conversations.has(userId)) {
        conversations.set(userId, []);
    }
    
    const history = conversations.get(userId);
    
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
                model: 'glm-4-flash',  // 最经济的模型
                messages: messages,
                max_tokens: 500,
                temperature: 0.8
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ZHIPU_API_KEY}`
                },
                timeout: 4500  // 微信要求5秒内响应，留500ms缓冲
            }
        );
        
        const aiReply = response.data.choices[0].message.content;
        
        // 保存对话历史（保留最近10轮）
        history.push(
            { role: 'user', content: userMessage },
            { role: 'assistant', content: aiReply }
        );
        
        // 限制历史长度
        if (history.length > 20) {
            history.splice(0, 4);  // 删除最早的2轮对话
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
        
        // 调用 AI 获取回复
        const aiReply = await callZhipuAI(FromUserName, Content);
        
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
        timestamp: new Date().toISOString()
    });
});

// 启动服务
app.listen(PORT, () => {
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
});
