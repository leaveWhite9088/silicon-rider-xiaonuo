/**
 * 工具注册和验证模块
 * Silicon Rider Bench - Agent 基准测试系统
 *
 * 需求：17.1, 17.3
 */
/**
 * 工具注册表类
 * 负责注册工具、验证参数、管理工具定义
 */
export class ToolRegistry {
    tools = new Map();
    /**
     * 注册工具
     * @param tool 工具定义
     */
    register(tool) {
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool "${tool.name}" is already registered`);
        }
        this.tools.set(tool.name, tool);
    }
    /**
     * 批量注册工具
     * @param tools 工具定义数组
     */
    registerAll(tools) {
        for (const tool of tools) {
            this.register(tool);
        }
    }
    /**
     * 获取工具定义
     * @param toolName 工具名称
     * @returns 工具定义或 undefined
     */
    getTool(toolName) {
        return this.tools.get(toolName);
    }
    /**
     * 检查工具是否存在
     * @param toolName 工具名称
     * @returns true 如果工具已注册
     */
    hasTool(toolName) {
        return this.tools.has(toolName);
    }
    /**
     * 获取所有已注册的工具名称
     * @returns 工具名称数组
     */
    getToolNames() {
        return Array.from(this.tools.keys());
    }
    /**
     * 获取所有工具定义（用于生成 OpenAI 工具 schema）
     * @returns 工具定义数组
     */
    getAllTools() {
        return Array.from(this.tools.values());
    }
    /**
     * 验证工具调用参数
     * 需求：17.1, 17.3
     * @param toolName 工具名称
     * @param parameters 参数对象
     * @returns 验证结果，成功返回 null，失败返回错误对象
     */
    validateParameters(toolName, parameters) {
        // 检查工具是否存在
        const tool = this.tools.get(toolName);
        if (!tool) {
            return {
                success: false,
                error: {
                    code: 'INVALID_PARAMETER',
                    message: `Unknown tool: ${toolName}`,
                    details: { toolName },
                },
            };
        }
        // 验证每个参数
        for (const [paramName, schema] of Object.entries(tool.parameters)) {
            const value = parameters[paramName];
            // 检查必需参数
            if (schema.required && (value === undefined || value === null)) {
                return {
                    success: false,
                    error: {
                        code: 'INVALID_PARAMETER',
                        message: `Missing required parameter: ${paramName}`,
                        details: { toolName, paramName },
                    },
                };
            }
            // 如果参数不存在且不是必需的，跳过验证
            if (value === undefined || value === null) {
                continue;
            }
            // 验证参数类型
            const typeError = this.validateType(value, schema, paramName);
            if (typeError) {
                return {
                    success: false,
                    error: {
                        code: 'INVALID_PARAMETER',
                        message: typeError,
                        details: { toolName, paramName, value },
                    },
                };
            }
        }
        return null;
    }
    /**
     * 验证参数类型
     * @param value 参数值
     * @param schema 参数 schema
     * @param paramName 参数名称
     * @returns 错误消息或 null
     */
    validateType(value, schema, paramName) {
        // 检查基本类型
        switch (schema.type) {
            case 'string':
                if (typeof value !== 'string') {
                    return `Parameter "${paramName}" must be a string`;
                }
                break;
            case 'number':
                if (typeof value !== 'number' || isNaN(value)) {
                    return `Parameter "${paramName}" must be a number`;
                }
                // 检查范围
                if (schema.min !== undefined && value < schema.min) {
                    return `Parameter "${paramName}" must be >= ${schema.min}`;
                }
                if (schema.max !== undefined && value > schema.max) {
                    return `Parameter "${paramName}" must be <= ${schema.max}`;
                }
                break;
            case 'boolean':
                if (typeof value !== 'boolean') {
                    return `Parameter "${paramName}" must be a boolean`;
                }
                break;
            case 'array':
                if (!Array.isArray(value)) {
                    return `Parameter "${paramName}" must be an array`;
                }
                // 验证数组元素
                if (schema.items) {
                    for (let i = 0; i < value.length; i++) {
                        const itemError = this.validateType(value[i], schema.items, `${paramName}[${i}]`);
                        if (itemError) {
                            return itemError;
                        }
                    }
                }
                break;
            case 'object':
                if (typeof value !== 'object' || value === null || Array.isArray(value)) {
                    return `Parameter "${paramName}" must be an object`;
                }
                // 验证对象属性
                if (schema.properties) {
                    for (const [propName, propSchema] of Object.entries(schema.properties)) {
                        if (propSchema.required && !(propName in value)) {
                            return `Parameter "${paramName}.${propName}" is required`;
                        }
                        if (propName in value) {
                            const propError = this.validateType(value[propName], propSchema, `${paramName}.${propName}`);
                            if (propError) {
                                return propError;
                            }
                        }
                    }
                }
                break;
        }
        return null;
    }
    /**
     * 转换为 OpenAI 工具格式
     * @returns OpenAI 工具定义数组
     */
    toOpenAIFormat() {
        return this.getAllTools().map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: {
                    type: 'object',
                    properties: this.convertSchemaToOpenAI(tool.parameters),
                    required: Object.entries(tool.parameters)
                        .filter(([_, schema]) => schema.required)
                        .map(([name, _]) => name),
                },
            },
        }));
    }
    /**
     * 转换参数 schema 为 OpenAI 格式
     */
    convertSchemaToOpenAI(parameters) {
        const result = {};
        for (const [name, schema] of Object.entries(parameters)) {
            result[name] = {
                type: schema.type,
                description: schema.description,
            };
            if (schema.min !== undefined) {
                result[name].minimum = schema.min;
            }
            if (schema.max !== undefined) {
                result[name].maximum = schema.max;
            }
            if (schema.items) {
                result[name].items = this.convertSchemaToOpenAI({ item: schema.items }).item;
            }
            if (schema.properties) {
                result[name].properties = this.convertSchemaToOpenAI(schema.properties);
            }
        }
        return result;
    }
}
//# sourceMappingURL=tool-registry.js.map