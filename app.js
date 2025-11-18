import React from "react";
import "./App.css";

function App() {
  return (
    <div className="landing-container">

      <header className="header">
        <h1>Ramazone Online Store</h1>
        <p>Local to Digital — Fast Delivery within 24 Hours</p>
      </header>

      <section className="hero">
        <h2>Pure, Fresh & Affordable Products</h2>
        <p>Connecting Local Vendors with You</p>
        <button className="cta">Shop Now</button>
      </section>

      <section className="features">
        <div className="card">
          <h3>✔ Fast Delivery</h3>
          <p>Guaranteed delivery within 24 hours.</p>
        </div>

        <div className="card">
          <h3>✔ Best Prices</h3>
          <p>Local vendor pricing with online convenience.</p>
        </div>

        <div className="card">
          <h3>✔ Trusted Service</h3>
          <p>Verified vendors & transparent process.</p>
        </div>
      </section>

      <footer className="footer">
        <p>© 2025 Ramazone Online Store. All Rights Reserved.</p>
      </footer>

    </div>
  );
}

export default App;