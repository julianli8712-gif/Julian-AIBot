#!/usr/bin/env node
/**
 * 测试"酒店与旅游业专家"对行业前沿问题的回答
 * 使用已部署的 Railway 应用的 /test 端点
 */

const https = require('https');
const fs = require('fs');

const BASE_URL = 'https://julian-aibot-production.up.railway.app';

// 行业前沿问题列表（根据"酒店与旅游业专家"定位设计）
const testQuestions = [
    // 生成式 AI 应用
    '生成式 AI 在酒店业有哪些具体应用？',
    'AI Agent 如何改变酒店的客户服务？',
    
    // 可持续发展
    '酒店业如何实现碳中和目标？',
    '绿色酒店认证标准有哪些？',
    
    // 个性化与大数据
    '大数据如何驱动酒店个性化服务？',
    '酒店如何利用客户数据进行精准营销？',
    
    // 无接触服务
    '后疫情时代，无接触服务在酒店业的发展如何？',
    '酒店自助入住技术的最新趋势是什么？',
    
    // 数字化转型
    '酒店数字化转型的关键步骤有哪些？',
    '如何理解酒店业的「全链路数字化」？',
    
    // 客户体验
    '2025年酒店客户体验管理的趋势是什么？',
    '如何衡量酒店的客户体验质量？',
    
    // 收益管理新技术
    'AI 在酒店收益管理中的应用有哪些？',
    '动态定价策略在酒店业如何实施？',
    
    // 机器人与自动化
    '服务机器人在酒店业的应用现状如何？',
    '酒店自动化对人力成本的影响是什么？'
];

// 发送测试请求
function sendTestRequest(question, userId = 'test-expert-001') {
    return new Promise((resolve, reject) => {
        const url = `${BASE_URL}/test`;
        const postData = JSON.stringify({
            message: question,
            userId: userId
        });
        
        const urlObj = new URL(url);
        
        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: '/test',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve({
                        success: true,
                        statusCode: res.statusCode,
                        data: result
                    });
                } catch (error) {
                    resolve({
                        success: false,
                        statusCode: res.statusCode,
                        error: '解析响应失败',
                        rawData: data
                    });
                }
            });
        });
        
        req.on('error', (error) => {
            reject(error);
        });
        
        req.write(postData);
        req.end();
    });
}

// 评估回答质量
function evaluateReply(question, reply) {
    const evaluation = {
        question: question,
        reply: reply,
        hasJulianEnding: false,
        isTooShort: false,
        isTooLong: false,
        hasHallucination: false,
        score: 0,
        issues: []
    };
    
    // 检查生硬结尾
    if (reply.includes('Julian 认为') || reply.includes('Julian 建议')) {
        evaluation.hasJulianEnding = true;
        evaluation.issues.push('❌ 有生硬结尾（Julian 认为...）');
    }
    
    // 检查长度
    if (reply.length < 50) {
        evaluation.isTooShort = true;
        evaluation.issues.push('⚠️ 回复太短（<50字）');
    } else if (reply.length > 600) {
        evaluation.isTooLong = true;
        evaluation.issues.push('⚠️ 回复太长（>600字）');
    }
    
    // 简单幻觉检测（检查是否包含不确定的数据）
    const hallucinationKeywords = ['100%', '一定', '绝对', '肯定'];
    for (const keyword of hallucinationKeywords) {
        if (reply.includes(keyword)) {
            evaluation.hasHallucination = true;
            evaluation.issues.push(`⚠️ 可能包含幻觉词汇：${keyword}`);
            break;
        }
    }
    
    // 评分（简单版本）
    evaluation.score = 100;
    if (evaluation.hasJulianEnding) evaluation.score -= 30;
    if (evaluation.isTooShort) evaluation.score -= 20;
    if (evaluation.isTooLong) evaluation.score -= 10;
    if (evaluation.hasHallucination) evaluation.score -= 20;
    
    return evaluation;
}

// 清空对话历史
async function clearConversation(userId = 'test-expert-001') {
    return new Promise((resolve, reject) => {
        const url = `${BASE_URL}/test/clear`;
        const postData = JSON.stringify({
            userId: userId
        });
        
        const urlObj = new URL(url);
        
        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: '/test/clear',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`🗑️  已清空对话历史（用户: ${userId}）\n`);
                resolve(JSON.parse(data));
            });
        });
        
        req.on('error', (error) => {
            console.error('清空对话失败:', error);
            reject(error);
        });
        
        req.write(postData);
        req.end();
    });
}

