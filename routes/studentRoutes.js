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
  if(!req.cookies.jwt) return res.status(401).json({success: false, message: "No authorizationtoken found!"})
    try{

    const {oldpassword, newpassword, confirmpassword} = req.body
    const identity = jwt.verify(req.cookies.jwt, process.env.secret_key)
    const matric = identity.matric;

    dbConnection.query('SELECT Passcode FROM student WHERE MatricNo = ?', [matric], (err, student)=>{
      if(err) res.status(500).json({success: false, message: "Database Error"})
     const password = student[0].Passcode;

     if(!oldpassword || !newpassword || !confirmpassword){
      return res.status(400).json({success: false, message: "All fields are required!"})
    }

    const validateOldPassword = bcrypt.compareSync(oldpassword, password);

    if(!validateOldPassword){
      return res.status(400).json({success: false, message: "Your current password is incorrect!"})
    }

    if(confirmpassword !== newpassword){ 
      return res.status(400).json({success: false, message: "Passwords do not match"});
    }
    const updateQuery = 'UPDATE student SET Passcode = ? WHERE MatricNo = ?';
    const hashNewPassword = bcrypt.hashSync(newpassword, 10);


    dbConnection.query(updateQuery, [hashNewPassword, matric], (err, row)=>{
        if(err) return res.status(500).json();
        return res.status(200).json({success: true, message: "Password updated successfully"});
    })
  })
}catch(e){
    console.error(e)
    return res.status(500).json({success: false, message: "Internal Server Error"})
}
});

//Get: Student Course Registration
router.get('/course_registration', async (req, res) => {
  if (!req.cookies.jwt) return res.redirect('/');

  try {
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
    const query = util.promisify(dbConnection.query).bind(dbConnection);

    // Get current session and semester
    const [academicRow] = await query('SELECT * FROM academic_sessions WHERE is_current = TRUE LIMIT 1');
    const session = academicRow.session;
    const semester = academicRow.semester;

    // Get student data
    const [student] = await query('SELECT * FROM student WHERE MatricNo = ?', [verify.matric]);
    if (!student) return res.redirect('/');

    const department = student.Department;

    // Calculate current level
    let current_level = student.Level;
    if (session == student.Admission_Year) {
      current_level = student.Level + 1;
    } else if (session == student.Admission_Year + 1) {
      current_level = student.Level + 2;
    } else {
      current_level = 'FGS';
    }

   const [existingReg] = await query(
      'SELECT * FROM course_registrations WHERE matric_no = ? AND semester = ? AND session_year = ? AND level = ? LIMIT 1',
      [verify.matric, semester, session, current_level]
    );

let courses;
if (existingReg) {
  // Student has already registered, fetch registered courses only
  courses = await query(`
    SELECT ct.*, cr.is_repeat
    FROM course_registrations cr
    JOIN course_table ct ON cr.course_code = ct.COURSE_ID
    AND cr.department = ct.DEPARTMENT
    WHERE cr.matric_no = ?
      AND cr.session_year = ?
      AND cr.semester = ?
      AND cr.level = ?
      AND cr.department = ?
  `, [verify.matric, session, semester, current_level, department]);

} else {
  // Student has not registered, fetch new + repeated courses
  courses = await query(`
    (
      SELECT 
        ct.*, 
        FALSE AS is_repeat
      FROM course_table ct
      WHERE ct.SEMESTER = ? 
        AND ct.DEPARTMENT = ? 
        AND ct.LEVEL = ?
    )
    UNION
    (
      SELECT 
        ct.*,
        TRUE AS is_repeat 
      FROM student_result sr
      JOIN course_table ct 
        ON sr.CourseId = ct.COURSE_ID 
        AND sr.Semester = ct.SEMESTER
        AND ct.DEPARTMENT = ?
      LEFT JOIN course_registrations cr
        ON sr.MatricNo = cr.matric_no 
        AND sr.CourseId = cr.course_code 
        AND cr.session_year = ? 
        AND sr.Semester = cr.semester
      WHERE sr.MatricNo = ?
        AND sr.GP = 0
        AND sr.Session < ?
        AND sr.Semester = ?
        AND cr.course_code IS NULL
    )
  `, [semester, department, current_level, department, session, verify.matric, session, semester]);
}

    const [totalUnitRow] = await query(
      'SELECT SUM(COURSE_UNIT) AS total FROM course_table WHERE SEMESTER = ? AND DEPARTMENT = ? AND LEVEL = ?',
      [semester, department, current_level]
    );

    // Render response
    return res.render('student/course_reg', {
      fullname: `${student.Lastname} ${student.Firstname} ${student.Middlename}`,
      matric: verify.matric,
      department,
      level: current_level,
      message: existingReg ? "Registered" : "Submit Registration",
      courses,
      total_unit: totalUnitRow.total,
      session,
      session2: session + 1,
      semester,
      disabled: existingReg ? "disabled" : ""
    });

  } catch (e) {
    console.error('Course registration error:', e);
    return res.redirect('/');
  }
});


