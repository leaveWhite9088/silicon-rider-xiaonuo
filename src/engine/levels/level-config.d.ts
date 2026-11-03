/**
 * Level 配置系统
 * Silicon Rider Bench - Agent 基准测试系统
 *
 * 定义不同 Level 的配置，包括 Level 0.1, Level 1 和 Level 2
 * 需求：12.1-12.3, 13.1-13.5
 */
import { LevelConfig } from '../types';
/**
 * Level 名称类型
 */
export type LevelName = 'level0.1' | 'level1' | 'level2' | 'level3';
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
export declare function getLevelConfig(levelName: LevelName): LevelConfig;
/**
 * 验证 Level 配置
 *
 * @param config Level 配置对象
 * @returns 验证结果，如果有效返回 null，否则返回错误消息
 */
export declare function validateLevelConfig(config: LevelConfig): string | null;
/**
 * 获取所有可用的 Level 名称
 *
 * @returns Level 名称数组
 */
export declare function getAvailableLevels(): LevelName[];
/**
 * 检查 Level 名称是否有效
 *
 * @param levelName Level 名称
 * @returns true 如果有效，false 否则
 */
export declare function isValidLevelName(levelName: string): levelName is LevelName;
/**
 * 创建自定义 Level 配置
 *
 * @param options 配置选项
 * @returns Level 配置对象
 * @throws Error 如果配置无效
 */
export declare function createCustomLevelConfig(options: {
    duration?: number;
    mapSize?: 'small' | 'large';
    seed?: number;
    orderCount?: number;
    baseOrderFrequency?: number;
}): LevelConfig;
/**
 * 获取 Level 描述信息
 *
 * @param levelName Level 名称
 * @returns Level 描述字符串
 */
export declare function getLevelDescription(levelName: LevelName): string;
/**
 * 打印 Level 配置信息
 *
 * @param levelName Level 名称
 * @returns 格式化的配置信息字符串
 */
export declare function printLevelConfig(levelName: LevelName): string;
/**
 * 导出预定义的 Level 配置（用于测试）
 */
export declare const LEVEL_0_1_CONFIG: LevelConfig;
export declare const LEVEL_1_CONFIG: LevelConfig;
export declare const LEVEL_2_CONFIG: LevelConfig;
export declare const LEVEL_3_CONFIG: LevelConfig;
//# sourceMappingURL=level-config.d.ts.map