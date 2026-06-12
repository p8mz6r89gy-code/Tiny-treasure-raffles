const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Load .env only if it exists (not required for the bare static server)
try {
    require('dotenv').config();
} catch (e) {
    // .env not required
}

const app = express();
const PORT = process.env.PORT || 3000;
const SITE_URL = process.env.SITE_URL || 'https://thetinytreasures.co.uk';

// ---------------------------------------------------------------------------
// Stripe setup (graceful if no key configured)
// ---------------------------------------------------------------------------
let stripe = null;
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder';

if (stripeSecretKey && !stripeSecretKey.startsWith('sk_test_placeholder')) {
    try {
        stripe = require('stripe')(stripeSecretKey);
        console.log('✓ Stripe configured with live/real test key');
    } catch (e) {
        console.log('! Stripe initialization failed:', e.message);
    }
} else {
    console.log('! Stripe not configured — using placeholder mode (payment will show demo notice)');
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.set('trust proxy', 1); // Trust reverse proxy (Railway, Render, Fly.io)
app.use(cors());
app.use(express.json({
    // Webhook needs raw body — handled separately below
    verify: (req, _res, buf) => {
        if (req.url === '/api/webhook') {
            req.rawBody = buf.toString();
        }
    }
}));

// ---------------------------------------------------------------------------
// Static files — serve the frontend
// ---------------------------------------------------------------------------
const publicDir = __dirname;
app.use(express.static(publicDir, {
    setHeaders: (res, filePath) => {
        // Cache HTML/CSS/JS for better performance
        if (filePath.endsWith('.html')) {
            res.set('Cache-Control', 'no-cache');
        }
    }
}));

// ---------------------------------------------------------------------------
// API: GET /api/config — return Stripe publishable key for the frontend
// ---------------------------------------------------------------------------
app.get('/api/config', (_req, res) => {
    res.json({
        stripePublishableKey,
        siteUrl: SITE_URL,
        stripeConfigured: stripe !== null,
        ticketPrice: 1, // £1 per ticket
    });
});

// ---------------------------------------------------------------------------
// API: GET /api/raffles — return current raffles data (for dynamic frontend)
// ---------------------------------------------------------------------------
const RAFFLES = [
    {
        id: 'lego-castle',
        name: 'LEGO Icons Castle',
        emoji: '🧱',
        retailPrice: 249,
        maxTickets: 500,
        ticketsSold: 342,
        badge: { text: '🔥 Hot', type: 'hot' },
    },
    {
        id: 'nintendo-switch',
        name: 'Nintendo Switch OLED',
        emoji: '🎮',
        retailPrice: 279,
        maxTickets: 500,
        ticketsSold: 293,
        badge: { text: '⭐ Popular', type: 'popular' },
    },
    {
        id: 'lego-porsche',
        name: 'LEGO Technic Porsche',
        emoji: '🚗',
        retailPrice: 169,
        maxTickets: 500,
        ticketsSold: 137,
        badge: { text: '🆕 New', type: 'new' },
    },
];

app.get('/api/raffles', (_req, res) => {
    res.json(RAFFLES);
});

// ---------------------------------------------------------------------------
// API: POST /api/create-checkout-session — create Stripe Checkout session
// ---------------------------------------------------------------------------
app.post('/api/create-checkout-session', async (req, res) => {
    try {
        const { raffleId, raffleName, quantity, email } = req.body;

        // Validate
        if (!raffleName || !quantity || quantity < 1 || quantity > 500) {
            return res.status(400).json({ error: 'Invalid request — check raffle name and quantity (1–500)' });
        }

        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Please provide a valid email address' });
        }

        const amount = quantity * 100; // £1 = 100 pence (Stripe uses smallest currency unit)

        // If Stripe is not configured, return a simulated session URL
        if (!stripe) {
            console.log(`[PLACEHOLDER] Would create checkout: ${quantity}× ${raffleName} for ${email} = £${quantity}`);
            return res.json({
                sessionUrl: `${SITE_URL}/checkout-success.html?simulated=true&raffle=${encodeURIComponent(raffleName)}&qty=${quantity}&email=${encodeURIComponent(email)}`,
                simulated: true,
            });
        }

        // Create real Stripe Checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            customer_email: email,
            line_items: [
                {
                    price_data: {
                        currency: 'gbp',
                        product_data: {
                            name: `${quantity}× Ticket${quantity > 1 ? 's' : ''} — ${raffleName}`,
                            description: `Tiny Treasure Raffles — ${raffleName} Raffle`,
                        },
                        unit_amount: 100, // £1 per ticket in pence
                    },
                    quantity,
                },
            ],
            metadata: {
                raffleName,
                raffleId: raffleId || '',
                quantity: String(quantity),
            },
            success_url: `${SITE_URL}/checkout-success.html?session_id={CHECKOUT_SESSION_ID}&raffle=${encodeURIComponent(raffleName)}&qty=${quantity}`,
            cancel_url: `${SITE_URL}/?canceled=true`,
        });

        res.json({ sessionUrl: session.url });
    } catch (err) {
        console.error('Stripe session error:', err);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// ---------------------------------------------------------------------------
// API: POST /api/webhook — Stripe webhook for payment confirmation
// ---------------------------------------------------------------------------
app.post('/api/webhook', (req, res) => {
    const sig = req.headers['stripe-signature'];

    if (!stripe) {
        // Placeholder mode — just acknowledge
        return res.json({ received: true, simulated: true });
    }

    // In production, verify with stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret)
    let event;
    try {
        // Without a real webhook secret, we just parse the raw payload
        event = JSON.parse(req.rawBody);
    } catch (err) {
        console.error('Webhook parse error:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        console.log(`✓ Payment completed: ${session.metadata?.raffleName} — ${session.metadata?.quantity} tickets — ${session.customer_email}`);
        recordPurchase(session);
    }

    res.json({ received: true });
});

// ---------------------------------------------------------------------------
// In-memory data store (replace with real DB in production)
// ---------------------------------------------------------------------------

// Raffle status tracking
const raffleStatus = {
    'lego-castle': { status: 'active', winner: null, completedAt: null },
    'nintendo-switch': { status: 'active', winner: null, completedAt: null },
    'lego-porsche': { status: 'active', winner: null, completedAt: null },
};

// Orders/purchases store
const orders = [];
let nextOrderId = 1000;

// Seed demo orders
function seedDemoOrders() {
    const demoOrders = [
        { id: nextOrderId++, raffleId: 'lego-castle', raffleName: 'LEGO Icons Castle', quantity: 12, email: 'sarah.m@example.com', amount: 12, status: 'completed', createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
        { id: nextOrderId++, raffleId: 'nintendo-switch', raffleName: 'Nintendo Switch OLED', quantity: 8, email: 'james.b@example.com', amount: 8, status: 'completed', createdAt: new Date(Date.now() - 5 * 86400000).toISOString() },
        { id: nextOrderId++, raffleId: 'lego-porsche', raffleName: 'LEGO Technic Porsche', quantity: 5, email: 'priya.l@example.com', amount: 5, status: 'completed', createdAt: new Date(Date.now() - 7 * 86400000).toISOString() },
        { id: nextOrderId++, raffleId: 'lego-castle', raffleName: 'LEGO Icons Castle', quantity: 20, email: 'tom.e@example.com', amount: 20, status: 'completed', createdAt: new Date(Date.now() - 10 * 86400000).toISOString() },
        { id: nextOrderId++, raffleId: 'nintendo-switch', raffleName: 'Nintendo Switch OLED', quantity: 3, email: 'emma.k@example.com', amount: 3, status: 'completed', createdAt: new Date(Date.now() - 1 * 86400000).toISOString() },
        { id: nextOrderId++, raffleId: 'lego-castle', raffleName: 'LEGO Icons Castle', quantity: 15, email: 'alex.r@example.com', amount: 15, status: 'completed', createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
    ];
    demoOrders.forEach(o => orders.push(o));
    console.log(`✓ Seeded ${demoOrders.length} demo orders`);
}

function recordPurchase(session) {
    const order = {
        id: nextOrderId++,
        raffleId: session.metadata?.raffleId || 'unknown',
        raffleName: session.metadata?.raffleName || 'Unknown',
        quantity: parseInt(session.metadata?.quantity || '1'),
        email: session.customer_email || 'unknown@example.com',
        amount: parseInt(session.metadata?.quantity || '1'),
        status: 'completed',
        stripeSessionId: session.id || '',
        createdAt: new Date().toISOString(),
    };
    orders.push(order);
    console.log(`✓ Order recorded: #${order.id} — ${order.quantity}× ${order.raffleName} — ${order.email}`);
}

seedDemoOrders();

// ---------------------------------------------------------------------------
// Admin Auth
// ---------------------------------------------------------------------------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'tinytreasure2025';

function requireAdmin(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const token = auth.slice(7);
    if (token !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }
    next();
}

// ---------------------------------------------------------------------------
// API: POST /api/admin/login
// ---------------------------------------------------------------------------
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        return res.json({ success: true, token: ADMIN_PASSWORD });
    }
    res.status(401).json({ error: 'Invalid password' });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/stats
// ---------------------------------------------------------------------------
app.get('/api/admin/stats', requireAdmin, (_req, res) => {
    const totalRevenue = orders.reduce((sum, o) => sum + o.amount, 0);
    const totalTickets = orders.reduce((sum, o) => sum + o.quantity, 0);
    const totalOrders = orders.length;

    const raffleStats = RAFFLES.map(r => ({
        ...r,
        status: raffleStatus[r.id]?.status || 'active',
        winner: raffleStatus[r.id]?.winner,
        completedAt: raffleStatus[r.id]?.completedAt,
        orders: orders.filter(o => o.raffleId === r.id).length,
        revenue: orders.filter(o => o.raffleId === r.id).reduce((sum, o) => sum + o.amount, 0),
    }));

    res.json({
        totalRevenue,
        totalTickets,
        totalOrders,
        raffles: raffleStats,
        recentOrders: orders.slice(-20).reverse(),
    });
});

// ---------------------------------------------------------------------------
// API: GET /api/admin/orders
// ---------------------------------------------------------------------------
app.get('/api/admin/orders', requireAdmin, (_req, res) => {
    res.json({ orders: orders.slice().reverse() });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/raffles/:id/complete
// ---------------------------------------------------------------------------
app.post('/api/admin/raffles/:id/complete', requireAdmin, (req, res) => {
    const raffleId = req.params.id;
    const raffle = RAFFLES.find(r => r.id === raffleId);
    if (!raffle) {
        return res.status(404).json({ error: 'Raffle not found' });
    }

    if (raffleStatus[raffleId]?.status === 'completed') {
        return res.status(400).json({ error: 'Raffle already completed' });
    }

    // Pick a random winner from purchasers
    const purchasers = orders.filter(o => o.raffleId === raffleId && o.status === 'completed');
    if (purchasers.length === 0) {
        return res.status(400).json({ error: 'No purchasers for this raffle' });
    }

    // Weight by ticket quantity
    const weightedPool = [];
    purchasers.forEach(p => {
        for (let i = 0; i < p.quantity; i++) {
            weightedPool.push(p);
        }
    });
    const winner = weightedPool[Math.floor(Math.random() * weightedPool.length)];

    raffleStatus[raffleId] = {
        status: 'completed',
        winner: { email: winner.email, orderId: winner.id, quantity: winner.quantity },
        completedAt: new Date().toISOString(),
    };

    // Update tickets sold to max
    raffle.ticketsSold = raffle.maxTickets;

    res.json({
        success: true,
        raffle: raffle.name,
        winner: { email: winner.email, quantity: winner.quantity },
        message: `${raffle.name} completed! Winner: ${winner.email}`,
    });
});

// ---------------------------------------------------------------------------
// API: POST /api/admin/reset-raffle/:id
// ---------------------------------------------------------------------------
app.post('/api/admin/reset-raffle/:id', requireAdmin, (req, res) => {
    const raffleId = req.params.id;
    if (raffleStatus[raffleId]) {
        raffleStatus[raffleId] = { status: 'active', winner: null, completedAt: null };
        const raffle = RAFFLES.find(r => r.id === raffleId);
        if (raffle) {
            raffle.ticketsSold = orders.filter(o => o.raffleId === raffleId && o.status === 'completed').reduce((s, o) => s + o.quantity, 0);
        }
        return res.json({ success: true, message: 'Raffle reset to active' });
    }
    res.status(404).json({ error: 'Raffle not found' });
});

// ---------------------------------------------------------------------------
// Serve admin page
// ---------------------------------------------------------------------------
app.get('/admin', (_req, res) => {
    res.sendFile(path.join(publicDir, 'admin.html'));
});

app.get('/admin.html', (_req, res) => {
    res.sendFile(path.join(publicDir, 'admin.html'));
});

// ---------------------------------------------------------------------------
// Fallback for SPA
// ---------------------------------------------------------------------------
app.get('/checkout-success.html', (_req, res) => {
    res.sendFile(path.join(publicDir, 'checkout-success.html'));
});

app.get('/checkout-cancel.html', (_req, res) => {
    res.sendFile(path.join(publicDir, 'checkout-cancel.html'));
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('✨ Tiny Treasure Raffles Server');
    console.log(`   http://0.0.0.0:${PORT}`);
    console.log(`   Stripe: ${stripe ? '✓ Configured' : '○ Placeholder mode'}`);
    console.log(`   Admin: http://0.0.0.0:${PORT}/admin`);
    console.log('');
});