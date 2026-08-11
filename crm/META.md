# Meta Lead Ads — setup guide

How to connect Star Gardens' Facebook and Instagram lead ads to the CRM, so a
form submission becomes a lead automatically.

**The short version:** four values go into Supabase once. After that, everything
you change day to day — which ad account, which campaigns, which form fields —
is a click inside the CRM at **Settings → Integrations → Meta setup**. None of
it touches Vercel, and none of it needs a redeploy.

---

## 1. What you need before you start

| Thing | Where it comes from | Who can get it |
|---|---|---|
| A Meta **Business** account | business.facebook.com | Owner |
| A Facebook **Page** running the lead ads | Already exists | Owner |
| An **ad account** under that business | Already exists | Owner |
| A Meta **app** (type: Business) | developers.facebook.com | Owner or developer |

You do **not** need Meta App Review or a "verified business" for this to work
with your *own* Page and *own* ad account. Review is only required to access
Pages you do not own.

---

## 2. Permissions

The integration uses two tokens, deliberately kept apart so a leak of one does
not expose the other.

### Ads token — reads campaigns and spend

| Permission | Why it is needed | What breaks without it |
|---|---|---|
| `ads_read` | List ad accounts, campaigns and daily spend | The ad-account list on the setup screen stays empty, and there is no spend or cost-per-lead |
| `ads_management` | *Only* if you later want the CRM to change campaigns | Nothing today — **do not request it** |

> Ask for `ads_read` alone. `ads_management` grants write access to your
> advertising, and the CRM never writes to Meta.

### Page token — reads lead forms and the submissions themselves

| Permission | Why it is needed | What breaks without it |
|---|---|---|
| `leads_retrieval` | Fetch the answers a customer submitted | Leads arrive as an empty shell with no name or number |
| `pages_show_list` | Identify which Pages the token covers | The form list cannot be built |
| `pages_read_engagement` | Read the Page's lead forms and their questions | The field-mapping screen has no questions to map |
| `pages_manage_metadata` | Subscribe the Page to the leadgen webhook | Meta never notifies us, so leads only appear on the next sync |

**Use a System User token, not a personal one.** A token tied to a person stops
working the day that person leaves or changes their password. In Business
Settings → Users → System Users, create a system user, give it access to the
Page and the ad account, then generate a token with the permissions above.

Set the token to **never expire** where Meta offers it. A 60-day token means
lead capture silently stops two months from now, on a day nobody is watching.

---

## 3. One-time configuration

These four values are Supabase Edge Function secrets. They are set once, from a
terminal, and never again.

```bash
supabase secrets set \
  META_ADS_ACCESS_TOKEN="<system user token with ads_read>" \
  META_PAGE_ACCESS_TOKEN="<page token with leads_retrieval>" \
  META_ALLOWED_PAGE_IDS="<your page id>" \
  META_APP_SECRET="<from the app's Basic Settings>" \
  META_VERIFY_TOKEN="<any long random string you invent>" \
  META_SYNC_INTERNAL_SECRET="<any long random string you invent>"
```

`META_APP_SECRET` is what proves an incoming webhook really came from Meta —
every request is checked against an `X-Hub-Signature-256` header computed over
the raw body. Without it, anyone who guesses the URL could post fake leads.

`META_VERIFY_TOKEN` is only used once, during the handshake in step 4. Invent
it; it is not issued by Meta.

**`META_AD_ACCOUNT_ID` is deliberately not in that list.** It used to be an
environment variable. It is now chosen in the CRM and stored in Supabase, so
switching account is a click rather than a deployment.

Then deploy the functions:

```bash
supabase functions deploy meta-webhook --no-verify-jwt
supabase functions deploy meta-sync
supabase functions deploy meta-insights-sync
```

`--no-verify-jwt` applies to the webhook **only**. Meta cannot send a Supabase
JWT, so that endpoint authenticates by signature instead. The other two keep JWT
verification, because they are called by the CRM and by cron.

---

## 4. Point Meta at the webhook

In your app on developers.facebook.com → **Webhooks** → **Page**:

- **Callback URL:** `https://<project-ref>.supabase.co/functions/v1/meta-webhook`
- **Verify token:** the `META_VERIFY_TOKEN` you invented above
- **Subscribe to field:** `leadgen`

Press **Verify and Save**. Meta immediately sends a `GET` with a challenge; if
the token matches, it saves. If it fails, the token does not match — that is
the only thing this step checks.

Then, still in the app, subscribe your Page to the app. A webhook that is
configured but whose Page is not subscribed produces no error anywhere and no
leads at all, which makes it the single most common way this setup silently
fails.

---

## 5. Set it up in the CRM

