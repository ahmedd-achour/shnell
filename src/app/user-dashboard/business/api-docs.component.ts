import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toastSuccess } from '../../shared/swal';

export const API_BASE_URL = 'https://us-central1-shnell-393a6.cloudfunctions.net/api/v1';

interface Endpoint {
  id: string;
  method: 'GET' | 'POST';
  path: string;
  title: string;
  summary: string;
  body?: string;
  response: string;
  notes?: string[];
}

/**
 * Shnell API v1 reference. Shown in the business dashboard (with the
 * account's fresh key in the snippets) and publicly at /developers.
 * Mirrors functions/index.js `api` + lib/public_api.js.
 */
@Component({
  selector: 'app-api-docs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './api-docs.component.html',
  styleUrls: ['./biz.css', './api-docs.component.css'],
})
export class ApiDocsComponent {
  /** Key put in the snippets (the real one right after creation, else a placeholder). */
  @Input() apiKey = '';
  /** Public page: no dashboard chrome around it. */
  @Input() standalone = false;

  readonly base = API_BASE_URL;
  lang: 'curl' | 'node' | 'python' | 'php' = 'curl';
  open = new Set<string>(['create-order']);

  get key(): string { return this.apiKey || 'shk_YOUR_API_KEY'; }

  readonly orderBody = `{
  "pickup": { "address": "Dépôt Ariana, Rue 8600", "lat": 36.8625, "lng": 10.1956 },
  "stops": [
    {
      "address": "Avenue Habib Bourguiba, Sousse",
      "lat": 35.8256, "lng": 10.6084,
      "name": "Client A",
      "phone": "+21620000000",
      "description": "2 cartons, fragile",
      "cashToCollect": 120,
      "reference": "INV-2026-0042"
    }
  ],
  "vehicleTypes": ["light", "medium"],
  "scheduleAt": "2026-11-02T09:00:00Z",
  "notes": "Call 10 min before arriving"
}`;

  readonly orderResponse = `{
  "id": "api_5f1c9d…",
  "state": "searching",
  "createdAt": "2026-10-28T19:10:04.112Z",
  "scheduleAt": "2026-11-02T09:00:00.000Z",
  "price": 85,
  "priceRange": { "min": 85, "max": 120 },
  "currency": "TND",
  "distanceKm": 146.2,
  "vehicleTypes": ["light", "medium"],
  "pickup": { "address": "Dépôt Ariana, Rue 8600", "lat": 36.8625, "lng": 10.1956 },
  "stops": [
    { "id": "api_5f1c9d…_0", "address": "Avenue Habib Bourguiba, Sousse", "lat": 35.8256, "lng": 10.6084,
      "name": "Client A", "phone": "+21620000000", "cashToCollect": 120,
      "reference": "INV-2026-0042", "state": "pending",
      "deliveredAt": null, "failedAt": null, "failReason": null }
  ],
  "driver": null,
  "offers": [],
  "search": { "status": "searching", "radiusKm": 5, "startsAt": null },
  "canceledBy": null
}`;

