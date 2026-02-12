const User = require('../models/user.model');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
require('dotenv').config();

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

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

        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

        user.resetPasswordToken = resetTokenHash;
        user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        await user.save();

        return res.status(200).json({
            message: 'Reset token generated successfully.',
            // No mail service is configured yet, so return a token for the frontend flow.
            resetToken
        });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ error: 'Failed to process forgot password request.' });
    }
}

const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and newPassword are required.' });
        }

        if (String(newPassword).length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({
            resetPasswordToken: resetTokenHash,
            resetPasswordExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired reset token.' });
        }

        const hashedPassword = await bcrypt.hash(newPassword,10);
        user.password = hashedPassword;
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;

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
