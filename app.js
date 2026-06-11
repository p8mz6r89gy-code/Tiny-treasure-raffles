/* =============================================
   Tiny Treasure Raffles — App JavaScript
   ============================================= */

document.addEventListener('DOMContentLoaded', async () => {

    // --- Load Stripe config ---
    let config = { stripePublishableKey: '', stripeConfigured: false, ticketPrice: 1 };
    try {
        const resp = await fetch('/api/config');
        config = await resp.json();
        console.log('✓ Config loaded:', config.stripeConfigured ? 'Stripe live' : 'Placeholder mode');
    } catch (e) {
        console.warn('Could not load config:', e.message);
    }

    // --- Mobile Menu Toggle ---
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mainNav = document.getElementById('mainNav');

    if (mobileMenuBtn && mainNav) {
        mobileMenuBtn.addEventListener('click', () => {
            mainNav.classList.toggle('open');
            mobileMenuBtn.classList.toggle('active');
        });

        mainNav.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                mainNav.classList.remove('open');
                mobileMenuBtn.classList.remove('active');
            });
        });

        document.addEventListener('click', (e) => {
            if (!mainNav.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
                mainNav.classList.remove('open');
                mobileMenuBtn.classList.remove('active');
            }
        });
    }

    // --- Buy Tickets Modal ---
    const modalOverlay = document.getElementById('buyModal');
    const modalClose = document.getElementById('modalClose');
    const modalRaffleName = document.getElementById('modalRaffleName');
    const modalEmail = document.getElementById('modalEmail');
    const ticketQty = document.getElementById('ticketQty');
    const modalTotal = document.getElementById('modalTotal');
    const ticketInc = document.getElementById('ticketInc');
    const ticketDec = document.getElementById('ticketDec');
    const modalCheckout = document.getElementById('modalCheckout');
    const modalError = document.getElementById('modalError');
    const modalLoading = document.getElementById('modalLoading');

    let currentRaffle = '';
    let currentRaffleId = '';
    let quantity = 5;
    const TICKET_PRICE = config.ticketPrice || 1;

    // Raffle data mapping (for ID lookup)
    const raffleMap = {
        'LEGO Icons Castle': 'lego-castle',
        'Nintendo Switch OLED': 'nintendo-switch',
        'LEGO Technic Porsche': 'lego-porsche',
    };

    // Open modal
    document.querySelectorAll('.buy-tickets-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentRaffle = btn.dataset.raffle || 'Raffle';
            currentRaffleId = raffleMap[currentRaffle] || '';
            modalRaffleName.textContent = currentRaffle;
            quantity = 5;
            modalEmail.value = '';
            modalError.classList.remove('visible');
            modalError.textContent = '';
            modalLoading.style.display = 'none';
            updateModalDisplay();
            modalOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
            // Focus email field
            setTimeout(() => modalEmail?.focus(), 200);
        });
    });

    // Close modal
    function closeModal() {
        modalOverlay.classList.remove('active');
        document.body.style.overflow = '';
        modalLoading.style.display = 'none';
    }

    if (modalClose) {
        modalClose.addEventListener('click', closeModal);
    }

    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // Quantity controls
    if (ticketInc) {
        ticketInc.addEventListener('click', () => {
            if (quantity < 500) {
                quantity++;
                updateModalDisplay();
            }
        });
    }

    if (ticketDec) {
        ticketDec.addEventListener('click', () => {
            if (quantity > 1) {
                quantity--;
                updateModalDisplay();
            }
        });
    }

    function updateModalDisplay() {
        ticketQty.textContent = quantity;
        modalTotal.textContent = `£${(quantity * TICKET_PRICE).toFixed(2)}`;
    }

    // Enter key on email field triggers checkout
    if (modalEmail) {
        modalEmail.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleCheckout();
            }
        });
    }

    // Checkout handler
    if (modalCheckout) {
        modalCheckout.addEventListener('click', handleCheckout);
    }

    async function handleCheckout() {
        const email = modalEmail.value.trim();

        // Validate email
        if (!email) {
            showError('Please enter your email address');
            modalEmail?.focus();
            return;
        }

        if (!email.includes('@') || !email.includes('.')) {
            showError('Please enter a valid email address');
            modalEmail?.focus();
            return;
        }

        // Validate quantity
        if (quantity < 1 || quantity > 500) {
            showError('Ticket quantity must be between 1 and 500');
            return;
        }

        // Show loading
        showLoading(true);
        hideError();

        try {
            console.log(`🛒 Checkout: ${quantity}× ${currentRaffle} — ${email}`);

            const resp = await fetch('/api/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    raffleId: currentRaffleId,
                    raffleName: currentRaffle,
                    quantity,
                    email,
                }),
            });

            const data = await resp.json();

            if (!resp.ok) {
                throw new Error(data.error || 'Something went wrong');
            }

            console.log('✓ Checkout session created, redirecting...');
            window.location.href = data.sessionUrl;
        } catch (err) {
            console.error('Checkout error:', err);
            showError(err.message || 'Failed to start checkout. Please try again.');
            showLoading(false);
        }
    }

    function showError(msg) {
        if (modalError) {
            modalError.textContent = msg;
            modalError.classList.add('visible');
        }
    }

    function hideError() {
        if (modalError) {
            modalError.classList.remove('visible');
            modalError.textContent = '';
        }
    }

    function showLoading(visible) {
        if (modalLoading) {
            modalLoading.style.display = visible ? 'flex' : 'none';
        }
        if (modalCheckout) {
            modalCheckout.disabled = visible;
        }
    }

    // --- Smooth scroll for nav links ---
    function setupSmoothScroll(selector, targetId) {
        document.querySelectorAll(selector).forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.getElementById(targetId);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            });
        });
    }

    setupSmoothScroll('a[href="#raffles"]', 'raffles');
    setupSmoothScroll('a[href="#winners"]', 'winners');
    setupSmoothScroll('a[href="#trust"]', 'trust');

    // --- Animate progress bars on scroll ---
    const progressFills = document.querySelectorAll('.progress-fill');
    if (progressFills.length && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const width = entry.target.dataset.targetWidth || '0%';
                    entry.target.style.transition = 'width 0.8s ease';
                    entry.target.style.width = width;
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.3 });

        progressFills.forEach(fill => {
            const width = fill.style.width;
            fill.dataset.targetWidth = width;
            fill.style.width = '0%';
            observer.observe(fill);
        });
    }

    console.log('✨ Tiny Treasure Raffles loaded!');
});