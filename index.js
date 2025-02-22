require('dotenv').config()
// import dependencies
const express = require('express')
const mysql = require('mysql')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const fs = require('fs')
const csv = require('fast-csv')
const path = require('path')
const multer = require('multer')
//setup my server
const app = express()
app.listen(process.env.serverPort, ()=>console.log(`server is running on port ${process.env.serverPort}`))
//middleware
app.use(express.urlencoded({extended: false}))
app.use(express.json())
app.use(cookieParser())
//view engine setup
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.use(express.static('public'))

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
})

const pool = mysql.createPool({
    host:process.env.userHost,
    user: process.env.user,
    password: process.env.userPassword,
    database: process.env.userDB,
    port: process.env.userPort
})

//create database connection
const dbConnection = mysql.createConnection({
    user:process.env.user,
    password:process.env.userPassword,
    host:process.env.userHost,
    port: process.env.userPort,
    database:process.env.userDB,
})
//connect to the database
dbConnection.connect((err)=>{
    if(err) throw err
    console.log('database connected successfully')
})

//Endpoints

//Get: Login Page
app.get('/', (req, res)=>{
    res.render('student/login', {message: "", alert: ""})
})
//Get: Student Dashboard
app.get('/dashboard', (req, res)=>{
    if(req.cookies.jwt){
        dbConnection.query('select * from academic', (err, row)=>{
        if(err) throw err
        const verify = jwt.verify(req.cookies.jwt, process.env.secret_key)
        dbConnection.query(`select * from student where MatricNo = '${verify.matric}'`, (err, result)=>{
        var current_level = null
        if(row[0].Session == result[0].Admission_Year){
            current_level = result[0].Level + 1
        }else if(row[0].Session == result[0].Admission_Year + 1){
            current_level = result[0].Level + 2
        }else{
            current_level = 'FGS'
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
        })
    })
    })
      }else{
        res.redirect('/')
      }
})
//Get: Student Logout 
app.get('/logout', (req, res)=>{
    res.cookie('jwt', "",{
        maxAge: 1,
        httpOnly: true
    })
    res.redirect('/')
})
//Get: Student Profile
app.get('/profile', (req, res)=>{
    if(req.cookies.jwt){
        const verify = jwt.verify(req.cookies.jwt, process.env.secret_key)
      dbConnection.query('select * from student where MatricNo = ?', [verify.matric], (err, result)=>{
        if(err) throw err
            res.render('student/profile', {
            fullname:result[0].Lastname+' '+result[0].Firstname+' '+result[0].Middlename, 
            matric:verify.matric, 
            department:verify.department,
            email:result[0].Email,
            admissionYear:result[0].Admission_Year,
            gender: result[0].sex,
            programme:result[0].Level + ' '+ result[0].Programme
        })
        })
      }else{
        res.redirect('/')
      }
})

//Get: Student Change Password
app.get('/change_password', (req, res)=>{
    if(req.cookies.jwt){
        const verify = jwt.verify(req.cookies.jwt, process.env.secret_key)
        dbConnection.query('select * from academic', (err, row)=>{
            if(err) throw err
        dbConnection.query(`select * from student where MatricNo = '${verify.matric}'`, (err, result)=>{
            if(err) throw err
            if(row[0].Session == result[0].Admission_Year){
                current_level = result[0].Level + 1
            }else if(row[0].Session == result[0].Admission_Year + 1){
                current_level = result[0].Level + 2
            }else{
                current_level = 'FGS'
            }
            if(row[0].Session - result[0].Admission_Year > 3){
                const alert = 'alert alert-danger'
                const message = 'Your studentship is elapsed! Kindly visit the admin'
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
                    })
            }else{
                res.render('student/changepassword', {
                fullname:result[0].Lastname+' '+result[0].Firstname+' '+result[0].Middlename, 
                matric:verify.matric, 
                department:verify.department,
                message: "",
                style: ""
              })
            }
    })
})
        }else{
            res.redirect('/')
        }
})

