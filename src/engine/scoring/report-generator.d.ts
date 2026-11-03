/**
 * 报告生成器
 * Silicon Rider Bench - Agent 基准测试系统
 *
 * 需求：14.5
 */
import { ScoreMetrics, OrderCompletionRecord } from './score-calculator';
/**
 * Token 使用量统计
 */
export interface TokenUsage {
    total: number;
    prompt: number;
    completion: number;
}
/**
 * 对话日志条目（用于详细报告）
 */
export interface ConversationEntry {
    iteration: number;
    role: 'assistant' | 'tool';
    content?: string;
    toolName?: string;
    toolArgs?: Record<string, any>;
    toolResult?: any;
}
/**
 * 报告状态
 */
export type ReportStatus = 'completed' | 'interrupted' | 'error';
/**
 * 报告配置
 */
export interface ReportConfig {
    level: string;
    seed: number;
    duration: number;
    modelName?: string;
    startTime?: string;
    endTime?: string;
    tokenUsage?: TokenUsage;
    conversationHistory?: ConversationEntry[];
    status?: ReportStatus;
    statusMessage?: string;
    maxIterations?: number;
    contextHistoryLimit?: number;
    temperature?: number;
    topP?: number;
    repetitionPenalty?: number;
    toolCallFormat?: string;
}
/**
 * 报告生成器类
 *
 * 负责生成 Markdown 格式的评测报告
 */
export declare class ReportGenerator {
    /**
     * 生成完整的 Markdown 报告
     * 需求：14.5
     *
     * @param config 报告配置
     * @param metrics 评分指标
     * @param completionRecords 订单完成记录（可选，用于详细分析）
     * @returns Markdown 格式的报告
     */
    static generateReport(config: ReportConfig, metrics: ScoreMetrics, completionRecords?: OrderCompletionRecord[]): string;
    /**
     * 生成基本信息部分
     */
    private static generateBasicInfo;
    /**
     * 生成核心指标部分
     */
    private static generateCoreMetrics;
    /**
     * 生成详细统计部分
     */
    private static generateDetailedStats;
    /**
     * 生成订单类型分布部分
     */
    private static generateOrderDistribution;
    /**
     * 生成性能分析部分
     */
    private static generatePerformanceAnalysis;
    /**
     * 生成评价总结部分
     */
    private static generateSummary;
    /**
     * 格式化时长
     */
    private static formatDuration;
    /**
     * 翻译订单类型
     */
    private static translateOrderType;
    /**
     * 生成简短摘要（用于终端显示）
     */
    static generateShortSummary(config: ReportConfig, metrics: ScoreMetrics): string;
    /**
     * 生成详细报告（包含所有 tool call 和 content）
     *
     * @param config 报告配置
     * @param metrics 评分指标
     * @param conversationHistory 对话历史
     * @returns Markdown 格式的详细报告
     */
    static generateDetailReport(config: ReportConfig, metrics: ScoreMetrics, conversationHistory?: ConversationEntry[]): string;
    /**
     * 生成 Token 使用量详情部分
     */
    private static generateTokenUsageSection;
    /**
     * 生成对话详情部分
     */
    private static generateConversationDetails;
}
//# sourceMappingURL=report-generator.d.ts.map