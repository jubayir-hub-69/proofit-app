# Proofit

Read-only desk for airdrops, campaigns, and gas-adjusted net ROI.

Copy `.env.example` to `.env.local`, then start the app:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Paste a watch address in the top bar. The dashboard and ledger load `GET /api/ledger` for that address.

`NEXT_PUBLIC_COVALENT_API_KEY` is the preferred history source for `POST /api/wallets/sync`. `NEXT_PUBLIC_ALCHEMY_KEY` is next. With neither key, sync reads public RPCs (`https://mainnet.base.org`, `https://arb1.arbitrum.io/rpc`, and a public Polygon endpoint) via `eth_getLogs` and transaction receipts. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` persist the book. Apply `supabase/schema.sql` first. `TELEGRAM_BOT_TOKEN` and `DATABASE_URL` stay on the server.

Wallet sync in the top bar stores a public watch address in the browser. Proofit does not connect a wallet and does not ask for a signature.

## Ledger API

`POST /api/wallets/sync` accepts `{ "address": "0x…", "chains": [8453, 42161, 137] }` and indexes Base, Arbitrum, and Polygon.

`GET /api/ledger?address=0x…` returns gas-adjusted ROI, a campaign breakdown, and the indexed rows. `value_usd` counts claim credit and inbound transfers. Swap notional is kept on the row and is not treated as profit. `PATCH /api/transactions` sets the type or campaign on an unclassified row. The ledger page can export those rows as CSV.
