/**
 * 测试 Railway 部署的 /test 接口（GET 和 POST）
 */

const https = require('https');

// 从命令行参数获取 Railway 域名
const RAILWAY_URL = process.argv[2] || 'https://julian-aibot-production.up.railway.app';

console.log(`🧪 测试 Railway 部署: ${RAILWAY_URL}\n`);

// 测试 1: GET /test (应该返回 HTML 测试页面)
function testGet() {
    return new Promise((resolve, reject) => {
        console.log('1️⃣  测试 GET /test (浏览器测试页面)...');
        
        https.get(`${RAILWAY_URL}/test`, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode === 200 && data.includes('Hotel AI 测试')) {
                    console.log('✅ GET /test 成功！返回测试页面\n');
                    resolve(true);
                } else {
                    console.log(`❌ GET /test 失败: HTTP ${res.statusCode}`);
                    console.log(`   响应: ${data.substring(0, 200)}\n`);
                    resolve(false);
                }
            });
        }).on('error', (err) => {
            console.log(`❌ GET /test 错误: ${err.message}\n`);
            resolve(false);
        });
    });
}

// 测试 2: GET /health (健康检查)
function testHealth() {
    return new Promise((resolve, reject) => {
        console.log('2️⃣  测试 GET /health (健康检查)...');
        
        https.get(`${RAILWAY_URL}/health`, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode === 200) {
                    console.log('✅ GET /health 成功！');
                    console.log(`   响应: ${data}\n`);
                    resolve(true);
                } else {
                    console.log(`❌ GET /health 失败: HTTP ${res.statusCode}`);
                    console.log(`   响应: ${data.substring(0, 200)}\n`);
                    resolve(false);
                }
            });
        }).on('error', (err) => {
            console.log(`❌ GET /health 错误: ${err.message}\n`);
            resolve(false);
        });
    });
}

// 测试 3: POST /test (AI 回复)
function testPost() {
    return new Promise((resolve, reject) => {
        console.log('3️⃣  测试 POST /test (AI 回复)...');
        
        const postData = JSON.stringify({
            message: '你好，请介绍一下酒店收益管理'
        });
        
        const url = new URL(`${RAILWAY_URL}/test`);
        
        const options = {
            hostname: url.hostname,
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
                if (res.statusCode === 200) {
                    const result = JSON.parse(data);
                    if (result.success) {
                        console.log('✅ POST /test 成功！');
                        console.log(`   用户消息: ${result.userMessage}`);
                        console.log(`   AI 回复: ${result.aiReply.substring(0, 100)}...\n`);
                        resolve(true);
                    } else {
                        console.log(`❌ POST /test 失败: ${result.error}\n`);
                        resolve(false);
                    }
                } else {
                    console.log(`❌ POST /test 失败: HTTP ${res.statusCode}`);
                    console.log(`   响应: ${data.substring(0, 200)}\n`);
                    resolve(false);
                }
            });
        });
        
        req.on('error', (err) => {
            console.log(`❌ POST /test 错误: ${err.message}\n`);
            resolve(false);
        });
        
        req.write(postData);
        req.end();
    });
}

// 运行所有测试
async function runTests() {
    const test1 = await testGet();
    const test2 = await testHealth();
    const test3 = await testPost();
    
    console.log('='.repeat(50));
    console.log('📊 测试结果汇总:');
    console.log(`   GET /test:    ${test1 ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   GET /health:  ${test2 ? '✅ 成功' : '❌ 失败'}`);
    console.log(`   POST /test:   ${test3 ? '✅ 成功' : '❌ 失败'}`);
    console.log('='.repeat(50));
    
    if (test1 && test2 && test3) {
        console.log('\n🎉 所有测试通过！Railway 部署成功！');
        console.log(`\n🌐 访问测试页面: ${RAILWAY_URL}/test`);
    } else {
        console.log('\n⚠️  部分测试失败，请检查 Railway 部署日志');
    }
}

runTests();
