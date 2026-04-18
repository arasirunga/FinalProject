const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.static("public"));
const path = require("path");

app.use(express.static(path.join(__dirname, "public")));

app.use(bodyParser.json());

// PostgreSQL connection
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'FinalProject',
  password: 'arasi',
  port: 5432,
});

/* =========================
   LOGIN ENDPOINT
========================= */


app.get("/ping", (req, res) => {
  res.send("pong");
});



app.post("/login", async (req, res) => {
  const { email, password} = req.body;

  try {
    const result = await pool.query(
      `
      SELECT id, name, email, role, password_hash
      FROM users
      WHERE LOWER(email) = LOWER($1)
      `,
      [email.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    const user = result.rows[0];

    // TEMP: plain text comparison
    if (password.trim() !== user.password_hash) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password"
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ success: false });
  }
});


/* =========================
   RATES ENDPOINT
========================= */
app.get('/api/rates', async (req, res) => {
  const { origin, destination, incoterm } = req.query;

  try {
    const result = await pool.query(
      `
      SELECT cost_item, rate_per_mt
      FROM logistics_rates
      WHERE origin = $1
        AND destination = $2
        AND incoterm = $3
      `,
      [origin, destination, incoterm]
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Rates query error:', err);
    res.status(500).json({ error: 'Failed to fetch rates' });
  }
});



app.post("/api/orders", async (req, res) => {
  const {
    user_id,
    commodity,
    tonnage,
    origin,
    destination,
    incoterm,
    total_price
  } = req.body;

  try {
    const result = await pool.query(
      `
      INSERT INTO orders
      (user_id, commodity, tonnage, origin, destination, incoterm, total_price)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        user_id,
        commodity,
        tonnage,
        origin,
        destination,
        incoterm,
        total_price
      ]
    );

    res.json({
      success: true,
      order: result.rows[0]
    });
  } catch (err) {
    console.error("Order insert error:", err);
    res.status(500).json({ success: false });
  }
});

app.get("/api/orders", async (req, res) => {
  const { user_id, role } = req.query;

  try {
    let result;

    if (role === "ADMIN") {
      // Admin sees all orders + client info
      result = await pool.query(`
        SELECT o.*, u.name AS client_name, u.email
        FROM orders o
        JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
      `);
    } else {
      // Client sees only their own orders
      result = await pool.query(
        `
        SELECT *
        FROM orders
        WHERE user_id = $1
        ORDER BY created_at DESC
        `,
        [user_id]
      );
    }

    res.json(result.rows);

  } catch (err) {
    console.error("Fetch orders error:", err);
    res.status(500).json({ success: false });
  }
});

/* =========================
   CONFIRM ORDER ENDPOINT
========================= */
app.post("/api/orders/:id/toggle-status", async (req, res) => {
  const { id } = req.params;

  try {
    // First get the current status
    const currentOrder = await pool.query(
      "SELECT status FROM orders WHERE id = $1",
      [id]
    );

    if (currentOrder.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Order not found" 
      });
    }

    // Toggle the status
    const newStatus = currentOrder.rows[0].status === 'CONFIRMED' ? 'PENDING' : 'CONFIRMED';

    const result = await pool.query(
      `
      UPDATE orders
      SET status = $1
      WHERE id = $2
      RETURNING *
      `,
      [newStatus, id]
    );

    res.json({
      success: true,
      message: `Order status changed to ${newStatus}`,
      order: result.rows[0]
    });

  } catch (err) {
    console.error("Toggle order status error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Failed to update order status" 
    });
  }
});

/* =========================
   SERVER START
========================= */
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
