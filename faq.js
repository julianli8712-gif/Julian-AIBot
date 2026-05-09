// 预定义问答库（常见问题快速回复）
const faqDatabase = {
    // ADR 相关问题
    'adr': {
        keywords: ['adr', 'average daily rate', '平均房价'],
        answer: `📊 ADR (Average Daily Rate) 平均每日房价

## 定义
ADR = 客房总收入 ÷ 已售客房数

## 公式
ADR = Room Revenue ÷ Rooms Sold

## 示例
某酒店某日：
- 客房收入：100,000 元
- 已售房间：200 间
- ADR = 100,000 ÷ 200 = 500 元

## 作用
- 衡量酒店定价策略有效性
- 与 RevPAR、Occupancy 结合分析收益
- 行业对标的重要指标

💡 ADR 高不代表收益好，需结合入住率分析～`
    },
    
    // 收益管理
    '收益管理': {
        keywords: ['收益管理', 'revenue management', '收益'],
        answer: `💰 酒店收益管理 (Revenue Management)

## 核心目标
在正确的时间，以正确的价格，把房间卖给正确的客人

## 关键指标
- **ADR**: 平均每日房价
- **Occupancy**: 入住率
- **RevPAR**: 每间可售房收入 = ADR × Occupancy
- **TRevPAR**: 每间房总收益（含餐饮、SPA等）

## 常用策略
- 动态定价（根据需求调整价格）
- 库存控制（预留房间给高价客人）
- 渠道管理（OTA vs 直订）
- 超售管理（overbooking）

📚 推荐书籍：《酒店收益管理》- 本土化实践指南`
    },
    
    // 北京酒店推荐
    '北京酒店': {
        keywords: ['北京酒店', '北京高端酒店', '北京推荐酒店'],
        answer: `🏨 北京高端酒店推荐

## 国际品牌
- **瑰丽酒店** - 亮马桥，设计感强
- **四季酒店** - 亮马桥，服务一流
- **瑰丽/文华东方** - 瑜舍，时尚精品
- **国贸大酒店** - CBD，商务首选
- **钓鱼台芳华苑** - 高端会所式

## 本土品牌
- **首旅如家** - 高端线：建国饭店
- **华住** - 高端线：禧玥
- **开元** - 杭州品牌，北京有分店

## 选择建议
- 商务：国贸、华贸区域
- 旅游：王府井、前门区域
- 设计：三里屯、朝阳公园区域

💡 具体需求可以告诉我，我帮你细化推荐～`
    },
    
    // RevPAR
    'revpar': {
        keywords: ['revpar', '每间可售房收入'],
        answer: `📈 RevPAR (Revenue Per Available Room) 每间可售房收入

## 定义
衡量每间可用客房产生的收入，是酒店收益管理的核心指标

## 两个计算公式
1️⃣ RevPAR = ADR × Occupancy Rate
2️⃣ RevPAR = Total Room Revenue ÷ Total Available Rooms

## 示例
某酒店 100 间房：
- 入住率 80%（售出 80 间）
- ADR = 500 元
- RevPAR = 500 × 80% = 400 元

或者直接算：
- 客房总收入：40,000 元
- RevPAR = 40,000 ÷ 100 = 400 元

## 意义
- 综合反映入住率和房价水平
- 比单独看 ADR 或入住率更全面
- 行业对标的核心指标

💡 RevPAR 高 = 收益好，但要结合成本控制分析～`
    },
    
    // 欢迎/帮助
    '帮助': {
        keywords: ['帮助', 'help', '能干嘛', '能做什么'],
        answer: `👋 我是酒店与旅游业 AI 助手 🏨

## 🌟 我能帮你：
- **酒店运营**：ADR、RevPAR、入住率等指标解释
- **收益管理**：定价策略、库存控制、动态定价
- **品牌策略**：国际品牌 vs 本土品牌分析
- **旅游业趋势**：最新行业动态和数据分析
- **葡萄酒品鉴** 🍷：搭配建议、产区介绍
- **美食旅行** 🌍：餐厅推荐、旅行攻略

## 💬 使用方式
直接发消息提问，例如：
- "什么是 ADR？"
- "推荐北京高端酒店"
- "收益管理怎么做？"
- "赤霞珠配什么菜？"

我会尽快回复你！😊`
    }
};

// 匹配预定义问答
function matchFAQ(userMessage) {
    const lowerMessage = userMessage.toLowerCase();
    
    for (const [key, faq] of Object.entries(faqDatabase)) {
        for (const keyword of faq.keywords) {
            if (lowerMessage.includes(keyword.toLowerCase())) {
                console.log(`📚 匹配预定义问答: ${key}`);
                return faq.answer;
            }
        }
    }
    
    return null;  // 没有匹配
}

module.exports = { faqDatabase, matchFAQ };
