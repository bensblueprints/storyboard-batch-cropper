import express from 'express';

import cors from 'cors';

import crypto from 'node:crypto';

import fs from 'node:fs';

import path from 'node:path';

import { fileURLToPath } from 'node:url';

import {

  createBillingCheckout,

  isAirwallexConfigured,

  isAirwallexMockMode,

  retrieveBillingCheckout,

  verifyAirwallexWebhookSignature,

} from './airwallex.js';

import {

  createOrder,

  findLatestPaidOrderByEmail,

  findOrder,

  findOrderByBillingCheckoutId,

  findOrderByPaymentLinkId,

  updateOrder,

} from './orders.js';



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT || 8787);

const LICENSES_PATH = path.join(__dirname, 'data', 'licenses.json');

const PRODUCT_ID = 'storyboard-batch-cropper';

const PRODUCT_NAME = 'Storyboard Batch Cropper';

const PRODUCT_PRICE = 9.99;

const PRODUCT_CURRENCY = 'USD';

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL?.trim() || 'http://localhost:5173';



const app = express();

app.use(cors());



app.post(

  '/api/v1/webhooks/airwallex',

  express.raw({ type: 'application/json' }),

  async (req, res) => {

    const rawBody = req.body.toString('utf8');

    const timestamp = req.get('x-timestamp') || '';

    const signature = req.get('x-signature') || '';



    if (!verifyAirwallexWebhookSignature(rawBody, timestamp, signature)) {

      res.status(400).send('failed to verify webhook signature');

      return;

    }



    let event;

    try {

      event = JSON.parse(rawBody);

    } catch {

      res.status(400).send('invalid json');

      return;

    }



    try {

      await handleAirwallexEvent(event);

      res.status(200).send('ok');

    } catch (err) {

      console.error('Airwallex webhook error:', err);

      res.status(500).send('webhook handler failed');

    }

  }

);



app.use(express.json());



function readLicenses() {

  if (!fs.existsSync(LICENSES_PATH)) {

    return { licenses: [] };

  }

  return JSON.parse(fs.readFileSync(LICENSES_PATH, 'utf8'));

}



function writeLicenses(data) {

  fs.mkdirSync(path.dirname(LICENSES_PATH), { recursive: true });

  fs.writeFileSync(LICENSES_PATH, `${JSON.stringify(data, null, 2)}\n`);

}



function normalizeKey(key) {

  return key.trim().toUpperCase();

}



function generateLicenseKey() {

  const chunk = () => crypto.randomBytes(2).toString('hex').toUpperCase();

  return `SB-${chunk()}-${chunk()}-${chunk()}`;

}



function findLicense(key) {

  const normalized = normalizeKey(key);

  const data = readLicenses();

  return data.licenses.find((entry) => normalizeKey(entry.key) === normalized) ?? null;

}



function findLicenseByEmail(email, product = PRODUCT_ID) {

  const normalized = email.trim().toLowerCase();

  const data = readLicenses();

  return (

    [...data.licenses]

      .reverse()

      .find(

        (entry) =>

          entry.product === product &&

          entry.type === 'purchase' &&

          !entry.revoked &&

          entry.email?.toLowerCase() === normalized

      ) ?? null

  );

}



/**

 * @param {string} email

 * @param {string} billingCheckoutId

 * @returns {string}

 */

function issuePurchaseLicense(email, billingCheckoutId) {

  const existing = findLicenseByEmail(email);

  if (existing) {

    return existing.key;

  }



  const key = generateLicenseKey();

  const data = readLicenses();

  data.licenses.push({

    key,

    product: PRODUCT_ID,

    type: 'purchase',

    email,

    billingCheckoutId,

    createdAt: new Date().toISOString(),

    revoked: false,

  });

  writeLicenses(data);

  return key;

}



/**

 * @param {Object} order

 * @param {string} email

 * @param {string} billingCheckoutId

 */

function completePaidOrder(order, email, billingCheckoutId) {

  if (!order || order.status === 'paid') {

    return;

  }



  const resolvedEmail = email || order.email || `buyer+${order.id}@checkout.airwallex`;

  const licenseKey = issuePurchaseLicense(resolvedEmail, billingCheckoutId);

  updateOrder(order.id, {

    status: 'paid',

    email: resolvedEmail,

    licenseKey,

    paidAt: new Date().toISOString(),

    billingCheckoutId: billingCheckoutId || order.billingCheckoutId,

  });

}



/**

 * @param {Object} checkout

 */

