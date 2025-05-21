const express = require('express');
const dbConnection = require('../database/connection');
const jwt = require('jsonwebtoken');
const router = express.Router();
const bcrypt = require('bcryptjs');
const util = require('util');

//Get: Login Page
router.get('/', (req, res)=>{
    if(!req.cookies.jwt) return res.render('student/login', {message: "", alert: ""});
       return res.redirect('/dashboard');
})

//Post: Student Authentication
router.post('/', async (req, res) => {
  const { matric, password } = req.body;

  try {
    const query = util.promisify(dbConnection.query).bind(dbConnection);

    // Find student by matric number
    const result = await query('SELECT * FROM student WHERE MatricNo = ?', [matric]);

    if (result.length !== 1) {
      return res.render('student/login', {
        message: 'Invalid credential!',
        alert: 'alert alert-danger dismissal',
      });
    }

    const student = result[0];

    // Validate password
    const validatePassword = await bcrypt.compareSync(password, student.Passcode)
    if (!validatePassword) {
      return res.render('student/login', {
        message: 'Incorrect Password!',
        alert: 'alert alert-danger dismissal',
      });
    }

    // Set JWT cookie
    res.cookie('jwt', student.Token, {
      maxAge: parseInt(process.env.expiryTime),
      httpOnly: true,
    });

    return res.redirect('/dashboard');

  } catch (err) {
    console.error(err);
    return res.status(500).send('Internal Server Error');
  }
});



