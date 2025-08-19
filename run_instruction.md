# How to Run the Subscription Management System Project

Follow these steps to run the project locally:

## Backend Setup

1. Open a terminal.

2. Navigate to the backend directory:
   ```
   cd backend
   ```

3. Install the required Node.js dependencies:
   ```
   npm install
   ```

4. Set up the MySQL database:
   - Open your MySQL client.
   - Run the SQL commands in `schema.sql` to create the database and tables.
   - Update the MySQL connection credentials in `server.js` if necessary.

5. Start the backend server:
   ```
   node server.js
   ```
   The server will start on port 3000.

## Frontend Setup

1. Open the `frontend` folder in your code editor or file explorer.

2. Open `index.html` in a web browser directly, or use a Live Server extension in VS Code for better development experience:
   - Right-click `index.html` and select "Open with Live Server".

3. The frontend will communicate with the backend server running on port 3000.

## Testing

- Use the frontend pages to register and login.
- Follow the `test_instructions.md` for detailed testing steps.

---

You are now ready to use and test the Subscription Management System project locally.