import React, { useState } from 'react';

export default function POS() {
  const [cart, setCart] = useState([]);

  const menus = [
    { id: 1, name: 'V60 Gayo', price: 25000, category: 'Manual Brew' },
    { id: 2, name: 'Kopi Susu Gula Aren', price: 22000, category: 'Espresso Based' },
    { id: 3, name: 'Nasi Goreng Spesial', price: 35000, category: 'Food' },
    { id: 4, name: 'French Fries', price: 15000, category: 'Snacks' },
  ];

  const addToCart = (menu) => {
    const existing = cart.find(item => item.id === menu.id);
    if (existing) {
      setCart(cart.map(item => item.id === menu.id ? { ...item, qty: item.qty + 1 } : item));
    } else {
      setCart([...cart, { ...menu, qty: 1 }]);
    }
  };

  const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

  return (
    <div style={{ display: 'flex', gap: '2rem', height: 'calc(100vh - 4rem)' }}>
      {/* Menu Grid */}
      <div style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
        <h1 className="page-title" style={{ marginBottom: '1.5rem' }}>Point of Sale</h1>
        <div className="grid-cols-3">
          {menus.map(menu => (
            <div 
              key={menu.id} 
              className="card" 
              style={{ cursor: 'pointer', textAlign: 'center' }}
              onClick={() => addToCart(menu)}
            >
              <div style={{ height: '100px', backgroundColor: 'var(--bg-dark)', borderRadius: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '2rem', opacity: 0.2 }}>☕</span>
              </div>
              <div style={{ fontWeight: 'bold' }}>{menu.name}</div>
              <div className="text-primary" style={{ marginTop: '0.5rem' }}>Rp {menu.price.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h2 className="card-title" style={{ color: 'white', fontSize: '1.25rem', marginBottom: '1rem' }}>Current Order</h2>
        
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>Cart is empty</div>
          ) : (
            cart.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem 0', borderBottom: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{item.qty} x Rp {item.price.toLocaleString()}</div>
                </div>
                <div style={{ fontWeight: 'bold' }}>Rp {(item.qty * item.price).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ paddingTop: '1rem', borderTop: '2px dashed var(--border-color)', marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '1.25rem', fontWeight: 'bold' }}>
            <span>Total</span>
            <span className="text-primary">Rp {total.toLocaleString()}</span>
          </div>
          <button className="btn btn-success" style={{ width: '100%', padding: '1rem', fontSize: '1.1rem' }} disabled={cart.length === 0}>
            Pay Order
          </button>
        </div>
      </div>
    </div>
  );
}
