/**
 * 工具执行器
 * Silicon Rider Bench - Agent 基准测试系统
 *
 * 需求：17.2, 17.3
 */
/**
 * 工具执行器类
 * 负责分发工具调用、执行工具函数、处理错误
 */
export class ToolExecutor {
    registry;
    constructor(registry) {
        this.registry = registry;
    }
    /**
     * 获取工具的用法说明
     *
     * @param toolName 工具名称
     * @returns 工具用法说明
     */
    getToolUsage(toolName) {
        const tool = this.registry.getTool(toolName);
        if (!tool) {
            return `Tool "${toolName}" does not exist`;
        }
        const params = Object.entries(tool.parameters)
            .map(([name, schema]) => {
            const required = schema.required ? 'required' : 'optional';
            const typeMap = {
                'string': 'string',
                'number': 'number',
                'boolean': 'boolean',
                'array': 'array',
                'object': 'object',
            };
            const type = typeMap[schema.type] || schema.type;
            return `${name} (${required}, ${type}${schema.description ? ', ' + schema.description : ''})`;
        });
        if (params.length === 0) {
            return `Usage: ${toolName}() - no parameters required`;
        }
        return `Usage: ${toolName}({${params.join(', ')}})`;
    }
    /**
     * 执行工具调用
     * 需求：17.2, 17.3
     *
     * @param request 工具调用请求
     * @param context 工具执行上下文
     * @returns 工具调用响应
     */
    async execute(request, context) {
        const { toolName, parameters } = request;
        try {
            // 验证工具名称
            if (!this.registry.hasTool(toolName)) {
                return {
                    success: false,
                    error: {
                        code: 'INVALID_PARAMETER',
                        message: `Unknown tool: ${toolName}`,
                        details: { toolName },
                    },
                };
            }
            // 验证参数
            const validationError = this.registry.validateParameters(toolName, parameters);
            if (validationError) {
                // 在验证错误消息中添加用法说明
                const usage = this.getToolUsage(toolName);
                if (validationError.error) {
                    validationError.error.message = `${validationError.error.message}. ${usage}`;
                }
                return validationError;
            }
            // 获取工具定义
            const tool = this.registry.getTool(toolName);
            if (!tool) {
                // 这不应该发生，因为我们已经检查过工具存在
                return {
                    success: false,
                    error: {
                        code: 'INVALID_PARAMETER',
                        message: `Tool not found: ${toolName}`,
                        details: { toolName },
                    },
                };
            }
            // 执行工具函数
            const result = await tool.handler(parameters, context);
            return result;
        }
        catch (error) {
            // 捕获执行过程中的任何错误
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            const usage = this.getToolUsage(toolName);
            return {
                success: false,
                error: {
                    code: 'INVALID_PARAMETER',
                    message: `${errorMessage}. ${usage}`,
                    details: {
                        toolName,
                        parameters,
                        error: error instanceof Error ? error.stack : String(error),
                    },
                },
            };
        }
    }
    /**
     * 批量执行工具调用
     *
     * @param requests 工具调用请求数组
     * @param context 工具执行上下文
     * @returns 工具调用响应数组
     */
    async executeAll(requests, context) {
        const results = [];
        for (const request of requests) {
            const result = await this.execute(request, context);
            results.push(result);
        }
        return results;
    }
    /**
     * 获取工具注册表
     * @returns 工具注册表实例
     */
    getRegistry() {
        return this.registry;
    }
}
/**
 * 创建工具执行器实例
 *
 * @param registry 工具注册表
 * @returns 工具执行器实例
 */
export function createToolExecutor(registry) {
    return new ToolExecutor(registry);
}
//# sourceMappingURL=tool-executor.js.map