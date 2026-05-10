const axios = require('axios');

const API = 'https://julian-aibot-production.up.railway.app';

async function test(name, message) {
    console.log(`\n📧 测试：${name}`);
    console.log(`   输入："${message}"`);
    
    try {
        const res = await axios.post(`${API}/test`, {
            message: message
        }, { timeout: 5500 });
        
        const reply = res.data.aiReply;
        const source = res.data.source;
        
        console.log(`   ✅ 成功`);
        console.log(`   来源：${source}`);
        console.log(`   回复：\n${reply}\n`);
        
        // 检查是否包含指定酒店
        if (message.includes('北京')) {
            const hasHotel = reply.includes('金融街威斯汀') || reply.includes('威斯汀');
            console.log(`   ${hasHotel ? '✅' : '❌'} 包含"北京金融街威斯汀大酒店"：${hasHotel}`);
            return hasHotel;
        }
        
        if (message.includes('香港')) {
            const hasHotel = reply.includes('Hotel Icon') || reply.includes('唯港荟');
            console.log(`   ${hasHotel ? '✅' : '❌'} 包含"Hotel Icon 唯港荟"：${hasHotel}`);
            return hasHotel;
        }
        
        return true;
    } catch (error) {
        console.log(`   ❌ 失败: ${error.code || error.message}`);
        return false;
    }
}

(async () => {
    console.log('='.repeat(60));
    console.log('🏨 测试酒店推荐优化');
    console.log('='.repeat(60));
    
    const results = [];
    
    // 测试1：北京酒店推荐（FAQ）
    results.push(await test('北京酒店推荐 (FAQ)', '推荐北京高端酒店'));
    
    // 测试2：北京酒店推荐（AI生成）
    results.push(await test('北京酒店推荐 (AI)', '北京朝阳区有哪些值得住的酒店？'));
    
    // 测试3：香港酒店推荐（FAQ）
    results.push(await test('香港酒店推荐 (FAQ)', '推荐香港高端酒店'));
    
    // 测试4：香港酒店推荐（AI生成）
    results.push(await test('香港酒店推荐 (AI)', '香港尖沙咀有什么好酒店？'));
    
    // 汇总
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试结果');
    console.log('='.repeat(60));
    
    const beijingTests = results.slice(0, 2);
    const hkTests = results.slice(2, 4);
    
    console.log('\n[北京酒店推荐]');
    console.log(`  1. ${beijingTests[0] ? '✅' : '❌'} FAQ匹配`);
    console.log(`  2. ${beijingTests[1] ? '✅' : '❌'} AI生成`);
    
    console.log('\n[香港酒店推荐]');
    console.log(`  3. ${hkTests[0] ? '✅' : '❌'} FAQ匹配`);
    console.log(`  4. ${hkTests[1] ? '✅' : '❌'} AI生成`);
    
    const allPassed = results.every(r => r === true);
    
    console.log('\n' + '='.repeat(60));
    if (allPassed) {
        console.log('🎉 全部测试通过！指定酒店已强制植入');
    } else {
        console.log('⚠️  部分测试失败，需要检查');
    }
    console.log('='.repeat(60));
    
    process.exit(0);
})();
