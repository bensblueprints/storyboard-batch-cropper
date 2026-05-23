import crypto from 'node:crypto';

const SANDBOX_API_BASE = 'https://api-demo.airwallex.com/api/v1';
const LIVE_API_BASE = 'https://api.airwallex.com/api/v1';

/** @returns {string} */
export function getAirwallexApiBase() {
  if (process.env.AIRWALLEX_API_BASE?.trim()) {
    return process.env.AIRWALLEX_API_BASE.trim();
  }
  return process.env.AIRWALLEX_SANDBOX === 'true' ? SANDBOX_API_BASE : LIVE_API_BASE;
}

/** @returns {boolean} */
export function isAirwallexConfigured() {
  return Boolean(
    process.env.AIRWALLEX_CLIENT_ID &&
      process.env.AIRWALLEX_API_KEY &&
      process.env.AIRWALLEX_LEGAL_ENTITY_ID &&
      process.env.AIRWALLEX_PAYMENT_ACCOUNT_ID &&
      process.env.AIRWALLEX_PRICE_ID
  );
}

/** @returns {boolean} */
export function isAirwallexMockMode() {
  return process.env.AIRWALLEX_MOCK === 'true';
}

let cachedToken = null;
/** @type {number} */
let cachedTokenExpiresAt = 0;

/**
 * @returns {Promise<string>}
 */
export async function getAirwallexAccessToken() {
  if (isAirwallexMockMode()) {
    return 'mock-airwallex-token';
  }

  if (!process.env.AIRWALLEX_CLIENT_ID || !process.env.AIRWALLEX_API_KEY) {
    throw new Error('Airwallex is not configured. Set AIRWALLEX_CLIENT_ID and AIRWALLEX_API_KEY.');
  }

  const now = Date.now();
  if (cachedToken && cachedTokenExpiresAt > now + 60_000) {
    return cachedToken;
  }

  const response = await fetch(`${getAirwallexApiBase()}/authentication/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': process.env.AIRWALLEX_CLIENT_ID,
      'x-api-key': process.env.AIRWALLEX_API_KEY,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Airwallex login failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data.token) {
    throw new Error('Airwallex login did not return a token');
  }

  cachedToken = data.token;
  cachedTokenExpiresAt = data.expires_at
    ? new Date(data.expires_at).getTime()
    : now + 25 * 60 * 1000;

  return cachedToken;
}

/**
 * @param {string} path
 * @param {RequestInit & { json?: unknown }} options
 * @returns {Promise<Object>}
 */
async function airwallexRequest(path, options = {}) {
  const token = await getAirwallexAccessToken();
  const response = await fetch(`${getAirwallexApiBase()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Airwallex ${path} failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function createBillingCheckout(payload) {
  if (isAirwallexMockMode()) {
    const checkoutId = `bc_mock_${payload.reference}`;
    const separator = payload.successUrl.includes('?') ? '&' : '?';
    return {
      id: checkoutId,
      url: `${payload.successUrl}${separator}order=${encodeURIComponent(payload.reference)}&mock=1`,
      status: 'ACTIVE',
    };
  }

  const legalEntityId = process.env.AIRWALLEX_LEGAL_ENTITY_ID?.trim();
  const paymentAccountId = process.env.AIRWALLEX_PAYMENT_ACCOUNT_ID?.trim();
  const priceId = process.env.AIRWALLEX_PRICE_ID?.trim();

  if (!legalEntityId || !paymentAccountId || !priceId) {
    throw new Error(
      'Airwallex billing checkout requires AIRWALLEX_LEGAL_ENTITY_ID, AIRWALLEX_PAYMENT_ACCOUNT_ID, and AIRWALLEX_PRICE_ID.'
    );
  }

  /** @type {Record<string, unknown>} */
  const body = {
    request_id: payload.reference,
    mode: 'PAYMENT',
    legal_entity_id: legalEntityId,
    linked_payment_account_id: paymentAccountId,
    success_url: payload.successUrl,
    back_url: payload.backUrl,
    line_items: [{ price_id: priceId, quantity: 1 }],
    metadata: payload.metadata,
    invoice_data: {
      memo: payload.title || 'Storyboard Batch Cropper license',
      metadata: payload.metadata,
    },
  };

  if (payload.email) {
    body.customer_data = {
      email: payload.email,
      ...(payload.name ? { name: payload.name } : {}),
    };
  }

  return airwallexRequest('/billing_checkouts/create', {
    method: 'POST',
    json: body,
  });
}

/**
 * @param {string} billingCheckoutId
 * @returns {Promise<Object>}
 */
export async function retrieveBillingCheckout(billingCheckoutId) {
  if (isAirwallexMockMode()) {
    return { id: billingCheckoutId, status: 'ACTIVE' };
  }

  return airwallexRequest(`/billing_checkouts/${billingCheckoutId}`, {
    method: 'GET',
  });
}

/**
 * @param {string} rawBody
 * @param {string} timestamp
 * @param {string} signature
 * @returns {boolean}
 */
export function verifyAirwallexWebhookSignature(rawBody, timestamp, signature) {
  const secret = process.env.AIRWALLEX_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== 'production';
  }

  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}${rawBody}`).digest('hex');
  return expected === signature;
}