  readonly endpoints: Endpoint[] = [
    {
      id: 'vehicle-types', method: 'GET', path: '/vehicle-types', title: 'List vehicle types',
      summary: 'The vehicle types you can ask for, lightest first. Use their `id` in `vehicleTypes`.',
      response: `{ "vehicleTypes": [ { "id": "light", "name": "Utilitaire léger", "maxWeightKg": 1500 }, … ] }`,
    },
    {
      id: 'quote', method: 'POST', path: '/quotes', title: 'Price a trip',
      summary: 'Shnell prices the trip for each vehicle type, exactly as in the app. Nothing is booked. A quote is valid 2 hours and is tied to these exact points.',
      body: `{
  "pickup": { "lat": 36.8625, "lng": 10.1956 },
  "stops": [ { "lat": 35.8256, "lng": 10.6084 } ],
  "vehicleTypes": ["light", "medium"]
}`,
      response: `{
  "quoteId": "Q8x…",
  "currency": "TND",
  "distanceKm": 146.2,
  "options": [
    { "vehicleType": "light", "name": "Utilitaire léger", "price": 85, "maxWeightKg": 1500 },
    { "vehicleType": "medium", "name": "Camion moyen", "price": 120, "maxWeightKg": 3500 }
  ],
  "minPrice": 85, "maxPrice": 120,
  "unpriced": [],
  "expiresAt": "2026-10-28T21:10:04.000Z"
}`,
      notes: [
        '`vehicleTypes` is optional: leave it out to price every vehicle type.',
        '`distanceKm` is optional: send your own road distance if you have one. Shnell never charges less than the straight-line distance.',
      ],
    },
    {
      id: 'create-order', method: 'POST', path: '/orders', title: 'Create an order',
      summary: 'Books the trip and starts the driver search right away (or 1 hour before `scheduleAt`). Same pricing, same search and same drivers as the Shnell app.',
      body: '',
      response: '',
      notes: [
        'Send an `Idempotency-Key` header (your own order id, for example). Retrying with the same key returns the same order: an order is never booked twice.',
        'Either send `quoteId` (to book the exact price you showed your customer) or `vehicleTypes` (Shnell prices it now), not both. With neither, every vehicle type is allowed.',
        'Every stop needs `address`, `lat`, `lng` and `phone`. Up to 50 stops per order, up to 100 open orders at a time.',
        '`cashToCollect` is the cash the driver collects at that stop (cash on delivery). `reference` is your own id for the stop; it comes back in every response.',
        '`driverId` (optional) gives the trip to one of your own drivers instead of the marketplace.',
        'Drivers see the trip with the price of their own vehicle: the cheapest allowed vehicle sets `price`, the most expensive one `priceRange.max`.',
      ],
    },
    {
      id: 'list-orders', method: 'GET', path: '/orders?state=searching&limit=50', title: 'List orders',
      summary: 'Your orders of the last 30 days, newest first (also the ones created in the dashboard). Optional `state` filter, `limit` up to 200.',
      response: `{ "orders": [ { "id": "…", "state": "assigned", … } ] }`,
    },
    {
      id: 'get-order', method: 'GET', path: '/orders/{id}', title: 'Get an order',
      summary: 'Current state, driver, offers and the state of every stop.',
      response: '',
      notes: [
        'The driver\'s phone number is only shown while the trip is `assigned` or `in_progress`.',
        'Every stop has its own `state` (see Stop states), with `deliveredAt` once delivered, or `failedAt` and `failReason` when the driver could not deliver.',
      ],
    },
    {
      id: 'cancel', method: 'POST', path: '/orders/{id}/cancel', title: 'Cancel an order',
      summary: 'Before a driver takes the trip, cancelling is free. Once a driver holds it, send a reason: the same cancellation rules as the app apply.',
      body: `{ "reason": "changed_mind", "note": "Customer not at home" }`,
      response: `{ "id": "…", "state": "canceled", … }`,
      notes: ['`reason` (only when a driver holds the trip): `driver_asked`, `driver_late`, `driver_early`, `price_dispute`, `changed_mind`, `found_other`, `other`.'],
    },
    {
      id: 'accept-offer', method: 'POST', path: '/orders/{id}/offers/{driverId}/accept', title: 'Accept a driver offer',
      summary: 'When the state is `offers`, drivers proposed their own price. Accept one by sending the amount you saw (if it changed, you get 409 and read the order again).',
      body: `{ "amount": 95 }`,
      response: `{ "id": "…", "state": "assigned", "driver": { "id": "…", "name": "Sami", "phone": "+216…" }, … }`,
    },
  ];

  readonly states = [
    { s: 'scheduled', d: 'Booked for later: the search starts 1 hour before `scheduleAt`.' },
    { s: 'searching', d: 'Shnell is offering the trip to nearby drivers, in growing circles.' },
    { s: 'offers', d: 'Drivers sent their own price: accept one, or wait for a driver at your price.' },
    { s: 'no_driver', d: 'Nobody took it in time. Cancel it, or create it again.' },
    { s: 'assigned', d: 'A driver accepted the trip and is on the way to the pickup.' },
    { s: 'in_progress', d: 'The goods are on board.' },
    { s: 'delivered', d: 'Trip finished.' },
    { s: 'canceled', d: 'Canceled by you (`canceledBy: "you"`) or by Shnell.' },
    { s: 'expired', d: 'Still without a driver 24 hours after the search started.' },
  ];

  readonly stopStates = [
    { s: 'pending', d: 'Not reached yet.' },
    { s: 'on_the_way', d: 'The driver is heading to this stop now.' },
    { s: 'delivered', d: 'Handed over. `deliveredAt` says when.' },
    { s: 'failed', d: 'Not delivered. `failReason`: `absent`, `refused`, `wrong_address`, `unreachable` or `other`; `failedAt` says when.' },
  ];

  readonly stopWebhookPayload = `POST https://your-server.com/shnell-webhook
X-Shnell-Event: stop.failed

{
  "id": "evt_41c2e0…",
  "type": "stop.failed",
  "createdAt": "2026-10-28T15:42:10.000Z",
  "data": {
    "orderId": "api_5f1c9d…",
    "stop": { "id": "api_5f1c9d…_1", "reference": "INV-2026-0043", "state": "failed",
              "failReason": "absent", "failedAt": "2026-10-28T15:42:08.000Z",
              "cashToCollect": 120, "name": "Client B", "phone": "+216…", … },
    "order": { "id": "api_5f1c9d…", "state": "in_progress", "stops": [ … ], … }
  }
}`;

