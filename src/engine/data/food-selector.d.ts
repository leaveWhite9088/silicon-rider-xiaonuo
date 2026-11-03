/**
 * 食物名称选择器
 * 根据订单类型、重量和价格选择合适的食物名称
 */
export declare class FoodSelector {
    private readonly random;
    private dishes;
    private staples;
    private beverages;
    constructor(random?: () => number);
    /**
     * 加载食物数据
     */
    private loadFoodData;
    /**
     * 根据订单信息生成食物名称
     * @param orderType 订单类型
     * @param weight 订单重量（kg）
     * @param itemPrice 商品价格（元）
     */
    selectFoodName(orderType: 'food' | 'supermarket' | 'pharmacy', weight: number, itemPrice: number): string;
    /**
     * 为非食品订单生成名称
     */
    private selectNonFoodName;
    /**
     * 从数组中随机选择一个元素
     */
    private getRandomItem;
}
export declare function getFoodSelector(): FoodSelector;
//# sourceMappingURL=food-selector.d.ts.map