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
const path = require('path');

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

//GET: Render admin signup page
router.get('/signup', (req, res)=>{
    res.render('admin/signup', {message: ''})
})

//POST: Admin signup
router.post('/signup', async (req, res) => {
  try {
    const { username, password, email, confirmpassword } = req.body;

    const rows = await query('SELECT * FROM admin_table');

    if (rows.length !== 0) {
    const message = "Registration Closed!";
    return res.render('admin/signup', { message});
    }

    if (confirmpassword !== password) {
      const message = "Passwords do not match!";
      return res.render('admin/signup', { message});
    }
    const hashedPassword = await bcrypt.hashSync(password, 10);
    const addAdmin = await query
    ('INSERT INTO admin_table(username, password, email) values(?,?,?)', [username, hashedPassword, email]);
    const message = "Registered Successfully.";
    return res.render('admin/signup', { message});
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
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
    const isValidPassword = await bcrypt.compareSync(password, admin.password);

    if (!isValidPassword) {
      return renderAccessDenied(res);
    }

    const token = jwt.sign({ username: username }, process.env.admin_secret_key);

    res.cookie('admin', token, {
      maxAge: parseInt(process.env.adminExpiryHour),
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
  return res.render('admin/admin_login', { message});
}


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
      courses,
      department,
      results,
      admin,
      session,
      academic_session,
      academic_semester
    ] = await Promise.all([
      query('SELECT * FROM student'),
      query('SELECT DISTINCT COURSE_ID FROM course_table'),
      query('SELECT DISTINCT Department FROM student'),
      query('SELECT * FROM student_result'),
      query('SELECT * FROM admin_table'),
      query('SELECT * FROM academic_sessions WHERE is_current = TRUE LIMIT 1'),
      query('SELECT DISTINCT session FROM academic_sessions'),
      query('SELECT semester FROM academic_sessions')
    ]);
    res.render('admin/admin', {
      students,
      courses,
      department,
      results,
      admin,
      academic_session,
      academic_semester,
      current_session: session[0],
      username: verify.username
    });
  } catch (err) {
    console.error(err);
  }
});



//Get: Admin Upload Student Result
router.get('/upload_result', (req, res)=>{
    if(!req.cookies.admin) return res.redirect('/admin');
    return res.render('admin/upload_result', {message: "", alert: "", style:""});
})


//Post: Admin Upload Student Result
router.post('/upload_result', upload.single('file'), async (req, res) => {
   const filePath = path.join(__dirname, '../uploads', req.file.filename);

  try {
    await uploadResult(filePath, req.body);
    fs.unlinkSync(filePath); // Cleanup uploaded file

    const message = 'Result uploaded Successfully';
    const alert = 'alert alert-info';
    const style = "font-size: 18px; font-family: calibri; background-color: rgba(37, 164, 248, 0.42); padding: 10px; width: 100%; justify-content: center; border-radius: 5px;";
    
    res.render('admin/upload_result', { message, alert, style });
  } catch (err) {
    console.error('Error uploading CSV:', err);

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath); // Cleanup on error

    const message = "Error processing the CSV file.";
    const alert = 'alert alert-danger';
    const style = "background-color: red; color: white; padding: 10px; font-family: calibri;";

    res.render('admin/upload_result', { message, alert, style });
  }
});



