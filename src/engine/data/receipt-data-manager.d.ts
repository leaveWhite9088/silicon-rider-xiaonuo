/**
 * Receipt Data Manager
 * Manages the synthetic receipt data for V2 multimodal testing
 *
 * Responsibilities:
 * - Load receipt data from dataset.json
 * - Track which order IDs are currently in use (active orders)
 * - Provide next available order data with circular reuse
 * - Release order IDs when orders are completed or expired
 */
import { ReceiptData } from '../types';
/**
 * Receipt Data Manager class
 */
export declare class ReceiptDataManager {
    private dataset;
    private dataDir;
    private usedOrderIds;
    private currentIndex;
    constructor();
    /**
     * Load the receipt dataset from disk
     */
    loadDataset(): void;
    /**
     * Get the total number of orders in the dataset
     */
    getTotalOrders(): number;
    /**
     * Get the number of currently active (in-use) order IDs
     */
    getActiveOrderCount(): number;
    /**
     * Check if an order ID is currently in use
     */
    isOrderIdInUse(orderId: string): boolean;
    /**
     * Get the next available order data that is not currently in use
     * Returns null if all orders are in use
     */
    getNextAvailableOrder(): ReceiptData | null;
    /**
     * Mark an order as completed, releasing its ID for reuse
     */
    markOrderCompleted(orderId: string): void;
    /**
     * Mark an order as expired, releasing its ID for reuse
     */
    markOrderExpired(orderId: string): void;
    /**
     * Get the image file path for a specific order
     */
    getImagePath(imageFilename: string): string;
    /**
     * Get the absolute image file path for a specific order
     */
    getAbsoluteImagePath(imageFilename: string): string;
    /**
     * Read image file as base64
     */
    getImageAsBase64(imageFilename: string): string;
    /**
     * Get receipt data by order ID
     */
    getReceiptByOrderId(orderId: string): ReceiptData | null;
    /**
     * Reset the manager state (for testing)
     */
    reset(): void;
    /**
     * Get all currently used order IDs
     */
    getUsedOrderIds(): string[];
}
/**
 * Get the singleton ReceiptDataManager instance
 */
export declare function getReceiptDataManager(): ReceiptDataManager;
/**
 * Create a new ReceiptDataManager instance (for testing)
 */
export declare function createReceiptDataManager(): ReceiptDataManager;
//# sourceMappingURL=receipt-data-manager.d.ts.map