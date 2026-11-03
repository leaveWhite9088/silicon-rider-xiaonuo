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
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/**
 * Receipt Data Manager class
 */
export class ReceiptDataManager {
    dataset = null;
    dataDir;
    usedOrderIds = new Set();
    currentIndex = 0;
    constructor() {
        this.dataDir = path.join(__dirname, 'synthetic_receipt_data');
    }
    /**
     * Load the receipt dataset from disk
     */
    loadDataset() {
        const datasetPath = path.join(this.dataDir, 'dataset.json');
        if (!fs.existsSync(datasetPath)) {
            throw new Error(`Receipt dataset not found at: ${datasetPath}`);
        }
        const rawData = fs.readFileSync(datasetPath, 'utf-8');
        this.dataset = JSON.parse(rawData);
        console.log(`[ReceiptDataManager] Loaded ${this.dataset.orders.length} receipt records`);
    }
    /**
     * Get the total number of orders in the dataset
     */
    getTotalOrders() {
        return this.dataset?.orders.length || 0;
    }
    /**
     * Get the number of currently active (in-use) order IDs
     */
    getActiveOrderCount() {
        return this.usedOrderIds.size;
    }
    /**
     * Check if an order ID is currently in use
     */
    isOrderIdInUse(orderId) {
        return this.usedOrderIds.has(orderId);
    }
    /**
     * Get the next available order data that is not currently in use
     * Returns null if all orders are in use
     */
    getNextAvailableOrder() {
        if (!this.dataset) {
            throw new Error('Dataset not loaded. Call loadDataset() first.');
        }
        const totalOrders = this.dataset.orders.length;
        // If all orders are in use, return null
        if (this.usedOrderIds.size >= totalOrders) {
            console.warn('[ReceiptDataManager] All orders are currently in use');
            return null;
        }
        // Find the next available order using circular iteration
        let attempts = 0;
        while (attempts < totalOrders) {
            const order = this.dataset.orders[this.currentIndex];
            const orderId = `#${order.order_id}`;
            // Move to next index (circular)
            this.currentIndex = (this.currentIndex + 1) % totalOrders;
            attempts++;
            if (!this.usedOrderIds.has(orderId)) {
                // Mark as in use and return
                this.usedOrderIds.add(orderId);
                return order;
            }
        }
        // Should not reach here if usedOrderIds.size < totalOrders
        return null;
    }
    /**
     * Mark an order as completed, releasing its ID for reuse
     */
    markOrderCompleted(orderId) {
        if (this.usedOrderIds.has(orderId)) {
            this.usedOrderIds.delete(orderId);
            console.log(`[ReceiptDataManager] Released order ID: ${orderId}`);
        }
    }
    /**
     * Mark an order as expired, releasing its ID for reuse
     */
    markOrderExpired(orderId) {
        this.markOrderCompleted(orderId); // Same behavior as completed
    }
    /**
     * Get the image file path for a specific order
     */
    getImagePath(imageFilename) {
        return path.join(this.dataDir, imageFilename);
    }
    /**
     * Get the absolute image file path for a specific order
     */
    getAbsoluteImagePath(imageFilename) {
        return path.resolve(this.dataDir, imageFilename);
    }
    /**
     * Read image file as base64
     */
    getImageAsBase64(imageFilename) {
        const imagePath = this.getImagePath(imageFilename);
        if (!fs.existsSync(imagePath)) {
            throw new Error(`Image file not found: ${imagePath}`);
        }
        const imageBuffer = fs.readFileSync(imagePath);
        return imageBuffer.toString('base64');
    }
    /**
     * Get receipt data by order ID
     */
    getReceiptByOrderId(orderId) {
        if (!this.dataset) {
            throw new Error('Dataset not loaded. Call loadDataset() first.');
        }
        // Remove # prefix if present
        const cleanId = orderId.startsWith('#') ? orderId.slice(1) : orderId;
        return this.dataset.orders.find(order => order.order_id === cleanId) || null;
    }
    /**
     * Reset the manager state (for testing)
     */
    reset() {
        this.usedOrderIds.clear();
        this.currentIndex = 0;
    }
    /**
     * Get all currently used order IDs
     */
    getUsedOrderIds() {
        return Array.from(this.usedOrderIds);
    }
}
/**
 * Singleton instance
 */
let receiptDataManagerInstance = null;
/**
 * Get the singleton ReceiptDataManager instance
 */
export function getReceiptDataManager() {
    if (!receiptDataManagerInstance) {
        receiptDataManagerInstance = new ReceiptDataManager();
        receiptDataManagerInstance.loadDataset();
    }
    return receiptDataManagerInstance;
}
/**
 * Create a new ReceiptDataManager instance (for testing)
 */
export function createReceiptDataManager() {
    const manager = new ReceiptDataManager();
    manager.loadDataset();
    return manager;
}
//# sourceMappingURL=receipt-data-manager.js.map