function uploadResult(filePath, formData) {
  return new Promise((resolve, reject) => {
    const csvData = [];

    fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: false }))
      .on('error', reject)
      .on('data', (row) => csvData.push(row))
      .on('end', async () => {
        try {
          if (csvData.length === 0) return reject(new Error('CSV file is empty'));

          const dataRows = csvData.slice(1); // Remove header
          const processedRows = [];

          const connection = await new Promise((res, rej) => {
            pool.getConnection((err, conn) => (err ? rej(err) : res(conn)));
          });

          for (let row of dataRows) {
            if (row.length < 2) continue; // Skip malformed rows

            const matricNo = row[0];
            const courseId = formData.coursecode;
            const score = parseFloat(row[1]) || 0;

            // Fetch department from DB
             const [resultDepartment] = await new Promise((res, rej) => {
              connection.query(
                'SELECT Department FROM student WHERE MatricNo = ?',
                [matricNo],
                (err, results) => (err ? rej(err) : res(results))
              );
            });

             if (!resultDepartment || !resultDepartment.Department) {
              console.warn(`Department not found for matricNo: ${matricNo}`);
              continue; // Skip if student not found
            }

            const department = resultDepartment.Department;

            // Fetch course unit from DB
            const [unitResult] = await new Promise((res, rej) => {
              connection.query(
                'SELECT COURSE_UNIT FROM course_table WHERE COURSE_ID = ? AND DEPARTMENT = ?',
                [formData.coursecode, department],
                (err, results) => (err ? rej(err) : res(results))
              );
            });


           if (!unitResult || !unitResult.COURSE_UNIT) {
              console.warn(`Course unit not found for courseId: ${courseId}`);
              continue; // Skip if course not found
            }

           const unit = parseFloat(unitResult.COURSE_UNIT);

            // Calculate CP
            let cp = 0.00;
            if (score >= 75 && score <= 100) cp = 4.00;
            else if (score >= 70) cp = 3.50;
            else if (score >= 65) cp = 3.25;
            else if (score >= 60) cp = 3.00;
            else if (score >= 55) cp = 2.75;
            else if (score >= 50) cp = 2.50;
            else if (score >= 45) cp = 2.25;
            else if (score >= 40) cp = 2.00;

            const gp = cp * unit;

            // Final row structure
            processedRows.push([
              matricNo,
              courseId,
              score.toFixed(2),
              gp.toFixed(2),
              cp.toFixed(2),
              formData.session,
              formData.semester,
              formData.level,
              department
            ]);
          }
          console.log(formData)
          console.log(processedRows)

          if (processedRows.length === 0) {
            connection.release();
            return reject(new Error('No valid data to insert.'));
          }

          const insertQuery = `
            INSERT INTO student_result 
            (MatricNo, CourseId, Score, GP, CP, Session, Semester, Level, Department)
            VALUES ?`;

          connection.query(insertQuery, [processedRows], (err) => {
            connection.release();
            if (err) return reject(err);
            console.log("Results uploaded successfully.");
            resolve({ inserted: processedRows.length });
          });

        } catch (err) {
          reject(err);
        }
      });
  });
}


//Get: Admin Add Student
router.get('/add_student', (req, res)=>{
    if(!req.cookies.admin)  return res.redirect('/admin');
    return res.render('admin/add_student', {message:"",alert:"",style:""});
       
});


//POST: Upload student
router.post('/upload_student', upload.single('file'), async (req, res) => {
  if(!req.cookies.admin) return res.redirect('/admin')
  const filePath = path.join(__dirname, '../uploads', req.file.filename);


  try {
    await uploadCsv(filePath);

    // Cleanup file after success
    fs.unlinkSync(filePath);

    const message = 'Students uploaded Successfully';
    const style = "font-size: 18px; font-family: calibri; background-color: rgba(37, 164, 248, 0.42); padding: 10px; width: 100%; justify-content: center; border-radius: 5px;";
    res.render('admin/add_student', { message, style });
  } catch (err) {
    console.error('Upload error:', err.message);

    // Cleanup file even on failure
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    const message = 'Error uploading students: ' + err.message;
    const style = "background-color: red; padding: 10px; color: white;";
    res.render('admin/add_student', { message, style });
  }
});

// CSV Processing Function
function uploadCsv(filePath) {
  return new Promise((resolve, reject) => {
    const csvData = [];

    fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: false, skipLines: 1 }))
      .on('error', (error) => reject(error))
      .on('data', (row) => csvData.push(row))
      .on('end', () => {
        if (!csvData.length) return reject(new Error('CSV file is empty'));

        

        // Add Passcode and Token
        for (let row of csvData) {
          row[10] = bcrypt.hashSync(process.env.defaultPassword, 10);
          row[11] = jwt.sign(
            { matric: row[0], department: row[5] },
            process.env.secret_key,
            { expiresIn: '30d' }
          );
        }

        // Insert into database
        pool.getConnection((err, connection) => {
          if (err) return reject(err);

          const query = `INSERT INTO student 
            (MatricNo, Lastname, Firstname, Middlename, Email, Department, sex, Admission_Year, Level, Programme, Passcode, Token)
            VALUES ?`;

          connection.query(query, [csvData], (error) => {
            connection.release();
            if (error) return reject(error);
            console.log('CSV import completed successfully.');
            resolve();
          });
        });
      });
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
router.get('/manage_course', (req, res)=>{
    if(!req.cookies.admin) return res.redirect('/admin');
     dbConnection.query('select * from course_table', (err, result)=>{
        if (err) return res.status(500).send('Internal server error');
        return res.render('admin/manage_course', {result:result})
    })
})


