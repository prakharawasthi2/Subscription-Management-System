const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'your_jwt_secret_key';

const corsOptions = {
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500'], // Allow both localhost and 127.0.0.1 for frontend
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MySQL connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'prakhar@2006',
  database: 'subscription_management'
});

db.connect(err => {
  if (err) {
    console.error('Database connection failed:', err);
    return;
  }
  console.log('Connected to MySQL database.');
});

const saltRounds = 10;

// Generate JWT token
function generateToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
}

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Forbidden' });
    req.user = user;
    next();
  });
}

// User registration endpoint
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Please provide all required fields.' });
  }

  // Check if user exists
  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (results.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    bcrypt.hash(password, saltRounds, (err, hash) => {
      if (err) return res.status(500).json({ message: 'Error hashing password' });

      // Insert user
      db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hash], (err, results) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.status(201).json({ message: 'User registered successfully' });
      });
    });
  });
});

// User login endpoint
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Please provide email and password.' });
  }

  db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (results.length === 0) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const user = results[0];
    bcrypt.compare(password, user.password, (err, match) => {
      if (err) return res.status(500).json({ message: 'Error comparing passwords' });
      if (!match) return res.status(400).json({ message: 'Invalid email or password' });

      // Generate JWT token
      const token = generateToken(user);
      res.json({ message: 'Login successful', token });
    });
  });
});

app.post('/api/settings', authenticateToken, (req, res) => {
  const { name, email, emailReminders } = req.body;
  const userId = req.user.id;

  if (!name || !email) {
    return res.status(400).json({ message: 'Name and email are required' });
  }

  db.query(
    'UPDATE users SET name = ?, email = ?, email_reminders_enabled = ? WHERE id = ?',
    [name, email, emailReminders ? 1 : 0, userId],
    (err, results) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      res.json({ message: 'Settings updated successfully' });
    }
  );
});

const nodemailer = require('nodemailer');

// Configure nodemailer transporter (using Gmail SMTP as example)
require('dotenv').config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Email address from environment variable
    pass: process.env.EMAIL_PASS  // Email password or app password from environment variable
  }
});

// Function to send reminder email
function sendReminderEmail(toEmail, serviceName, endDate) {
  const mailOptions = {
    from: 'your_email@gmail.com', // TODO: replace with your email
    to: toEmail,
    subject: `Subscription Expiry Reminder for ${serviceName}`,
    text: `Dear user,\n\nYour subscription for ${serviceName} is going to expire on ${endDate}. Please recharge it before the expiry date to continue enjoying the service.\n\nBest regards,\nSubscription Management Team`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending reminder email:', error);
    } else {
      console.log('Reminder email sent:', info.response);
    }
  });
}

