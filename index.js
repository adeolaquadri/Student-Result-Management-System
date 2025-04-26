require('dotenv').config();
// import dependencies
const express = require('express');
const mysql = require('mysql');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const csv = require('fast-csv');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs');

//setup my server
const app = express();
const port = process.env.serverPort;

//middleware
app.use(express.urlencoded({extended: false}));
app.use(express.json());
app.use(cookieParser());

//view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static('public'));

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

const pool = mysql.createPool({
    host:process.env.userHost,
    user: process.env.user,
    password: process.env.userPassword,
    database: process.env.userDB,
    port: process.env.userPort
});


//create database connection
const dbConnection = mysql.createConnection({
    user:process.env.user,
    password:process.env.userPassword,
    host:process.env.userHost,
    port: process.env.userPort,
    database:process.env.userDB,
});

//connect to the database
dbConnection.connect((err)=>{
    if(err) res.status(500).send(err.message)
    console.log('database connected successfully')
});

//Student endpoints

//Get: Login Page
app.get('/', (req, res)=>{
    if(!req.cookies.jwt){
    res.render('student/login', {message: "", alert: ""});
    }else{
        res.redirect('/dashboard')
    }
})

//Post: Student Authentication
app.post('/', (req, res)=>{
    try{
        dbConnection.query('select * from student where MatricNo = ?', 
            [req.body.matric], (err, result)=>{
                if(err) return res.status(500).send(err.message)
                if(result.length === 1){
                 if(req.body.password !== result[0].Passcode){
                    const message = 'Incorrect Password!'
                    const alert = 'alert alert-danger dismissal'
                    res.render('student/login', {
                        message: message,
                        alert:alert})
                }else{
                    const token = result[0].Token
                    res.cookie('jwt', token,{
                        maxAge: process.env.expiryTime,
                        httpOnly: true
                      })
                    res.redirect('/dashboard')
                }
            }else{
                const message = 'Invalid credential!'
                const alert = 'alert alert-danger dismissal'
                res.render('student/login', {
                    message: message,
                    alert:alert})
            }
            })
    }catch(e){
        console.log(e)
        return res.status(500).send(e.message)
    }
})

//Get: Student Dashboard
app.get('/dashboard', (req, res)=>{
    if(req.cookies.jwt){
        dbConnection.query('select * from academic', (err, row)=>{
        if(err) return res.status(500).send(err.message);
        const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
        dbConnection.query(`select * from student where MatricNo = '${verify.matric}'`, (err, result)=>{
            if(err) res.status(500).send(err.message);
        var current_level = null;
        if(row[0].Session == result[0].Admission_Year){
            current_level = result[0].Level + 1;
        }else if(row[0].Session == result[0].Admission_Year + 1){
            current_level = result[0].Level + 2;
        }else{
            current_level = 'FGS';
        }
          res.render('student/dashboard', {
            fullname:result[0].Lastname+' '+result[0].Firstname+' '+result[0].Middlename,
            matric:verify.matric, 
            department:verify.department,
            level:current_level,
            session: row[0].Session,
            session2: row[0].Session + 1,
            semester: row[0].Semester,
            message: "",
            alert:""
        });
    });
    });
      }else{
        res.redirect('/');
      }
});


//Get: Student Logout 
app.get('/logout', (req, res)=>{
    res.cookie('jwt', "",{
        maxAge: 1,
        httpOnly: true,
        sameSite: true
    });
    res.redirect('/');
})


//Get: Student Profile
app.get('/profile', (req, res)=>{
    if(req.cookies.jwt){
      const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
      dbConnection.query('select * from student where MatricNo = ?', [verify.matric], (err, result)=>{
        if(err) res.status(500).send(err.message);
            res.render('student/profile', {
            fullname:result[0].Lastname+' '+result[0].Firstname+' '+result[0].Middlename, 
            matric:verify.matric, 
            department:verify.department,
            email:result[0].Email,
            admissionYear:result[0].Admission_Year,
            gender: result[0].sex,
            programme:result[0].Level + ' '+ result[0].Programme
        });
        });
      }else{
        res.redirect('/');
      }
})


