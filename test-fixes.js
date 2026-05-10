const axios = require('axios');

const API = 'https://julian-aibot-production.up.railway.app';
const USER_ID = 'test_user_007';

async function test(name, message) {
    console.log(`\n📧 测试：${name}`);
    console.log(`   输入："${message}"`);
    
    const start = Date.now();
    try {
        const res = await axios.post(`${API}/test`, {
            message: message,
            userId: USER_ID
        }, { timeout: 5500 });
        
        const elapsed = Date.now() - start;
        const reply = res.data.aiReply;
        const source = res.data.source;
        
        console.log(`   ✅ 成功 (${elapsed}ms)`);
        console.log(`   来源：${source}`);
        
        const preview = reply ? reply.substring(0, 60) : '';
        console.log(`   回复：${preview}...`);
        
        return { success: true, elapsed, source };
    } catch (error) {
        const elapsed = Date.now() - start;
        const errorMsg = error.code || error.message;
        console.log(`   ❌ 失败 (${elapsed}ms): ${errorMsg}`);
        return { success: false, elapsed, error: errorMsg };
    }
}

(async () => {
    console.log('='.repeat(60));
    console.log('🔧 测试三个修复（使用全新问题，避缓存）');
    console.log('='.repeat(60));
    
    const results = [];
    
    // 测试1：关于Julian的FAQ匹配（新问法）
    results.push(await test('关于Julian (FAQ)', 'Julian Li是谁？'));
    
    // 测试2：关于公众号的FAQ匹配（新问法）
    results.push(await test('关于公众号 (FAQ)', '这个公众号叫什么名字？'));
    
    // 测试3：酒店推荐不应匹配到"酒店类型"FAQ
    results.push(await test('酒店推荐不误匹配', '推荐一家上海外滩边的上的豪华酒店'));
    
    // 测试4：AI调用超时测试（新问题，不在缓存）
    results.push(await test('AI响应速度（新）', '什么是单体酒店？'));
    
    // 测试5：AI调用超时测试2（新问题，不在缓存）
    results.push(await test('AI响应速度2（新）', '中国酒店业发展趋势如何？'));
    
    // 分析
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试结果');
    console.log('='.repeat(60));
    
    console.log('\n[FAQ匹配]');
    for (let i = 0; i < 3 && i < results.length; i++) {
        const r = results[i];
        if (r.success) {
            const status = r.source === 'faq' ? '✅' : '❌';
            console.log(`  ${i+1}. ${status} 来源=${r.source}`);
        } else {
            console.log(`  ${i+1}. ❌ 失败`);
        }
    }
    
    console.log('\n[AI响应速度]');
    for (let i = 3; i < results.length; i++) {
        const r = results[i];
        if (r.success) {
            const status = r.elapsed < 5000 ? '✅' : '❌';
            const warning = r.elapsed >= 4000 ? ' ⚠️接近超时' : '';
            console.log(`  ${i-2}. ${status} ${r.elapsed}ms${warning}`);
        } else {
            console.log(`  ${i-2}. ❌ 失败: ${r.error}`);
        }
    }
    
    // 总体判断
    const faqTests = results.slice(0, 3);
    const aiTests = results.slice(3);
    
    const allFAQCorrect = faqTests.every(r => r.success && r.source === 'faq');
    const allAIUnder5s = aiTests.every(r => r.success && r.elapsed < 5000);
    
    console.log('\n' + '='.repeat(60));
    if (allFAQCorrect && allAIUnder5s) {
        console.log('🎉 全部测试通过！三个问题都已修复');
    } else {
        console.log('⚠️  部分测试失败，需要进一步优化');
        if (!allFAQCorrect) console.log('   - FAQ匹配有问题');
        if (!allAIUnder5s) console.log('   - AI响应超时风险');
    }
    console.log('='.repeat(60));
    
    process.exit(0);
})();
