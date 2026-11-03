/**
 * CLI 格式化工具
 * 用于格式化命令行输出
 */
import { Simulator } from '../core/simulator';
/**
 * 格式化状态信息显示
 */
export declare function formatStatusDisplay(simulator: Simulator, iteration: number, message?: string): string;
/**
 * 格式化简洁的状态行（用于快速更新）
 */
export declare function formatCompactStatus(simulator: Simulator, iteration: number): string;
/**
 * 格式化工具调用信息
 */
export declare function formatToolCall(toolName: string, params: any, success: boolean): string;
/**
 * 格式化标题
 */
export declare function formatHeader(text: string): string;
/**
 * 格式化分隔线
 */
export declare function formatSeparator(char?: string, width?: number): string;
//# sourceMappingURL=cli-formatter.d.ts.map