#!/usr/bin/env node
/**
 * 诊断脚本 - 检查 WeChat AI 服务状态
 * 用法: node diagnose.js
 */

require('dotenv').config();
const axios = require('axios');

const RAILWAY_URL = process.env.RAILWAY_URL || 'https://your-app.railway.app';

async function diagnose() {
    console.log('🔍 开始诊断 WeChat AI 服务...\n');
    
    // 1. 检查环境变量
    console.log('📋 1. 检查环境变量:');
    const requiredVars = [
        'WECHAT_TOKEN',
        'WECHAT_APPID', 
        'WECHAT_APPSECRET',
        'ZHIPU_API_KEY'
    ];
    
    let allVarsPresent = true;
    for (const varName of requiredVars) {
        if (process.env[varName]) {
            console.log(`  ✅ ${varName}: 已设置`);
        } else {
            console.log(`  ❌ ${varName}: 未设置`);
            allVarsPresent = false;
        }
    }
    
    if (!allVarsPresent) {
        console.log('\n⚠️  部分环境变量未设置，服务可能无法正常工作\n');
    }
    
    // 2. 测试健康检查接口
    console.log('🏥 2. 测试健康检查接口:');
    try {
        const healthUrl = `${RAILWAY_URL}/health`;
        console.log(`  请求: ${healthUrl}`);
        
        const healthResponse = await axios.get(healthUrl, { timeout: 5000 });
        console.log(`  ✅ 健康检查通过:`, healthResponse.data);
    } catch (error) {
        console.log(`  ❌ 健康检查失败:`, error.message);
        console.log(`  请检查 Railway 服务是否正在运行`);
    }
    
    // 3. 测试 WeChat Access Token 获取
    console.log('\n🔑 3. 测试 WeChat Access Token:');
    try {
        const tokenResponse = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
            params: {
                grant_type: 'client_credential',
                appid: process.env.WECHAT_APPID,
                secret: process.env.WECHAT_APPSECRET
            },
            timeout: 5000
        });
        
        if (tokenResponse.data.access_token) {
            console.log(`  ✅ Access Token 获取成功`);
            console.log(`  Token: ${tokenResponse.data.access_token.substring(0, 20)}...`);
        } else {
            console.log(`  ❌ Access Token 获取失败:`, tokenResponse.data);
        }
    } catch (error) {
        console.log(`  ❌ Access Token 获取失败:`, error.response?.data || error.message);
    }
    
    // 4. 测试 智谱 AI API
    console.log('\n🤖 4. 测试 智谱 AI API:');
    try {
        const aiResponse = await axios.post(
            'https://open.bigmodel.cn/api/paas/v4/chat/completions',
            {
                model: 'glm-4-flash',
                messages: [
                    { role: 'user', content: '测试' }
                ],
                max_tokens: 50
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.ZHIPU_API_KEY}`
                },
                timeout: 8000
            }
        );
        
        console.log(`  ✅ 智谱 AI API 调用成功`);
        console.log(`  回复: ${aiResponse.data.choices[0].message.content}`);
    } catch (error) {
        console.log(`  ❌ 智谱 AI API 调用失败:`, error.response?.data || error.message);
    }
    
    // 5. 检查代码逻辑
    console.log('\n🔍 5. 代码逻辑检查:');
    console.log('  请手动检查以下项:');
    console.log('    - Railway 服务是否正在运行?');
    console.log('    - 微信公众平台 → 设置与开发 → 基本配置 → 服务器配置 是否启用?');
    console.log('    - 服务器地址(URL) 是否正确? (应为: ' + RAILWAY_URL + '/wechat )');
    console.log('    - Token 是否一致? (微信后台的 Token 应等于 WECHAT_TOKEN)');
    
    console.log('\n✅ 诊断完成！请根据上述结果修复问题。\n');
}

diagnose().catch(error => {
    console.error('❌ 诊断过程中发生错误:', error);
    process.exit(1);
});
