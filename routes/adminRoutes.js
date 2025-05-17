const express = require('express');
const dbConnection = require('../database/connection');
const pool = require('../database/pool')
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const csv = require('fast-csv');
const fs = require('fs');
const multer = require('multer')
const router = express.Router();
const util = require('util');
const query = util.promisify(dbConnection.query).bind(dbConnection);

//CSV file upload storage
let storage = multer.diskStorage({
    destination:(req, file, cb)=> {
    cb(null, 'uploads/');
}, 
filename:(req, file, cb)=>{
    cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
}
})

let upload = multer({
    storage:storage
});

//Get: Admin Login
router.get('/', (req, res)=>{
    res.render('admin/admin_login', {message:"", style:""})
});

//Post: Admin Login
router.post('/', async (req, res) => {
  try {
    const { username, password } = req.body;

    const rows = await query('SELECT * FROM admin_table WHERE username = ?', [username]);

    if (rows.length !== 1) {
      return renderAccessDenied(res);
    }

    const admin = rows[0];
    const isValidPassword = await bcrypt.compare(password, admin.password);

    if (!isValidPassword) {
      return renderAccessDenied(res);
    }

    const token = jwt.sign({ username: username }, process.env.admin_secret_key);

    res.cookie('admin', token, {
      maxAge: parseInt(process.env.adminExpiryHour), // make sure this is an integer in ms
      httpOnly: true,
      sameSite: true,
    });

    res.redirect('/admin/dashboard');
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

function renderAccessDenied(res) {
  const message = "Access Denied!";
  const style =
    "font-size: 18px; font-family: calibri; background-color: rgba(248, 2, 2, 0.35);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;";
  return res.render('admin/admin_login', { message, style });
}

//POST: Admin Signup
router.post('/register', async(req, res)=>{
    try{
    const password = await bcrypt.hash(req.body.password, 10)
    const {username} = req.body;
    const sql = "INSERT INTO admin_table(username, password) VALUES (?,?)";
    dbConnection.query(sql, [username, password], (err, result)=>{
        if(err) return res.status(500).json({message: `Registration Failed due to ${err.message}`})
        return res.status(200).json({message: "Registration Successful!"});
    });
      }catch(err){
        return res.status(500).json({error: err.message});
      }
});


//Get: Admin Dashboard
router.get('/dashboard', async (req, res) => {
  if (!req.cookies.admin) {
    return res.redirect('/admin');
  }
  try {
    const verify = jwt.verify(req.cookies.admin, process.env.admin_secret_key);

    // Run all queries in parallel
    const [
      students,
      academic,
      courses,
      department,
      results,
      admin
    ] = await Promise.all([
      query('SELECT * FROM student'),
      query('SELECT * FROM academic'),
      query('SELECT DISTINCT COURSE_ID FROM course_table'),
      query('SELECT DISTINCT Department FROM student'),
      query('SELECT * FROM student_result'),
      query('SELECT * FROM admin_table')
    ]);
    console.log(students)
    res.render('admin/admin', {
      students,
      academic,
      courses,
      department,
      results,
      admin,
      username: verify.username
    });
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});


//Get: Admin Update Academic Session
router.get('/update_session', (req, res)=>{
    if(req.cookies.admin) return res.render('admin/update_session', {message:"", alert:"", style:""});
    return res.redirect('/admin');
});


//Put: Admin update academic session
router.put('/update_session', async (req, res) => {
  if (!req.cookies.admin) {
    return res.redirect('/admin');
  }
  try {
    jwt.verify(req.cookies.admin, process.env.admin_secret_key);

    if (!req.body.session) {
      return res.status(400).render('admin/update_session', {
        message: 'Session value is required',
        alert: 'alert alert-warning',
        style: "font-size: 18px; font-family: calibri; background-color: rgba(248, 204, 2, 0.42); padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
      });
    }

    await query('UPDATE academic SET Session = ?', [req.body.session]);

    res.render('admin/update_session', {
      message: 'Academic Session Updated Successfully',
      alert: 'alert alert-info',
      style: "font-size: 18px; font-family: calibri; background-color: rgba(37, 164, 248, 0.42); padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('admin/update_session', {
      message: 'Error updating session: ' + err.message,
      alert: 'alert alert-danger',
      style: "font-size: 18px; font-family: calibri; background-color: rgba(248, 2, 2, 0.42); padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
    });
  }
});



//Get: Admin Update Academic Semester
router.get('/update_semester', (req, res)=>{
    if(req.cookies.admin){
        res.render('admin/update_semester', {message:"", alert:"", style:""})
    }else{
        res.redirect('/admin')
    }
})


//Put: Admin update academic semester
router.put('/update_semester', async(req, res)=>{
    try{
    if(!req.cookies.admin) return res.redirect('/admin');
    
    const semester = req.body.semester;
    if (!semester) {
      return res.status(400).json({ success: false, message: "Semester is required" });
    }
   await query('UPDATE academic SET Semester = ?',[req.body.semester], (err)=>{
        if(err) return res.status(500).json({success: false, message: "Error updating semster.."});
        return res.status(200).json({success: true, message: "Updated semster successfully"});
    })
}catch(err){
        console.error('Error updating semester:', err);
    return res.status(500).json({success: false, message: "Error updating semster.."});
}
});

//GET: Fetch admin details
router.get('/getadmin', async(req, res)=>{
    await query('select * from admin_table', (err, result)=>{
        if(err) return res.status(500).json({sqlError: err.sqlMessage})
            return res.status(200).json({admin: result})
    })
})
//GET: Render admin signup page
router.get('/signup', (req, res)=>{
    res.render('admin/signup')
})

//POST: Admin signup
router.post('/signup', async(req, res)=>{
    try{
    await query('select * from admin_table', (err, result)=>{
    if(err) return res.status(500).json({sqlError: err.sqlMessage})
    if(result.length === 1) return res.status(403).json();
    const {username, password, secretkey} = req.body
    const hashedPassword =  bcrypt.hashSync(password, 10)
    const hasedSecretKey = bcrypt.hashSync(secretkey, 10)
    dbConnection.query('insert into admin_table values(?,?,?)', [username, hashedPassword, hasedSecretKey], (err, result)=>{
        if(err) return res.status(500).json({sqlError: err.sqlMessage})
        return res.status(201).json({message: "Admin registered successfully"})
    })
})
}catch(e){
    return res.status(500).json(e.message)
}
})

//Get: Admin Upload Student Result
router.get('/upload_result', (req, res)=>{
    if(!req.cookies.admin) return res.redirect('/admin');
    return res.render('admin/upload_result', {message: "", alert: "", style:""});
})


//Post: Admin Upload Student Result
router.post('/upload_result', upload.single('file'), (req, res) => {
  const filePath = __dirname + "/uploads/" + req.file.filename;

  uploadCsv(filePath, req.body)
    .then(() => {
      const message = 'Result uploaded Successfully';
      const style = "font-size: 18px; font-family: calibri; background-color: rgba(37, 164, 248, 0.42); padding: 10px; width: 100%; justify-content: center; border-radius: 5px;";
      const alert = 'alert alert-info';

      res.render('admin/upload_result', { message, alert, style });
    })
    .catch(err => {
      console.error('Error uploading CSV:', err);
      res.status(500).send("Error processing the CSV file.");
    });
});

function uploadCsv(path, formData) {
  return new Promise((resolve, reject) => {
    let csvDataColl = [];
    let stream = fs.createReadStream(path);
    let fileStream = csv.parse({ headers: false })
      .on('error', error => reject(error))
      .on('data', (row) => {
        csvDataColl.push(row);
      })
      .on('end', () => {
        // Assume first row is header, replace relevant headers
        if (csvDataColl.length === 0) return reject(new Error('CSV file is empty'));

        csvDataColl[0][5] = 'GP';
        csvDataColl[0][6] = 'CP';
        csvDataColl[0][7] = 'Session';
        csvDataColl[0][8] = 'Semester';
        csvDataColl[0][9] = 'Level';

        // Remove header for data processing
        const dataRows = csvDataColl.slice(1);

        // Process each row to add GP, CP, Session, Semester, Level
        for (let i = 0; i < dataRows.length; i++) {
          const score = Number(dataRows[i][3]);
          const courseUnit = Number(dataRows[i][4]);

          // Set Session, Semester, Level from form input
          dataRows[i][7] = formData.session;
          dataRows[i][8] = formData.semester;
          dataRows[i][9] = formData.level;

          // Calculate CP based on Score
          let cp = 0.00;
          if (score >= 75 && score <= 100) cp = 4.00;
          else if (score >= 70) cp = 3.50;
          else if (score >= 65) cp = 3.25;
          else if (score >= 60) cp = 3.00;
          else if (score >= 55) cp = 2.75;
          else if (score >= 50) cp = 2.50;
          else if (score >= 45) cp = 2.25;
          else if (score >= 40) cp = 2.00;

          dataRows[i][6] = cp;
          dataRows[i][5] = (cp * courseUnit).toFixed(2); // GP = CP * CourseUnit
        }

        // Now insert all processed rows as batch
        pool.getConnection((err, connection) => {
          if (err) return reject(err);

          const insertQuery = 'INSERT INTO student_result(MatricNo, CourseId, CourseTitle, Score, CourseUnit, GP, CP, Session, Semester, Level) VALUES ?';

          connection.query(insertQuery, [dataRows], (error) => {
            connection.release();
            if (error) return reject(error);
            resolve();
          });
        });
      });

    stream.pipe(fileStream);
  });
}


//Get: Admin Add Student
router.get('/add_student', (req, res)=>{
    if(!req.cookies.admin)  return res.redirect('/admin');
    return res.render('admin/add_student', {message:"",alert:"",style:""});
       
});


//POST: Upload student
router.post('/upload_student', upload.single('file'), (req, res) => {
  const filePath = __dirname + "/uploads/" + req.file.filename;

  uploadCsv(filePath)
    .then(() => {
      const message = 'Students uploaded Successfully';
      const style = "font-size: 18px; font-family: calibri; background-color: rgba(37, 164, 248, 0.42); padding: 10px; width: 100%; justify-content: center; border-radius: 5px;";
      res.render('admin/add_student', { message, style });
    })
    .catch(err => {
      console.error('Error uploading students:', err);
      res.status(500).send("Error processing the CSV file.");
    });
});

function uploadCsv(path) {
  return new Promise((resolve, reject) => {
    const csvDataColl = [];
    const stream = fs.createReadStream(path);
    const fileStream = csv.parse({ headers: false })
      .on('error', error => reject(error))
      .on('data', row => {
        csvDataColl.push(row);
        // Replace header row labels once
        if (csvDataColl.length === 1) {
          csvDataColl[0][10] = 'Passcode';
          csvDataColl[0][11] = 'Token';
        }
      })
      .on('end', () => {
        // Remove header row before insertion
        csvDataColl.shift();

        // Add Passcode and Token fields to each row
        for (let i = 0; i < csvDataColl.length; i++) {
          csvDataColl[i][10] = process.env.defaultPassword || 'defaultpass'; // fallback default password
          csvDataColl[i][11] = jwt.sign(
            { matric: csvDataColl[i][0], department: csvDataColl[i][5] },
            process.env.secret_key,
            { expiresIn: '30d' } // optional token expiry
          );
        }

        pool.getConnection((err, connection) => {
          if (err) return reject(err);

          const query = 'INSERT INTO student(MatricNo, Lastname, Firstname, Middlename, Email, Department, sex, Admission_Year, Level, Programme, Passcode, Token) VALUES ?';

          connection.query(query, [csvDataColl], (error) => {
            connection.release();
            if (error) return reject(error);
            console.log("Records added successfully");
            resolve();
          });
        });
      });

    stream.pipe(fileStream);
  });
}



//Get: Admin Add Course
router.get('/add_course', (req, res)=>{
    if(!req.cookies.admin)  return res.redirect('/admin');
    return res.render('admin/add_course', {
        message: "",
        alert: "",
        style: ""
    })
});

//Get: Manage courses
router.get('/manage_course', async(req, res)=>{
    if(!req.cookies.admin) return res.redirect('/admin');
    await query('select * from course_table', (err, result)=>{
        if (err) return res.status(500).send('Internal server error');
        return res.render('admin/manage_course', {result:result})
    })
})


//Delete: Admin delete course
router.delete('/delete_course', async (req, res) => {
    const { courseId, semester, department, level } = req.body;

    // Check admin auth
    if (!req.cookies.admin) {
        return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }

    // Validate required fields
    if (!courseId || !semester || !department || !level) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const query = `
        DELETE FROM course_table
        WHERE COURSE_ID = ? AND SEMESTER = ? AND DEPARTMENT = ? AND LEVEL = ?
    `;
    const data = [courseId, semester, department, level];

    dbConnection.query(query, data, (err, result) => {
        if (err) {
            console.error('Error deleting course:', err);
            return res.status(500).json({ success: false, message: 'Failed to delete course' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }

        return res.status(200).json({ success: true, message: 'Course deleted successfully' });
    });
});



//Put: Admin update course
router.put('/update_course', (req, res) => {
    if (!req.cookies.admin) {
        return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }

    const { courseId, courseTitle, courseUnit, semester, department, level } = req.body;

    if (!courseId || !courseTitle || !courseUnit || !semester || !department || !level) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const updateQuery = `
        UPDATE course_table
        SET COURSE_ID = ?, COURSE_TITLE = ?, COURSE_UNIT = ?, SEMESTER = ?, DEPARTMENT = ?, LEVEL = ?
        WHERE COURSE_ID = ? AND SEMESTER = ? AND DEPARTMENT = ? AND LEVEL = ?
    `;

    const data = [
        courseId, courseTitle, courseUnit, semester, department, level, // new values
        courseId, semester, department, level                            // original filter
    ];

    dbConnection.query(updateQuery, data, (err, result) => {
        if (err) {
            console.error('Error updating course:', err);
            return res.status(500).json({ success: false, message: 'Failed to update course' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Course not found or no changes made' });
        }

        return res.status(200).json({ success: true, message: 'Course updated successfully' });
    });
});


//Get: Manage Student Result
router.get('/manage_result', (req, res)=>{
    if(!req.cookies.admin) return res.redirect('/admin');
        dbConnection.query('select * from student_result', (err, result)=>{
        if(err) return res.status(500).send('Internal server error.');
        return res.render('admin/manage_result', {result:result})
        })
})



//Get: Manage Students
router.get('/manage_student',(req, res)=>{
    if(!req.cookies.admin) return res.redirect('/admin');
    dbConnection.query('select * from student', (err, result)=>{
        if(err) return res.status(500).send('Internal server error.');
         return res.render('admin/manage_student', {result:result});
    });
});


//Delete: Admin delete student
router.delete('/delete_student', (req, res) => {
    const { matric } = req.body;

    if (!req.cookies.admin) {
        return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }

    if (!matric) {
        return res.status(400).json({ success: false, message: 'Matric number is required' });
    }

    const query = 'DELETE FROM student WHERE MatricNo = ?';

    dbConnection.query(query, [matric], (err, result) => {
        if (err) {
            console.error('Error deleting student:', err);
            return res.status(500).json({ success: false, message: 'Failed to delete student' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        return res.status(200).json({ success: true, message: 'Student deleted successfully' });
    });
});


//Put: Admin update student
router.put('/update_student', (req, res) => {
    if (!req.cookies.admin) {
        return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }

    const {
        matric,
        email,
        lastname,
        firstname,
        middlename,
        department,
        adYear,
        password,
        level,
        sex
    } = req.body;

    if (!matric) {
        return res.status(400).json({ success: false, message: 'Matric number is required' });
    }

    const query = `
        UPDATE student
        SET Email = ?, Lastname = ?, Firstname = ?, Middlename = ?, Department = ?,
            Admission_Year = ?, Passcode = ?, Level = ?, sex = ?
        WHERE MatricNo = ?
    `;
    
    const values = [email, lastname, firstname, middlename, department, adYear, password, level, sex, matric];

    dbConnection.query(query, values, (err, result) => {
        if (err) {
            console.error('Error updating student:', err);
            return res.status(500).json({ success: false, message: 'Failed to update student' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Student not found or no changes made' });
        }

        return res.status(200).json({ success: true, message: 'Student updated successfully' });
    });
});




//Delete: Admin delete result
router.delete('/delete_result', (req, res) => {
    const { id } = req.body;

    // Check for admin cookie
    if (!req.cookies.admin) {
        return res.status(401).json({ message: 'Unauthorized access' });
    }

    // Basic validation
    if (!id || isNaN(id)) {
        return res.status(400).json({ message: 'Invalid or missing result ID' });
    }

    const query = 'DELETE FROM student_result WHERE id = ?';

    dbConnection.query(query, [id], (err, result) => {
        if (err) {
            console.error('Delete result error:', err.message);
            return res.status(500).json({ message: 'Server error while deleting result' });
        }

        // Check if any row was deleted
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Result not found' });
        }

        return res.status(200).json({ message: 'Result deleted successfully' });
    });
});



//Put: Admin Update Result
router.put('/update_result', (req, res) => {
  if (!req.cookies.admin) {
    return res.status(401).json({ message: 'Unauthorized access' });
  }

  let { id, matric, session, semester, level, courseId, courseTitle, courseUnit, score, cp, gp } = req.body;

  // Basic validation
  if (!id || isNaN(id)) {
    return res.status(400).json({ message: 'Invalid or missing result ID' });
  }

  const updateQuery = `
    UPDATE student_result
    SET MatricNo = ?, Session = ?, Semester = ?, Level = ?, CourseId = ?, CourseTitle = ?, CourseUnit = ?, Score = ?, CP = ?, GP = ?
    WHERE id = ?
  `;
  const data = [matric, session, semester, level, courseId, courseTitle, courseUnit, score, cp, gp, id];

  dbConnection.query(updateQuery, data, (err, result) => {
    if (err) {
      console.error('Update result error:', err.message);
      return res.status(500).json({ message: 'Error updating result' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Result not found' });
    }

    return res.status(200).json({ message: 'Result updated successfully' });
  });
});



//Get: Admin Logout
router.get('/logout', (req, res)=>{
    res.cookie('admin', "",{
        maxAge: 1,
        httpOnly: true
    })
    res.redirect('/admin');
});


//Get: Admin Change Password
router.get('/change_password', (req, res)=>{
    if(!req.cookies.admin){
        return res.redirect('/admin');
    }else{
        const verify = jwt.verify(req.cookies.admin, process.env.admin_secret_key)
        return res.render('admin/change_password', {message:"", style: "", username:verify.username})
    }  
});


//Put: Admin change password
router.put('/change_password', (req, res) => {
  try {
    const { oldpassword, newpassword, confirmpassword } = req.body;

    if (!req.cookies.admin) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const identity = jwt.verify(req.cookies.admin, process.env.admin_secret_key);
    const username = identity.username;

    if (newpassword !== confirmpassword) {
      return res.status(400).json({ message: 'New password and confirm password do not match' });
    }

    dbConnection.query('SELECT * FROM admin_table WHERE username = ?', [username], (err, result) => {
      if (err) return res.status(500).json({ message: 'Database error' });

      if (result.length !== 1) {
        return res.status(404).json({ message: 'Admin user not found' });
      }

      const matchPassword = bcrypt.compareSync(oldpassword, result[0].password);
      if (!matchPassword) {
        return res.status(401).json({ message: 'Old password is incorrect' });
      }

      const hashPassword = bcrypt.hashSync(newpassword, 10);
      const updateQuery = 'UPDATE admin_table SET password = ? WHERE username = ?';

      dbConnection.query(updateQuery, [hashPassword, username], (err) => {
        if (err) return res.status(500).json({ message: 'Failed to update password' });

        return res.status(200).json({ message: 'Password updated successfully' });
      });
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: 'Internal server error' });
  }
});


router.get('/reset-password', (req, res)=>{
    return res.render('admin/reset_password')
})

//PUT: Admin reset password
router.put('/reset-password', async (req, res) => {
  try {
    const { resetToken, newpassword, confirmpassword, username } = req.body;

    // Basic input validation
    if (!username || !resetToken || !newpassword || !confirmpassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (newpassword !== confirmpassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    // Fetch user by username
    const users = await query('SELECT * FROM admin_table WHERE username = ?', [username]);

    if (users.length !== 1) {
      return res.status(404).json({ message: 'Admin user not found' });
    }

    const user = users[0];

    // Check reset token
    if (!user.reset_token || user.reset_token !== resetToken) {
      return res.status(401).json({ message: 'Invalid or expired reset token' });
    }

    // Optional: Check if token has expired
    // const now = new Date();
    // if (user.token_expires && now > user.token_expires) {
    //   return res.status(403).json({ message: 'Reset token has expired' });
    // }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newpassword, 10);

    // Update password and clear token
    const updateQuery = `
      UPDATE admin_table 
      SET password = ?, reset_token = NULL, token_expires = NULL 
      WHERE username = ?
    `;

    await query(updateQuery, [hashedPassword, username]);

    return res.status(200).json({ message: 'Password reset successfully' });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});



//Post: Admin upload Courses
router.post('/upload_courses', upload.single('file'), (req, res) => {
    if (!req.cookies.admin) return res.redirect('/admin');

    const filePath = path.join(__dirname, 'uploads', req.file.filename);

    function uploadCsv(path) {
        const stream = fs.createReadStream(path);
        let csvDataColl = [];

        const fileStream = csv.parse()
            .on('data', (data) => {
                csvDataColl.push(data);
            })
            .on('end', () => {
                csvDataColl.shift(); // remove header row

                pool.getConnection((err, connection) => {
                    if (err) {
                        fs.unlinkSync(filePath);
                        return res.status(500).send(err.message);
                    }

                    // Check and insert only new courses
                    const checkQuery = `SELECT COURSE_ID, SEMESTER, DEPARTMENT, LEVEL FROM course_table`;
                    connection.query(checkQuery, (err, existingCourses) => {
                        if (err) {
                            fs.unlinkSync(filePath);
                            return res.status(500).send('Error checking existing courses');
                        }

                        const existingSet = new Set(
                            existingCourses.map(row => `${row.COURSE_ID}-${row.SEMESTER}-${row.DEPARTMENT}-${row.LEVEL}`)
                        );

                        const newCourses = csvDataColl.filter(row => {
                            const key = `${row[0]}-${row[3]}-${row[4]}-${row[5]}`;
                            return !existingSet.has(key);
                        });

                        if (newCourses.length === 0) {
                            fs.unlinkSync(filePath);
                            return res.render('admin/add_course', {
                                message: 'No new courses to upload. All entries already exist.',
                                style: "font-size: 18px; font-family: calibri; background-color: #f8d7da; padding: 10px; border-radius: 5px;"
                            });
                        }

                        const insertQuery = `INSERT INTO course_table(COURSE_ID, COURSE_TITLE, COURSE_UNIT, SEMESTER, DEPARTMENT, LEVEL) VALUES ?`;
                        connection.query(insertQuery, [newCourses], (err) => {
                            fs.unlinkSync(filePath); // 🧹 Clean up
                            if (err) return res.status(500).send('Error uploading new courses');

                            return res.render('admin/add_course', {
                                message: 'Courses uploaded successfully',
                                style: "font-size: 18px; font-family: calibri; background-color: rgba(37, 164, 248, 0.42); padding: 10px; border-radius: 5px;"
                            });
                        });
                    });
                });
            });

        stream.pipe(fileStream);
    }

    uploadCsv(filePath);
});



//GET: Admin generate student report
router.get('/student-report/', async (req, res) => {
    try {
        // const { studentId, semester } = req.params;
        const query1 = `SELECT MatricNo, Lastname, Firstname, Middlename, Department, Email FROM student WHERE 
        MatricNo = 'HNDCOM/23/068'`
        dbConnection.query(query1, (err, std)=>{
            if(err) throw err
        dbConnection.query(`SELECT CourseId, Score FROM student_result WHERE MatricNo = 'HNDCOM/23/068'`,
            (err, result)=>{
            if(err) throw err 
        dbConnection.query(`select sum(GP) / sum(CourseUnit) as cgpa from student_result where MatricNo = 'HNDCOM/23/068'`,(err, CGPA)=>{
        res.json({student: std, results:result, cgpa: CGPA[0].cgpa.toFixed(2)});
            });
        });
        });
    } catch (error) {
        res.status(500).json({ error: "Error generating report" });
    }
});

module.exports = router;