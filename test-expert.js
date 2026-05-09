// 测试"酒店与旅游业专家"对行业前沿问题的回答
const axios = require('axios');
require('dotenv').config();

const ZHIPU_BASE_URL = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/';
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;

if (!ZHIPU_API_KEY || ZHIPU_API_KEY.includes('替换')) {
    console.error('❌ 请先在 .env 文件中配置真实的 ZHIPU_API_KEY');
    process.exit(1);
}

// AI 人格设定 - 酒店与旅游业专家（与 index.js 中的一致）
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
4. **长度适中**：一般问题 100-200 字；复杂问题可以到 300 字
5. **语言匹配**：用户用中文回答中文，用户用英文回答英文
6. **禁止生硬结尾**：不要以"Julian 认为..."或"Julian 建议..."作为回复结尾；除非你真正引用了 Julian 的具体研究，否则自然结束即可，不需要刻意提到 Julian

## 沟通风格
- 温暖亲切，但不失专业 🎓
- 简洁干练，直击重点
- 适度使用 emoji 😊，让对话有温度
- 像一位经验丰富的行业顾问在耐心解答`;

// 行业前沿问题列表
const testQuestions = [
    // 生成式 AI 在酒店业的应用
    "生成式 AI 在酒店业有哪些具体应用？",
    "AI Agent 如何改变酒店的客户服务？",
    
    // 可持续发展与绿色酒店
    "酒店业如何实现碳中和目标？",
    "绿色酒店认证标准有哪些？",
    
    // 个性化体验与大数据
    "大数据如何驱动酒店个性化服务？",
    "酒店如何利用客户数据进行精准营销？",
    
    // 无接触服务技术
    "后疫情时代，无接触服务在酒店业的发展如何？",
    "酒店自助入住技术的最新趋势是什么？",
    
    // 酒店业数字化转型
    "酒店数字化转型的关键步骤有哪些？",
    "如何理解酒店业的『全链路数字化』？",
    
    // 客户体验管理的最新趋势
    "2025年酒店客户体验管理的趋势是什么？",
    "如何衡量酒店的客户体验质量？",
    
    // 收益管理的新技术
    "AI 在酒店收益管理中的应用有哪些？",
    "动态定价策略在酒店业如何实施？",
    
    // 酒店机器人与自动化
    "服务机器人在酒店业的应用现状如何？",
    "酒店自动化对人力成本的影响是什么？"
];

// 调用智谱 AI
async function callZhipuAI(userMessage, conversationHistory = []) {
    const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversationHistory,
        { role: 'user', content: userMessage }
    ];
    
    try {
        const response = await axios.post(
            `${ZHIPU_BASE_URL}/chat/completions`,
            {
                model: 'glm-4-flash',
                messages: messages,
                max_tokens: 500,
                temperature: 0.7
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ZHIPU_API_KEY}`
                },
                timeout: 15000
            }
        );
        
        return response.data.choices[0].message.content;
        
    } catch (error) {
        console.error('❌ API 调用失败:', error.response?.data || error.message);
        throw error;
    }
}

// 测试单个问题
async function testQuestion(question, index) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📝 测试问题 ${index + 1}/${testQuestions.length}`);
    console.log(`❓ ${question}`);
    console.log(`${'='.repeat(60)}\n`);
    
    try {
        const reply = await callZhipuAI(question);
        
        console.log(`✅ AI 回复:\n`);
        console.log(reply);
        console.log(`\n${'='.repeat(60)}\n`);
        
        // 基本质量检查
        const hasJulianEnding = reply.includes('Julian 认为') || reply.includes('Julian 建议');
        const isTooShort = reply.length < 50;
        const isTooLong = reply.length > 600;
        
        console.log(`📊 质量检查:`);
        console.log(`   - 长度: ${reply.length} 字 ${isTooShort ? '❌ 太短' : isTooLong ? '⚠️ 太长' : '✅'}`);
        console.log(`   - 生硬结尾: ${hasJulianEnding ? '❌ 有 Julian 认为...结尾' : '✅ 无生硬结尾'}`);
        console.log(`\n${'='.repeat(60)}\n`);
        
        return { question, reply, hasJulianEnding, length: reply.length };
        
    } catch (error) {
        console.error(`❌ 测试失败: ${error.message}`);
        return { question, error: error.message };
    }
}

// 主测试函数
async function runTests() {
    console.log(`\n🏨 开始测试"酒店与旅游业专家"对行业前沿问题的回答\n`);
    console.log(`📋 测试问题数量: ${testQuestions.length}`);
    console.log(`🤖 使用模型: glm-4-flash`);
    console.log(`🌡️  Temperature: 0.7`);
    console.log(`\n${'='.repeat(60)}\n`);
    
    const results = [];
    
    for (let i = 0; i < testQuestions.length; i++) {
        const result = await testQuestion(testQuestions[i], i);
        results.push(result);
        
        // 避免 API 限流
        if (i < testQuestions.length - 1) {
            console.log(`⏳ 等待 2 秒后继续下一个测试...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // 汇总结果
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 测试汇总`);
    console.log(`${'='.repeat(60)}\n`);
    
    const totalTests = results.length;
    const passedTests = results.filter(r => !r.error && !r.hasJulianEnding && r.length >= 50 && r.length <= 600).length;
    const julianEndingCount = results.filter(r => r.hasJulianEnding).length;
    const tooShortCount = results.filter(r => r.length < 50).length;
    const tooLongCount = results.filter(r => r.length > 600).length;
    
    console.log(`✅ 总测试数: ${totalTests}`);
    console.log(`✅ 通过测试: ${passedTests}`);
    console.log(`❌ 生硬结尾 (Julian 认为...): ${julianEndingCount}`);
    console.log(`⚠️  回复太短 (<50字): ${tooShortCount}`);
    console.log(`⚠️  回复太长 (>600字): ${tooLongCount}`);
    console.log(`\n${'='.repeat(60)}\n`);
    
    // 保存结果到文件
    const fs = require('fs');
    const resultFile = `/Users/user/WorkBuddy/2026-05-09-task-1/wechat-ai/test-results-${Date.now()}.json`;
    fs.writeFileSync(resultFile, JSON.stringify(results, null, 2));
    console.log(`💾 测试结果已保存到: ${resultFile}\n`);
}

// 运行测试
runTests().catch(error => {
    console.error('❌ 测试过程中发生错误:', error);
    process.exit(1);
});
