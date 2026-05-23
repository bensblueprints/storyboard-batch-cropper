# Deployment — Benji's AI Empire

## 1. Storyboard Batch Cropper (the app)

```bash
npm install
npm run build
```

Deploy the `dist/` folder to your app host.

Users need:

1. A **license key** from Benji's AI Empire ($9.99 one-time or program member)
2. Their own **FAL API key** for video generation

## 2. License + checkout API (backend)

```bash
cd backend
npm install
cp .env.example .env
npm start
```

Runs on port `8787` by default.

### Airwallex setup ($9.99 one-time)

1. Create an Airwallex account at [airwallex.com](https://www.airwallex.com/)
2. Go to **Settings → Developer → API keys** and copy:
   - `AIRWALLEX_CLIENT_ID`
   - `AIRWALLEX_API_KEY`
3. Go to **Settings → Developer → Webhooks** and create a webhook:
   - URL: `https://benjisaiempire.com/api/v1/webhooks/airwallex`
   - Events: `payment_link.paid` (and optionally `payment_intent.succeeded`)
   - Copy the webhook secret into `AIRWALLEX_WEBHOOK_SECRET`
4. Set in `backend/.env`:

```env
PUBLIC_BASE_URL=https://benjisaiempire.com
AIRWALLEX_API_BASE=https://api.airwallex.com/api/v1
AIRWALLEX_CLIENT_ID=your_client_id
AIRWALLEX_API_KEY=your_api_key
AIRWALLEX_WEBHOOK_SECRET=your_webhook_secret
AIRWALLEX_MOCK=false
```

Sandbox testing uses `https://api-demo.airwallex.com/api/v1`.

### API endpoints

- `POST /api/v1/checkout/create` — create $9.99 Airwallex payment link
- `GET /api/v1/checkout/orders/:orderId` — poll order + license after payment
- `POST /api/v1/webhooks/airwallex` — Airwallex payment confirmation
- `POST /api/v1/licenses/validate` — app activation
- `POST /api/v1/licenses/lookup` — recover key by checkout email
- `POST /api/v1/licenses/create-program` — issue program member keys

Deploy behind `https://benjisaiempire.com/api/v1` (reverse proxy to port 8787).

Dev license for testing: `SB-DEV-LOCAL-2026`

## 3. Software store pages

Static files in `public/software/` (copied into `dist/software/` on build):

- `/software/` — product listing
- `/software/storyboard-batch-cropper.html` — $9.99 Airwallex checkout
- `/software/purchase-success.html` — shows license key after payment

## 4. Local dev

```bash
npm run dev:all
```

Or separately:

```bash
cd backend && npm start
npm run dev
```

- App: `http://localhost:5173`
- Store: `http://localhost:5173/software/storyboard-batch-cropper.html`
- API: `http://localhost:8787`

With `AIRWALLEX_MOCK=true` in `backend/.env`, **Buy for $9.99** skips real Airwallex and issues a license on the success page.

Use license key `SB-DEV-LOCAL-2026` for the app itself, or complete a mock checkout to test the full purchase flow.