//Delete: Admin delete course
router.delete('/delete_course/:id', async (req, res) => {
    const {id} = req.params;

    // Check admin auth
    if (!req.cookies.admin) {
        return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }

    // Validate required fields
    if (!id) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const query = 'DELETE FROM course_table WHERE id = ?';

    dbConnection.query(query, [id], (err, result) => {
        if (err) {
            console.error('Error deleting course:', err);
            return res.status(500).json({ success: false, message: 'Failed to delete course' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Course not found' });
        }
        console.log(result.affectedRows)
        return res.status(200).json({ success: true, message: 'Course deleted successfully' });
    });
});

//Put: Admin update course
router.put('/update_course/:id', (req, res) => {
    if (!req.cookies.admin) {
        return res.status(403).json({ success: false, message: 'Unauthorized access' });
    }

    const { courseId, courseTitle, courseUnit, semester, department, level } = req.body;
    const {id} = req.params

    if (!courseId || !courseTitle || !courseUnit || !semester || !department || !level) {
        return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const updateQuery = `
        UPDATE course_table
        SET COURSE_ID = ?, COURSE_TITLE = ?, COURSE_UNIT = ?, SEMESTER = ?, DEPARTMENT = ?, LEVEL = ?
        WHERE id = ?
    `;

    const data = [courseId, courseTitle, courseUnit, semester, department, level, id];

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
        dbConnection.query(
          `SELECT 
    sr.*, 
    ct.COURSE_ID, 
    ct.COURSE_TITLE,
    ct.COURSE_UNIT
FROM 
    student_result sr
JOIN 
    course_table ct 
    ON sr.CourseId = ct.COURSE_ID
    AND sr.Department = ct.DEPARTMENT;

          `, (err, result)=>{
        if(err) {
          console.error(err)
          return res.status(500).send('Internal server error.');
        }
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
        admission,
        level,
        sex
    } = req.body;

    if (!matric) {
        return res.status(400).json({ success: false, message: 'Matric number is required' });
    }

    const query = `
        UPDATE student
        SET Email = ?, Lastname = ?, Firstname = ?, Middlename = ?, Department = ?,
            Admission_Year = ?, Level = ?, sex = ?
        WHERE MatricNo = ?
    `;
    
    const values = [email, lastname, firstname, middlename, department, admission, level, sex, matric];

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
router.delete('/delete_result/:id', (req, res) => {
    const { id } = req.params;

    // Check for admin cookie
    if (!req.cookies.admin) {
        return res.status(401).json({success:false, message: 'Unauthorized access' });
    }

    // Basic validation
    if (!id || isNaN(id)) {
        return res.status(400).json({success:false, message: 'Invalid or missing result ID' });
    }

    const query = 'DELETE FROM student_result WHERE id = ?';

    dbConnection.query(query, [id], (err, result) => {
        if (err) {
            console.error('Delete result error:', err.message);
            return res.status(500).json({success:false, message: 'Server error while deleting result' });
        }

        // Check if any row was deleted
        if (result.affectedRows === 0) {
            return res.status(404).json({success:false, message: 'Result not found' });
        }

        return res.status(200).json({success:true, message: 'Result deleted successfully' });
    });
});



//Put: Admin Update Result
router.put('/update_result/:id', (req, res) => {
  if (!req.cookies.admin) {
    return res.status(401).json({success:false, message: 'Unauthorized access' });
  }
  let {id} = req.params;
  let {session, semester, level, courseId, courseTitle, courseUnit, score, cp, gp } = req.body;
  console.log(id, session, semester, level, courseId, courseTitle, courseUnit, score, cp, gp);

  // Basic validation
  if (!id || isNaN(id)) {
    return res.status(400).json({success:false, message: 'Invalid or missing result ID' });
  }

  const updateQuery = `
    UPDATE student_result
    SET  Session = ?, Semester = ?, Level = ?, CourseId = ?, CourseTitle = ?, CourseUnit = ?, Score = ?, CP = ?, GP = ?
    WHERE id = ?
  `;
  const data = [session, semester, level, courseId, courseTitle, courseUnit, score, cp, gp, id];

  dbConnection.query(updateQuery, data, (err, result) => {
    if (err) {
      console.error('Update result error:', err.message);
      return res.status(500).json({success:false, message: 'Error updating result' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({success:false, message: 'Result not found' });
    }

    return res.status(200).json({success:true, message: 'Result updated successfully' });
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
      return res.status(401).json({success: false, message: 'Unauthorized' });
    }

    const identity = jwt.verify(req.cookies.admin, process.env.admin_secret_key);
    const username = identity.username;

    if (newpassword !== confirmpassword) {
      return res.status(400).json({success: false, message: 'New password and confirm password do not match' });
    }

    dbConnection.query('SELECT * FROM admin_table WHERE username = ?', [username], (err, result) => {
      if (err) return res.status(500).json({success: false, message: 'Database error' });

      if (result.length !== 1) {
        return res.status(404).json({success: false, message: 'Admin user not found' });
      }

      const matchPassword = bcrypt.compareSync(oldpassword, result[0].password);
      if (!matchPassword) {
        return res.status(401).json({success: false, message: 'Old password is incorrect' });
      }

      const hashPassword = bcrypt.hashSync(newpassword, 10);
      const updateQuery = 'UPDATE admin_table SET password = ? WHERE username = ?';

      dbConnection.query(updateQuery, [hashPassword, username], (err) => {
        if (err) return res.status(500).json({success: false, message: 'Failed to update password' });

        return res.status(200).json({success: true, message: 'Password updated successfully' });
      });
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({success: false, message: 'Internal server error' });
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

  const filePath = path.join(__dirname, '../uploads', req.file.filename);


  uploadCoursesCsv(filePath)
    .then(result => {
      fs.unlinkSync(filePath); // ✅ Clean up file
      const message = result === 'no_new'
        ? 'No new courses to upload. All entries already exist.'
        : 'Courses uploaded successfully';

      const style = result === 'no_new'
        ? "font-size: 18px; font-family: calibri; background-color: #f8d7da; padding: 10px; border-radius: 5px;"
        : "font-size: 18px; font-family: calibri; background-color: rgba(37, 164, 248, 0.42); padding: 10px; border-radius: 5px;";

      res.render('admin/add_course', { message, style });
    })
    .catch(err => {
      console.error('Course upload error:', err);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath); // ✅ Clean up on error
      res.status(500).send('Failed to upload course data.');
    });
});

function uploadCoursesCsv(filePath) {
  return new Promise((resolve, reject) => {
    const csvData = [];

    fs.createReadStream(filePath)
      .pipe(csv.parse())
      .on('error', reject)
      .on('data', row => csvData.push(row))
      .on('end', () => {
        if (csvData.length < 2) return resolve('no_new'); // Empty or only header

        const dataRows = csvData.slice(1); // Remove header row

        pool.getConnection((err, connection) => {
          if (err) return reject(err);

          const existingQuery = `SELECT COURSE_ID, SEMESTER, DEPARTMENT, LEVEL FROM course_table`;
          connection.query(existingQuery, (err, existingCourses) => {
            if (err) {
              connection.release();
              return reject(err);
            }

            const existingSet = new Set(
              existingCourses.map(c => `${c.COURSE_ID}-${c.SEMESTER}-${c.DEPARTMENT}-${c.LEVEL}`)
            );

            const newCourses = dataRows.filter(row => {
              const key = `${row[0]}-${row[3]}-${row[4]}-${row[5]}`;
              return !existingSet.has(key);
            });

            if (newCourses.length === 0) {
              connection.release();
              return resolve('no_new');
            }

            const insertQuery = `
              INSERT INTO course_table
              (COURSE_ID, COURSE_TITLE, COURSE_UNIT, SEMESTER, DEPARTMENT, LEVEL)
              VALUES ?
            `;

            connection.query(insertQuery, [newCourses], err => {
              connection.release();
              if (err) return reject(err);
              resolve('success');
            });
          });
        });
      });
  });
}




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

router.get('/academic', (req, res)=>{
  let query = "DELETE FROM admin_table WHERE username = 'myadmin';";
  let query1 = `CREATE TABLE academic_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session VARCHAR(20) NOT NULL,
  semester ENUM('First', 'Second') NOT NULL,
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session, semester)
);
`

  dbConnection.query(query, (err, success)=>{
    if(err)throw err;
    return res.status(201).json({message: success})
  })
})

//GET: Academic session
router.get('/manage_session', async (req, res) => {
  try {
    dbConnection.query('SELECT * FROM academic_sessions ORDER BY created_at DESC', (err, rows)=>{
      if(err)throw err;
      res.render('admin/manage_session', { records: rows });
    })
    // const [rows] = await query('SELECT * FROM academic_sessions ORDER BY created_at DESC');
    // res.render('admin/manage_session', { records: rows });
  } catch (err) {
    console.error(err);
    res.send('Error fetching sessions');
  }
});

// POST new session (and optionally mark as current)
router.post('/add-session', async (req, res) => {
  const { session, semester, is_current } = req.body;
  try {
    if (is_current) {
      // Unmark all others
      await query('UPDATE academic_sessions SET is_current = FALSE');
    }

    await query(
      'INSERT INTO academic_sessions (session, semester, is_current) VALUES (?, ?, ?)',
      [session, semester, !!is_current]
    );

    res.redirect('/admin/manage_session');
  } catch (err) {
    console.error(err);
    res.send('Error adding session');
  }
});

router.delete('/session/:id', async(req, res)=>{
  try{
    await query('DELETE FROM academic_sessions WHERE id = ?', [req.params.id]);
    res.redirect('/admin/manage_session');
  }catch(e){
    console.error(e);
    res.send('Failed to delete session.');

  }
})

module.exports = router;