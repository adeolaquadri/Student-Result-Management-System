const mysql = require('mysql');
const dotenv = require('dotenv');
dotenv.config();

const userdb = process.env.userDB;
const dbuserpassword = process.env.userPassword;
const dbuser = process.env.user;
const dbhost = process.env.userHost;
const dbport = process.env.userPort;

const dbConnection = mysql.createConnection({
  user: dbuser,
  password: dbuserpassword,
  database: userdb,
  host: dbhost,
  port: dbport
});

dbConnection.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
  } else {
    console.log('Database connected successfully!');
  }
});

module.exports = dbConnection;