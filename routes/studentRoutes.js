const express = require('express');
const dbConnection = require('../database/connection');
const jwt = require('jsonwebtoken');
const router = express.Router();

//Get: Login Page
router.get('/', (req, res)=>{
    if(!req.cookies.jwt){
    res.render('student/login', {message: "", alert: ""});
    }else{
        res.redirect('/dashboard')
    }
})

//Post: Student Authentication
router.post('/', async(req, res)=>{
    try{
      const matric = req.body.matric
        dbConnection.query('select * from student where MatricNo = ?', [matric], (err, result)=>{
                if(err) throw err
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
router.get('/dashboard', (req, res)=>{
    if(req.cookies.jwt){
        dbConnection.query('select * from academic', (err, row)=>{
        if(err) throw err;
        const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
        dbConnection.query('select * from student where MatricNo = ?', [verify.matric], (err, result)=>{
        if(err) throw err;
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
router.get('/logout', (req, res)=>{
    res.cookie('jwt', "",{
        maxAge: 1,
        httpOnly: true,
        sameSite: true
    });
    res.redirect('/');
})


//Get: Student Profile
router.get('/profile', (req, res)=>{
    if(req.cookies.jwt){
      const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
      dbConnection.query('select * from student where MatricNo = ?', [verify.matric], (err, result)=>{
        if(err) throw err;
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
router.get('/change_password', (req, res)=>{
    if(req.cookies.jwt){
        const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
        dbConnection.query('select * from academic', (err, row)=>{
            if(err) throw err;
        dbConnection.query('select * from student where MatricNo = ?', [verify.matric], (err, result)=>{
            if(err) throw err;
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
router.get('/course_registration', (req, res)=>{
    if(req.cookies.jwt){
        const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
        dbConnection.query('select * from academic', (err, row)=>{
            if(err) throw err;
            dbConnection.query(`select * from student where MatricNo = '${verify.matric}'`, (err, result)=>{
               if(err) throw err;
                var current_level = null;
                if(row[0].Session == result[0].Admission_Year){
                    current_level = result[0].Level + 1;
                }else if(row[0].Session == result[0].Admission_Year + 1){
                    current_level = result[0].Level + 2;
                }else{
                    current_level = 'FGS';
                }
               let semester = row[0].Semester;
               let department = verify.department;
        dbConnection.query('select * from course_table where SEMESTER = ? and DEPARTMENT = ? and LEVEL = ?',
            [semester, department, current_level], (err, result)=>{
            if(err) throw err;
        dbConnection.query(`select sum(COURSE_UNIT) as total from course_table where SEMESTER =  ? and \ 
            DEPARTMENT = ? and LEVEL = ?`, [semester, department, current_level], (err, totals)=>{
                if(err) throw err;
         dbConnection.query('select * from course_registration where MatricNo = ? and \
            Department = ? and Level = ? and Semester = ?',[verify.matric, department,
                current_level, semester], (err, myres)=>{
                    if(err) throw err;
                    if(myres.length === 1){
                    res.redirect('/Reprint_Course_Form');
    }else{
        dbConnection.query(`select * from student where MatricNo = ?`, [verify.matric], (err, std)=>{
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
router.post('/course_registration', (req, res)=>{
    if(req.cookies.jwt){
        const identity = jwt.verify(req.cookies.jwt, process.env.secret_key);
        const {student_id, department, session, semester, level, status} = req.body;
        dbConnection.query('select * from course_registration where MatricNo = ? and \
            Department = ? and Level = ? and Semester = ?',[student_id, department, level, semester],
            (err, result)=>{
                if(err) throw err;
                if(result.length === 1){
                    res.render('student/reprint_course_form')
                }else{
                    dbConnection.query('INSERT INTO course_registration(MatricNo, Department, \
                        Session, Semester, Level, Status) values(?,?,?,?,?,?)',
                        [student_id, department, session, semester, level, "Registered"], (err)=>{
                            if(err) throw err;
                            res.redirect('/course_registration');
                        })
                }
            })
    }
})

//Get: Student Result
router.get('/result', (req, res)=>{ 
    let reg_sessions = [];
    var returnGP = [];
    var eachGP = [];
    var semester = ["First", "Second"];
    var current_level = null;
   if(req.cookies.jwt){
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
    dbConnection.query('select * from academic', (err, row)=>{
        if(err) throw err;
    dbConnection.query(`select * from student where MatricNo = ?`, [verify.matric], (err, result)=>{
        if(err)  throw err;
        if(row[0].Session == result[0].Admission_Year){
            current_level = result[0].Level + 1;
        }else if(row[0].Session == result[0].Admission_Year + 1){
            current_level = result[0].Level + 2;
        }else{
            current_level = 'FGS';
        }
        if(err) throw err;
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
        dbConnection.query(`select distinct Session from course_registration where MatricNo = ?`,
          [verify.matric], (err, reg)=>{
            if(err) throw err;
            for(let i = 0; i < reg.length; i++){
                reg_sessions.push(reg[i].Session);
            }
        dbConnection.query(`select Session, sum(GP) / sum(CourseUnit) as mygp from student_result where MatricNo = ? group by Session`,
         [verify.matric], (err, rows)=>{
            if(err) throw err;
            if(rows.length >= 1){
        //Sql query for student overall cgpa
        dbConnection.query(`select sum(GP) / sum(CourseUnit) as cgpa from student_result where MatricNo = ?`, [verify.matric], (err, CGPA)=>{
            if(err) throw err;
        //Sql query for first semester grade point            
        dbConnection.query(`select sum(GP) / sum(CourseUnit) as mygp, Session from student_result where MatricNo = ? \
            and Semester = 'First' group by Session order by Session`, [verify.matric], (err, fisrtSM)=>{
                    if(err) throw err;
                    fisrtSM.forEach(fsem => {
                        fsem['Semester'] = 'First';
                    })
                    fisrtSM.forEach(fsm => {
                        eachGP.push(fsm);
                    })
        //Sql query for second semester grade point            
        dbConnection.query(`select sum(GP) / sum(CourseUnit) as mygp, Session from student_result where MatricNo = ?
           and Semester = "Second" group by Session order by Session`, [verify.matric], (err, secondSM)=>{
                if(err) throw err;
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
router.get('/RePrint_Course_Form', (req, res)=>{
    if(req.cookies.jwt){
        const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
        dbConnection.query('select * from academic', (err, row)=>{
            if(err) throw err;
        dbConnection.query(`select * from student where MatricNo = ?`, [verify.matric], (err, result)=>{
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
         let semester = row[0].Semester;
         let department = verify.department;
        dbConnection.query(`select sum(COURSE_UNIT) as total from course_table where SEMESTER = ? and \ 
            DEPARTMENT = ? and LEVEL = ?`, [semester, department, current_level], (err, totals)=>{
            if(err) throw err;
        dbConnection.query(`select * from course_registration where MatricNo = ?`, [verify.matric], (err, myresult)=>{
            if(err) throw err;
        dbConnection.query(`select * from course_table where SEMESTER = ? and \ 
                DEPARTMENT = ? and LEVEL = ?`, [semester, department, current_level], (err, courses)=>{
            if(err) throw err;
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
router.get('/view_result', (req, res)=>{
    if(req.cookies.jwt){
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
    dbConnection.query('select * from academic', (err, row)=>{
        if(err) throw err;
    dbConnection.query(`select * from student where MatricNo = ?`, [verify.matric], (err, result)=>{
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
    dbConnection.query(`select * from student_result where MatricNo = ? \
    and Session = ? order by CourseId`, [id , session], (err, data)=>{
            if(err)throw err;
    dbConnection.query(`select distinct Session from course_registration where MatricNo = ?`, [id], (err, reg)=>{
            if(err)throw err;
    dbConnection.query(`select sum(GP) / sum(CourseUnit) as cgpa from student_result where MatricNo = ?`, [verify.matric], (err, CGPA)=>{
            if(err)throw err;
     dbConnection.query(`select Admission_Year from student where MatricNo = ?`, [verify.matric], (err, adYear)=>{
            if(err)throw err;
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
router.get('/Reprint_CourseForm', (req, res)=>{
    if(req.cookies.jwt){
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key);
    const {id, level, session, department, semester} = req.query;
    dbConnection.query(`select * from student where MatricNo = `, [verify.matric], (err, mydata)=>{
         if(err) throw err;
    dbConnection.query(`select * from course_table where LEVEL = \
         and SEMESTER = ? and DEPARTMENT = ? order by COURSE_ID`, [level, semester, department], (err, result)=>{
            if(err)throw err;
    dbConnection.query(`select sum(COURSE_UNIT) as total from course_table where SEMESTER = ? and \ 
                DEPARTMENT = ? and LEVEL = ?`, [semester, department, level], (err, totals)=>{
            if(err) throw err;
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

module.exports = router;