const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'your_jwt_secret_key';

const corsOptions = {
  origin: ['http://127.0.0.1:5500', 'http://localhost:5500'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// MySQL connection pool
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'prakhar@2006',
  database: 'subscription_management',
  connectionLimit: 10
});

// Test the connection
db.getConnection((err, connection) => {
  if (err) {
    console.error('Database connection failed:', err);
    return;
  }
  console.log('Connected to MySQL database.');
  connection.release();
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

// Configure nodemailer transporter (using Gmail SMTP as example)
require('dotenv').config({ path: __dirname + '/.env' });

// Email configuration validation
let transporter;
let emailConfigured = false;

try {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('❌ Email configuration missing: EMAIL_USER and EMAIL_PASS environment variables are required');
    console.log('ℹ️  Please check your .env file or set the environment variables');
  } else {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
    
    // Verify email configuration
    transporter.verify((error, success) => {
      if (error) {
        console.error('❌ Email configuration error:', error);
        console.log('ℹ️  Make sure to use an app password if you have 2FA enabled on Gmail');
        console.log('ℹ️  Check: https://support.google.com/accounts/answer/185833');
      } else {
        console.log('✅ Email server is ready to send messages');
        emailConfigured = true;
      }
    });
  }
} catch (error) {
  console.error('❌ Failed to configure email transporter:', error);
}

// Function to send reminder email with improved error handling
function sendReminderEmail(toEmail, serviceName, endDate) {
  if (!emailConfigured) {
    console.error('❌ Cannot send email: Email service not configured properly');
    return false;
  }

  const mailOptions = {
    from: process.env.EMAIL_USER || 'subscription@management.com',
    to: toEmail,
    subject: `Subscription Expiry Reminder for ${serviceName}`,
    text: `Dear user,\n\nYour subscription for ${serviceName} is going to expire on ${endDate}. Please recharge it before the expiry date to continue enjoying the service.\n\nBest regards,\nSubscription Management Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Subscription Expiry Reminder</h2>
        <p>Dear user,</p>
        <p>Your subscription for <strong>${serviceName}</strong> is going to expire on <strong>${endDate}</strong>.</p>
        <p>Please recharge it before the expiry date to continue enjoying the service.</p>
        <p>Best regards,<br>Subscription Management Team</p>
      </div>
    `
  };

  return new Promise((resolve) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('❌ Error sending reminder email to', toEmail, ':', error.message);
        if (error.responseCode === 535) {
          console.log('ℹ️  Authentication failed - check your email credentials');
        }
        resolve(false);
      } else {
        console.log('✅ Reminder email sent to', toEmail, ':', info.response);
        if (process.env.DEBUG_EMAILS === 'true') {
          console.log('📧 Email details:', {
            to: toEmail,
            subject: mailOptions.subject,
            messageId: info.messageId
          });
        }
        resolve(true);
      }
    });
  });
}

// Function to check for subscriptions expiring in 7 days and send reminders
async function checkAndSendReminders() {
  console.log('🔍 Checking for subscriptions expiring within 7 days...');
  
  const query = `
    SELECT s.id, s.service_name, s.end_date, u.email, u.email_reminders_enabled, u.name as user_name
    FROM subscriptions s
    JOIN users u ON s.user_id = u.id
    WHERE s.status = 'Active'
  `;

  db.query(query, async (err, results) => {
    if (err) {
      console.error('❌ Error fetching subscriptions for reminders:', err);
      return;
    }

    console.log(`📊 Found ${results.length} active subscriptions to check`);

    const today = new Date();
    let remindersSent = 0;
    let eligibleSubscriptions = 0;

    for (const sub of results) {
      if (!sub.end_date) {
        console.log(`⚠️  Subscription ${sub.id} (${sub.service_name}) has no end date`);
        continue;
      }

      if (!sub.email_reminders_enabled) {
        console.log(`ℹ️  User ${sub.email} has email reminders disabled`);
        continue;
      }

      const endDate = new Date(sub.end_date);
      const diffTime = endDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 7 && diffDays >= 0) {
        eligibleSubscriptions++;
        console.log(`📨 Eligible: ${sub.service_name} for ${sub.email} expires in ${diffDays} days`);
        
        try {
          const emailSent = await sendReminderEmail(sub.email, sub.service_name, sub.end_date);
          if (emailSent) {
            remindersSent++;
            // Update last reminder sent date
            db.query('UPDATE subscriptions SET last_reminder_sent = NOW() WHERE id = ?', [sub.id]);
          }
        } catch (error) {
          console.error(`❌ Failed to send email to ${sub.email}:`, error);
        }
      } else if (diffDays < 0) {
        console.log(`⏰ Subscription ${sub.service_name} for ${sub.email} expired ${Math.abs(diffDays)} days ago`);
        // Update status to Expired
        db.query('UPDATE subscriptions SET status = "Expired" WHERE id = ? AND status = "Active"', [sub.id]);
      }
    }

    console.log(`✅ Reminder check completed: ${remindersSent} emails sent out of ${eligibleSubscriptions} eligible subscriptions`);
  });
}

