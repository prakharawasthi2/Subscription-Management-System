CREATE DATABASE IF NOT EXISTS subscription_management;
USE subscription_management;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  email_reminders_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  service_name VARCHAR(100) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  billing_date DATE NOT NULL,
  status ENUM('Active', 'Expired') DEFAULT 'Active',
  start_date DATE,
  end_date DATE,
  duration_days INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