async function handleBillingCheckoutCompleted(checkout) {

  const metadata = checkout?.metadata ?? {};

  if (metadata.product && metadata.product !== PRODUCT_ID) {

    return;

  }



  const billingCheckoutId = checkout?.id;

  const order =

    (metadata.orderId ? findOrder(metadata.orderId) : null) ||

    (billingCheckoutId ? findOrderByBillingCheckoutId(billingCheckoutId) : null);



  if (!order || order.status === 'paid') {

    return;

  }



  const email =

    checkout?.customer_data?.email ||

    checkout?.customer?.email ||

    metadata.email ||

    order.email ||

    null;



  completePaidOrder(order, email, billingCheckoutId);

}



/**

 * @param {Object} event

 */

async function handleAirwallexEvent(event) {

  const name = event?.name;

  const data = event?.data?.object ?? event?.data;



  if (name === 'billing_checkout.completed') {

    await handleBillingCheckoutCompleted(data);

    return;

  }



  if (name === 'payment_link.paid' || name === 'payment_intent.succeeded') {

    const paymentLinkId = data?.id;

    const metadata = data?.metadata ?? {};

    const order =

      findOrder(metadata.orderId) ||

      (paymentLinkId ? findOrderByPaymentLinkId(paymentLinkId) : null);



    if (!order || order.status === 'paid') {

      return;

    }



    const email = order.email || metadata.email || `buyer+${order.id}@checkout.airwallex`;

    completePaidOrder(order, email, paymentLinkId);

  }

}



function createOrderId() {

  return `ord_${crypto.randomBytes(8).toString('hex')}`;

}



app.get('/api/v1/health', (_req, res) => {

  res.json({

    ok: true,

    service: 'benjisaiempire-licenses',

    airwallex: isAirwallexConfigured() || isAirwallexMockMode(),

    checkoutMode: isAirwallexMockMode() ? 'mock' : 'billing',

  });

});



app.get('/api/v1/products/:productId', (req, res) => {

  if (req.params.productId !== PRODUCT_ID) {

    res.status(404).json({ message: 'Product not found' });

    return;

  }



  res.json({

    id: PRODUCT_ID,

    name: PRODUCT_NAME,

    price: PRODUCT_PRICE,

    priceCents: Math.round(PRODUCT_PRICE * 100),

    priceLabel: '$9.99',

    currency: PRODUCT_CURRENCY,

    description:

      'Section storyboard sheets, crop panels, export scenes, and generate fal.ai image-to-video clips with per-scene prompts and reference images.',

    purchaseUrl: '/software/storyboard-batch-cropper.html',

    successUrl: '/software/purchase-success.html',

    checkoutProvider: 'airwallex',

    airwallexProductId: process.env.AIRWALLEX_PRODUCT_ID || null,

    airwallexPriceId: process.env.AIRWALLEX_PRICE_ID || null,

  });

});



app.post('/api/v1/checkout/create', async (req, res) => {

  const product = req.body?.product || PRODUCT_ID;

  if (product !== PRODUCT_ID) {

    res.status(404).json({ message: 'Product not found' });

    return;

  }



  if (!isAirwallexConfigured() && !isAirwallexMockMode()) {

    res.status(503).json({

      message: 'Checkout is not configured yet. Add Airwallex keys to backend/.env',

    });

    return;

  }



  const orderId = createOrderId();

  const email = String(req.body?.email || '').trim() || null;

  const successUrl = `${PUBLIC_BASE_URL}/software/purchase-success.html?order=${encodeURIComponent(orderId)}`;

  const backUrl = `${PUBLIC_BASE_URL}/software/storyboard-batch-cropper.html`;



  try {

    const checkout = await createBillingCheckout({

      reference: orderId,

      successUrl,

      backUrl,

      email,

      title: `${PRODUCT_NAME} — one-time license`,

      metadata: {

        orderId,

        product: PRODUCT_ID,

        ...(email ? { email } : {}),

      },

    });



    if (!checkout.url) {

      res.status(500).json({ message: 'Airwallex did not return a checkout URL' });

      return;

    }



    createOrder({

      id: orderId,

      product: PRODUCT_ID,

      status: 'pending',

      amount: PRODUCT_PRICE,

      currency: PRODUCT_CURRENCY,

      billingCheckoutId: checkout.id,

      checkoutUrl: checkout.url,

      licenseKey: null,

      email,

      createdAt: new Date().toISOString(),

    });



    res.status(201).json({

      orderId,

      checkoutUrl: checkout.url,

      provider: 'airwallex',

    });

  } catch (err) {

    res.status(500).json({

      message: err instanceof Error ? err.message : 'Could not create checkout',

    });

  }

});