// Handle form submission
router.post('/submit_registration', async(req, res) => {
  if(!req.cookies.jwt) return res.redirect('/');

  const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
  const query = util.promisify(dbConnection.query).bind(dbConnection);

  const { selectedCourses } = req.body;
  console.log('Selected courses:', selectedCourses);
  const matricNo = verify.matric;

   const academic = await query('SELECT * FROM academic_sessions WHERE is_current = TRUE LIMIT 1');
    if (academic.length === 0) throw new Error('No academic session found');
    const sessionYear = academic[0].session;
    const semester = academic[0].semester;

    const studentRows = await query('SELECT * FROM student WHERE MatricNo = ?', [verify.matric]);
    if (studentRows.length === 0) throw new Error('Student not found');

    const student = studentRows[0];
    const department = student.Department;
    let current_level;

    if (academic[0].session == student.Admission_Year) {
      current_level = student.Level + 1;
    } else if (academic[0].session == student.Admission_Year + 1) {
      current_level = student.Level + 2;
    } else {
      current_level = 'FGS';
    }


  if (!selectedCourses || selectedCourses.length === 0) {
    return res.send('No courses selected.');
  }

  // Fetch repeated courses for the student
const repeatedCourses = await query(`
  SELECT DISTINCT sr.CourseId
  FROM student_result sr
  WHERE sr.MatricNo = ?
    AND sr.GP = 0
    AND sr.Session < ?
    AND sr.Semester = ?
`, [matricNo, sessionYear, semester]);

const repeatedCourseIds = repeatedCourses.map(row => row.CourseId);

// Map selected courses with is_repeat status
const values = selectedCourses.map(code => [
  matricNo,
  code,
  sessionYear,
  semester,
  current_level,
  department,
  repeatedCourseIds.includes(code) // is_repeat flag (true/false)
]);

const insertQuery = `
  INSERT INTO course_registrations 
    (matric_no, course_code, session_year, semester, level, department, is_repeat)
  VALUES ?
`;

dbConnection.query(insertQuery, [values], (err, results) => {
  if (err) {
    console.error('DB Error:', err);
    return res.status(500).send('Database error occurred.');
  }
  return res.redirect('/course_registration');
});
});


