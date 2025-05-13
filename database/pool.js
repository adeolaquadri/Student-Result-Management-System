const mysql = require('mysql')
const dotenv = require('dotenv');
dotenv.config();

const pool = mysql.createPool({
    host:process.env.userHost,
    user: process.env.user,
    password: process.env.userPassword,
    database: process.env.userDB,
    port: process.env.userPort
});

module.exports = pool;