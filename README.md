# Revenue Concentration & Top-Account Stress Test (Kleecks)

Next.js app (Vercel) showing licence-revenue concentration (HHI, top-N share), LVMH weight,
the Execus pass-through weight (gross / net) and a "lose the top N accounts" stress test
with remaining ARR, remaining contribution and months of cash runway.

## Data
- Zoho CRM (COQL): deals in stage `8. Client Won` with `Licence > 0`, using `Licence_Start_Date`,
  `Licence_End_Date`, `Licence_Lost`, `Final_Client`, `Grand_Total` (Providers cost).
- Zoho Books: invoices of the customer `EXECUS S.P.A.` (receivables panel).
- Snapshot is cached in memory for 3 hours per server instance; "Refresh" forces a reload.

## Vercel environment variables
See `.env.example`. OAuth scopes (comma separated when generating the grant token):
`ZohoCRM.coql.READ,ZohoCRM.modules.deals.READ,ZohoCRM.modules.accounts.READ,ZohoBooks.invoices.READ`

`APP_PASSWORD` protects the whole app; `AUTH_SECRET` signs the session cookie (any long random string).

## Zoho CRM Web Tab
Create a Web Tab with URL:

    https://<your-vercel-domain>/?key=<APP_PASSWORD>

The key is swapped for a secure cookie (SameSite=None) and removed from the address bar.
Anyone who can see the Web Tab configuration can read the password, so restrict the tab to the right profiles.
Without the key, the app shows a password form (works in the iframe too).
Embedding is allowed only from Zoho domains (`FRAME_ANCESTORS` to change).

If a browser blocks third-party cookies in the iframe (e.g. Safari), the key URL still works on each load.

## Maintaining the group mapping
`lib/groups.ts` maps brands to corporate groups (LVMH, Prada Group, Kering…) and defines the pass-through partner.

## Local check
    npm install
    npm run build
    npm run test:model -- path/to/coql-export.json
