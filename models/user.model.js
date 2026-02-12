const mongoose = require('mongoose');

// const userSchema = new mongoose.Schema({
//     fullName : {
//         type : String,
//         required : true,
//     },
//     dob : {
//         type : Date,
//         required : true,
//     },
//     gender : {
//         type : String,
//         enum : ["Male","Female","other"],
//         required : true,
//         default : "Male"
//     },
//     address : {
//         type :String,
//         required : true,
//     },
//     aadharCard : {
//         type : String,
//         required : true,
//         unique : true
//     },
//     mobileNo : {
//         type: Number,
//         required : true,
//         unique : true
//     },
//     email : {
//         type : String,
//         unique : true
//     },
//     password : {
//         type : String,
//         required : true,
//     },
//     createdAt : {
//         type : Date,
//         default : Date.now,
//     }
// })

const userSchema = new mongoose.Schema({
    fullName : {
        type : String,
        required : true,
    },
    aadharCard : {
        type : String,
        required : true,
        unique : true
    },
    mobileNo : {
        type: Number,
        required : true,
        unique : true
    },
    email : {
        type : String,
        unique : true
    },
    password : {
        type : String,
        required : true,
    },
    resetPasswordOtpHash: {
        type: String,
        default: null,
    },
    resetPasswordOtpExpires: {
        type: Date,
        default: null,
    },
    createdAt : {
        type : Date,
        default : Date.now,
    }
})

module.exports = mongoose.model('User',userSchema);