//Get: Student Result
router.get('/result', async (req, res) => {
  if (!req.cookies.jwt) return res.redirect('/');

  try {
    const token = jwt.verify(req.cookies.jwt, process.env.secret_key);
    const query = util.promisify(dbConnection.query).bind(dbConnection);

    // 1. Get current academic session
    const [academicSession] = await query('SELECT * FROM academic_sessions WHERE is_current = TRUE LIMIT 1');
    if (!academicSession) throw new Error('Current academic session not found');

    // 2. Get student by matric number
    const [student] = await query('SELECT * FROM student WHERE MatricNo = ?', [token.matric]);
    if (!student) throw new Error('Student not found');

    // 3. Determine current level
    let currentLevel;
    const sessionDiff = academicSession.session - student.Admission_Year;
    if (sessionDiff === 0) currentLevel = student.Level + 1;
    else if (sessionDiff === 1) currentLevel = student.Level + 2;
    else currentLevel = 'FGS';

    // 4. Check if studentship has elapsed
    if (sessionDiff > 3) {
      return res.render('student/dashboard', {
        fullname: token.fullname,
        matric: token.matric,
        department: token.department,
        level: currentLevel,
        session: academicSession.session,
        session2: academicSession.session + 1,
        semester: academicSession.semester,
        message: 'Your studentship is elapsed! Kindly visit the admin',
        alert: 'alert alert-danger',
      });
    }

    // 5. Get registered session years
    const registeredSessions = await query(
      'SELECT DISTINCT session_year FROM course_registrations WHERE matric_no = ?',
      [token.matric]
    );

    // 6. Get GP per session
    const sessionGpaQuery = `
    SELECT 
    sr.Session, 
    SUM(sr.GP) / SUM(sr.CourseUnit) AS mygp
FROM 
    student_result sr
JOIN 
    course_registrations cr 
    ON sr.MatricNo = cr.matric_no 
    AND sr.CourseId = cr.course_code 
    AND sr.Session = cr.session_year
WHERE 
    sr.MatricNo = ?
GROUP BY 
    sr.Session
`
    const sessionGPA = await query(sessionGpaQuery, [token.matric]
    );

    // // If no results found
    // if (sessionGPA.length === 0) {
    //   return res.render('student/result.ejs', {
    //     fullname: `${student.Lastname} ${student.Firstname} ${student.Middlename}`,
    //     matric: token.matric,
    //     department: token.department,
    //     level: currentLevel,
    //     message: 'No results found.',
    //     style: 'color: red; font-weight: bold; text-align: center; margin-top: 20px;',
    //     gp: [],
    //     reg: registeredSessions,
    //     myresult: [],
    //     cgpa: null,
    //     semester: ["First", "Second"],
    //   });
    // }

    // 7. Calculate CGPA
    const [cgpaRow] = await query(
      'SELECT SUM(GP) / SUM(CourseUnit) AS cgpa FROM student_result WHERE MatricNo = ?',
      [token.matric]
    );

    const cgpa = cgpaRow?.cgpa || null;

    // 8. Render result page
    res.render('student/result.ejs', {
      fullname: `${student.Lastname} ${student.Firstname} ${student.Middlename}`,
      matric: token.matric,
      department: token.department,
      level: currentLevel,
      message: "",
      style: "",
      gp: sessionGPA,
      reg: registeredSessions,
      myresult: [], // future use: course-by-course breakdown
      cgpa,
      semester: ["First", "Second"],
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Internal server error');
  }
});




//Get: Reprint Course Form
router.get('/RePrint_Course_Form', (req, res) => {
  if (!req.cookies.jwt) return res.redirect('/');

  try {
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
    const Query = `SELECT DISTINCT session_year, semester,
      FROM registered_courses
      WHERE matric_no = ?
      ORDER BY session_year DESC, semester DESC
    `;
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
          SELECT DISTINCT session_year, semester, level FROM course_registrations WHERE matric_no = ?
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

    const resultQuery = `
SELECT r.*, res.*
FROM course_registrations r
JOIN student_result res
  ON r.matric_no = res.MatricNo
  AND r.course_code = res.CourseId
  AND r.session_year = res.Session
WHERE r.matric_no = ?
  AND r.session_year = ?
  AND r.department = ?
ORDER BY res.CourseId;
`

const cgpaQuery = `
SELECT 
    SUM(sr.GP) / SUM(sr.CourseUnit) AS cgpa
FROM 
    student_result sr
JOIN 
    course_registrations cr
    ON sr.MatricNo = cr.matric_no
    AND sr.CourseId = cr.course_code
    AND sr.Session = cr.session_year
WHERE 
    sr.MatricNo = ?

`

    const resultData = await query(resultQuery, [id, session, verify.department]);

    const regSessions = await query(
      `SELECT DISTINCT session_year FROM course_registrations WHERE matric_no = ?`, [id]);

    const [cgpaRow] = await query(cgpaQuery, [verify.matric]);

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
      gpa: tgp / tcu,
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
    const {level, session, department, semester } = req.query;

    const courseQueryList = `SELECT c.*
    FROM course_table c
    JOIN course_registrations r
    ON c.COURSE_ID = r.course_code
    AND c.DEPARTMENT = r.department
    WHERE r.matric_no = ?
    AND r.session_year = ?
    AND r.semester = ?
    AND r.department = ?;
`

    const totalCourseUnit = `SELECT SUM(c.COURSE_UNIT) AS total
    FROM course_table c
    JOIN course_registrations r 
    ON c.COURSE_ID = r.course_code
    AND c.DEPARTMENT = r.department
    WHERE r.matric_no = ?
    AND r.session_year = ?
    AND r.semester = ?
    AND r.department = ?
`

    // Fetch student data
    const [student] = await query('SELECT * FROM student WHERE MatricNo = ?', [verify.matric]);

    // Fetch registered courses
    const courses = await query(courseQueryList, [verify.matric, session, semester, department]);

    // Fetch total course unit
    const [totals] = await query(totalCourseUnit, [verify.matric, session, semester, department]);
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