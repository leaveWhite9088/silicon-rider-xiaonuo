import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
/**
 * 食物名称选择器
 * 根据订单类型、重量和价格选择合适的食物名称
 */
export class FoodSelector {
    random;
    dishes = [];
    staples = [];
    beverages = [];
    constructor(random = Math.random) {
        this.random = random;
        this.loadFoodData();
    }
    /**
     * 加载食物数据
     */
    loadFoodData() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const foodFilePath = path.join(__dirname, 'food.md');
        const content = fs.readFileSync(foodFilePath, 'utf-8');
        const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        // 0-1564行是菜品
        this.dishes = lines.slice(0, 1564);
        // 1565-2138行是主食
        this.staples = lines.slice(1564, 2138);
        // 2139-2791行是饮品
        this.beverages = lines.slice(2138, 2791);
    }
    /**
     * 根据订单信息生成食物名称
     * @param orderType 订单类型
     * @param weight 订单重量（kg）
     * @param itemPrice 商品价格（元）
     */
    selectFoodName(orderType, weight, itemPrice) {
        if (orderType !== 'food') {
            return this.selectNonFoodName(orderType, weight, itemPrice);
        }
        // 根据重量和价格决定食物组合
        const items = [];
        // 重量越大，菜品越多
        const dishCount = Math.max(1, Math.floor(weight / 0.3));
        // 价格越高，可能包含更多菜品
        const priceBasedDishCount = Math.max(1, Math.floor(itemPrice / 30));
        const totalDishCount = Math.min(dishCount, priceBasedDishCount, 5);
        // 选择菜品
        for (let i = 0; i < totalDishCount; i++) {
            const dish = this.getRandomItem(this.dishes);
            if (!items.includes(dish)) {
                items.push(dish);
            }
        }
        // 根据重量决定是否添加主食
        if (weight > 0.5 || itemPrice > 40) {
            const stapleCount = Math.min(2, Math.floor(weight / 0.8));
            for (let i = 0; i < stapleCount; i++) {
                const staple = this.getRandomItem(this.staples);
                if (!items.includes(staple)) {
                    items.push(staple);
                }
            }
        }
        // 根据价格决定是否添加饮品
        if (itemPrice > 50 || weight > 1.5) {
            const beverageCount = Math.min(2, Math.floor(itemPrice / 60));
            for (let i = 0; i < beverageCount; i++) {
                const beverage = this.getRandomItem(this.beverages);
                if (!items.includes(beverage)) {
                    items.push(beverage);
                }
            }
        }
        return JSON.stringify(items);
    }
    /**
     * 为非食品订单生成名称
     */
    selectNonFoodName(orderType, weight, itemPrice) {
        if (orderType === 'supermarket') {
            const items = ['日用品', '零食', '饮料', '水果', '蔬菜', '肉类', '调味品', '清洁用品'];
            const count = Math.max(1, Math.min(4, Math.floor(weight / 0.5)));
            const selected = [];
            for (let i = 0; i < count; i++) {
                const item = this.getRandomItem(items);
                if (!selected.includes(item)) {
                    selected.push(item);
                }
            }
            return JSON.stringify(selected);
        }
        else {
            // pharmacy
            const items = ['感冒药', '消炎药', '维生素', '创可贴', '口罩', '体温计', '保健品', '医用酒精'];
            const count = Math.max(1, Math.min(3, Math.floor(itemPrice / 30)));
            const selected = [];
            for (let i = 0; i < count; i++) {
                const item = this.getRandomItem(items);
                if (!selected.includes(item)) {
                    selected.push(item);
                }
            }
            return JSON.stringify(selected);
        }
    }
    /**
     * 从数组中随机选择一个元素
     */
    getRandomItem(array) {
        return array[Math.floor(this.random() * array.length)];
    }
}
// 单例模式
let instance = null;
export function getFoodSelector() {
    if (!instance) {
        instance = new FoodSelector();
    }
    return instance;
}
//# sourceMappingURL=food-selector.js.map