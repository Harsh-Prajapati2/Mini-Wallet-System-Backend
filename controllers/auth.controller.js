const User = require('../models/user.model');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const nodemailer = require('nodemailer')
require('dotenv').config();

const RESET_OTP_TTL_MS = 10 * 60 * 1000;

async function sendResetOtpEmail(toEmail, otp, fullName = 'User') {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        throw new Error('Email configuration is missing. Set EMAIL_USER and EMAIL_PASS in backend/.env');
    }

    const transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: toEmail,
        subject: 'Mini Wallet Password Reset OTP',
        text: `Hello ${fullName}, your OTP is ${otp}. It expires in 10 minutes.`
    };

    await transporter.sendMail(mailOptions);
}

const register = async(req,res) => {
    /* try {
        const {fullName,dob,gender,address,aadharCard,mobileNo,email,password} = req.body;
        if(!fullName || !dob || !gender || !address || !aadharCard || !mobileNo || !email || !password){
            return res.status(400).json({error : "All fields are required"});
        }
        const userExists = await User.findOne({email});
        if(userExists){
            return res.status(400).json({error : "User already exists with this email"});
        }
        const mobileNoExists = await User.findOne({mobileNo});
        if(mobileNoExists){
            return res.status(400).json({error : "Mobile number already registered"});
        }
        const hashedPassword = await bcrypt.hash(password,10);
        const user = await User.create({
            fullName,
            dob,
            gender,
            address,
            aadharCard,
            mobileNo,
            email,
            password : hashedPassword,
            createdAt : Date.now()
        });

        res.status(201).json({message : "User registered successfully. Please login to continue."})

    }
    */ 
    try {
        const {fullName,aadharCard,mobileNo,email,password} = req.body;
        if(!fullName || !aadharCard || !mobileNo || !email || !password){
            return res.status(400).json({error : "All fields are required."});
        }
        const userExists = await User.findOne({email});
        if(userExists){
            return res.status(400).json({error : "User already exists with this email."});
        }
        const mobileNoExists = await User.findOne({mobileNo});
        if(mobileNoExists){
            return res.status(400).json({error : "Mobile number already exists."});
        }
        const hashedPassword = await bcrypt.hash(password,10);
        await User.create({
            fullName,
            aadharCard,
            mobileNo,
            email,
            password : hashedPassword,
            createdAt : Date.now()
        });
        return res.status(201).json({message : "User registered successfully. Please login to continue."})
    }
    catch (err){
        console.log(err);
        return res.status(500).json({error : "Registration failed. Please try again."})
    }
} 

const login = async(req,res)=>{
    try {
        const {email,password} = req.body;
        const userValidate = await User.findOne({email});
        if(!userValidate) return res.status(400).send({error : "User not found."});

        const validPassword = await bcrypt.compare(password,userValidate.password);
        if(!validPassword) return res.status(400).send({error : "Invalid Password."});

        const token = jwt.sign({
            userId : userValidate._id,
            email : userValidate.email
        },process.env.JWT_SECRET_KEY,{
            expiresIn : '1d'
        })
        return res.json({message : "Login Successfully.",token})
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({error : "Login failed. Please try again."});
    }
}

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required.' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const otp = crypto.randomInt(100000, 1000000).toString();
        const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

        user.resetPasswordOtpHash = otpHash;
        user.resetPasswordOtpExpires = new Date(Date.now() + RESET_OTP_TTL_MS);
        await user.save();

        try {
            await sendResetOtpEmail(user.email, otp, user.fullName);
        }
        catch (mailErr) {
            user.resetPasswordOtpHash = null;
            user.resetPasswordOtpExpires = null;
            await user.save();
            throw mailErr;
        }

        return res.status(200).json({
            message: 'OTP sent to your email address.'
        });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ error: 'Failed to process forgot password request.' });
    }
}

const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ error: 'Email, OTP and newPassword are required.' });
        }

        if (String(newPassword).length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        if (!user.resetPasswordOtpHash || !user.resetPasswordOtpExpires) {
            return res.status(400).json({ error: 'Please request OTP first.' });
        }

        if (user.resetPasswordOtpExpires <= new Date()) {
            user.resetPasswordOtpHash = null;
            user.resetPasswordOtpExpires = null;
            await user.save();
            return res.status(400).json({ error: 'OTP expired. Please request a new OTP.' });
        }

        const otpHash = crypto.createHash('sha256').update(String(otp)).digest('hex');
        if (otpHash !== user.resetPasswordOtpHash) {
            return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword,10);
        user.password = hashedPassword;
        user.resetPasswordOtpHash = null;
        user.resetPasswordOtpExpires = null;

        await user.save();

        return res.status(200).json({ message: 'Password reset successful. Please login.' });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ error: 'Failed to reset password. Please try again.' });
    }
}

module.exports = {
    register,
    login,
    forgotPassword,
    resetPassword
}
