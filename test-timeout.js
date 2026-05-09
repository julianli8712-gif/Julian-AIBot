// 测试智谱 AI 实际响应时间
const axios = require('axios');
require('dotenv').config();

const ZHIPU_BASE_URL = process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/';
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;

const testQuestions = [
    '什么是ADR？',
    '解释ADR在酒店管理中的含义',
    '推荐北京的高端酒店',
    '酒店收益管理是什么？'
];

async function testAIResponse(question) {
    const startTime = Date.now();
    
    try {
        console.log(`\n📤 测试问题: ${question}`);
        
        const response = await axios.post(
            `${ZHIPU_BASE_URL}/chat/completions`,
            {
                model: 'glm-4-flash',
                messages: [
                    { role: 'system', content: '你是酒店业助手，简洁回答。' },
                    { role: 'user', content: question }
                ],
                max_tokens: 150,
                temperature: 0.7
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ZHIPU_API_KEY}`
                },
                timeout: 10000  // 10秒超时（测试用）
            }
        );
        
        const aiReply = response.data.choices[0].message.content;
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        console.log(`✅ 成功 (耗时: ${duration}ms)`);
        console.log(`   回复: ${aiReply.substring(0, 100)}...`);
        
        return { success: true, duration, reply: aiReply };
        
    } catch (error) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        console.log(`❌ 失败 (耗时: ${duration}ms)`);
        console.log(`   错误: ${error.response?.data || error.message}`);
        
        return { success: false, duration, error: error.message };
    }
}

async function runTests() {
    console.log('🧪 开始测试智谱 AI 响应时间...\n');
    console.log('=' .repeat(60));
    
    const results = [];
    
    for (const question of testQuestions) {
        const result = await testAIResponse(question);
        results.push({ question, ...result });
        
        // 等待 1 秒，避免限流
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log('\n📊 测试总结:\n');
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    if (successful.length > 0) {
        const avgTime = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
        const maxTime = Math.max(...successful.map(r => r.duration));
        const minTime = Math.min(...successful.map(r => r.duration));
        
        console.log(`✅ 成功: ${successful.length}/${results.length}`);
        console.log(`⏱️  平均耗时: ${avgTime.toFixed(0)}ms`);
        console.log(`⏱️  最快: ${minTime}ms`);
        console.log(`⏱️  最慢: ${maxTime}ms`);
        
        if (maxTime > 3500) {
            console.log(`\n⚠️  警告: 最慢响应 ${maxTime}ms 超过 3.5秒超时限制！`);
            console.log(`   建议: 调整超时时间到 ${(maxTime / 1000 + 0.5).toFixed(1)} 秒`);
        }
    }
    
    if (failed.length > 0) {
        console.log(`\n❌ 失败: ${failed.length}/${results.length}`);
        failed.forEach(r => {
            console.log(`   - ${r.question}: ${r.error}`);
        });
    }
    
    console.log('\n💡 建议:');
    if (successful.some(r => r.duration > 3500)) {
        console.log('   - 智谱 AI 响应时间不稳定，建议添加预定义回答');
        console.log('   - 或者调整超时时间到 4.5 秒（接近微信 5 秒限制）');
    }
}

runTests().catch(console.error);
