# n8n-nodes-veridion

An [n8n](https://n8n.io) community node for the Veridion company data APIs. It currently includes three operations inside a single `Veridion` node:

- `Enrich Company`
- `Company Search`
- `Supplier Search`

---

## What it does

- **Enrich Company** matches a known company and returns the enriched Veridion company profile.
- **Company Search** discovers companies using location, industry, NAICS, keyword, and company-size filters.
- **Supplier Search** discovers suppliers using grouped product keyword logic plus optional supplier and company-level filters.

---

## Installation

### Community Nodes UI (n8n ≥ 0.187)

1. Open your n8n instance → **Settings → Community Nodes**.
2. Click **Install a community node**.
3. Enter `n8n-nodes-veridion` and confirm.

### Manual (self-hosted)

```bash
cd ~/.n8n/custom   # or your n8n custom-extensions path
npm install n8n-nodes-veridion
```

Restart n8n after installation.

---

## Credentials

Create a **Veridion API** credential in n8n and paste your Veridion API key into the **API Key** field. The key is sent via the `x-api-key` request header.

---

## Enrich Company

### Required

| Parameter | Description | API field |
|---|---|---|
| Legal Name | Official registered name | `legal_names` (array) |
| Commercial Name | Trading / brand name | `commercial_names` (array) |

### Optional

| Parameter | Description | API field |
|---|---|---|
| Website | Company website domain or URL | `website` |
| Address | Free-text address | `address_txt` |
| Phone Number | Company phone number | `phone_number` |
| Registry ID | Company registry or tax ID | `registry_id` |
| Minimum Confidence Score | Match threshold 0–1 (default `0.6`) | `min_confidence_score` query param |

Empty optional fields are stripped from the request body before sending.

---

## Search Operations

### Company Search

- Shared filters: country, region, city, postcode, industries, NAICS, employee count, revenue, year founded, page size, pagination token
- Company-only filters: keywords, exclude keywords, keyword strictness
- Industry values are loaded live from `GET /industries/v0`

### Supplier Search

- Shared filters: country, region, city, postcode, industries, NAICS, employee count, revenue, year founded, page size, pagination token
- Supplier-only filters:
  - `Product Keywords Group 1`
  - `Product Keywords Group 2`
  - `Product Keywords Group 3`
  - `Product Exclude Keywords`
  - `Supplier Types`
  - `Proximity Address`
  - `Proximity Radius`
  - `Proximity Unit`
- Supplier keyword groups follow the Make-style logic:
  - OR within a group
  - AND across groups

## Output structure

### Successful match (`HTTP 200`)

The full Veridion company JSON object is passed through as the node output. Example top-level keys:

```json
{
  "legal_name": "Acme Corporation",
  "website_domain": "acme.com",
  "main_country_code": "US",
  "employee_count": 520,
  "revenue_range": "10M-50M",
  "industries": ["Manufacturing", "Industrial Machinery"],
  ...
}
```

### No match (`HTTP 202`)

```json
{
  "matched": false,
  "reason": "No match found above the requested confidence threshold"
}
```

### Errors

`400` responses surface the API's error message as a descriptive `NodeApiError`. All other non-2xx statuses also throw a `NodeApiError` with the HTTP status code attached.

---

## Edge cases

- If neither **Legal Name** nor **Commercial Name** is filled in, the node throws a descriptive error **before** making any API call.
- `legal_names` and `commercial_names` are always sent as arrays (Veridion API requirement), even though the node accepts a single string.
- Optional fields with empty string values are stripped from the request body.
- Search responses can be returned either as one item per company or as a single full-response item, depending on `Output Mode`.

---

## Development

```bash
git clone https://github.com/veridion/n8n-nodes-veridion.git
cd n8n-nodes-veridion
npm install
npm run build   # compile TypeScript → dist/
npm run dev     # watch mode
npm run lint    # ESLint check
```

---

## License

MIT — see [LICENSE](LICENSE).
