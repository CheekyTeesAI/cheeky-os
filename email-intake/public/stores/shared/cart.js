/*!
 * CheekyCart — Reusable cart engine for Cheeky Tees private stores
 * Plain JS IIFE, no dependencies. Sets window.CheekyCart.
 * Live: connects to /api/intake/create
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'cheeky_cart';

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function save(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    document.dispatchEvent(new CustomEvent('cheeky:cart:updated', { detail: { cart: cart } }));
  }

  var CheekyCart = {
    /** Returns current cart array */
    get: function () {
      return load();
    },

    /**
     * Add an item to the cart.
     * @param {{ sku: string, name: string, type: string, size: string, qty: number, unitPrice: number, storeId: string }} item
     */
    add: function (item) {
      var cart = load();
      // Look for exact match on sku + size to merge qty
      var existing = null;
      for (var i = 0; i < cart.length; i++) {
        if (cart[i].sku === item.sku && cart[i].size === item.size) {
          existing = cart[i];
          break;
        }
      }
      if (existing) {
        existing.qty += (item.qty || 1);
      } else {
        cart.push({
          sku: item.sku,
          name: item.name,
          type: item.type,
          size: item.size,
          qty: item.qty || 1,
          unitPrice: item.unitPrice,
          storeId: item.storeId || ''
        });
      }
      save(cart);
    },

    /**
     * Update quantity of item at index. If qty <= 0, removes item.
     * @param {number} index
     * @param {number} qty
     */
    updateQty: function (index, qty) {
      var cart = load();
      if (qty <= 0) {
        cart.splice(index, 1);
      } else if (cart[index]) {
        cart[index].qty = qty;
      }
      save(cart);
    },

    /**
     * Remove item at index.
     * @param {number} index
     */
    remove: function (index) {
      var cart = load();
      cart.splice(index, 1);
      save(cart);
    },

    /** Clear the entire cart */
    clear: function () {
      save([]);
    },

    /** Sum of unitPrice * qty for all items */
    total: function () {
      return load().reduce(function (sum, item) {
        return sum + (item.unitPrice * item.qty);
      }, 0);
    },

    /** Total item count (sum of qtys) */
    count: function () {
      return load().reduce(function (sum, item) {
        return sum + item.qty;
      }, 0);
    },

    /**
     * Build payload for POST /api/intake/create
     * Combines all cart line items into a single garment description.
     * @param {{ firstName: string, lastName: string, email: string, phone?: string, notes?: string }} customerInfo
     * @returns {Object} payload ready to POST
     */
    buildIntakePayload: function (customerInfo) {
      var cart = load();
      var lines = cart.map(function (item) {
        return item.qty + 'x ' + item.name + ' (' + item.sku + ') — Size: ' + item.size;
      });
      var garmentSummary = lines.join('\n');
      var total = CheekyCart.total();

      return {
        firstName: customerInfo.firstName || '',
        lastName: customerInfo.lastName || '',
        phone: customerInfo.phone || '',
        email: customerInfo.email || '',
        garment: garmentSummary,
        color: 'See order details',
        quantity: CheekyCart.count(),
        artDescription: 'SDPC approved logo (uniform program)',
        notes: [
          'Store: ' + (cart[0] ? cart[0].storeId : 'unknown'),
          'Est. subtotal: $' + total.toFixed(2),
          customerInfo.notes || ''
        ].filter(Boolean).join(' | '),
        rush: false,
        dueDate: ''
      };
    }
  };

  window.CheekyCart = CheekyCart;
})();