app.get('/api/v1/checkout/orders/:orderId', async (req, res) => {

  const order = findOrder(req.params.orderId);

  if (!order) {

    res.status(404).json({ message: 'Order not found' });

    return;

  }



  if (order.status !== 'paid' && order.billingCheckoutId && !isAirwallexMockMode()) {

    try {

      const checkout = await retrieveBillingCheckout(order.billingCheckoutId);

      if (checkout.status === 'COMPLETED' && !order.licenseKey) {

        const email =

          checkout.customer_data?.email ||

          checkout.customer?.email ||

          order.email ||

          `buyer+${order.id}@checkout.airwallex`;

        completePaidOrder(order, email, order.billingCheckoutId);

        order.status = 'paid';

        order.licenseKey = findOrder(order.id)?.licenseKey ?? order.licenseKey;

        order.email = email;

      }

    } catch {

      // Ignore polling errors; webhook may still complete the order.

    }

  }



  if (isAirwallexMockMode() && req.query.mock === '1' && order.status !== 'paid') {

    const email = order.email || `buyer+${order.id}@checkout.airwallex`;

    completePaidOrder(order, email, order.billingCheckoutId);

    order.status = 'paid';

    order.licenseKey = findOrder(order.id)?.licenseKey ?? order.licenseKey;

  }



  res.json({

    orderId: order.id,

    status: order.status,

    licenseKey: order.licenseKey,

    product: order.product,

    email: order.email,

  });

});



app.post('/api/v1/checkout/mock-complete/:orderId', (req, res) => {

  if (!isAirwallexMockMode()) {

    res.status(404).json({ message: 'Not found' });

    return;

  }



  const order = findOrder(req.params.orderId);

  if (!order) {

    res.status(404).json({ message: 'Order not found' });

    return;

  }



  const email = String(req.body?.email || order.email || `buyer+${order.id}@checkout.airwallex`).trim();

  completePaidOrder(order, email, order.billingCheckoutId);

  const updated = findOrder(order.id);



  res.json({

    orderId: order.id,

    status: 'paid',

    licenseKey: updated?.licenseKey,

    email,

  });

});



app.post('/api/v1/licenses/validate', (req, res) => {

  const key = req.body?.key;

  const product = req.body?.product;



  if (!key || product !== PRODUCT_ID) {

    res.status(400).json({ valid: false, message: 'Missing key or product' });

    return;

  }



  const license = findLicense(key);

  if (!license || license.product !== PRODUCT_ID) {

    res.status(401).json({ valid: false, message: 'Invalid license key' });

    return;

  }



  if (license.revoked) {

    res.status(401).json({ valid: false, message: 'License revoked' });

    return;

  }



  res.json({

    valid: true,

    type: license.type,

    product: license.product,

    email: license.email ?? null,

  });

});



app.post('/api/v1/licenses/lookup', (req, res) => {

  const email = String(req.body?.email || '').trim();

  const product = req.body?.product || PRODUCT_ID;



  if (!email) {

    res.status(400).json({ message: 'Email required' });

    return;

  }



  const license = findLicenseByEmail(email, product);

  const paidOrder = findLatestPaidOrderByEmail(email, product);



  if (!license && !paidOrder?.licenseKey) {

    res.status(404).json({ message: 'No license found for that email yet' });

    return;

  }



  res.json({

    key: license?.key || paidOrder?.licenseKey,

    product,

    email,

  });

});



app.post('/api/v1/licenses/create-program', (req, res) => {

  const email = String(req.body?.email || '').trim();

  if (!email) {

    res.status(400).json({ message: 'Email required' });

    return;

  }



  const key = generateLicenseKey();

  const data = readLicenses();

  data.licenses.push({

    key,

    product: PRODUCT_ID,

    type: 'program',

    email,

    createdAt: new Date().toISOString(),

    revoked: false,

  });

  writeLicenses(data);



  res.status(201).json({

    key,

    product: PRODUCT_ID,

    type: 'program',

    email,

  });

});



app.listen(PORT, () => {

  console.log(`Benji license API listening on http://localhost:${PORT}`);

  console.log(`Public base URL: ${PUBLIC_BASE_URL}`);

  console.log(`Airwallex: ${isAirwallexMockMode() ? 'mock mode' : isAirwallexConfigured() ? 'live billing checkout' : 'not configured'}`);

});

