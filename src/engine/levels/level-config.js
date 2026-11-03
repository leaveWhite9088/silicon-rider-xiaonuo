/**
 * Level 配置系统
 * Silicon Rider Bench - Agent 基准测试系统
 *
 * 定义不同 Level 的配置，包括 Level 0.1, Level 1 和 Level 2
 * 需求：12.1-12.3, 13.1-13.5
 */
/**
 * 获取基准测试时间限制（从环境变量读取）
 * 环境变量 BENCHMARK_TIME_LIMIT 以小时为单位，默认 24 小时
 * @returns 时间限制（分钟）
 */
function getBenchmarkTimeLimit() {
    const envValue = process.env.BENCHMARK_TIME_LIMIT;
    if (envValue !== undefined && envValue !== '') {
        const hours = parseFloat(envValue);
        if (!isNaN(hours) && hours > 0) {
            return Math.round(hours * 60); // 转换为分钟
        }
    }
    return 1440; // 默认 24 小时 = 1440 分钟
}
/**
 * 获取模拟骑手数量（从环境变量读取）
 * 环境变量 SIMULATION_RIDER_NUM，默认 3
 * @returns 骑手数量
 */
function getSimulationRiderNum() {
    const envValue = process.env.SIMULATION_RIDER_NUM;
    if (envValue !== undefined && envValue !== '') {
        const num = parseInt(envValue, 10);
        if (!isNaN(num) && num > 0 && num <= 10) {
            return num;
        }
    }
    return 3; // 默认 3 个骑手
}
/**
 * Level 配置映射
 */
const LEVEL_CONFIGS = {
    /**
     * Level 0.1 - 教程场景
     *
     * 需求 12.1: WHEN Level 0.1 初始化 THEN 模拟器 SHALL 创建一个简单地图，包含一个可用订单
     * 需求 12.2: WHEN 智能体完成单次配送 THEN 模拟器 SHALL 终止场景
     * 需求 12.3: WHEN Level 0.1 运行 THEN 模拟器 SHALL 验证智能体正确依次调用工具
     *
     * 特点：
     * - 简单地图（small）
     * - 只有一个订单
     * - 时长 60 分钟（足够完成一单）
     * - 固定种子确保可重现
     */
    'level0.1': {
        duration: 60, // 60 分钟
        mapSize: 'small', // 小地图
        seed: 12345, // 固定种子
        orderCount: 1, // 只有一个订单
    },
    /**
     * Level 1 - 完整基准测试场景
     *
     * 需求 13.1: WHEN Level 1 初始化 THEN 模拟器 SHALL 从种子生成完整地图
     * 需求 13.2: WHEN Level 1 运行 THEN 模拟器 SHALL 模拟从 0:00 到 24:00 的完整 24 小时周期
     * 需求 13.3: WHEN Level 1 运行 THEN 模拟器 SHALL 在整个模拟期间持续生成新订单
     * 需求 13.4: WHEN Level 1 运行 THEN 模拟器 SHALL 根据时间应用动态拥堵
     * 需求 13.5: WHEN Level 1 完成 THEN 模拟器 SHALL 计算并报告最终利润分数
     *
     * 特点：
     * - 大地图（large）
     * - 24 小时完整周期
     * - 持续生成订单
     * - 动态拥堵
     * - 订单潮汐效应
     * - 完整评分系统
     */
    'level1': {
        duration: 1440, // 1440 分钟 = 24 小时
        mapSize: 'large', // 大地图
        seed: 67890, // 固定种子
        baseOrderFrequency: 5, // 基准频率：每 5 分钟
    },
    /**
     * Level 2 - 多模态测试场景
     *
     * 特点：
     * - 使用真实小票数据（100条循环使用）
     * - 只有外卖订单（无超市、药店）
     * - AI 骑手需通过识别小票图片中的手机号取餐
     * - 使用 get_receipts 获取小票图片
     * - 使用 pickup_food_by_phone_number 取餐
     * - 禁用 pickup_food 工具
     */
    'level2': {
        duration: 1440, // 1440 分钟 = 24 小时
        mapSize: 'large', // 大地图
        seed: 11111, // 固定种子
        baseOrderFrequency: 5, // 基准频率：每 5 分钟
        useRealReceiptData: true, // 使用真实小票数据
        excludeNodeTypes: ['supermarket', 'pharmacy'], // 排除超市和药店
    },
    /**
     * Level 3 - 多骑手多模态测试场景
     *
     * 特点：
     * - 基于 Level 2 的多模态取餐流程
     * - 一个 AI 同时操作多个骑手
     * - 共享订单池，骑手需要抢单
     * - 所有骑手利润汇总作为最终成绩
     * - 所有工具调用需要传入 agent_id 参数
     * - AI 可在一次响应中同时对多个骑手发出命令
     */
    'level3': {
        duration: 1440, // 1440 分钟 = 24 小时
        mapSize: 'large', // 大地图
        seed: 22222, // 固定种子
        baseOrderFrequency: 5, // 基准频率：每 5 分钟
        useRealReceiptData: true, // 使用真实小票数据
        excludeNodeTypes: ['supermarket', 'pharmacy'], // 排除超市和药店
        simulationRiderNum: 3, // 默认 3 个骑手
    },
};
/**
 * 生成随机种子
 * 基于当前时间戳生成一个随机种子
 */
function generateRandomSeed() {
    return Math.floor(Math.random() * 1000000) + Date.now() % 100000;
}
/**
 * 获取 Level 配置
 *
 * 对于 level1 和 level2：
 * - 会读取 BENCHMARK_TIME_LIMIT 环境变量覆盖默认时长
 * - 会生成随机种子（除非通过命令行参数显式指定）
 *
 * Level 0.1 保持固定种子，因为它是教程场景，需要确保一致性
 *
 * @param levelName Level 名称
 * @returns Level 配置对象
 * @throws Error 如果 Level 名称无效
 */