// Schedule the reminder check to run every day at 9:00 AM
cron.schedule('0 9 * * *', () => {
  console.log('⏰ Running daily subscription reminder check at 9:00 AM');
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

// Enhanced manual trigger endpoint for email reminders with detailed feedback
app.get('/api/trigger-email-reminders', async (req, res) => {
  console.log('🚀 Manual email reminder trigger requested');
  try {
    await checkAndSendReminders();
    res.json({ 
      message: 'Email reminder check completed successfully',
      status: 'success',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in manual email trigger:', error);
    res.status(500).json({ 
      message: 'Error triggering email reminders',
      status: 'error',
      error: error.message 
    });
  }
});

// Test email endpoint for manual testing
app.post('/api/test-email', (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ message: 'Email address is required' });
  }

  if (!emailConfigured) {
    return res.status(500).json({ 
      message: 'Email service not configured properly',
      details: 'Check your .env file for EMAIL_USER and EMAIL_PASS variables'
    });
  }

  const testMailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Test Email - Subscription Management System',
    text: 'This is a test email from your Subscription Management System. If you received this, your email configuration is working correctly!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Test Email Successful! 🎉</h2>
        <p>This is a test email from your Subscription Management System.</p>
        <p>If you received this email, your email configuration is working correctly!</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p>Best regards,<br>Subscription Management Team</p>
      </div>
    `
  };

  transporter.sendMail(testMailOptions, (error, info) => {
    if (error) {
      console.error('❌ Test email failed:', error);
      res.status(500).json({ 
        message: 'Test email failed to send',
        error: error.message,
        details: 'Check your email credentials and ensure you\'re using an app password if 2FA is enabled'
      });
    } else {
      console.log('✅ Test email sent successfully:', info.response);
      res.json({ 
        message: 'Test email sent successfully!',
        response: info.response,
        details: 'Check your inbox (and spam folder) for the test email'
      });
    }
  });
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
    db.query(insertQuery, [user_id, service_name, amount, billing_date, status, start_date, end_date, duration_days], async (err, results) => {
      if (err) {
        console.error('Database error inserting subscription:', err);
        return res.status(500).json({ message: 'Database error inserting subscription' });
      }
      
      // Check if subscription expires within 7 days and send immediate reminder
      const today = new Date();
      const endDate = new Date(end_date);
      const diffTime = endDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 7 && diffDays >= 0) {
        console.log(`📨 New subscription expires in ${diffDays} days - sending immediate reminder`);
        
        // Get user email and preferences
        db.query('SELECT email, email_reminders_enabled FROM users WHERE id = ?', [user_id], async (err, userResults) => {
          if (err) {
            console.error('Error fetching user details for immediate reminder:', err);
            return;
          }
          
          if (userResults.length > 0 && userResults[0].email_reminders_enabled) {
            try {
              const emailSent = await sendReminderEmail(userResults[0].email, service_name, end_date);
              if (emailSent) {
                console.log('✅ Immediate reminder email sent successfully');
                // Update last reminder sent date
                db.query('UPDATE subscriptions SET last_reminder_sent = NOW() WHERE id = ?', [results.insertId]);
              }
            } catch (error) {
              console.error('❌ Failed to send immediate reminder email:', error);
            }
          }
        });
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
    db.query(updateQuery, [user_id, service_name, amount, billing_date, status, start_date, end_date, duration_days, subscriptionId], async (err, results) => {
      if (err) {
        console.error('Database error updating subscription:', err);
        return res.status(500).json({ message: 'Database error updating subscription' });
      }
      
      // Check if updated subscription expires within 7 days and send immediate reminder
      const today = new Date();
      const endDate = new Date(end_date);
      const diffTime = endDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 7 && diffDays >= 0) {
        console.log(`📨 Updated subscription expires in ${diffDays} days - sending immediate reminder`);
        
        // Get user email and preferences
        db.query('SELECT email, email_reminders_enabled FROM users WHERE id = ?', [user_id], async (err, userResults) => {
          if (err) {
            console.error('Error fetching user details for immediate reminder:', err);
            return;
          }
          
          if (userResults.length > 0 && userResults[0].email_reminders_enabled) {
            try {
              const emailSent = await sendReminderEmail(userResults[0].email, service_name, end_date);
              if (emailSent) {
                console.log('✅ Immediate reminder email sent successfully for updated subscription');
                // Update last reminder sent date
                db.query('UPDATE subscriptions SET last_reminder_sent = NOW() WHERE id = ?', [subscriptionId]);
              }
            } catch (error) {
              console.error('❌ Failed to send immediate reminder email for updated subscription:', error);
            }
          }
        });
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
