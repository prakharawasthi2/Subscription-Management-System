# Thorough Testing Instructions for Subscription Management System

## Frontend Testing

1. Open the following pages in a browser (preferably Chrome or Firefox):
   - `frontend/index.html`

2. Verify the following:
   - Page loads correctly and is responsive on different screen sizes.
   - Navigation links work and scroll to the correct sections.

## Backend API Testing

Use the following curl commands to test the backend API endpoints. Make sure the backend server is running (`node backend/server.js`).

### 1. User Registration

```bash
curl -X POST http://localhost:3000/api/register \
-H "Content-Type: application/json" \
-d '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

- Expected: HTTP 201 with message "User registered successfully".
- Test duplicate email registration to get error.

### 2. User Login

```bash
curl -X POST http://localhost:3000/api/login \
-H "Content-Type: application/json" \
-d '{"email":"test@example.com","password":"password123"}'
```

- Expected: HTTP 200 with message "Login successful".
- Test invalid email or password to get error.

## Database Verification

1. Connect to MySQL and run:

```sql
USE subscription_management;
SELECT * FROM users;
SELECT * FROM subscriptions;
```

2. Verify that user data is stored correctly after registration.

## Additional Notes

- Test error handling by sending malformed requests.
- Test frontend-backend integration once frontend pages are implemented.

---

Please run these tests and report any issues or feedback for further improvements.