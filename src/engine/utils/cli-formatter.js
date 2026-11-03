/**
 * CLI 格式化工具
 * 用于格式化命令行输出
 */
/**
 * 格式化状态信息显示
 */
export function formatStatusDisplay(simulator, iteration, message) {
    const agentState = simulator.getAgentState();
    const currentTime = simulator.getFormattedTime();
    const carriedOrders = agentState.getCarriedOrders();
    const lines = [];
    // 分隔线
    lines.push('─'.repeat(70));
    // 第一行：时间和迭代
    lines.push(`⏰ 时间: ${currentTime.padEnd(8)} | 🔄 迭代: ${iteration}`);
    // 第二行：位置和电量
    const position = agentState.getPosition();
    const battery = agentState.getBattery().toFixed(1);
    const batteryRange = agentState.getBatteryRange().toFixed(1);
    lines.push(`📍 位置: ${position.padEnd(10)} | 🔋 电量: ${battery}% (${batteryRange}km)`);
    // 第三行：利润和完成订单
    const profit = agentState.getProfit().toFixed(2);
    const completed = agentState.getCompletedOrders();
    lines.push(`💰 利润: ¥${profit.padEnd(8)} | ✅ 完成: ${completed} 单`);
    // 第四行：背包信息
    if (carriedOrders.length > 0) {
        const totalWeight = agentState.getTotalWeight().toFixed(2);
        lines.push(`📦 背包: ${carriedOrders.length}/5 单 | ⚖️  重量: ${totalWeight}/10kg`);
        // 显示每个订单
        carriedOrders.forEach((order, index) => {
            const status = order.pickedUp ? '✓已取餐' : '⏳待取餐';
            const typeEmoji = getOrderTypeEmoji(order.type);
            const weight = order.weight.toFixed(2);
            const fee = order.deliveryFee.toFixed(2);
            lines.push(`   ${index + 1}. ${order.id} ${typeEmoji} ${status} - ${weight}kg - ¥${fee}`);
        });
    }
    else {
        lines.push(`📦 背包: 空`);
    }
    // AI 消息（如果有）
    if (message && message.trim()) {
        const truncated = message.length > 80 ? message.substring(0, 80) + '...' : message;
        lines.push(`💬 AI: ${truncated}`);
    }
    return '\n' + lines.join('\n');
}
/**
 * 获取订单类型的 emoji
 */
function getOrderTypeEmoji(type) {
    switch (type) {
        case 'food':
            return '🍔';
        case 'supermarket':
            return '🛒';
        case 'pharmacy':
            return '💊';
        default:
            return '📦';
    }
}
/**
 * 格式化简洁的状态行（用于快速更新）
 */
export function formatCompactStatus(simulator, iteration) {
    const agentState = simulator.getAgentState();
    const time = simulator.getFormattedTime();
    const position = agentState.getPosition();
    const battery = agentState.getBattery().toFixed(0);
    const profit = agentState.getProfit().toFixed(2);
    const orders = agentState.getCarriedOrders().length;
    const completed = agentState.getCompletedOrders();
    return `[${iteration}] ${time} | ${position} | 🔋${battery}% | 📦${orders} | ¥${profit} | ✅${completed}`;
}
/**
 * 格式化工具调用信息
 */
export function formatToolCall(toolName, params, success) {
    const statusIcon = success ? '✓' : '✗';
    const paramsStr = Object.keys(params).length > 0
        ? JSON.stringify(params).substring(0, 50)
        : '{}';
    return `${statusIcon} ${toolName}(${paramsStr})`;
}
/**
 * 格式化标题
 */
export function formatHeader(text) {
    const width = 70;
    const padding = Math.max(0, Math.floor((width - text.length - 2) / 2));
    const line = '═'.repeat(width);
    const titleLine = '║' + ' '.repeat(padding) + text + ' '.repeat(width - padding - text.length - 2) + '║';
    return `\n${line}\n${titleLine}\n${line}\n`;
}
/**
 * 格式化分隔线
 */
export function formatSeparator(char = '─', width = 70) {
    return char.repeat(width);
}
//# sourceMappingURL=cli-formatter.js.map