import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ORDERS_PATH = path.join(__dirname, 'data', 'orders.json');

function readOrders() {
  if (!fs.existsSync(ORDERS_PATH)) {
    return { orders: [] };
  }
  return JSON.parse(fs.readFileSync(ORDERS_PATH, 'utf8'));
}

function writeOrders(data) {
  fs.mkdirSync(path.dirname(ORDERS_PATH), { recursive: true });
  fs.writeFileSync(ORDERS_PATH, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * @param {Object} order
 * @returns {Object}
 */
export function createOrder(order) {
  const data = readOrders();
  data.orders.push(order);
  writeOrders(data);
  return order;
}

/**
 * @param {string} orderId
 * @returns {Object|null}
 */
export function findOrder(orderId) {
  const data = readOrders();
  return data.orders.find((entry) => entry.id === orderId) ?? null;
}

/**
 * @param {string} paymentLinkId
 * @returns {Object|null}
 */
export function findOrderByPaymentLinkId(paymentLinkId) {
  const data = readOrders();
  return (
    data.orders.find(
      (entry) =>
        entry.paymentLinkId === paymentLinkId || entry.billingCheckoutId === paymentLinkId
    ) ?? null
  );
}

/**
 * @param {string} billingCheckoutId
 * @returns {Object|null}
 */
export function findOrderByBillingCheckoutId(billingCheckoutId) {
  const data = readOrders();
  return data.orders.find((entry) => entry.billingCheckoutId === billingCheckoutId) ?? null;
}

/**
 * @param {string} orderId
 * @param {Object} patch
 * @returns {Object|null}
 */
export function updateOrder(orderId, patch) {
  const data = readOrders();
  const index = data.orders.findIndex((entry) => entry.id === orderId);
  if (index < 0) {
    return null;
  }
  data.orders[index] = { ...data.orders[index], ...patch };
  writeOrders(data);
  return data.orders[index];
}

/**
 * @param {string} email
 * @param {string} product
 * @returns {Object|null}
 */
export function findLatestPaidOrderByEmail(email, product) {
  const normalized = email.trim().toLowerCase();
  const data = readOrders();
  return (
    [...data.orders]
      .reverse()
      .find(
        (entry) =>
          entry.product === product &&
          entry.status === 'paid' &&
          entry.email?.toLowerCase() === normalized &&
          entry.licenseKey
      ) ?? null
  );
}
