const User = require('../models/user.model');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken')
require('dotenv').config();


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
    res.json({message : "Login Successfully.",token})

}

module.exports = {
    register,
    login
}