//Get: Student Change Password
app.get('/change_password', (req, res)=>{
    if(req.cookies.jwt){
        const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
        dbConnection.query('select * from academic', (err, row)=>{
            if(err) res.status(500).send(err.message);
        dbConnection.query(`select * from student where MatricNo = '${verify.matric}'`, (err, result)=>{
            if(err) res.status(500).send(err.message);
            if(row[0].Session == result[0].Admission_Year){
                current_level = result[0].Level + 1;
            }else if(row[0].Session == result[0].Admission_Year + 1){
                current_level = result[0].Level + 2;
            }else{
                current_level = 'FGS';
            }
            if(row[0].Session - result[0].Admission_Year > 3){
                const alert = 'alert alert-danger';
                const message = 'Your studentship is elapsed! Kindly visit the admin';
                res.render('student/dashboard', {
                    fullname:verify.fullname,
                    matric:verify.matric, 
                    department:verify.department,
                    level:current_level,
                    session: row[0].Session,
                    session2: row[0].Session + 1,
                    semester: row[0].Semester,
                    message:message,
                    alert:alert
                    });
            }else{
                res.render('student/changepassword', {
                fullname:result[0].Lastname+' '+result[0].Firstname+' '+result[0].Middlename, 
                matric:verify.matric, 
                department:verify.department,
                message: "",
                style: ""
              });
            }
    });
});
        }else{
            res.redirect('/');
        }
});

