/**
 * 工具模块导出
 * Silicon Rider Bench - Agent 基准测试系统
 */
export * from './tool-registry';
export * from './query-tools';
export * from './action-tools';
export * from './tool-executor';
import { ToolRegistry } from './tool-registry';
import { getQueryTools, getQueryToolsV3 } from './query-tools';
import { getActionTools, getActionToolsV2, getActionToolsV3 } from './action-tools';
/**
 * 创建并初始化工具注册表
 * 注册所有可用工具
 *
 * @param v2Mode 是否为 V2 模式（使用多模态取餐工具）
 * @returns 已注册所有工具的注册表实例
 */
export function createToolRegistry(v2Mode = false) {
    const registry = new ToolRegistry();
    // 注册查询工具
    registry.registerAll(getQueryTools());
    // 注册行动工具
    if (v2Mode) {
        // V2 模式：使用 get_receipts 和 pickup_food_by_phone_number，不包含 pickup_food
        registry.registerAll(getActionToolsV2());
        console.log('[ToolRegistry] Registered V2 action tools (multimodal pickup)');
    }
    else {
        // V1 模式：使用原有的 pickup_food
        registry.registerAll(getActionTools());
    }
    return registry;
}
/**
 * 创建 V3 版本的工具注册表（多骑手模式）
 * 所有工具都需要 agent_id 参数
 * 基于 V2 的多模态取餐流程
 *
 * @returns 已注册所有 V3 工具的注册表实例
 */
export function createToolRegistryV3() {
    const registry = new ToolRegistry();
    // 注册 V3 版本的查询工具
    registry.registerAll(getQueryToolsV3());
    // 注册 V3 版本的行动工具
    registry.registerAll(getActionToolsV3());
    console.log('[ToolRegistry] Registered V3 tools (multi-rider mode with multimodal pickup)');
    return registry;
}
//# sourceMappingURL=index.js.map