router.get('/dashboard', async (req, res) => {
  if (!req.cookies.jwt) return res.redirect('/');

  try {
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
    const query = util.promisify(dbConnection.query).bind(dbConnection);

    const academic = await query('SELECT * FROM academic_sessions WHERE is_current = TRUE LIMIT 1');
    if (academic.length === 0) throw new Error('No academic session found');

    const studentRows = await query('SELECT * FROM student WHERE MatricNo = ?', [verify.matric]);
    if (studentRows.length === 0) throw new Error('Student not found');

    const student = studentRows[0];
    let current_level;

    if (academic[0].session == student.Admission_Year) {
      current_level = student.Level + 1;
    } else if (academic[0].session == student.Admission_Year + 1) {
      current_level = student.Level + 2;
    } else {
      current_level = 'FGS';
    }

    res.render('student/dashboard', {
      fullname: `${student.Lastname} ${student.Firstname} ${student.Middlename}`,
      matric: verify.matric,
      department: verify.department,
      level: current_level,
      session: academic[0].session,
      semester: academic[0].semester,
      message: "",
      alert: ""
    });

  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});



//Get: Student Logout 
router.get('/logout', (req, res)=>{
    res.cookie('jwt', "",{
        maxAge: 1,
        httpOnly: true,
        sameSite: true
    });
    res.redirect('/');
})


//GET: Student profile
router.get('/profile', async (req, res) => {
  try {
    if (!req.cookies.jwt) {
      return res.redirect('/');
    }

    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
    const query = util.promisify(dbConnection.query).bind(dbConnection);

    const result = await query('SELECT * FROM student WHERE MatricNo = ?', [verify.matric]);

    if (result.length === 0) {
      return res.redirect('/');
    }

    const student = result[0];

    res.render('student/profile', {
      fullname: `${student.Lastname} ${student.Firstname} ${student.Middlename}`,
      matric: verify.matric,
      department: verify.department,
      email: student.Email,
      admissionYear: student.Admission_Year,
      gender: student.sex,
      programme: `${student.Level} ${student.Programme}`,
    });

  } catch (err) {
    console.error(err);
    return res.status(500).send('Internal Server Error');
  }
});



//Get: Student Change Password
router.get('/change_password', async (req, res) => {
  try {
    if (!req.cookies.jwt) {
      return res.redirect('/');
    }

    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
    const query = util.promisify(dbConnection.query).bind(dbConnection);

    const [academic] = await query('SELECT * FROM academic_sessions WHERE is_current = TRUE LIMIT 1');
    const [student] = await query('SELECT * FROM student WHERE MatricNo = ?', [verify.matric]);

    let current_level;
    const admissionYear = student.Admission_Year;

    if (academic.session == admissionYear) {
      current_level = student.Level + 1;
    } else if (academic.session == admissionYear + 1) {
      current_level = student.Level + 2;
    } else {
      current_level = 'FGS';
    }

    if (academic.session - admissionYear > 3) {
      return res.render('student/dashboard', {
        fullname: verify.fullname,
        matric: verify.matric,
        department: verify.department,
        level: current_level,
        session: academic,
        message: 'Your studentship is elapsed! Kindly visit the admin',
        alert: 'alert alert-danger'
      });
    }

    return res.render('student/changepassword', {
      fullname: `${student.Lastname} ${student.Firstname} ${student.Middlename}`,
      matric: verify.matric,
      department: verify.department,
      message: '',
      style: ''
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});


//Put: Student change password
router.put('/new_password', (req, res)=>{
    try{
    const {oldpassword, newpassword, confirmpassword} = req.body
    if(req.cookies.jwt){
       const identity = jwt.verify(req.cookies.jwt, process.env.secret_key)
       const matric = identity.matric;

    dbConnection.query('select * from student where MatricNo = ?', [matric], (err, result)=>{
            if (err) res.status(500);
            if(result.length === 1){
            if(confirmpassword !== newpassword) return res.status(403).json();
            if(oldpassword !== result[0].Passcode) return res.status(401).json();

        let updateQuery = 'UPDATE student SET Passcode = ? WHERE MatricNo = ?';
    dbConnection.query(updateQuery, [newpassword, matric], (err, row)=>{
        if(err) return res.status(500).json();
        return res.status(200).json();
    })
        }
    })
    }
}catch(e){
    return res.status(500).send(e.message)
}
});

//Get: Student Course Registration
router.get('/course_registration', (req, res) => {
  if (!req.cookies.jwt) {
    return res.redirect('/');
  }
  try {
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);

    dbConnection.query('SELECT * FROM academic_sessions WHERE is_current = TRUE LIMIT 1', (err, academicRow) => {
      if (err) throw err;
      const session = academicRow[0].session;
      const semester = academicRow[0].semester;

      dbConnection.query('SELECT * FROM student WHERE MatricNo = ?', [verify.matric], (err, students) => {
        if (err) throw err;
        if (!students.length) return res.redirect('/');

        const student = students[0];
        const department = student.Department;
        let current_level = 'FGS';

        if (session == student.Admission_Year) {
          current_level = student.Level + 1;
        } else if (session == student.Admission_Year + 1) {
          current_level = student.Level + 2;
        }

        // Fetch courses for this level, department, and semester
        const courseQuery = 'SELECT * FROM course_table WHERE SEMESTER = ? AND DEPARTMENT = ? AND LEVEL = ?';
        const unitSumQuery = 'SELECT SUM(COURSE_UNIT) AS total FROM course_table WHERE SEMESTER = ? AND DEPARTMENT = ? AND LEVEL = ?';
        const regCheckQuery = 'SELECT * FROM course_registration WHERE MatricNo = ? AND Department = ? AND Level = ? AND Semester = ?';

        dbConnection.query(courseQuery, [semester, department, current_level], (err, courses) => {
          if (err) throw err;

          dbConnection.query(unitSumQuery, [semester, department, current_level], (err, totals) => {
            if (err) throw err;

            dbConnection.query(regCheckQuery, [verify.matric, department, current_level, semester], (err, existingReg) => {
              if (err) throw err;

              if (existingReg.length) {
                return res.redirect('/Reprint_Course_Form');
              }

              res.render('student/course_reg', {
                fullname: `${student.Lastname} ${student.Firstname} ${student.Middlename}`,
                matric: verify.matric,
                department,
                level: current_level,
                message: "",
                courses,
                total_unit: totals[0].total,
                session,
                session2: session + 1,
                semester
              });
            });
          });
        });
      });
    });
  } catch (e) {
    console.error('JWT error:', e);
    return res.redirect('/');
  }
});

//Post: Student Course Registration
router.post('/course_registration', (req, res) => {
  if (!req.cookies.jwt) return res.redirect('/');

  try {
    const identity = jwt.verify(req.cookies.jwt, process.env.secret_key);
    const { student_id, department, session, semester, level } = req.body;

    // Check for existing registration
    const checkQuery = 'SELECT * FROM course_registration WHERE MatricNo = ? AND Department = ? AND Level = ? AND Semester = ?';
    dbConnection.query(checkQuery, [student_id, department, level, semester], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Server error while checking registration.");
      }

      if (result.length > 0) {
        // Already registered — redirect to reprint page (consider sending data too)
        return res.redirect('/Reprint_Course_Form');
      }

      // Insert new registration
      const insertQuery = `
        INSERT INTO course_registration (MatricNo, Department, Session, Semester, Level, Status)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      dbConnection.query(insertQuery, [student_id, department, session, semester, level, "Registered"], (err) => {
        if (err) {
          console.error(err);
          return res.status(500).send("Server error while registering course.");
        }

        return res.redirect('/course_registration');
      });
    });

  } catch (e) {
    console.error('JWT verification failed:', e);
    return res.redirect('/');
  }
});


//Get: Student Result
router.get('/result', async (req, res) => {
  if (!req.cookies.jwt) return res.redirect('/');

  try {
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
    const query = util.promisify(dbConnection.query).bind(dbConnection);

    // Fetch current academic session info
    const academic = await query('SELECT * FROM academic_sessions WHERE is_current = TRUE LIMIT 1');
    if (academic.length === 0) throw new Error('Academic session not found');

    // Fetch student info by matric
    const students = await query('SELECT * FROM student WHERE MatricNo = ?', [verify.matric]);
    if (students.length === 0) throw new Error('Student not found');

    const student = students[0];
    let current_level;

    if (academic[0].session == student.Admission_Year) {
      current_level = student.Level + 1;
    } else if (academic[0].session == student.Admission_Year + 1) {
      current_level = student.Level + 2;
    } else {
      current_level = 'FGS';
    }

    // Check if student’s session elapsed
    if (academic[0].session - student.Admission_Year > 3) {
      return res.render('student/dashboard', {
        fullname: verify.fullname,
        matric: verify.matric,
        department: verify.department,
        level: current_level,
        session: academic[0].session,
        session2: academic[0].session + 1,
        semester: academic[0].semester,
        message: 'Your studentship is elapsed! Kindly visit the admin',
        alert: 'alert alert-danger',
      });
    }

    // Fetch distinct sessions from course_registration
    const reg = await query('SELECT DISTINCT Session FROM course_registration WHERE MatricNo = ?', [verify.matric]);

    // Fetch GP per session
    const gp = await query('SELECT Session, SUM(GP) / SUM(CourseUnit) AS mygp FROM student_result WHERE MatricNo = ? GROUP BY Session', [verify.matric]);

    if (gp.length < 1) {
      // No results found, render page with appropriate message
      return res.render('student/result.ejs', {
        fullname: `${student.Lastname} ${student.Firstname} ${student.Middlename}`,
        matric: verify.matric,
        department: verify.department,
        level: current_level,
        message: 'No results found.',
        style: 'color: red; font-weight: bold; text-align: center; margin-top: 20px;',
        gp: [],
        reg,
        myresult: [],
        cgpa: null,
        semester: ["First", "Second"],
      });
    }

    // Calculate overall CGPA
    const cgpaResult = await query('SELECT SUM(GP) / SUM(CourseUnit) AS cgpa FROM student_result WHERE MatricNo = ?', [verify.matric]);
    const cgpa = cgpaResult[0]?.cgpa || null;

    // Render result page with all data
    res.render('student/result.ejs', {
      fullname: `${student.Lastname} ${student.Firstname} ${student.Middlename}`,
      matric: verify.matric,
      department: verify.department,
      level: current_level,
      message: "",
      style: "",
      gp,
      reg,
      myresult: [],
      cgpa,
      semester: ["First", "Second"],
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});


//Get: Reprint Course Form
router.get('/RePrint_Course_Form', (req, res) => {
  if (!req.cookies.jwt) return res.redirect('/');

  try {
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);

    dbConnection.query('SELECT * FROM academic_sessions WHERE is_current = TRUE LIMIT 1', (err, academicRows) => {
      if (err) {
        console.error('Academic session fetch error:', err);
        return res.status(500).send("Server error.");
      }

      const academic = academicRows[0];

      dbConnection.query('SELECT * FROM student WHERE MatricNo = ?', [verify.matric], (err, studentRows) => {
        if (err) {
          console.error('Student fetch error:', err);
          return res.status(500).send("Server error.");
        }

        const student = studentRows[0];

        // Determine current level
        let current_level;
        const yearDiff = academic.session - student.Admission_Year;
        if (yearDiff === 0) current_level = student.Level + 1;
        else if (yearDiff === 1) current_level = student.Level + 2;
        else current_level = 'FGS';

        // Check studentship status
        if (yearDiff > 3) {
          return res.render('student/dashboard', {
            fullname: `${student.Lastname} ${student.Firstname} ${student.Middlename}`,
            matric: verify.matric,
            department: verify.department,
            level: current_level,
            session: academic.session,
            session2: academic.session + 1,
            semester: academic.semester,
            message: 'Your studentship is elapsed! Kindly visit the admin',
            alert: 'alert alert-danger'
          });
        }

        const semester = academic.semester;
        const department = verify.department;

        const totalUnitsQuery = `
          SELECT SUM(COURSE_UNIT) as total FROM course_table
          WHERE SEMESTER = ? AND DEPARTMENT = ? AND LEVEL = ?
        `;
        const regCoursesQuery = `
          SELECT * FROM course_registration WHERE MatricNo = ?
        `;
        const courseListQuery = `
          SELECT * FROM course_table WHERE SEMESTER = ? AND DEPARTMENT = ? AND LEVEL = ?
        `;

        dbConnection.query(totalUnitsQuery, [semester, department, current_level], (err, totals) => {
          if (err) {
            console.error('Course unit total error:', err);
            return res.status(500).send("Server error.");
          }

          dbConnection.query(regCoursesQuery, [verify.matric], (err, myresult) => {
            if (err) {
              console.error('Registered courses error:', err);
              return res.status(500).send("Server error.");
            }

            dbConnection.query(courseListQuery, [semester, department, current_level], (err, courses) => {
              if (err) {
                console.error('Courses list fetch error:', err);
                return res.status(500).send("Server error.");
              }

              return res.render('student/reprint_course_form', {
                fullname: `${student.Lastname} ${student.Firstname} ${student.Middlename}`,
                matric: verify.matric,
                department: verify.department,
                level: current_level,
                message: "",
                courses: courses,
                total_unit: totals,
                semester: academic.Semester,
                session: academic.Session,
                session2: academic.Session + 1,
                reprint_courses: myresult
              });
            });
          });
        });
      });
    });
  } catch (e) {
    console.error('JWT verification error:', e);
    return res.redirect('/');
  }
});


//Get: Student View Student
router.get('/view_result', async (req, res) => {
  try {
    if (!req.cookies.jwt) return res.redirect('/');
     // Promisify dbConnection.query
    const query = util.promisify(dbConnection.query).bind(dbConnection);
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);

    const [academic] = await query('SELECT * FROM academic_sessions WHERE is_current = TRUE LIMIT 1');
    const [student] = await query('SELECT * FROM student WHERE MatricNo = ?', [verify.matric]);

    const yearDiff = academic.session - student.Admission_Year;
    let current_level = yearDiff === 0 ? student.Level + 1
                      : yearDiff === 1 ? student.Level + 2
                      : 'FGS';

    if (yearDiff > 3) {
      return res.render('student/dashboard', {
        fullname: `${student.Lastname} ${student.Firstname} ${student.Middlename}`,
        matric: verify.matric,
        department: verify.department,
        level: current_level,
        session: academic.session,
        session2: academic.session + 1,
        semester: academic.semester,
        message: 'Your studentship is elapsed! Kindly visit the admin',
        alert: 'alert alert-danger'
      });
    }

    // Validate query parameters
    const { id, session, gp } = req.query;
    if (!id || !session || !gp) {
      return res.status(400).send("Missing required query parameters.");
    }

    const resultData = await query(
      `SELECT * FROM student_result WHERE MatricNo = ? AND Session = ? ORDER BY CourseId`,
      [id, session]
    );

    const regSessions = await query(
      `SELECT DISTINCT Session FROM course_registration WHERE MatricNo = ?`,
      [id]
    );

    const [cgpaRow] = await query(
      `SELECT SUM(GP) / SUM(CourseUnit) AS cgpa FROM student_result WHERE MatricNo = ?`,
      [verify.matric]
    );

    const [adYearRow] = await query(
      `SELECT Admission_Year FROM student WHERE MatricNo = ?`,
      [verify.matric]
    );

    let tgp = 0, tcu = 0;
    resultData.forEach(r => {
      tgp += r.GP;
      tcu += r.CourseUnit;
    });

    res.render('student/view_result', {
      matric: verify.matric,
      department: verify.department,
      fullname: `${student.Lastname} ${student.Firstname} ${student.Middlename}`,
      level: resultData[0]?.Level || '',
      session: resultData[0]?.Session || '',
      semester: resultData[0]?.Semester || '',
      result: resultData,
      gpa: gp,
      tgp: tgp,
      tcu: tcu,
      cgpa: cgpaRow?.cgpa || 0,
      adYear: adYearRow?.Admission_Year || '',
      reg: regSessions
    });

  } catch (err) {
    console.error("Error in /view_result:", err);
    res.status(500).send("Server error.");
  }
});



//Get: View and Print Course Form
router.get('/Reprint_CourseForm', async (req, res) => {
  try {
    if (!req.cookies.jwt) return res.redirect('/');

    const query = util.promisify(dbConnection.query).bind(dbConnection);
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
    const { id, level, session, department, semester } = req.query;

    // Fetch student data
    const [student] = await query('SELECT * FROM student WHERE MatricNo = ?', [verify.matric]);

    // Fetch registered courses
    const courses = await query(
      `SELECT * FROM course_table WHERE LEVEL = ? AND SEMESTER = ? AND DEPARTMENT = ? ORDER BY COURSE_ID`,
      [level, semester, department]
    );

    // Fetch total course unit
    const [totals] = await query(
      `SELECT SUM(COURSE_UNIT) AS total FROM course_table WHERE SEMESTER = ? AND DEPARTMENT = ? AND LEVEL = ?`,
      [semester, department, level]
    );

    res.render('student/reprint_CF', {
      matric: verify.matric,
      department: verify.department,
      fullname: `${student.Lastname} ${student.Firstname} ${student.Middlename}`,
      level: level,
      session: session,
      semester: semester,
      result: courses,
      total_unit: totals
    });

  } catch (err) {
    console.error("Error in /Reprint_CourseForm:", err);
    res.status(500).send("Internal Server Error.");
  }
});

module.exports = router;