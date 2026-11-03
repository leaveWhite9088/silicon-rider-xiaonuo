/**
 * 工具模块导出
 * Silicon Rider Bench - Agent 基准测试系统
 */
export * from './tool-registry';
export * from './query-tools';
export * from './action-tools';
export * from './tool-executor';
import { ToolRegistry } from './tool-registry';
/**
 * 创建并初始化工具注册表
 * 注册所有可用工具
 *
 * @param v2Mode 是否为 V2 模式（使用多模态取餐工具）
 * @returns 已注册所有工具的注册表实例
 */
export declare function createToolRegistry(v2Mode?: boolean): ToolRegistry;
/**
 * 创建 V3 版本的工具注册表（多骑手模式）
 * 所有工具都需要 agent_id 参数
 * 基于 V2 的多模态取餐流程
 *
 * @returns 已注册所有 V3 工具的注册表实例
 */
export declare function createToolRegistryV3(): ToolRegistry;
//# sourceMappingURL=index.d.ts.map