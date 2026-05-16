/*!
 * CheekyCart — Reusable cart engine for Cheeky Tees private stores
 * Plain JS IIFE, no dependencies. Sets window.CheekyCart.
 * Connects to: POST /api/intake/web (fields: customerName, email, phone, product, quantity, notes)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'cheeky_cart';

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch (e) { return []; }
  }

  function save(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    document.dispatchEvent(new CustomEvent('cheeky:cart:updated', { detail: { cart: cart } }));
  }

  var CheekyCart = {
    get: function () { return load(); },

    add: function (item) {
      var cart = load();
      var existing = null;
      for (var i = 0; i < cart.length; i++) {
        if (cart[i].sku === item.sku && cart[i].size === item.size) { existing = cart[i]; break; }
      }
      if (existing) {
        existing.qty += (item.qty || 1);
      } else {
        cart.push({ sku: item.sku, name: item.name, type: item.type, size: item.size,
          qty: item.qty || 1, unitPrice: item.unitPrice, storeId: item.storeId || '' });
      }
      save(cart);
    },

    updateQty: function (index, qty) {
      var cart = load();
      if (qty <= 0) { cart.splice(index, 1); }
      else if (cart[index]) { cart[index].qty = qty; }
      save(cart);
    },

    remove: function (index) {
      var cart = load();
      cart.splice(index, 1);
      save(cart);
    },

    clear: function () { save([]); },

    total: function () {
      return load().reduce(function (s, i) { return s + (i.unitPrice * i.qty); }, 0);
    },

    count: function () {
      return load().reduce(function (s, i) { return s + i.qty; }, 0);
    },

    /**
     * Build payload for POST /api/intake/web
     * @param {{ firstName: string, lastName: string, email: string, phone?: string, notes?: string }} customerInfo
     * @returns {Object} { customerName, email, phone, product, quantity, notes }
     */
    buildIntakePayload: function (customerInfo) {
      var cart = load();
      var lines = cart.map(function (item) {
        return item.qty + 'x ' + item.name + ' (' + item.sku + ') Size: ' + item.size;
      });
      var storeName = cart.length ? (cart[0].storeId || 'store') : 'store';
      var estTotal = CheekyCart.total();
      var fullName = [customerInfo.firstName, customerInfo.lastName].filter(Boolean).join(' ') || 'Customer';
      var extraNotes = ['Store: ' + storeName, 'Est. subtotal: $' + estTotal.toFixed(2), customerInfo.notes || '']
        .filter(Boolean).join(' | ');

      return {
        customerName: fullName,
        email: customerInfo.email || '',
        phone: customerInfo.phone || '',
        product: 'Uniform Order: ' + lines.join(', '),
        quantity: CheekyCart.count(),
        notes: extraNotes
      };
    }
  };

  window.CheekyCart = CheekyCart;
})();
