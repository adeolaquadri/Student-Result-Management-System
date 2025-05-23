require('dotenv').config();
// import dependencies
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const methodOverride = require('method-override');


//setup my server
const app = express();
const port = process.env.serverPort;

app.listen(port, ()=>console.log(`server is running on port ${port}`));

//middleware
app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(cookieParser());
app.use(methodOverride('_method'));

//view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static('public'));

//connect to the database
const dbConnection = require('./database/connection')

//Routes setup
const adminRoutes = require('./routes/adminRoutes');
const studentRoutes = require('./routes/studentRoutes');

app.use('/admin', adminRoutes);
app.use(studentRoutes);