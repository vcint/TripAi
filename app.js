const express = require('express');
const app = express();
const session=require('express-session');
const flash = require('connect-flash');
const path = require('path');
require('dotenv').config();

app.set('view engine','ejs');
app.set('views', path.join(__dirname,'views'));

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Body Parser
app.use(express.urlencoded({extended:true}));

app.use(
    session({
        secret:'thisWebsiteISbuiltByVinay',
        resave:false,
        saveUninitialized: false,
    })
);

app.use(flash());

// Global Variables Middleware
app.use((req, res, next) => {
    res.locals.messages = req.flash();
    res.locals.user = req.session.user || null;
    next();
  });


app.use('/',require('./routes/index'));
//app.use('/auth',require('./routes/auth'));
//app.use('/',require('./routes/api'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});