  readonly errors = [
    { c: '400', m: 'A field is missing or invalid (`error.code` says which, for example `stop_phone_required`).' },
    { c: '401', m: 'Missing, unknown or revoked API key.' },
    { c: '403', m: 'Key suspended, API access blocked, account suspended, or Shnell Business not enabled.' },
    { c: '404', m: 'Order, quote or offer not found (or not yours).' },
    { c: '409', m: 'The order changed (already taken, quote expired or tied to other points, offer amount changed).' },
    { c: '409', m: 'Own driver (`driverId`) not allowed by your plan: `plan_limit` (free plan, more than 2 drivers in your fleet) or `plan_past_due` (Pro month unpaid, top up your wallet). Shnell-network orders are never blocked.' },
    { c: '422', m: 'Unknown vehicle type.' },
    { c: '429', m: 'More than 120 requests a minute on this key, 100 open orders, or too many cancellations.' },
    { c: '5xx', m: 'Our side. Retry with the same `Idempotency-Key`.' },
  ];

  get snippet(): string {
    const url = `${this.base}/orders`;
    const body = this.orderBody;
    switch (this.lang) {
      case 'node': return `const res = await fetch("${url}", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${this.key}",
    "Content-Type": "application/json",
    "Idempotency-Key": "INV-2026-0042"
  },
  body: JSON.stringify(${body.replace(/\n/g, '\n  ')})
});
const order = await res.json();
if (!res.ok) throw new Error(order.error.code + ": " + order.error.message);
console.log(order.id, order.state, order.price);`;
      case 'python': return `import requests

res = requests.post(
    "${url}",
    headers={
        "Authorization": "Bearer ${this.key}",
        "Idempotency-Key": "INV-2026-0042",
    },
    json=${body.replace(/\n/g, '\n    ')},
    timeout=60,
)
order = res.json()
res.raise_for_status()
print(order["id"], order["state"], order["price"])`;
      case 'php': return `$ch = curl_init("${url}");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer ${this.key}",
    "Content-Type: application/json",
    "Idempotency-Key: INV-2026-0042",
  ],
  CURLOPT_POSTFIELDS => '${body.replace(/\n/g, '\n  ')}',
]);
$order = json_decode(curl_exec($ch), true);
echo $order["id"] . " " . $order["state"];`;
      default: return `curl -X POST "${url}" \\
  -H "Authorization: Bearer ${this.key}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: INV-2026-0042" \\
  -d '${body.replace(/\n/g, '\n  ')}'`;
    }
  }

  readonly webhookPayload = `POST https://your-server.com/shnell-webhook
X-Shnell-Event: order.assigned
X-Shnell-Signature: t=1793222400,v1=5d41402abc4b2a76b9719d911017c592…

{
  "id": "evt_9a8b7c…",
  "type": "order.assigned",
  "createdAt": "2026-10-28T19:20:00.000Z",
  "data": { "id": "api_5f1c9d…", "state": "assigned", "driver": { … }, … }
}`;

  readonly webhookVerify = `// Node.js (Express): verify before trusting the event.
const crypto = require("crypto");

app.post("/shnell-webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.get("X-Shnell-Signature") || "";
  const t = (sig.match(/t=(\\d+)/) || [])[1];
  const v1 = (sig.match(/v1=([0-9a-f]+)/) || [])[1];
  const expected = crypto.createHmac("sha256", process.env.SHNELL_WEBHOOK_SECRET)
    .update(t + "." + req.body.toString("utf8")).digest("hex");
  const fresh = Math.abs(Date.now() / 1000 - Number(t)) < 300;
  if (!v1 || !fresh || !crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected))) {
    return res.status(400).end();
  }
  const event = JSON.parse(req.body);
  // event.type: "order.searching" | "order.assigned" | "order.delivered" | …
  //   or "order.offer": a driver's counter-offer -> event.data.offer { driverId, amount }
  //   accept it: POST /orders/{event.data.orderId}/offers/{driverId}/accept {"amount": amount}
  res.status(200).end();   // answer fast (5 s timeout), then do the work
});`;

  toggle(id: string): void { this.open.has(id) ? this.open.delete(id) : this.open.add(id); }

  bodyOf(e: Endpoint): string { return e.id === 'create-order' ? this.orderBody : e.body || ''; }
  responseOf(e: Endpoint): string { return e.id === 'create-order' || e.id === 'get-order' ? this.orderResponse : e.response; }

  copy(text: string): void {
    navigator.clipboard?.writeText(text).then(() => toastSuccess('Copié')).catch(() => {});
  }
}

/** Public reference at /developers (no sign-in needed). */
@Component({
  selector: 'app-developers-page',
  standalone: true,
  imports: [ApiDocsComponent],
  template: '<app-api-docs [standalone]="true"></app-api-docs>',
})
export class DevelopersPageComponent {}
