/**
 * 工具注册和验证模块
 * Silicon Rider Bench - Agent 基准测试系统
 *
 * 需求：17.1, 17.3
 */
import { ToolCallError } from '../types';
/**
 * 参数 Schema 定义
 */
export interface ParameterSchema {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    required?: boolean;
    description?: string;
    min?: number;
    max?: number;
    items?: ParameterSchema;
    properties?: Record<string, ParameterSchema>;
}
/**
 * 工具定义接口
 */
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, ParameterSchema>;
    handler: (params: Record<string, any>, context: any) => Promise<any>;
}
/**
 * 工具注册表类
 * 负责注册工具、验证参数、管理工具定义
 */
export declare class ToolRegistry {
    private tools;
    /**
     * 注册工具
     * @param tool 工具定义
     */
    register(tool: ToolDefinition): void;
    /**
     * 批量注册工具
     * @param tools 工具定义数组
     */
    registerAll(tools: ToolDefinition[]): void;
    /**
     * 获取工具定义
     * @param toolName 工具名称
     * @returns 工具定义或 undefined
     */
    getTool(toolName: string): ToolDefinition | undefined;
    /**
     * 检查工具是否存在
     * @param toolName 工具名称
     * @returns true 如果工具已注册
     */
    hasTool(toolName: string): boolean;
    /**
     * 获取所有已注册的工具名称
     * @returns 工具名称数组
     */
    getToolNames(): string[];
    /**
     * 获取所有工具定义（用于生成 OpenAI 工具 schema）
     * @returns 工具定义数组
     */
    getAllTools(): ToolDefinition[];
    /**
     * 验证工具调用参数
     * 需求：17.1, 17.3
     * @param toolName 工具名称
     * @param parameters 参数对象
     * @returns 验证结果，成功返回 null，失败返回错误对象
     */
    validateParameters(toolName: string, parameters: Record<string, any>): ToolCallError | null;
    /**
     * 验证参数类型
     * @param value 参数值
     * @param schema 参数 schema
     * @param paramName 参数名称
     * @returns 错误消息或 null
     */
    private validateType;
    /**
     * 转换为 OpenAI 工具格式
     * @returns OpenAI 工具定义数组
     */
    toOpenAIFormat(): any[];
    /**
     * 转换参数 schema 为 OpenAI 格式
     */
    private convertSchemaToOpenAI;
}
//# sourceMappingURL=tool-registry.d.ts.map