/**
 * 工具执行器
 * Silicon Rider Bench - Agent 基准测试系统
 *
 * 需求：17.2, 17.3
 */
import { ToolCallRequest, ToolCallResponse } from '../types';
import { ToolRegistry } from './tool-registry';
import { ToolContext } from './query-tools';
/**
 * 工具执行器类
 * 负责分发工具调用、执行工具函数、处理错误
 */
export declare class ToolExecutor {
    private registry;
    constructor(registry: ToolRegistry);
    /**
     * 获取工具的用法说明
     *
     * @param toolName 工具名称
     * @returns 工具用法说明
     */
    private getToolUsage;
    /**
     * 执行工具调用
     * 需求：17.2, 17.3
     *
     * @param request 工具调用请求
     * @param context 工具执行上下文
     * @returns 工具调用响应
     */
    execute(request: ToolCallRequest, context: ToolContext): Promise<ToolCallResponse>;
    /**
     * 批量执行工具调用
     *
     * @param requests 工具调用请求数组
     * @param context 工具执行上下文
     * @returns 工具调用响应数组
     */
    executeAll(requests: ToolCallRequest[], context: ToolContext): Promise<ToolCallResponse[]>;
    /**
     * 获取工具注册表
     * @returns 工具注册表实例
     */
    getRegistry(): ToolRegistry;
}
/**
 * 创建工具执行器实例
 *
 * @param registry 工具注册表
 * @returns 工具执行器实例
 */
export declare function createToolExecutor(registry: ToolRegistry): ToolExecutor;
//# sourceMappingURL=tool-executor.d.ts.map