//Put: Student change password
app.put('/new_password', (req, res)=>{
    try{
    const {oldpassword, newpassword, confirmpassword} = req.body
    if(req.cookies.jwt){
       const identity = jwt.verify(req.cookies.jwt, process.env.secret_key)
       const matric = identity.matric;

    dbConnection.query('select * from student where MatricNo = ?', [matric], (err, result)=>{
            if (err) return res.status(500).send(err.message);
            if(result.length === 1){
            if(confirmpassword !== newpassword) return res.status(403).json();
            if(oldpassword !== result[0].Passcode) return res.status(401).json();

        let updateQuery = `UPDATE student SET Passcode = '${newpassword}' WHERE MatricNo = '${matric}'`;
    dbConnection.query(updateQuery, (err, row)=>{
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
app.get('/course_registration', (req, res)=>{
    if(req.cookies.jwt){
        const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
        dbConnection.query('select * from academic', (err, row)=>{
            if(err) res.status(500).send(err.message);
            dbConnection.query(`select * from student where MatricNo = '${verify.matric}'`, (err, result)=>{
               if(err) res.status(500).send(err.message);
                var current_level = null;
                if(row[0].Session == result[0].Admission_Year){
                    current_level = result[0].Level + 1;
                }else if(row[0].Session == result[0].Admission_Year + 1){
                    current_level = result[0].Level + 2;
                }else{
                    current_level = 'FGS';
                }
        dbConnection.query(`select * from course_table where SEMESTER = '${row[0].Semester}' and \ 
            DEPARTMENT = '${verify.department}' and LEVEL = '${current_level}'`, (err, result)=>{
            if(err) res.status(500).send(err.message);
        dbConnection.query(`select sum(COURSE_UNIT) as total from course_table where SEMESTER = '${row[0].Semester}' and \ 
            DEPARTMENT = '${verify.department}' and LEVEL = '${current_level}'`, (err, totals)=>{
                if(err) res.status(500).send(err.message);
         dbConnection.query('select * from course_registration where MatricNo = ? and \
            Department = ? and Level = ? and Semester = ?',[verify.matric, verify.department,
                current_level, row[0].Semester], (err, myres)=>{
                    if(err) res.status(500).send(err.message);
                    if(myres.length == 1){
                    res.redirect('/Reprint_Course_Form');
    }else{
        dbConnection.query(`select * from student where MatricNo = '${verify.matric}'`, (err, std)=>{
        res.render('student/course_reg', {
            fullname: std[0].Lastname+' '+std[0].Firstname+' '+std[0].Middlename, 
            matric:verify.matric, 
            department:verify.department,
            level: current_level,
            message: "",
            courses: result,
            total_unit: totals,
            session: row[0].Session,
            session2: row[0].Session + 1,
            semester: row[0].Semester
        });
    });
    }
        });
    });
        });
    });
});
    }else{
        res.redirect('/');
    }
});

//Post: Student Course Registration
app.post('/course_registration', (req, res)=>{
    if(req.cookies.jwt){
        const identity = jwt.verify(req.cookies.jwt, process.env.secret_key);
        const {student_id, department, session, semester, level, status} = req.body;
        dbConnection.query('select * from course_registration where MatricNo = ? and \
            Department = ? and Level = ? and Semester = ?',[student_id, department, level, semester],
            (err, result)=>{
                if(err) return res.status(500).send(err.message);
                if(result.length === 1){
                    res.render('student/reprint_course_form')
                }else{
                    dbConnection.query('insert into course_registration(MatricNo, Department, \
                        Session, Semester, Level, Status) values(?,?,?,?,?,?)',
                        [student_id, department, session, semester, level, "Registered"], (err)=>{
                            if(err) res.status(500).send(err.message);
                            res.redirect('/course_registration');
                        })
                }
            })
    }
})

//Get: Student Result
app.get('/result', (req, res)=>{ 
    let reg_sessions = [];
    var returnGP = [];
    var eachGP = [];
    var semester = ["First", "Second"];
    var current_level = null;
   if(req.cookies.jwt){
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
    dbConnection.query('select * from academic', (err, row)=>{
        if(err) res.status(500).send(err.message);
    dbConnection.query(`select * from student where MatricNo = '${verify.matric}'`, (err, result)=>{
        if(err)res.status(500).send(err.message);
        if(row[0].Session == result[0].Admission_Year){
            current_level = result[0].Level + 1;
        }else if(row[0].Session == result[0].Admission_Year + 1){
            current_level = result[0].Level + 2;
        }else{
            current_level = 'FGS';
        }
        if(err) res.status(500).send(err.message);
        if(row[0].Session - result[0].Admission_Year > 3){
            const alert = 'alert alert-danger';
            const message = 'Your studentship is elapsed! Kindly visit the admin';
            res.render('student/dashboard', {
                fullname:verify.fullname,
                matric:verify.matric, 
                department:verify.department,
                level:current_level,
                session: row[0].Session,
                session2: row[0].Session + 1,
                semester: row[0].Semester,
                message:message,
                alert:alert
                
            });
        }else{
        dbConnection.query(`select distinct Session from course_registration where MatricNo = '${verify.matric}'`, (err, reg)=>{
            if(err)res.status(500).send(err.message);
            for(let i = 0; i < reg.length; i++){
                reg_sessions.push(reg[i].Session);
            }
        dbConnection.query(`select Session, sum(GP) / sum(CourseUnit) as mygp from student_result where MatricNo = '${verify.matric}' group by Session`,(err, rows)=>{
            if(err)res.status(500).send(err.message);
            if(rows.length >= 1){
        //Sql query for student overall cgpa
        dbConnection.query(`select sum(GP) / sum(CourseUnit) as cgpa from student_result where MatricNo = '${verify.matric}'`,(err, CGPA)=>{
                    if(err)res.status(500).send(err.message);
        //Sql query for first semester grade point            
        dbConnection.query(`select sum(GP) / sum(CourseUnit) as mygp, Session from student_result where MatricNo = '${verify.matric}' \
            and Semester = 'First' group by Session order by Session`,(err, fisrtSM)=>{
                    if(err)res.status(500).send(err.message);
                    fisrtSM.forEach(fsem => {
                        fsem['Semester'] = 'First';
                    })
                    fisrtSM.forEach(fsm => {
                        eachGP.push(fsm);
                    })
        //Sql query for second semester grade point            
        dbConnection.query(`select sum(GP) / sum(CourseUnit) as mygp, Session from student_result where MatricNo = '${verify.matric}'
           and Semester = "Second" group by Session order by Session`,(err, secondSM)=>{
                if(err)res.status(500).send(err.message);
            res.render('student/result.ejs', {
            fullname: result[0].Lastname+' '+result[0].Firstname+' '+result[0].Middlename, 
            matric:verify.matric, 
            department:verify.department,
            level:current_level,
            message: "",
            style: "",
            gp:rows,
            reg:reg,
            myresult:returnGP,
            cgpa: CGPA[0].cgpa,
            semester:semester,
          });
    });
});
        });
}else{
    const style = "font-size: 18px; font-family: calibri; background-color: rgba(37, 164, 248, 0.42);padding: 10px; width: 100%; justify-content: center; text-align:center;"
    res.render('student/no_result', {
        fullname:result[0].Lastname+' '+result[0].Firstname+' '+result[0].Middlename, 
        matric:verify.matric, 
        department:verify.department,
        level:current_level,
        style: style,
        message: "No result Found",
    });
}
                  });
                });
                }
    });
});
        }else{
            res.redirect('/')
        }
});


//Get: Reprint Course Form
app.get('/RePrint_Course_Form', (req, res)=>{
    if(req.cookies.jwt){
        const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
        dbConnection.query('select * from academic', (err, row)=>{
            if(err) res.status(500).send(err.message);
        dbConnection.query(`select * from student where MatricNo = '${verify.matric}'`, (err, result)=>{
            var current_level = null;
            if(row[0].Session == result[0].Admission_Year){
                current_level = result[0].Level + 1;
            }else if(row[0].Session == result[0].Admission_Year + 1){
                current_level = result[0].Level + 2;
            }else{
                current_level = 'FGS';
            }
            if(row[0].Session - result[0].Admission_Year > 3){
            const alert = 'alert alert-danger';
            const message = 'Your studentship is elapsed! Kindly visit the admin';
            res.render('student/dashboard', {
                fullname:result[0].Lastname+' '+result[0].Firstname+' '+result[0].Middlename,
                matric:verify.matric, 
                department:verify.department,
                level:current_level,
                session: row[0].Session,
                session2: row[0].Session + 1,
                semester: row[0].Semester,
                message:message,
                alert:alert
                
            });
        }else{
        dbConnection.query(`select sum(COURSE_UNIT) as total from course_table where SEMESTER = '${row[0].Semester}' and \ 
            DEPARTMENT = '${verify.department}' and LEVEL = '${current_level}'`, (err, totals)=>{
            if(err) res.status(500).send(err.message);
        dbConnection.query(`select * from course_registration where MatricNo = '${verify.matric}'`,(err, myresult)=>{
            if(err) res.status(500).send(err.message);
        dbConnection.query(`select * from course_table where SEMESTER = '${row[0].Semester}' and \ 
                DEPARTMENT = '${verify.department}' and LEVEL = '${current_level}'`, (err, courses)=>{
            if(err) res.status(500).send(err.message);
        res.render('student/reprint_course_form', {
            fullname:result[0].Lastname+' '+result[0].Firstname+' '+result[0].Middlename, 
            matric:verify.matric, 
            department:verify.department,
            level:current_level,
            message: "",
            courses: courses,
            total_unit: totals,
            semester: row[0].Semester,
            session: row[0].Session,
            session2: row[0].Session + 1,
            reprint_courses: myresult,
        });

        });
    });
        });
    }
    });
    });
        }else{
            res.redirect('/');
        }
});


//Get: Student View Student
app.get('/view_result', (req, res)=>{
    if(req.cookies.jwt){
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
    dbConnection.query('select * from academic', (err, row)=>{
        if(err) res.status(500).send(err.message);
    dbConnection.query(`select * from student where MatricNo = '${verify.matric}'`, (err, result)=>{
        if(row[0].Session - result[0].Admission_Year > 3){
            const alert = 'alert alert-danger'
            const message = 'Your studentship is elapsed! Kindly visit the admin'
            var current_level = null;
            if(row[0].Session == result[0].Admission_Year){
                current_level = result[0].Level + 1;
            }else if(row[0].Session == result[0].Admission_Year + 1){
                current_level = result[0].Level + 2;
            }else{
                current_level = 'FGS';
            }
            res.render('student/dashboard', {
                fullname:result[0].Lastname+' '+result[0].Firstname+' '+result[0].Middlename,
                matric:verify.matric, 
                department:verify.department,
                level:current_level,
                session: row[0].Session,
                session2: row[0].Session + 1,
                semester: row[0].Semester,
                message:message,
                alert:alert
                });
        }else{
    const {id, session,  gp} = req.query;
    dbConnection.query(`select * from student_result where MatricNo = '${id}' \
    and Session = ${session} order by CourseId`, (err, data)=>{
            if(err)res.status(500).send(err.message);
    dbConnection.query(`select distinct Session from course_registration where MatricNo = '${id}'`, (err, reg)=>{
            if(err)res.status(500).send(err.message);
    dbConnection.query(`select sum(GP) / sum(CourseUnit) as cgpa from student_result where MatricNo = '${verify.matric}'`,(err, CGPA)=>{
            if(err)res.status(500).send(err.message);
     dbConnection.query(`select Admission_Year from student where MatricNo = '${id}'`, (err, adYear)=>{
            if(err)res.status(500).send(err.message);
            let tgp = 0;
            let tcu = 0;
            for(let i = 0; i <  data.length; i++){
             tgp += data[i]['GP']
             tcu += data[i]['CourseUnit']
            }
            res.render('student/view_result', {
                matric:verify.matric,
                department:verify.department,
                fullname: result[0].Lastname+' '+result[0].Firstname+' '+result[0].Middlename,
                level:data[0].Level,
                session:data[0].Session,
                semester:data[0].Semester,
                result:data,
                gpa:gp,
                tgp:tgp,
                tcu:tcu,
                cgpa:CGPA[0].cgpa,
                adYear:adYear[0].Admission_Year,
                reg:reg
            });
        });
    });
         });
        });
        }
    });
});

        }else{
            res.redirect('/');
        }
});


//Get: View and Print Course Form
app.get('/Reprint_CourseForm', (req, res)=>{
    if(req.cookies.jwt){
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
    const {id, level, session, department, semester} = req.query;
    dbConnection.query(`select * from student where MatricNo = '${verify.matric}'`, (err, mydata)=>{
         if(err) res.status(500).send(err.message);
    dbConnection.query(`select * from course_table where LEVEL = '${level}' \
         and SEMESTER = '${semester}' and DEPARTMENT = '${department}' order by COURSE_ID`, (err, result)=>{
            if(err)res.status(500).send(err.message);
    dbConnection.query(`select sum(COURSE_UNIT) as total from course_table where SEMESTER = '${semester}' and \ 
                DEPARTMENT = '${department}' and LEVEL = '${level}'`, (err, totals)=>{
            if(err) res.status(500).send(err.message);
            res.render('student/reprint_CF', {
                matric:verify.matric,
                department:verify.department,
                fullname:mydata[0].Lastname+' '+mydata[0].Firstname+' '+mydata[0].Middlename,
                level:level,
                session:session,
                semester:semester,
                result:result,
                total_unit:totals
            });
         });
        });
    });
        }else{
            res.redirect('/');
        }
});

//Admin endpoints

//Get: Admin Login
app.get('/admin', (req, res)=>{
    res.render('admin/admin_login', {message:"", style:""})
});

//Post: Admin Login
app.post('/admin', async(req,res)=>{
    try{
        const {username, password} = req.body
        dbConnection.query('select * from admin_table where username = ?', [username], async(err, row)=>{
                if(err) return res.status(500).json({error:err.message})
                if(row.length == 1){
                const isValidPassword = await bcrypt.compare(password, row[0].password)
                 if(!isValidPassword){
                    const message = "Access Denied!"
                    const style = "font-size: 18px; font-family: calibri; background-color: rgba(248, 2, 2, 0.35);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
                    res.render('admin/admin_login', {
                    message:message,
                    style:style,
                })
                }else{
                const token = jwt.sign({username:username}, process.env.admin_secret_key)
                res.cookie('admin', token,{
                    maxAge:process.env.adminExpiryHour,
                    httpOnly: true,
                    sameSite: true
                })
                res.redirect('/admin/dashboard');
                }
                }else{
                const message = "Access Denied!";
                const style = "font-size: 18px; font-family: calibri; background-color: rgba(248, 2, 2, 0.35);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
                res.render('admin/admin_login', {
                   message:message,
                   style:style,
                });
            }
            });
    }catch(e){
        console.log(e)
        return res.status(500).json({error: e.message});
    }
});

//POST: Admin Signup
app.post('/admin/register', async(req, res)=>{
    try{
    const password = await bcrypt.hash(req.body.password, 10)
    const {username} = req.body;
    const sql = `INSERT INTO admin_table(username, password) VALUES ('${username}', '${password}')`
    dbConnection.query(sql, [username, password], (err, result)=>{
        if(err) return res.status(500).json({message: `Registration Failed due to ${err.message}`})
        return res.status(200).json({message: "Registration Successful!"});
    })
      }catch(err){
        return res.status(500).json({error: err.message});
      }
});


//Get: Admin Dashboard
app.get('/admin/dashboard', (req, res)=>{
    if(req.cookies.admin){
    const verify = jwt.verify(req.cookies.admin, process.env.admin_secret_key)
    dbConnection.query(`select * from student`, (err, students)=>{
        if(err) return res.status(500).send(err.message);
    dbConnection.query(`select * from academic`, (err, academic)=>{
        if(err) return res.status(500).send(err.message);
    dbConnection.query(`select distinct COURSE_ID from course_table`, (err, courses)=>{
        if(err) return res.status(500).send(err.message);
    dbConnection.query(`select distinct Department from student`, (err, department)=>{
        if(err) return res.status(500).send(err.message);
    dbConnection.query(`select * from student_result`, (err, results)=>{
        if(err) return res.status(500).send(err.message);
    dbConnection.query(`select * from admin_table`, (err, admin)=>{
        if(err) return res.status(500).send(err.message);
    res.render('admin/admin', {
        students:students,
        academic:academic,
        courses:courses,
        department:department,
        results:results,
        admin:admin,
        username:verify.username

    });
});
    });
});
    });
});
    });
    }else{
        res.redirect('/admin');
    }
});


//Get: Admin Update Academic Session
app.get('/admin/update_session', (req, res)=>{
    if(req.cookies.admin){
        res.render('admin/update_session', {message:"", alert:"", style:""});
    }else{
        res.redirect('/admin');
    }
});


//Put: Admin update academic session
app.put('/admin/update_session', (req, res)=>{
    if(req.cookies.admin){
    dbConnection.query('UPDATE academic SET Session = ?',[req.body.session], (err)=>{
        let message;
        if(err) return res.status(500).json(err.message);
        message = 'Academic Session Updated Successfully'
        const style = "font-size: 18px; font-family: calibri; background-color: rgba(37, 164, 248, 0.42);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
        const alert = 'alert alert-info'
        res.render('admin/update_session', {
            message: message,
            alert:alert,
            style:style
        });
    });
}else{
    res.redirect('/admin');
}
});


//Get: Admin Update Academic Semester
app.get('/admin/update_semester', (req, res)=>{
    if(req.cookies.admin){
        res.render('admin/update_semester', {message:"", alert:"", style:""})
    }else{
        res.redirect('/admin')
    }
})


//Put: Admin update academic semester
app.put('/admin/update_semester', (req, res)=>{
    if(req.cookies.admin){
    dbConnection.query('UPDATE academic SET Semester = ?',[req.body.semester], (err)=>{
        if(err)throw err
        return res.status(200).json();
    })
}else{
    res.redirect('/admin');
}
});

app.get('/getadmin', (req, res)=>{
    dbConnection.query('select * from admin_table', (err, result)=>{
        if(err) return res.status(500).json({sqlError: err.sqlMessage})
            return res.status(200).json({admin: result})
    })
})
app.post('/addadmin', (req, res)=>{
    const {username, password} = req.body
    const hashedPassword =  bcrypt.hashSync(password, 10)
    dbConnection.query('insert into admin_table values(?,?)', [username, hashedPassword], (err, result)=>{
        if(err) return res.status(500).json({sqlError: err.sqlMessage})
        return res.status(201).json({message: "Admin registered successfully"})
    })
})
//Get: Admin Upload Student Result
app.get('/admin/upload_result', (req, res)=>{
    if(req.cookies.admin){
    res.render('admin/upload_result', {message: "", alert: "", style:""})
    }else{
        res.redirect('/admin')
    }
})


//Post: Admin Upload Student Result
app.post('/admin/upload_result', upload.single('file'), (req, res)=>{
    uploadCsv(__dirname + "/uploads/"+req.file.filename)
    const message = 'Result uploaded Successfully'
    const style = "font-size: 18px; font-family: calibri; background-color: rgba(37, 164, 248, 0.42);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
    const alert = 'alert alert-info'
    res.render('admin/upload_result', {
        message: message,
        alert:alert,
        style:style
    })
function uploadCsv(path){
    let stream = fs.createReadStream(path)
    let csvDataColl = []
    let fileStream = csv.parse()
    .on('data', function(data){
        csvDataColl.push(data)
        csvDataColl[0][5] = 'GP'
        csvDataColl[0][6] = 'CP'
        csvDataColl[0][7] = 'Session'
        csvDataColl[0][8] = 'Semester'
        csvDataColl[0][9] = 'Level'
    })
    .on('end', function(){
        csvDataColl.shift()
        pool.getConnection((err, connection)=>{
            if(err){
                console.log(err)
            }else{
              var gp = null
              var cp = null
              for(let i = 0; i < csvDataColl.length; i++){
                csvDataColl[i][7] = req.body.session
                csvDataColl[i][8] = req.body.semester
                csvDataColl[i][9] = req.body.level
                if(csvDataColl[i][3] >= 75 && csvDataColl[i][3] <= 100){
                    csvDataColl[i][6] = 4.00
                }else if(csvDataColl[i][3] >= 70 && csvDataColl[i][3] < 75){
                    csvDataColl[i][6] = 3.50
                }else if(csvDataColl[i][3] >= 65 && csvDataColl[i][3] < 70){
                    csvDataColl[i][6] = 3.25
                }else if(csvDataColl[i][3] >= 60 && csvDataColl[i][3] < 65){
                    csvDataColl[i][6] = 3.00
                }else if(csvDataColl[i][3] >= 55 && csvDataColl[i][3] < 60){
                    csvDataColl[i][6]  = 2.75
                }else if(csvDataColl[i][3] >= 50 && csvDataColl[i][3] < 55){
                    csvDataColl[i][6]  = 2.50
                }else if(csvDataColl[i][3] >= 45 && csvDataColl[i][3] < 50){
                    csvDataColl[i][6]  = 2.25
                }else if(csvDataColl[i][3] >= 40 && csvDataColl[i][3] < 45){
                    csvDataColl[i][6]  = 2.00
                }else{
                    csvDataColl[i][6]  = 0.00
                }
                csvDataColl[i][5] =  csvDataColl[i][6]  * csvDataColl[i][4]
            let query = 'insert into student_result(MatricNo, CourseId, CourseTitle, Score, CourseUnit, GP, CP,  Session, Semester, Level) values ?'
            connection.query(query, [csvDataColl], (err, respo)=>{
                if(err){
                    console.log(err)
                }else{
                        console.log("Record added successfully")
                    }
                })
            }
            }
        })
    })
    stream.pipe(fileStream);
}
});


//Get: Admin Add Student
app.get('/admin/add_student', (req, res)=>{
    if(req.cookies.admin){
    res.render('admin/add_student', {message:"",alert:"",style:""});
    }else{
        res.redirect('/admin');
    }
});


//Post: Admin Add student
app.post('/admin/upload_student', upload.single('file'), (req, res)=>{
    function uploadCsv(path){
    let stream = fs.createReadStream(path)
    let csvDataColl = []
    let fileStream = csv.parse()
    .on('data', function(data){
        csvDataColl.push(data)
        csvDataColl[0][10] = 'Passcode'
        csvDataColl[0][11] = 'Token'
    })
    .on('end', function(){
        csvDataColl.shift()
        pool.getConnection((err, connection)=>{
            if(err){
              res.status(500).send(err.message)
            }else{
              for(let i = 0; i < csvDataColl.length; i++){
                if(true){
                 csvDataColl[i][10] = process.env.defaultPassword
                 csvDataColl[i][11] = jwt.sign({matric:csvDataColl[i][0], department:csvDataColl[i][5]}, process.env.secret_key)
                }
            }
                let query = 'INSERT INTO student(MatricNo, Lastname, Firstname, Middlename, Email, Department, sex, Admission_Year, Level, Programme, Passcode, Token) values ?'
                connection.query(query, [csvDataColl], (err, rowsData)=>{
                if(err){
                    res.status(500).send(err.message)
                }
                console.log("Record added successfully")
                })
            }
        })
    })
    stream.pipe(fileStream)
}
uploadCsv(__dirname + "/uploads/"+req.file.filename)
    const message = 'Students uploaded Successfully'
    const style = "font-size: 18px; font-family: calibri; background-color: rgba(37, 164, 248, 0.42);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
    res.render('admin/add_student', {
        message: message,
        style:style
    })
})


//Get: Admin Add Course
app.get('/admin/add_course', (req, res)=>{
    if(req.cookies.admin){
    res.render('admin/add_course', {
        message: "",
        alert: "",
        style: ""
    })
}else{
    res.redirect('/admin');
}
});

//Get: Manage courses
app.get('/admin/manage_course',(req, res)=>{
    if(req.cookies.admin){
    dbConnection.query('select * from course_table', (err, result)=>{
        if(err){
            console.log(err)
        }else{
            res.render('admin/manage_course', {
                result:result
            })
        }
    })
}else{
    res.redirect('/admin')
}
})


//Delete: Admin delete course
app.delete('/admin/delete_course', (req, res)=>{
    let {courseId, semester, department, level} = req.body;
    if(req.cookies.admin){
        let query = 'delete from course_table where COURSE_ID = ? and SEMESTER = ? and DEPARTMENT = ? and LEVEL = ?'
        let data = [courseId, semester, department, level]
        dbConnection.query(query, data, (err, feedback)=>{
        if(err) return res.status(500).json(err.message);
        return res.status(200).json();
        });
    }else{
        res.redirect('/admin');
    }
})


//Put: Admin update course
app.put('/admin/update_course', (req, res)=>{
        if(req.cookies.admin){
        let {courseId, courseTitle, courseUnit,semester, department, level} = req.body
        let selectQuery = 'select * from course_table where COURSE_ID = ? and SEMESTER = ? and DEPARTMENT = ? and LEVEL = ?'

        let updateQuery = `UPDATE course_table SET COURSE_ID = ?, COURSE_TITLE = ?, COURSE_UNIT = ?, SEMESTER = ?, DEPARTMENT = ?, \
        LEVEL = ? where COURSE_ID = '${courseId}' and SEMESTER = '${semester}' and DEPARTMENT = '${department}' and LEVEL = '${level}'`
        let data = [courseId, courseTitle, courseUnit, semester, department, level]
    dbConnection.query(updateQuery, data, (err)=>{
        if(err) return res.status(500).json(err.message);
        return res.status(200).json();  
    })
}else{
    res.redirect('/admin');
}
});

//Get: Manage Student Result
app.get('/admin/manage_result', (req, res)=>{
    if(req.cookies.admin){
    dbConnection.query('select * from student_result', (err, result)=>{
        if(err){
            console.log(err)
        }else{
            res.render('admin/manage_result', {
                result:result
            })
        }
    })
}else{
    res.redirect('/admin')
}
})



//Get: Manage Students
app.get('/admin/manage_student',(req, res)=>{
    if(req.cookies.admin){
    dbConnection.query('select * from student', (err, result)=>{
        if(err){
            console.log(err)
        }else{
            res.render('admin/manage_student', {
                result:result
            })
        }
    })
}else{
    res.redirect('/admin')
}
})


//Delete: Admin delete student
app.delete('/admin/delete_student', (req, res)=>{
    let {matric} = req.body
    if(req.cookies.admin){
    dbConnection.query(`delete from student where MatricNo = '${matric}'`, (err, feedback)=>{
        if(err) return res.status(500).json({message: err.message})
        return res.status(200).json()            
        })
    }else{
        res.redirect('/admin')
    }
})


//Put: Admin update student
app.put('/admin/update_student', (req, res)=>{
        if(req.cookies.admin){
          let {matric, email, lastname, firstname, middlename, department, adYear, password, level, sex} = req.body
          let myquery = 'UPDATE student SET Email = ?, Lastname = ?, Firstname = ?, Middlename = ?, Department = ?, \
        Admission_Year = ?, Passcode = ?, Level = ?, sex = ? where MatricNo = ?'
        let data = [email, lastname, firstname, middlename, department, adYear, password, level, sex, matric]
    dbConnection.query(myquery, data, (err)=>{
        if(err) return res.status(500).json({message: err.message})
        return res.status(200).json()           
    })
}else{
    res.redirect('/admin')
}
})



//Delete: Admin delete result
app.delete('/admin/delete_result', (req, res)=>{
    let {id} = req.body
    if(req.cookies.admin){
        dbConnection.query(`delete from student_result where id = '${id}'`, (err, feedback)=>{
        if(err) return res.status(500).send(err.message);
        return res.status(200).json();
         });
    }else{
        res.redirect('/admin')
    }
})


//Put: Admin Update Result
app.put('/admin/update_result', (req, res)=>{
        if(req.cookies.admin){
        let {id, matric, session, semester, level, courseId, courseTitle, courseUnit, score, cp, gp} = req.body
        let myquery = `UPDATE student_result SET MatricNo = ?, Session = ?, Semester = ?, Level = ?, CourseId = ?, \
        CourseTitle = ?, CourseUnit = ?, Score = ?, CP = ?, GP = ? where id = ${id} `
        let data = [matric, session, semester, level, courseId, courseTitle, courseUnit, score, cp, gp]
    dbConnection.query(myquery, data, (err)=>{
        if(err) return res.status(500).json(err.message)
        return res.status(200).json();  
    })
}else{
    res.redirect('/admin');
}
});


//Get: Admin Logout
app.get('/admin/logout', (req, res)=>{
    res.cookie('admin', "",{
        maxAge: 1,
        httpOnly: true
    })
    res.redirect('/admin');
});


//Get: Admin Change Password
app.get('/admin/change_password', (req, res)=>{
    if(!req.cookies.admin){
        res.redirect('/admin');
    }else{
        const verify = jwt.verify(req.cookies.admin, process.env.admin_secret_key)
        res.render('admin/change_password', {message:"", style: "", username:verify.username})
    }  
});


//Put: Admin change password
app.put('/admin/change_password', (req, res)=>{
    try{
    const {oldpassword, newpassword, confirmpassword} = req.body
    if(req.cookies.admin){
       const identity = jwt.verify(req.cookies.admin, process.env.admin_secret_key);
       const username = identity.username;

    dbConnection.query('select * from admin_table where username = ?', [username], (err, result)=>{
            if (err) return res.status(500).send(err.message);
            if(result.length === 1){
            console.log(result)
            const matchPassword = bcrypt.compareSync(oldpassword, result[0].password);
            if(confirmpassword !== newpassword) return res.status(403).json();
            if(!matchPassword) return res.status(401).json();
            const hashPassword = bcrypt.hashSync(newpassword, 10)
    let updateQuery = `UPDATE admin_table SET password = '${hashPassword}' WHERE username = '${username}'`;
    dbConnection.query(updateQuery, (err, row)=>{
        if(err) return res.status(500).json();
        return res.status(200).json();
    })
        }
    })
    }
}catch(e){
    console.log(e)
    return res.status(500).send(e.message)
}
});



//Post: Admin upload Courses
app.post('/admin/upload_courses', upload.single('file'), (req, res)=>{
    function uploadCsv(path){
    let stream = fs.createReadStream(path)
    let csvDataColl = []
    let fileStream = csv.parse()
    .on('data', function(data){
        csvDataColl.push(data)
    })
    .on('end', function(){
        csvDataColl.shift()
        pool.getConnection((err, connection)=>{
            if(err){
              res.status(500).send(err.message)
            }else{
            let query = 'INSERT INTO course_table(COURSE_ID, COURSE_TITLE, COURSE_UNIT, SEMESTER, DEPARTMENT, LEVEL) values ?'
                connection.query(query, [csvDataColl], (err, rowsData)=>{
                if(err){
                return res.status(500).send('Error uploading courses')
                }
                const message = 'Courses uploaded Successfully'
                const style = "font-size: 18px; font-family: calibri; background-color: rgba(37, 164, 248, 0.42);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
                res.render('admin/add_course', {
                message: message,
                style:style
    })
                })
            }
        })
    })
    stream.pipe(fileStream)
}
uploadCsv(__dirname + "/uploads/"+req.file.filename)
})


//GET: Admin generate student report
app.get('/admin/student-report/', async (req, res) => {
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
//Starting server
app.listen(port, ()=>console.log(`server is running on port ${port}`));
