#!/usr/bin/env node
/**
 * 快速测试 - 验证 API 密钥是否有效
 */

require('dotenv').config();
const axios = require('axios');

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;
const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_APPSECRET = process.env.WECHAT_APPSECRET;

console.log('🔍 快速测试 API 密钥...\n');

// 测试智谱 AI
async function testZhipu() {
    console.log('🤖 测试智谱 AI API...');
    
    if (!ZHIPU_API_KEY || ZHIPU_API_KEY.includes('替换')) {
        console.log('  ❌ API Key 未设置或使用占位符\n');
        return false;
    }
    
    try {
        const response = await axios.post(
            'https://open.bigmodel.cn/api/paas/v4/chat/completions',
            {
                model: 'glm-4-flash',
                messages: [{ role: 'user', content: '测试' }],
                max_tokens: 50
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${ZHIPU_API_KEY}`
                },
                timeout: 8000
            }
        );
        
        console.log('  ✅ 智谱 AI API 调用成功');
        console.log(`  回复: ${response.data.choices[0].message.content}\n`);
        return true;
    } catch (error) {
        console.log('  ❌ 智谱 AI API 调用失败:');
        console.log(`  错误: ${error.response?.data?.error?.message || error.message}\n`);
        return false;
    }
}

// 测试微信 Access Token
async function testWechat() {
    console.log('🔑 测试微信 Access Token...');
    
    if (!WECHAT_APPID || WECHAT_APPID.includes('替换')) {
        console.log('  ❌ WECHAT_APPID 未设置或使用占位符\n');
        return false;
    }
    
    if (!WECHAT_APPSECRET || WECHAT_APPSECRET.includes('替换')) {
        console.log('  ❌ WECHAT_APPSECRET 未设置或使用占位符\n');
        return false;
    }
    
    try {
        const response = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
            params: {
                grant_type: 'client_credential',
                appid: WECHAT_APPID,
                secret: WECHAT_APPSECRET
            },
            timeout: 5000
        });
        
        if (response.data.access_token) {
            console.log('  ✅ 微信 Access Token 获取成功');
            console.log(`  Token: ${response.data.access_token.substring(0, 20)}...\n`);
            return true;
        } else {
            console.log('  ❌ Access Token 获取失败:');
            console.log(`  错误: ${response.data.errmsg}\n`);
            return false;
        }
    } catch (error) {
        console.log('  ❌ Access Token 获取失败:');
        console.log(`  错误: ${error.response?.data || error.message}\n`);
        return false;
    }
}

// 主函数
async function main() {
    const zhipuOk = await testZhipu();
    const wechatOk = await testWechat();
    
    console.log('📊 测试结果:');
    console.log(`  智谱 AI: ${zhipuOk ? '✅ 正常' : '❌ 异常'}`);
    console.log(`  微信 API: ${wechatOk ? '✅ 正常' : '❌ 异常'}`);
    
    if (!zhipuOk || !wechatOk) {
        console.log('\n⚠️  请先设置正确的 API 密钥！');
        console.log('   1. 在 Railway Dashboard 中设置环境变量');
        console.log('   2. 或在本地 .env 文件中设置后重新部署\n');
    }
}

main().catch(error => {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
});
