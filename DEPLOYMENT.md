# Deployment Guide — Tiny Treasure Raffles

## Domain
**Production URL:** `https://thetinytreasures.co.uk`

## Recommended Hosting: **Railway** (top choice)

### Why Railway over alternatives

| Feature | Railway | Render | Fly.io |
|---------|---------|--------|--------|
| Node.js support | ✅ Native | ✅ Native | ✅ Native |
| Free tier | ✅ Generous | ✅ Limited | ✅ Limited |
| Custom domain + SSL | ✅ Auto | ✅ Auto | ✅ Manual |
| GitHub auto-deploy | ✅ Yes | ✅ Yes | ✅ Yes |
| .env management | ✅ Dashboard UI | ✅ Dashboard UI | ✅ CLI + toml |
| UK region | ✅ Yes (London) | ✅ Yes (Frankfurt) | ✅ Yes (London) |
| Stripe webhook support | ✅ Public URL | ✅ Public URL | ✅ Public URL |
| Ease of setup | ⭐ Easiest | ⭐ Easy | ⚠️ More complex |
| Persistent disk (SQLite) | ✅ Yes (Volumes) | ✅ Yes (Disks) | ✅ Yes (Volumes) |

**Railway is recommended because:**
1. **Simplest onboarding** — connect GitHub repo, Railway auto-detects Node.js, sets `npm start`, exposes PORT
2. **Built-in SSL + custom domain** — add `thetinytreasures.co.uk` in dashboard, SSL auto-provisioned
3. **UK (London) region** available — keeps latency low for UK-based parents
4. **Environment variables** — easy dashboard UI for Stripe keys, admin password, SITE_URL
5. **Starter plan ($5-10/mo)** — plenty for a raffle site with moderate traffic, or generous free tier to start

### Alternative: Render
- Also excellent — simple Node.js deployment
- Auto-deploys from GitHub, custom domains with SSL
- Slightly slower cold starts on free tier

### Alternative: Fly.io
- More config required (`fly.toml`, Dockerfile optional)
- Less beginner-friendly for non-devs
- Better for apps needing global edge deployment

## Deployment Steps (Railway)

### 1. Push to GitHub
Code is already pushed to `p8mz6r89gy-code/Tiny-treasure-raffles`.

### 2. Create Railway Project
1. Go to [railway.app](https://railway.app) → New Project
2. Select "Deploy from GitHub repo"
3. Connect `p8mz6r89gy-code/Tiny-treasure-raffles`
4. Railway auto-detects Node.js and runs `npm start`

### 3. Set Environment Variables
In Railway dashboard → Variables, add:

| Variable | Value |
|----------|-------|
| `SITE_URL` | `https://thetinytreasures.co.uk` |
| `STRIPE_SECRET_KEY` | `sk_live_...` (from Stripe dashboard) |
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` (from Stripe dashboard) |
| `ADMIN_PASSWORD` | `your-secure-password` |
| `PORT` | `3000` (Railway sets this automatically) |

### 4. Add Custom Domain
1. Railway dashboard → Settings → Custom Domain
2. Add `thetinytreasures.co.uk`
3. Update DNS: point CNAME `@` to Railway's provided endpoint
4. SSL auto-provisioned

### 5. Stripe Webhook
1. Stripe Dashboard → Webhooks → Add endpoint
2. URL: `https://thetinytreasures.co.uk/api/webhook`
3. Events: `checkout.session.completed`
4. Use signing secret as `STRIPE_WEBHOOK_SECRET` env var

## Production Checklist

- [ ] Replace Stripe test keys with live keys in Railway env vars
- [ ] Change `ADMIN_PASSWORD` to a strong unique password
- [ ] Verify SITE_URL env var points to the production domain
- [ ] Test checkout flow end-to-end on the live domain
- [ ] Set up Stripe webhook for payment confirmations
- [ ] Monitor logs for any errors after deploy
- [ ] Consider adding a database (PostgreSQL via Railway) for persistent order storage