Everything from here is inside the CRM at
**Settings → Integrations → Meta setup**, and all of it is stored in Supabase.

### Step 1 — Choose the ad account

Press **Sync campaigns**. Within a few seconds the page lists every ad account
your token can reach. Click one.

That choice is now what every sync uses. Change it whenever you like; the next
scheduled sync picks it up within 10 minutes.

> Empty list? The token is missing `ads_read`. Meta returns an empty result
> rather than an error for this, which is why the screen says so explicitly.

### Step 2 — Choose the campaigns

Two options:

- **Every campaign on this account** — the simple choice, and right for most
  businesses.
- **Only the ones I tick** — for an account that also runs work this CRM should
  not be counting.

Unselected campaigns keep syncing their names, but their spend is not stored and
they are hidden from the Marketing screen.

### Step 3 — Connect the lead form fields

This is the step that matters, and the one people forget.

Meta gives every question on your form a machine name like
`what_is_your_name?` or `full_name`. The CRM has to be told which one is the
customer's name and which is their mobile number. Until it is, submissions from
that form are **held, not lost** — they appear under **Integration issues** as
`UNMAPPED_FORM`.

Beside each form in step 2 there is a **Connect fields** link. On that screen:

1. Match each Meta question to a CRM column.
2. **Name** and **Mobile** are both required. Email, location and requirement
   are optional.
3. One Meta question cannot fill two CRM columns, and one CRM column cannot be
   claimed by two questions.
4. Press **Save**. The whole mapping is validated together — a partial mapping
   is never saved, because a half-mapped form drops customers.

A green tick beside a form means it is connected. Anything else means leads from
it are waiting.

**Already missed some leads?** Connect the fields, then go to **Integration
issues** and press **Retry**. Nothing was thrown away.

---

## 6. What runs automatically

| Job | Frequency | What it does |
|---|---|---|
| `meta-webhook` | Instant | A customer submits a form → a lead appears in the CRM |
| `meta-sync` | Every **10 minutes** | Refreshes ad accounts, campaigns, lead forms and their links |
| `meta-insights-sync` | Every 30 minutes | Refreshes spend, impressions, clicks and cost per lead |

All three are scheduled with **Supabase Cron**, inside the database. There is no
Vercel Cron, so redeploying the website never disturbs them.

The Meta jobs ship **paused** until the secrets in step 3 exist. Enable them
with the SQL in
`supabase/migrations/20260810121200_pause_unconfigured_meta_cron.sql`.

---

## 7. Checking it works

1. **Settings → Integrations** — "Last campaign sync" should show a recent time.
2. **Meta setup** — step 1 shows *Connected*, step 3 shows *All connected*.
3. Use Meta's own **Lead Ads Testing Tool** to submit a fake lead against your
   form. It should appear in **Leads** within seconds, source `META_FACEBOOK`.
4. **Marketing → Ads** shows spend and cost per lead once insights have run.

---

## 8. When something is wrong

| What you see | What it means | Fix |
|---|---|---|
| Ad account list is empty | Token lacks `ads_read` | Regenerate the ads token with that permission |
| "No ad account has been selected" | Nobody has done step 1 | Choose an account on the setup screen |
| Leads under `UNMAPPED_FORM` | The form's fields are not connected | Step 3, then **Retry** on the issues page |
| Leads under `FAILED` | Something else went wrong | The issues page shows the reason; **Retry** after fixing |
| Webhook never fires | Page not subscribed to the app | Re-subscribe the Page in the app's Webhooks section |
| Everything stopped after ~60 days | The token expired | Reissue as a non-expiring System User token |
| Campaign names update but spend does not | Insights sync failing, or campaign not selected | Check the last insights sync time; check step 2 |

Nothing here is recoverable-by-guessing: every webhook Meta sends is stored
before it is processed, so a misconfiguration delays leads, it does not destroy
them.

---

## 9. Where each setting actually lives

Worth knowing when you are wondering what a change will affect.

| Setting | Stored in | Changing it needs |
|---|---|---|
| Access tokens, app secret, page ids | Supabase Edge Function secrets | `supabase secrets set` |
| **Which ad account** | Supabase `app_settings` | A click in the CRM |
| **Which campaigns** | Supabase `meta_campaigns.is_selected` | A click in the CRM |
| **Field mapping** | Supabase `meta_field_mappings` | A click in the CRM |
| **Lead cleaning rules** | Supabase `app_settings` | A click in the CRM |
| Sync frequency | Supabase Cron (`pg_cron`) | A migration |

Nothing operational lives in Vercel. That is intentional: the people who run
this business should be able to change how it works without a developer and
without a deployment.