//Get: Student Course Registration
app.get('/course_registration', (req, res)=>{
    if(req.cookies.jwt){
        const verify = jwt.verify(req.cookies.jwt, process.env.secret_key)
        dbConnection.query('select * from academic', (err, row)=>{
            if(err) throw err
            dbConnection.query(`select * from student where MatricNo = '${verify.matric}'`, (err, result)=>{
                var current_level = null
                if(row[0].Session == result[0].Admission_Year){
                    current_level = result[0].Level + 1
                }else if(row[0].Session == result[0].Admission_Year + 1){
                    current_level = result[0].Level + 2
                }else{
                    current_level = 'FGS'
                }
        dbConnection.query(`select * from course_table where SEMESTER = '${row[0].Semester}' and \ 
            DEPARTMENT = '${verify.department}' and LEVEL = '${current_level}'`, (err, result)=>{
            if(err) throw err
        dbConnection.query(`select sum(COURSE_UNIT) as total from course_table where SEMESTER = '${row[0].Semester}' and \ 
            DEPARTMENT = '${verify.department}' and LEVEL = '${current_level}'`, (err, totals)=>{
                if(err) throw err
         dbConnection.query('select * from course_registration where MatricNo = ? and \
            Department = ? and Level = ? and Semester = ?',[verify.matric, verify.department,
                current_level, row[0].Semester], (err, myres)=>{
                    if(err) throw err
                    if(myres.length == 1){
                    res.redirect('/Reprint_Course_Form')
    }else{
        res.render('student/course_reg', {
            fullname:verify.fullname, 
            matric:verify.matric, 
            department:verify.department,
            level: current_level,
            message: "",
            courses: result,
            total_unit: totals,
            session: row[0].Session,
            session2: row[0].Session + 1,
            semester: row[0].Semester
        })
    }
        })
    })
        })
    })
})
    }else{
        res.redirect('/')
    }
})
//Get: Student Result
app.get('/result', (req, res)=>{ 
    let reg_sessions = []
    var returnGP = []
    var eachGP = []
    var semester = ["First", "Second"]
    var current_level = null
   if(req.cookies.jwt){
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key)
    dbConnection.query('select * from academic', (err, row)=>{
        if(err) throw err
    dbConnection.query(`select * from student where MatricNo = '${verify.matric}'`, (err, result)=>{
        if(err)throw err
        if(row[0].Session == result[0].Admission_Year){
            current_level = result[0].Level + 1
        }else if(row[0].Session == result[0].Admission_Year + 1){
            current_level = result[0].Level + 2
        }else{
            current_level = 'FGS'
        }
        if(err) throw err
        if(row[0].Session - result[0].Admission_Year > 3){
            const alert = 'alert alert-danger'
            const message = 'Your studentship is elapsed! Kindly visit the admin'
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
                
            })
        }else{
        dbConnection.query(`select distinct Session from course_registration where MatricNo = '${verify.matric}'`, (err, reg)=>{
            if(err)throw err
            for(let i = 0; i < reg.length; i++){
                reg_sessions.push(reg[i].Session)
            }
        dbConnection.query(`select Session, sum(GP) / sum(CourseUnit) as mygp from student_result where MatricNo = '${verify.matric}' group by Session`,(err, rows)=>{
            if(err)throw err
            if(rows.length >= 1){
        //Sql query for student overall cgpa
        dbConnection.query(`select sum(GP) / sum(CourseUnit) as cgpa from student_result where MatricNo = '${verify.matric}'`,(err, CGPA)=>{
                    if(err)throw err
        //Sql query for first semester grade point            
        dbConnection.query(`select sum(GP) / sum(CourseUnit) as mygp, Session from student_result where MatricNo = '${verify.matric}' \
            and Semester = 'First' group by Session order by Session`,(err, fisrtSM)=>{
                    if(err)throw err
                    fisrtSM.forEach(fsem => {
                        fsem['Semester'] = 'First'
                    })
                    fisrtSM.forEach(fsm => {
                        eachGP.push(fsm)
                    })
        //Sql query for second semester grade point            
        dbConnection.query(`select sum(GP) / sum(CourseUnit) as mygp, Session from student_result where MatricNo = '${verify.matric}'
           and Semester = "Second" group by Session order by Session`,(err, secondSM)=>{
                if(err)throw err
            res.render('student/result.ejs', {
            fullname:result[0].Lastname+' '+result[0].Firstname+' '+result[0].Middlename, 
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
          })
    })
})
        })
}else{
    const style = "font-size: 18px; font-family: calibri; background-color: rgba(37, 164, 248, 0.42);padding: 10px; width: 100%; justify-content: center; text-align:center;"
    res.render('student/no_result', {
        fullname:result[0].Lastname+' '+result[0].Firstname+' '+result[0].Middlename, 
        matric:verify.matric, 
        department:verify.department,
        level:current_level,
        style: style,
        message: "No result Found",
    })
}
                  })
                })
                }
    })
})
        }else{
            res.redirect('/')
        }
})
//Get: Reprint Course Form
app.get('/RePrint_Course_Form', (req, res)=>{
    if(req.cookies.jwt){
        const verify = jwt.verify(req.cookies.jwt, process.env.secret_key)
        dbConnection.query('select * from academic', (err, row)=>{
            if(err) throw err
        dbConnection.query(`select * from student where MatricNo = '${verify.matric}'`, (err, result)=>{
            var current_level = null
            if(row[0].Session == result[0].Admission_Year){
                current_level = result[0].Level + 1
            }else if(row[0].Session == result[0].Admission_Year + 1){
                current_level = result[0].Level + 2
            }else{
                current_level = 'FGS'
            }
            if(row[0].Session - result[0].Admission_Year > 3){
            const alert = 'alert alert-danger'
            const message = 'Your studentship is elapsed! Kindly visit the admin'
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
                
            })
        }else{
        dbConnection.query(`select sum(COURSE_UNIT) as total from course_table where SEMESTER = '${row[0].Semester}' and \ 
            DEPARTMENT = '${verify.department}' and LEVEL = '${current_level}'`, (err, totals)=>{
                if(err) throw err
        dbConnection.query(`select * from course_registration where MatricNo = '${verify.matric}'`,(err, myresult)=>{
            if(err)throw err
        dbConnection.query(`select * from course_table where SEMESTER = '${row[0].Semester}' and \ 
                DEPARTMENT = '${verify.department}' and LEVEL = '${current_level}'`, (err, courses)=>{
                if(err) throw err
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
        })

        })
    })
        })
    }
    })
    })
        }else{
            res.redirect('/')
        }
})
//Get: Student View Student
app.get('/view_result', (req, res)=>{
    if(req.cookies.jwt){
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key)
    dbConnection.query('select * from academic', (err, row)=>{
        if(err) throw err
    dbConnection.query(`select * from student where MatricNo = '${verify.matric}'`, (err, result)=>{
        if(row[0].Session - result[0].Admission_Year > 3){
            const alert = 'alert alert-danger'
            const message = 'Your studentship is elapsed! Kindly visit the admin'
            var current_level = null
            if(row[0].Session == result[0].Admission_Year){
                current_level = result[0].Level + 1
            }else if(row[0].Session == result[0].Admission_Year + 1){
                current_level = result[0].Level + 2
            }else{
                current_level = 'FGS'
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
                
            })
        }else{
    const {id, session,  gp} = req.query
    dbConnection.query(`select * from student_result where MatricNo = '${id}' \
    and Session = ${session} order by CourseId`, (err, data)=>{
            if(err)throw err
    dbConnection.query(`select distinct Session from course_registration where MatricNo = '${id}'`, (err, reg)=>{
            if(err)throw err
    dbConnection.query(`select sum(GP) / sum(CourseUnit) as cgpa from student_result where MatricNo = '${verify.matric}'`,(err, CGPA)=>{
            if(err)throw err
     dbConnection.query(`select Admission_Year from student where MatricNo = '${id}'`, (err, adYear)=>{
            if(err)throw err
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

            })
        })
    })
         })
        })
        }
    })
})

        }else{
            res.redirect('/')
        }
})
//Get: View and Print Course Form
app.get('/Reprint_CourseForm', (req, res)=>{
    if(req.cookies.jwt){
    const verify = jwt.verify(req.cookies.jwt, process.env.secret_key)
    const {id, level, session, department, semester} = req.query
    dbConnection.query(`select * from student where MatricNo = '${verify.matric}'`, (err, mydata)=>{
         if(err) throw err
    dbConnection.query(`select * from course_table where LEVEL = '${level}' \
         and SEMESTER = '${semester}' and DEPARTMENT = '${department}' order by COURSE_ID`, (err, result)=>{
            if(err)throw err
    dbConnection.query(`select sum(COURSE_UNIT) as total from course_table where SEMESTER = '${semester}' and \ 
                DEPARTMENT = '${department}' and LEVEL = '${level}'`, (err, totals)=>{
            if(err) throw err
            res.render('student/reprint_CF', {
                matric:verify.matric,
                department:verify.department,
                fullname:mydata[0].Lastname+' '+mydata[0].Firstname+' '+mydata[0].Middlename,
                level:level,
                session:session,
                semester:semester,
                result:result,
                total_unit:totals
            })
         })
        })
    })
        }else{
            res.redirect('/')
        }
})
//Get: Admin Login
app.get('/admin', (req, res)=>{
    res.render('admin/admin_login', {message:"", style:""})
})
//Post: Admin Login
app.post('/admin', (req,res)=>{
    try{
        dbConnection.query('select * from admin_table where username = ?',
            [req.body.username], (err, resp)=>{
                if(err)throw err
                if(resp.length == 1){
                 if(req.body.password !== resp[0].password){
                    const message = "Access Denied!"
                    const style = "font-size: 18px; font-family: calibri; background-color: rgba(248, 2, 2, 0.35);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
                    res.render('admin/admin_login', {
                    message:message,
                    style:style,
                })
                }else{
                const token = jwt.sign({username:resp[0].username}, process.env.admin_secret_key, {expiresIn: '30m'})
                res.cookie('jwt', token,{
                    maxAge:process.env.adminExpiryHour,
                    httpOnly: true
                })
                res.redirect('/admin/dashboard')
                }
                }else{
                const message = "Access Denied!"
                const style = "font-size: 18px; font-family: calibri; background-color: rgba(248, 2, 2, 0.35);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
                res.render('admin/admin_login', {
                   message:message,
                   style:style,
                })
            }
            })
    }catch(e){
        console.log(e)
    }
})
//Get: Admin Dashboard
app.get('/admin/dashboard', (req, res)=>{
    if(req.cookies.jwt){
    const verify = jwt.verify(req.cookies.jwt, process.env.admin_secret_key)
    dbConnection.query(`select * from student`, (err, students)=>{
        if(err)throw err
    dbConnection.query(`select * from academic`, (err, academic)=>{
        if(err)throw err
    dbConnection.query(`select distinct COURSE_ID from course_table`, (err, courses)=>{
        if(err) throw err
    dbConnection.query(`select distinct Department from student`, (err, department)=>{
        if(err) throw err
    dbConnection.query(`select * from student_result`, (err, results)=>{
        if(err) throw err
    dbConnection.query(`select * from admin_table`, (err, admin)=>{
        if(err) throw err
    res.render('admin/admin', {
        students:students,
        academic:academic,
        courses:courses,
        department:department,
        results:results,
        admin:admin,
        username:verify.username

    })
})
    })
})
    })
})
    })
    }else{
        res.redirect('/admin')
    }
})
//Get: Admin Update Academic Session
app.get('/admin/update_session', (req, res)=>{
    if(req.cookies.jwt){
        res.render('admin/update_session', {message:"", alert:"", style:""})
    }else{
        res.redirect('/admin')
    }
})
//Post: Admin Update Academic Session
app.post('/admin/update_session', (req, res)=>{
    try{
        if(req.cookies.jwt){
    dbConnection.query('select * from academic', (err, result)=>{
            if(err) throw err
            if(result.length == 1){
                console.log(result)
                console.log(req.body.session)
    dbConnection.query('UPDATE academic SET Session = ?',[req.body.session], (err)=>{
        if(err)throw err
        const message = 'Academic Session Updated Successfully'
        const style = "font-size: 18px; font-family: calibri; background-color: rgba(37, 164, 248, 0.42);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
        const alert = 'alert alert-info'
        res.render('admin/update_session', {
            message: message,
            alert:alert,
            style:style
        })
    })
}else{
    res.redirect('/admin/update_session')
}
})
        }else{
            res.redirect('/admin')
        }
    }catch(e){
        console.log(e)
    }
})
//Get: Admin Update Academic Semester
app.get('/admin/update_semester', (req, res)=>{
    if(req.cookies.jwt){
        res.render('admin/update_semester', {message:"", alert:"", style:""})
    }else{
        res.redirect('/admin')
    }
})
//Post: Admin Update Academic Semester
app.post('/admin/update_semester', (req, res)=>{
    try{
        if(req.cookies.jwt){
    dbConnection.query('select * from academic', (err, result)=>{
            if(err) throw err
            if(result.length == 1){
    dbConnection.query('UPDATE academic SET Semester = ?',[req.body.semester], (err)=>{
        if(err)throw err
        const message = 'Academic Semester Updated Successfully'
        const style = "font-size: 18px; font-family: calibri; background-color: rgba(37, 164, 248, 0.42);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
        const alert = 'alert alert-info'
        res.render('admin/update_semester', {
            message: message,
            alert:alert,
            style:style
        })
    })
}else{
    res.redirect('/admin/update_semester')
}
})
        }else{
            res.redirect('/admin')
        }
    }catch(e){
        console.log(e)
    }
})
//Get: Admin Upload Student Result
app.get('/admin/upload_result', (req, res)=>{
    if(req.cookies.jwt){
    res.render('admin/upload', {message: "", alert: "", style:""})
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
    res.render('admin/upload', {
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
    stream.pipe(fileStream)
}
})
//Get: Admin Add Student
app.get('/admin/add_student', (req, res)=>{
    if(req.cookies.jwt){
    res.render('admin/add_student', {message:"",alert:"",style:""})
    }else{
        res.redirect('/admin')
    }
})
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
              throw err
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
                    throw err
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

//Get: Admin Add New Admin
app.get('/admin/add_admin', (req, res)=>{
    if(req.cookies.jwt){
    res.render('admin/add_admin', {message:"",alert:"",style:""})
    }else{
        res.redirect('/admin')
    }
})
//Post: Admin Add Course
app.get('/admin/add_course', (req, res)=>{
    if(req.cookies.jwt){
    res.render('admin/add_course', {
        message: "",
        alert: "",
        style: ""
    })
}else{
    res.redirect('/admin')
}
})
//Get: Manage Student Result
app.get('/admin/manage_result', (req, res)=>{
    if(req.cookies.jwt){
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
//Get: Manage Admin
app.get('/admin/manage_admin', (req, res)=>{
    if(req.cookies.jwt){
        dbConnection.query('select * from admin_table', (err, result)=>{
            if(err){
                console.log(err)
            }else{
                res.render('admin/manage_admin', {
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
    if(req.cookies.jwt){
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
//Post: Admin Delete Student
app.post('/admin/delete_student', (req, res)=>{
    let {matric} = req.body
    if(req.cookies.jwt){
        dbConnection.query(`delete from student where MatricNo = '${matric}'`, (err, feedback)=>{
            if(err)throw err
                res.redirect('/admin/manage_student')
        })
    }
})
//Post: Admin Update Student
app.post('/admin/update_student', (req, res)=>{
    try{
        if(req.cookies.jwt){
            let {matric, email, lastname, firstname, middlename, department, adYear, password, level, sex} = req.body
    dbConnection.query(`select * from student where MatricNo = '${req.body.matric}'`, (err, result)=>{
            if(err) throw err
            if(result.length == 1){
        let myquery = 'UPDATE student SET Email = ?, Lastname = ?, Firstname = ?, Middlename = ?, Department = ?, \
        Admission_Year = ?, Passcode = ?, Level = ?, sex = ? where MatricNo = ?'
        let data = [email, lastname, firstname, middlename, department, adYear, password, level, sex, matric]
    dbConnection.query(myquery, data, (err)=>{
        if(err)throw err
        res.send(`
            <html>
            <head>
            <title>Success</title>
            </head>
            <body>
            <h4>Student with matriculation number <i>${matric}</i> record updated successfully</h4>
            <span> You will be redirected in 3sec </span>
            <script>
            setTimeout(function(){
            window.location.href = '/admin/manage_student'
            },3000)
            </script>
            </body>
            </html>`)
        
    })
}else{
    res.redirect('/admin/manage_student')
}
})
        }
    }catch(e){
        console.log(e)
    }
})
//Post: Admin Delete Result
app.post('/admin/delete_result', (req, res)=>{
    let {id} = req.body
    if(req.cookies.jwt){
        dbConnection.query(`delete from student_result where id = '${id}'`, (err, feedback)=>{
            if(err)throw err
                res.sendStatus(200);
        })
    }
})
//Post: Admin Update Result
app.post('/admin/update_result', (req, res)=>{
    try{
        if(req.cookies.jwt){
            let {id, matric, session, semester, level, courseId, courseTitle, courseUnit, score, cp, gp} = req.body
    dbConnection.query(`select * from student_result where id = '${id}'`, (err, result)=>{
            if(err) throw err
            if(result.length == 1){
        let myquery = `UPDATE student_result SET MatricNo = ?, Session = ?, Semester = ?, Level = ?, CourseId = ?, \
        CourseTitle = ?, CourseUnit = ?, Score = ?, CP = ?, GP = ? where id = ${id} `
        let data = [matric, session, semester, level, courseId, courseTitle, courseUnit, score, cp, gp]
    dbConnection.query(myquery, data, (err)=>{
        if(err)throw err
        res.sendStatus(200);
        
    })
}else{
    res.redirect('/admin/manage_student')
}
})
        }
    }catch(e){
        console.log(e)
    }
})
//Get: Manage courses
app.get('/admin/manage_course',(req, res)=>{
    if(req.cookies.jwt){
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
//Post: Admin Delete Course
app.post('/admin/delete_course', (req, res)=>{
    let {courseId, semester, department, level} = req.body
    if(req.cookies.jwt){
        let query = 'delete from course_table where COURSE_ID = ? and SEMESTER = ? and DEPARTMENT = ? and LEVEL = ?'
        let data = [courseId, semester, department, level]
        dbConnection.query(query, data, (err, feedback)=>{
            if(err)throw err
                res.sendStatus(200);
        })
    }
})

//Post: Admin Update Course
app.post('/admin/update_course', (req, res)=>{
    try{
        if(req.cookies.jwt){
        let {courseId, courseTitle, courseUnit,semester, department, level} = req.body
        let selectQuery = 'select * from course_table where COURSE_ID = ? and SEMESTER = ? and DEPARTMENT = ? and LEVEL = ?'
    dbConnection.query(selectQuery, [courseId, semester, department, level], (err, result)=>{
            if(err) throw err
            if(result.length == 1){
        let updateQuery = `UPDATE course_table SET COURSE_ID = ?, COURSE_TITLE = ?, COURSE_UNIT = ?, SEMESTER = ?, DEPARTMENT = ?, \
        LEVEL = ? where COURSE_ID = '${courseId}' and SEMESTER = '${semester}' and DEPARTMENT = '${department}' and LEVEL = '${level}'`
        let data = [courseId, courseTitle, courseUnit, semester, department, level]
    dbConnection.query(updateQuery, data, (err)=>{
        if(err)throw err
        res.sendStatus(200);
        
    })
}else{
    res.redirect('/admin/manage_course')
}
})
        }
    }catch(e){
        console.log(e)
    }
})
//Get: Admin Logout
app.get('/admin/logout', (req, res)=>{
    res.cookie('jwt', "",{
        maxAge: 1,
        httpOnly: true
    })
    res.redirect('/admin')
})
//Get: Admin Change Password
app.get('/admin/change_password', (req, res)=>{
    if(!req.cookies.jwt){
        res.redirect('/admin')
    }else{
        const verify = jwt.verify(req.cookies.jwt, process.env.admin_secret_key)
        res.render('admin/change_password', {message:"", style: "", username:verify.username})
    }  
})
//Post: Admin Change Password
app.post('/admin/change_password', (req, res)=>{
    try{
        if(req.cookies.jwt){
            const verify = jwt.verify(req.cookies.jwt, process.env.admin_secret_key)
        dbConnection.query('select * from admin_table where username = ? and password = ?',
             [verify.username, req.body.oldpassword], 
            (err, result)=>{
                if(err) throw err
                var current_level = null
                if(result.length==1){
                    if(req.body.confirmpassword !== req.body.newpassword){
                        const message = 'Passwords do not match'
                        const style = "font-size: 18px; font-family: calibri; background-color: rgba(248, 2, 2, 0.35);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
                        res.render('admin/change_password', {
                            message: message,
                            style:style,
                            username:verify.username
                          })
                       
                    }else{
                    dbConnection.query('UPDATE admin_table SET password = ? where username = ? ',
                        [req.body.newpassword, verify.username], (err)=>{
                            if(err) throw err
                            res.send(`
                                <html>
                                <head>
                                <title>Success</title>
                                </head>
                                <body>
                                <h4>The admin with username <i>'${verify.username}'</i> password has been updated successfully!</h4>
                                <p>You will be redirected to the login page in 5 sec</p>
                                <script>
                                setTimeout(function(){
                                window.location.href = '/admin/logout'
                                },5000)
                                </script>                               
                                </body>
                                </html>`)
                        })
                }
                }else{
                    const message = 'Invalid password'
                    const style = "font-size: 18px; font-family: calibri; background-color: rgba(248, 2, 2, 0.35);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
                    res.render('admin/change_password', {
                        message: message,
                        style:style,
                        username:verify.username
                      })
                }
            })
        }
    }catch(e){
        console.log(e)
    }
})
//End of API routes

//Post: Admin Add New Student
app.post('/admin/add_student', (req, res)=>{
    dbConnection.query('select * from student where MatricNo = ? OR Email = ?', [req.body.matric,
        req.body.email], (err, result)=>{
            if(err) throw err
            if(result.length == 1){
                const message = "Matric number or email is being used!"
                const alert = 'alert alert-danger'
                const style = "font-size: 18px; font-family: calibri; background-color: rgba(248, 2, 2, 0.35);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
                res.render('admin/add_student', {
                    message: message,
                    alert:alert,
                    style:style
                })
            }else{
     
    var query = 'INSERT INTO student values(?,?,?,?,?,?,?,?,?,?,?,?)'
    var {
        matric,
        email,
        lastname,
        firstname,
        middlename,
        department,
        admissionYear,
        level,
        gender,
        programme
    } = req.body
    const token = jwt.sign({matric:matric, department:department, level:level,
        fullname:lastname+' '+firstname+' '+middlename}, process.env.secret_key)
    dbConnection.query(query, [matric, email, lastname, firstname, middlename, department,
        admissionYear, process.env.defaultPassword, level, token, gender, programme],
    (err)=>{
        if(err){
            console.log(err)
        }else{
            res.send(`
                <html>
                <head>
                <title>Success</title>
                </head>
                <body>
                <h4>Student with matriculation number: <i>${matric}</i> added successfully</h4>
                <span> You will be redirected in 3sec </span>
                <script>
                setTimeout(function(){
                window.location.href = '/admin/add_student'
                },3000)
                </script>
                </body>
                </html>`)
        }
    })
     }
    })
})

//Post: Admin Add New Course
app.post('/admin/add_course', (req, res)=> {
    let {courseid, coursetitle, courseunit, semester, department, level} = req.body
    dbConnection.query(`select * from course_table where COURSE_ID = '${courseid}' \
        and DEPARTMENT = '${department}' and LEVEL = '${level}' \
        and SEMESTER = '${semester}'`, (err, result)=>{
            if(err) throw err
            if(result.length == 1){
                const message = 'Duplicating Course!'
                const alert = 'alert alert-info'
                const style = "font-size: 18px; font-family: calibri; background-color: rgba(248, 2, 2, 0.35);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
                res.render('admin/add_course', {
                    message:message,
                    alert:alert,
                    style:style
                })
            }else{
                let query =  'insert into course_table values(?,?,?,?,?,?)'
                let values = [courseid, coursetitle, courseunit, semester, department, level]
                dbConnection.query(query, values, (err, info)=> {
                    if(err){
                        console.log(err)
                    }else{
                        
    const style = "font-size: 18px; font-family: calibri; background-color: rgba(37, 164, 248, 0.42);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
                        const message = 'Course added successfully'
                        const alert = 'alert alert-info'
                        res.render('admin/add_course', {
                            message:message,
                            alert:alert,
                            style:style
                        })
                    }
                })
            }
        })
})
//Post: Student Authentication
app.post('/', (req, res)=>{
    try{
        dbConnection.query('select * from student where MatricNo = ?', 
            [req.body.matric], (err, result)=>{
                if(err) throw err
                if(result.length==1){
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
    }
})
//Post: Admin Add New Admin
app.post('/admin/add_admin', (req, res)=>{
    try{
        dbConnection.query(`select * from admin_table where username = '${req.body.username}'`,(err, result)=>{
            if(err) throw err
            if(result.length == 1){
                res.send(`<html>
                        <head>
                            <title>Error</title>
                            <link rel="icon" href="/images/logo-removebg-preview.png">
                            <script>
                                setTimeout(function() {
                                    window.location.href = '/admin/add_admin'; 
                                }, 5000); // 5 seconds
                            </script>
                        </head>
                        <body>
                            <h1>Error! The username is being taken by another admin</h1>
                            <p>You will be redirected back to the form page in 5 seconds...</p>
                        </body>
                    </html>

                    `)
            }else if(req.body.confirm !== req.body.password){
                const message = "Passwords are not match!"
                const style = "font-size: 18px; font-family: calibri; background-color: rgba(248, 2, 2, 0.35);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
                res.render('admin/add_admin',{
                    message:message,
                    style:style
                     })
            }else{
                let {username, password} = req.body
                dbConnection.query(`insert into admin_table values(?,?)`, [username, password], (err, status)=>{
                    if(err) throw err
                res.send(`
                    <html>
                        <head>
                            <title>Success</title>
                            <link rel="icon" href="/images/logo-removebg-preview.png">
                            <script>
                                setTimeout(function() {
                                    window.location.href = '/admin/add_admin'; 
                                }, 5000); // 5 seconds
                            </script>
                        </head>
                        <body>
                            <h1>Admin with username <i>${req.body.username}</i> has been added successfully</h1>
                            <p>You will be redirected back to the form page in 5 seconds...</p>
                        </body>
                    </html>`)
            })
        }

    })
    }catch(e){
        console.log(e)
    }
})

//Post: Student Course Registration
app.post('/course_registration', (req, res)=>{
    if(req.cookies.jwt){
        const identity = jwt.verify(req.cookies.jwt, process.env.secret_key)
        var matric = req.body.student_id
        var department = req.body.department
        var session =  req.body.session
        var semester =  req.body.semester
        var level =  req.body.level
        var status =  req.body.status
        dbConnection.query('select * from course_registration where MatricNo = ? and \
            Department = ? and Level = ? and Semester = ?',[matric, department, level, semester],
            (err, result)=>{
                if(err) throw err
                if(result.length == 1){
                    res.render('student/reprint_course_form')
                }else{
                    dbConnection.query('insert into course_registration(MatricNo, Department, \
                        Session, Semester, Level, Status) values(?,?,?,?,?,?)',
                        [matric, department, session, semester, level, "Registered"], (err)=>{
                            if(err) throw err
                            res.redirect('/course_registration')
                        })
                }
            })
    }
})

//Post: Student Change Password
app.post('/new_password', (req, res)=>{
    try{
    if(req.cookies.jwt){
    const identity = jwt.verify(req.cookies.jwt, process.env.secret_key)
    dbConnection.query('select * from student where MatricNo = ?',
         [identity.matric], 
        (err, result)=>{
            if(err) throw err
            var current_level = null
            if(result.length==1){
                if(req.body.confirmpassword !== req.body.newpassword){
                    const message = 'Passwords do not match'
                    const style = "font-size: 18px; font-family: calibri; background-color: rgba(248, 2, 2, 0.35);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
                    res.render('student/changepassword', {
                        fullname:result[0].Lastname+' '+result[0].Firstname+' '+result[0].Middlename, 
                        matric:identity.matric, 
                        department:identity.department,
                        level:current_level,
                        message: message,
                        style:style
                      })
                   
                }else if(req.body.oldpassword !== result[0].Passcode){
                    const message = 'Invalid password'
                    const style = "font-size: 18px; font-family: calibri; background-color: rgba(248, 2, 2, 0.35);padding: 10px; width: 100%; justify-content: center; border-radius: 5px;"
                    res.render('student/changepassword', {
                        fullname:result[0].Lastname+' '+result[0].Firstname+' '+result[0].Middlename, 
                        matric:identity.matric, 
                        department:identity.department,
                        message: message,
                        style: style
                })
                }else{
                dbConnection.query('UPDATE student SET Passcode = ? where MatricNo = ? ',
                    [ req.body.newpassword, identity.matric], (err)=>{
                        if(err) throw err
                        res.send(`
                            <html>
                            <head>
                            <title>Success</title>
                            </head>
                            <body>
                            <h4>Password updated successfully!</h4>
                            <p>You will be redirected to the login page in 5 sec</p>
                            <script>
                            setTimeout(function(){
                            window.location.href = '/logout'
                            },5000)
                            </script>                               
                            </body>
                            </html>`)
                    })
            }
            }
        })
    }
}catch(e){
    console.log(e)
}
})
