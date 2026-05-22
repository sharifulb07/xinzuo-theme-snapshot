import { Component } from '@theme/component';
import { CartAddEvent } from '@theme/events';

class BundleBuilderComponent extends Component {
  #selected = new Set();
  #productMap = new Map();
  #tiers = [];

  #minItems = 3;
  #maxItems = 8;
  #isAdding = false;

  #activeTab = 'all';

  connectedCallback() {
    super.connectedCallback();
    this.#init();
  }

  #init() {
    this.#parseConfig();
    this.#parseProducts();
    this.#bindTabSystem();
    this.#render();
  }

  // ---------------- CONFIG ----------------

  #parseConfig() {
    const n = (v, d) => {
      const num = Number.parseInt(v, 10);
      return Number.isFinite(num) ? num : d;
    };

    this.#minItems = n(this.dataset.minItems, 3);
    this.#maxItems = n(this.dataset.maxItems, 8);

    try {
      this.#tiers = JSON.parse(this.dataset.tiers || '[]')
        .filter(t => t?.minItems)
        .sort((a, b) => a.minItems - b.minItems);
    } catch {
      this.#tiers = [];
    }
  }

  #parseProducts() {
    const cards = this.refs.cards ?? [];

    for (const c of cards) {
      const id = c.dataset.productId;
      if (!id) continue;

      this.#productMap.set(id, {
        variantId: c.dataset.variantId,
        price: Number(c.dataset.price) || 0,
        title: c.dataset.title || '',
        image: c.dataset.image || '',
      });
    }
  }

  // ---------------- SELECTION ----------------

  handleCardClick(e) {
    const card = e.target.closest('.bundle-card');
    if (!card || card.dataset.available === 'false') return;

    const id = card.dataset.productId;
    if (!id) return;

    const isSelected = this.#selected.has(id);

    if (isSelected) {
      this.#selected.delete(id);
      card.classList.remove('bundle-card--selected');
      card.setAttribute('aria-pressed', 'false');
    } else {
      if (this.#selected.size >= this.#maxItems) return this.#shake();
      this.#selected.add(id);
      card.classList.add('bundle-card--selected');
      card.setAttribute('aria-pressed', 'true');
    }

    this.#render();
  }

  // ---------------- CART ----------------

  async handleAddToCart() {
    if (this.#isAdding || this.#selected.size < this.#minItems) return;

    this.#isAdding = true;
    const btn = this.refs.addToCartBtn;

    const prev = btn?.textContent;
    if (btn) {
      btn.textContent = 'Adding...';
      btn.disabled = true;
    }

    try {
      const bundleId = `bundle_${Date.now()}`;
      const count = this.#selected.size;

      const tier = [...this.#tiers]
        .reverse()
        .find(t => count >= t.minItems);

      const discount = tier?.discountPercent ?? 0;
      const discountCode = tier?.discountCode ?? '';

      const items = [...this.#selected]
        .map(id => this.#productMap.get(id))
        .filter(Boolean)
        .map(p => ({
          id: Number(p.variantId),
          quantity: 1,
          properties: {
            _bundle_id: bundleId,
            _bundle_count: String(count),
            _bundle_discount_percent: String(discount),
            _bundle_discount_code: discountCode,
          }
        }));

      await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      const cart = await fetch('/cart.js').then(r => r.json());

      document.dispatchEvent(
        new CartAddEvent({}, this.dataset.sectionId, {
          source: 'bundle-builder',
          itemCount: cart.item_count,
        })
      );

      if (btn) btn.textContent = 'Added!';
      setTimeout(() => {
        if (btn) {
          btn.textContent = prev;
          btn.disabled = false;
        }
        this.#isAdding = false;
      }, 2000);

    } catch (err) {
      console.error(err);
      if (btn) btn.textContent = 'Try Again';
      this.#isAdding = false;
    }
  }

  // ---------------- UI RENDER ----------------

  #render() {
    const count = this.#selected.size;

    this.#updateSummary(count);
    this.#updateProgress(count);
    this.#updateTotals(count);
    this.#updateCTA(count);
  }

  #updateSummary(count) {
    const bar = this.refs.summaryBar;
    bar?.classList.toggle('bundle-summary--visible', count > 0);

    if (this.refs.countText) {
      this.refs.countText.textContent = `${count}/${this.#maxItems}`;
    }
  }

  #updateCTA(count) {
    const btn = this.refs.addToCartBtn;
    if (!btn) return;
    btn.disabled = count < this.#minItems || this.#isAdding;
  }

  // ---------------- PROGRESS ----------------

  #updateProgress(count) {
    const fill = this.refs.progressFill;
    if (!fill) return;

    const maxTier = this.#tiers.at(-1)?.minItems || this.#maxItems;
    const pct = Math.min((count / maxTier) * 100, 100);

    fill.style.width = `${pct}%`;
  }

  // ---------------- TOTALS ----------------

  #updateTotals(count) {
    let total = 0;

    for (const id of this.#selected) {
      total += this.#productMap.get(id)?.price || 0;
    }

    const tier = [...this.#tiers]
      .reverse()
      .find(t => count >= t.minItems);

    const discount = tier?.discountPercent ?? 0;

    const savings = Math.round(total * discount / 100);
    const final = total - savings;

    if (this.refs.totalPrice) {
      this.refs.totalPrice.textContent = this.#money(final);
    }

    if (this.refs.totalSavings) {
      this.refs.totalSavings.textContent =
        savings ? `Save ${this.#money(savings)}` : '';
    }
  }

  // ---------------- TABS ----------------

  #bindTabSystem() {
    const tabs = this.refs.tabs ?? [];

    tabs.forEach(t => {
      t.addEventListener('click', () => {
        this.#activeTab = t.dataset.series;
        this.#filter();
      });
    });
  }

  #filter() {
    const cards = this.refs.cards ?? [];

    for (const c of cards) {
      const series = (c.dataset.series || '').split(' ');
      const ok = this.#activeTab === 'all' || series.includes(this.#activeTab);

      c.hidden = !ok;
    }
  }

  // ---------------- HELPERS ----------------

  #money(cents) {
    return `$${(cents / 100).toFixed(2)}`;
  }

  #shake() {
    const btn = this.refs.addToCartBtn;
    if (!btn) return;
    btn.classList.add('shake');
    setTimeout(() => btn.classList.remove('shake'), 400);
  }
}

customElements.define('bundle-builder-component', BundleBuilderComponent);