export function getLevelConfig(levelName) {
    const config = LEVEL_CONFIGS[levelName];
    if (!config) {
        throw new Error(`Invalid level name: ${levelName}`);
    }
    // 返回副本以防止修改
    const result = { ...config };
    // 对于 level1, level2 和 level3，应用 BENCHMARK_TIME_LIMIT 环境变量和随机种子
    if (levelName === 'level1' || levelName === 'level2' || levelName === 'level3') {
        result.duration = getBenchmarkTimeLimit();
        // 生成随机种子（用户可以通过 --seed 参数覆盖）
        result.seed = generateRandomSeed();
    }
    // 对于 level3，应用 SIMULATION_RIDER_NUM 环境变量
    if (levelName === 'level3') {
        result.simulationRiderNum = getSimulationRiderNum();
    }
    return result;
}
/**
 * 验证 Level 配置
 *
 * @param config Level 配置对象
 * @returns 验证结果，如果有效返回 null，否则返回错误消息
 */
export function validateLevelConfig(config) {
    // 验证 duration（最大支持 7 天 = 10080 分钟）
    if (config.duration <= 0 || config.duration > 10080) {
        return 'Duration must be between 1 and 10080 minutes (7 days)';
    }
    // 验证 mapSize
    if (config.mapSize !== 'small' && config.mapSize !== 'large') {
        return 'Map size must be "small" or "large"';
    }
    // 验证 seed
    if (typeof config.seed !== 'number' || config.seed < 0) {
        return 'Seed must be a non-negative number';
    }
    // 验证 orderCount（如果存在）
    if (config.orderCount !== undefined) {
        if (config.orderCount <= 0) {
            return 'Order count must be positive';
        }
    }
    // 验证 baseOrderFrequency（如果存在）
    if (config.baseOrderFrequency !== undefined) {
        if (config.baseOrderFrequency <= 0) {
            return 'Base order frequency must be positive';
        }
    }
    return null; // 配置有效
}
/**
 * 获取所有可用的 Level 名称
 *
 * @returns Level 名称数组
 */
export function getAvailableLevels() {
    return Object.keys(LEVEL_CONFIGS);
}
/**
 * 检查 Level 名称是否有效
 *
 * @param levelName Level 名称
 * @returns true 如果有效，false 否则
 */
export function isValidLevelName(levelName) {
    return levelName in LEVEL_CONFIGS;
}
/**
 * 创建自定义 Level 配置
 *
 * @param options 配置选项
 * @returns Level 配置对象
 * @throws Error 如果配置无效
 */
export function createCustomLevelConfig(options) {
    const config = {
        duration: options.duration ?? 1440,
        mapSize: options.mapSize ?? 'large',
        seed: options.seed ?? Math.floor(Math.random() * 1000000),
        orderCount: options.orderCount,
        baseOrderFrequency: options.baseOrderFrequency,
    };
    const validationError = validateLevelConfig(config);
    if (validationError) {
        throw new Error(`Invalid level config: ${validationError}`);
    }
    return config;
}
/**
 * 获取 Level 描述信息
 *
 * @param levelName Level 名称
 * @returns Level 描述字符串
 */
export function getLevelDescription(levelName) {
    const descriptions = {
        'level0.1': 'Level 0.1 - 教程场景：简单地图，单个订单，验证基本工具调用流程',
        'level1': 'Level 1 - 完整基准测试：大地图，24小时周期，持续订单生成，动态拥堵',
        'level2': 'Level 2 - 多模态测试：使用真实小票数据，需识别图片中的手机号取餐',
        'level3': 'Level 3 - 多骑手测试：一个AI同时操作多个骑手，共享订单池抢单，利润汇总',
    };
    return descriptions[levelName] || 'Unknown level';
}
/**
 * 打印 Level 配置信息
 *
 * @param levelName Level 名称
 * @returns 格式化的配置信息字符串
 */
export function printLevelConfig(levelName) {
    const config = getLevelConfig(levelName);
    const description = getLevelDescription(levelName);
    let info = `${description}\n\n`;
    info += `配置详情：\n`;
    info += `- 时长: ${config.duration} 分钟 (${(config.duration / 60).toFixed(1)} 小时)\n`;
    info += `- 地图大小: ${config.mapSize}\n`;
    info += `- 种子: ${config.seed}\n`;
    if (config.orderCount !== undefined) {
        info += `- 订单数量: ${config.orderCount}\n`;
    }
    if (config.baseOrderFrequency !== undefined) {
        info += `- 基准订单频率: 每 ${config.baseOrderFrequency} 分钟\n`;
    }
    if (config.useRealReceiptData) {
        info += `- 使用真实小票数据: 是\n`;
    }
    if (config.excludeNodeTypes && config.excludeNodeTypes.length > 0) {
        info += `- 排除节点类型: ${config.excludeNodeTypes.join(', ')}\n`;
    }
    if (config.simulationRiderNum !== undefined) {
        info += `- 骑手数量: ${config.simulationRiderNum}\n`;
    }
    return info;
}
/**
 * 导出预定义的 Level 配置（用于测试）
 */
export const LEVEL_0_1_CONFIG = LEVEL_CONFIGS['level0.1'];
export const LEVEL_1_CONFIG = LEVEL_CONFIGS['level1'];
export const LEVEL_2_CONFIG = LEVEL_CONFIGS['level2'];
export const LEVEL_3_CONFIG = LEVEL_CONFIGS['level3'];
//# sourceMappingURL=level-config.js.map