// 主测试函数
async function runTests() {
    console.log(`\n🏨 开始测试"酒店与旅游业专家"对行业前沿问题的回答\n`);
    console.log(`📋 测试问题数量: ${testQuestions.length}`);
    console.log(`🌐 测试 URL: ${BASE_URL}/test`);
    console.log(`🤖 使用模型: glm-4-flash`);
    console.log(`\n${'='.repeat(70)}\n`);
    
    const results = [];
    const evaluations = [];
    
    // 先清空对话历史
    await clearConversation('test-expert-001');
    
    for (let i = 0; i < testQuestions.length; i++) {
        const question = testQuestions[i];
        
        console.log(`\n${'='.repeat(70)}`);
        console.log(`📝 测试问题 ${i + 1}/${testQuestions.length}`);
        console.log(`❓ ${question}`);
        console.log(`${'='.repeat(70)}\n`);
        
        try {
            const response = await sendTestRequest(question, 'test-expert-001');
            
            if (response.success && response.data.success) {
                const reply = response.data.aiReply;
                
                console.log(`✅ AI 回复:\n`);
                console.log(reply);
                
                // 评估回答质量
                const evaluation = evaluateReply(question, reply);
                evaluations.push(evaluation);
                
                console.log(`\n📊 质量评估:`);
                if (evaluation.issues.length === 0) {
                    console.log(`   ✅ 通过所有检查`);
                } else {
                    evaluation.issues.forEach(issue => {
                        console.log(`   ${issue}`);
                    });
                }
                console.log(`   📈 评分: ${evaluation.score}/100`);
                
                results.push({
                    question: question,
                    reply: reply,
                    evaluation: evaluation
                });
                
            } else {
                console.error(`❌ 测试失败:`, response.data || response.error);
                results.push({
                    question: question,
                    error: response.data?.error || response.error || '未知错误'
                });
            }
            
        } catch (error) {
            console.error(`❌ 请求失败:`, error.message);
            results.push({
                question: question,
                error: error.message
            });
        }
        
        // 避免限流，等待 2 秒
        if (i < testQuestions.length - 1) {
            console.log(`\n⏳ 等待 2 秒后继续下一个测试...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // 汇总结果
    console.log(`\n\n${'='.repeat(70)}`);
    console.log(`📊 测试汇总`);
    console.log(`${'='.repeat(70)}\n`);
    
    const totalTests = results.length;
    const passedTests = evaluations.filter(e => e.score >= 80).length;
    const julianEndingCount = evaluations.filter(e => e.hasJulianEnding).length;
    const tooShortCount = evaluations.filter(e => e.isTooShort).length;
    const tooLongCount = evaluations.filter(e => e.isTooLong).length;
    const hallucinationCount = evaluations.filter(e => e.hasHallucination).length;
    
    console.log(`✅ 总测试数: ${totalTests}`);
    console.log(`✅ 通过测试 (评分≥80): ${passedTests}`);
    console.log(`❌ 生硬结尾 (Julian 认为...): ${julianEndingCount}`);
    console.log(`⚠️  回复太短 (<50字): ${tooShortCount}`);
    console.log(`⚠️  回复太长 (>600字): ${tooLongCount}`);
    console.log(`⚠️  可能包含幻觉: ${hallucinationCount}`);
    console.log(`📈 平均评分: ${(evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length).toFixed(1)}/100`);
    
    // 保存结果到文件
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultFile = `/Users/user/WorkBuddy/2026-05-09-task-1/wechat-ai/test-expert-results-${timestamp}.json`;
    
    fs.writeFileSync(resultFile, JSON.stringify({
        testTime: new Date().toISOString(),
        totalTests: totalTests,
        passedTests: passedTests,
        averageScore: evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length,
        results: results
    }, null, 2));
    
    console.log(`\n💾 测试结果已保存到: ${resultFile}\n`);
    
    // 输出失败的问题
    const failedTests = results.filter(r => r.error || (r.evaluation && r.evaluation.score < 80));
    if (failedTests.length > 0) {
        console.log(`\n${'='.repeat(70)}`);
        console.log(`⚠️  需要关注的问题`);
        console.log(`${'='.repeat(70)}\n`);
        
        failedTests.forEach((test, index) => {
            console.log(`❓ ${test.question}`);
            if (test.error) {
                console.log(`   错误: ${test.error}`);
            } else if (test.evaluation) {
                console.log(`   评分: ${test.evaluation.score}/100`);
                test.evaluation.issues.forEach(issue => {
                    console.log(`   ${issue}`);
                });
            }
            console.log();
        });
    }
}

// 运行测试
runTests().catch(error => {
    console.error('❌ 测试过程中发生错误:', error);
    process.exit(1);
});