// Function to check for subscriptions expiring in 7 days and send reminders
function checkAndSendReminders() {
  const query = `
    SELECT s.id, s.service_name, s.end_date, u.email, u.email_reminders_enabled
    FROM subscriptions s
    JOIN users u ON s.user_id = u.id
    WHERE s.status = 'Active'
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching subscriptions for reminders:', err);
      return;
    }

    const today = new Date();
    results.forEach(sub => {
      if (!sub.end_date) return;
      if (!sub.email_reminders_enabled) return;
      const endDate = new Date(sub.end_date);
      const diffTime = endDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays <= 7 && diffDays >= 0) {
        console.log(`Sending reminder email to ${sub.email} for subscription ${sub.service_name} expiring in ${diffDays} days.`);
        sendReminderEmail(sub.email, sub.service_name, sub.end_date);
      }
    });
  });
}

const cron = require('node-cron');

// Schedule the reminder check to run every day at 9:00 AM
cron.schedule('0 9 * * *', () => {
  console.log('Running daily subscription reminder check at 9:00 AM');
  checkAndSendReminders();
});

// Basic route
app.get('/', (req, res) => {
  res.send('Subscription Management System Backend');
});

// Get current user profile endpoint (protected)
app.get('/api/profile', authenticateToken, (req, res) => {
  const userId = req.user.id;
  db.query('SELECT id, name, email, email_reminders_enabled, created_at FROM users WHERE id = ?', [userId], (err, results) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (results.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json(results[0]);
  });
});

// Manual trigger endpoint for email reminders (for testing)
app.get('/api/trigger-email-reminders', (req, res) => {
  checkAndSendReminders();
  res.json({ message: 'Email reminder check triggered' });
});

// Get subscriptions expiring within 7 days for authenticated user
app.get('/api/subscriptions/upcoming', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const query = `
    SELECT s.id, s.service_name, s.amount, s.end_date
    FROM subscriptions s
    WHERE s.user_id = ? AND s.status = 'Active' AND s.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
  `;
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Database error fetching upcoming subscriptions:', err);
      return res.status(500).json({ message: 'Database error fetching upcoming subscriptions' });
    }
    res.json(results);
  });
});

// Manual trigger endpoint for email reminders (for testing)
app.get('/api/trigger-email-reminders', (req, res) => {
  checkAndSendReminders();
  res.json({ message: 'Email reminder check triggered' });
});

// Add new subscription
app.post('/api/subscriptions', authenticateToken, (req, res) => {
  const { service_name, amount, billing_date, status, user_email, duration_days } = req.body;
  if (!service_name || !amount || !billing_date || !status || !user_email || !duration_days) {
    return res.status(400).json({ message: 'Please provide all required fields' });
  }

  // Find user by email
  db.query('SELECT id FROM users WHERE email = ?', [user_email], (err, results) => {
    if (err) {
      console.error('Database error finding user:', err);
      return res.status(500).json({ message: 'Database error finding user' });
    }
    if (results.length === 0) {
      return res.status(400).json({ message: 'User not found' });
    }
    const user_id = results[0].id;

    // Calculate end_date as billing_date + duration_days
    const start_date = billing_date;
    const endDateObj = new Date(billing_date);
    endDateObj.setDate(endDateObj.getDate() + parseInt(duration_days, 10));
    const end_date = endDateObj.toISOString().split('T')[0];

    const insertQuery = 'INSERT INTO subscriptions (user_id, service_name, amount, billing_date, status, start_date, end_date, duration_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
    db.query(insertQuery, [user_id, service_name, amount, billing_date, status, start_date, end_date, duration_days], (err, results) => {
      if (err) {
        console.error('Database error inserting subscription:', err);
        return res.status(500).json({ message: 'Database error inserting subscription' });
      }
      res.status(201).json({ message: 'Subscription added successfully' });
    });
  });
});

app.put('/api/subscriptions/:id', authenticateToken, (req, res) => {
  const subscriptionId = req.params.id;
  console.log('PUT /api/subscriptions/:id called with id:', subscriptionId);
  const { service_name, amount, billing_date, status, user_email, duration_days } = req.body;
  console.log('Request body:', req.body);
  if (!service_name || !amount || !billing_date || !status || !user_email || !duration_days) {
    return res.status(400).json({ message: 'Please provide all required fields' });
  }

  // Find user by email
  db.query('SELECT id FROM users WHERE email = ?', [user_email], (err, results) => {
    if (err) {
      console.error('Database error finding user:', err);
      return res.status(500).json({ message: 'Database error finding user' });
    }
    if (results.length === 0) {
      return res.status(400).json({ message: 'User not found' });
    }
    const user_id = results[0].id;

    // Calculate end_date as billing_date + duration_days
    const start_date = billing_date;
    const endDateObj = new Date(billing_date);
    endDateObj.setDate(endDateObj.getDate() + parseInt(duration_days, 10));
    const end_date = endDateObj.toISOString().split('T')[0];

    const updateQuery = 'UPDATE subscriptions SET user_id = ?, service_name = ?, amount = ?, billing_date = ?, status = ?, start_date = ?, end_date = ?, duration_days = ? WHERE id = ?';
    db.query(updateQuery, [user_id, service_name, amount, billing_date, status, start_date, end_date, duration_days, subscriptionId], (err, results) => {
      if (err) {
        console.error('Database error updating subscription:', err);
        return res.status(500).json({ message: 'Database error updating subscription' });
      }
      res.json({ message: 'Subscription updated successfully' });
    });
  });
});

app.get('/api/subscriptions', authenticateToken, (req, res) => {
  const userId = req.user.id;
  const query = `
    SELECT s.id, s.user_id, s.service_name, s.amount, s.billing_date, s.status, s.created_at, s.end_date, u.email as user_email
    FROM subscriptions s
    JOIN users u ON s.user_id = u.id
    WHERE s.user_id = ?
  `;
  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Database error fetching subscriptions:', err);
      return res.status(500).json({ message: 'Database error fetching subscriptions' });
    }
    res.json(results);
  });
});

// Delete subscription
app.delete('/api/subscriptions/:id', authenticateToken, (req, res) => {
  const subscriptionId = req.params.id;
  const deleteQuery = 'DELETE FROM subscriptions WHERE id = ?';
  db.query(deleteQuery, [subscriptionId], (err, results) => {
    if (err) {
      console.error('Database error deleting subscription:', err);
      return res.status(500).json({ message: 'Database error deleting subscription' });
    }
    if (results.affectedRows === 0) {
      return res.status(404).json({ message: 'Subscription not found' });
    }
    res.json({ message: 'Subscription deleted successfully' });
  });
});

// Global error handler middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});