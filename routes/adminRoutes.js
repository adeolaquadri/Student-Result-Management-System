const express = require('express');
const dbConnection = require('../database/connection');
const pool = require('../database/pool')
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const csv = require('fast-csv');
const fs = require('fs');
const multer = require('multer')
const router = express.Router();

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
router.post('/', async(req,res)=>{
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
router.get('/dashboard', (req, res)=>{
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
router.get('/update_session', (req, res)=>{
    if(req.cookies.admin){
        res.render('admin/update_session', {message:"", alert:"", style:""});
    }else{
        res.redirect('/admin');
    }
});


//Put: Admin update academic session
router.put('/update_session', (req, res)=>{
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
router.get('/update_semester', (req, res)=>{
    if(req.cookies.admin){
        res.render('admin/update_semester', {message:"", alert:"", style:""})
    }else{
        res.redirect('/admin')
    }
})


//Put: Admin update academic semester
router.put('/update_semester', (req, res)=>{
    if(req.cookies.admin){
    dbConnection.query('UPDATE academic SET Semester = ?',[req.body.semester], (err)=>{
        if(err)throw err
        return res.status(200).json();
    })
}else{
    res.redirect('/admin');
}
});

//GET: Fetch admin details
router.get('/getadmin', (req, res)=>{
    dbConnection.query('select * from admin_table', (err, result)=>{
        if(err) return res.status(500).json({sqlError: err.sqlMessage})
            return res.status(200).json({admin: result})
    })
})
//GET: Render admin signup page
router.get('/signup', (req, res)=>{
    res.render('admin/signup')
})

//POST: Admin signup
router.post('/signup', (req, res)=>{
    try{
    dbConnection.query('select * from admin_table', (err, result)=>{
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
    if(req.cookies.admin){
    res.render('admin/upload_result', {message: "", alert: "", style:""})
    }else{
        res.redirect('/admin')
    }
})


//Post: Admin Upload Student Result
router.post('/upload_result', upload.single('file'), (req, res)=>{
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
            let query = 'INSERT INTO student_result(MatricNo, CourseId, CourseTitle, Score, CourseUnit, GP, CP,  Session, Semester, Level) values ?'
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
router.get('/add_student', (req, res)=>{
    if(req.cookies.admin){
    res.render('admin/add_student', {message:"",alert:"",style:""});
    }else{
        res.redirect('/admin');
    }
});


//Post: Admin Add student
router.post('/upload_student', upload.single('file'), (req, res)=>{
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
router.get('/add_course', (req, res)=>{
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
router.get('/manage_course',(req, res)=>{
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
router.delete('/delete_course', (req, res)=>{
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
router.put('/update_course', (req, res)=>{
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
router.get('/manage_result', (req, res)=>{
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
router.get('/manage_student',(req, res)=>{
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
router.delete('/delete_student', (req, res)=>{
    let {matric} = req.body
    if(req.cookies.admin){
    dbConnection.query('delete from student where MatricNo = ?', [matric], (err, feedback)=>{
        if(err) return res.status(500).json({message: err.message})
        return res.status(200).json()            
        })
    }else{
        res.redirect('/admin')
    }
})


//Put: Admin update student
router.put('/update_student', (req, res)=>{
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
router.delete('/delete_result', (req, res)=>{
    let {id} = req.body
    if(req.cookies.admin){
        dbConnection.query('delete from student_result where id = ?', [id], (err, feedback)=>{
        if(err) return res.status(500).send(err.message);
        return res.status(200).json();
         });
    }else{
        res.redirect('/admin')
    }
})


//Put: Admin Update Result
router.put('/update_result', (req, res)=>{
        if(req.cookies.admin){
        let {id, matric, session, semester, level, courseId, courseTitle, courseUnit, score, cp, gp} = req.body
        let myquery = 'UPDATE student_result SET MatricNo = ?, Session = ?, Semester = ?, Level = ?, CourseId = ?, \
        CourseTitle = ?, CourseUnit = ?, Score = ?, CP = ?, GP = ? where id = ?'
        let data = [matric, session, semester, level, courseId, courseTitle, courseUnit, score, cp, gp, id]
    dbConnection.query(myquery, data, (err)=>{
        if(err) return res.status(500).json(err.message)
        return res.status(200).json();  
    })
}else{
    res.redirect('/admin');
}
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
        res.redirect('/admin');
    }else{
        const verify = jwt.verify(req.cookies.admin, process.env.admin_secret_key)
        res.render('admin/change_password', {message:"", style: "", username:verify.username})
    }  
});


//Put: Admin change password
router.put('/change_password', (req, res)=>{
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
    let updateQuery = 'UPDATE admin_table SET password = ? WHERE username = ? ';
    dbConnection.query(updateQuery, [hashPassword, username], (err, row)=>{
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

router.get('/reset-password', (req, res)=>{
    res.render('admin/reset_password')
})

//PUT: Admin reset password
router.put('/reset-password', (req, res)=>{
    try{
    const {secretkey, newpassword, confirmpassword, username} = req.body
    dbConnection.query('select * from admin_table where username = ?', [username], (err, result)=>{
            if (err) return res.status(500).send(err.message);
            if(result.length === 1){
            const matchSecretkey = bcrypt.compareSync(secretkey, result[0].secretkey)
            if(confirmpassword !== newpassword) return res.status(403).json();
            if(!matchSecretkey) return res.status(401).json();
            const hashPassword = bcrypt.hashSync(newpassword, 10)
    let updateQuery = 'UPDATE admin_table SET password = ? WHERE username = ?';
    dbConnection.query(updateQuery, [hashPassword, username], (err, row)=>{
        if(err) return res.status(500).json();
        return res.status(200).json();
    })
        }else{
            return res.status(401).json();
        }
    })
}catch(e){
    console.log(e)
    return res.status(500).send(e.message)
}
});


//Post: Admin upload Courses
router.post('/upload_courses', upload.single('file'), (req, res)=>{
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