// routes/user.routes.js
const express = require('express');
const router = express.Router();
const User = require('../models/user.model');
const authMiddleware = require('../middlewares/auth.middleware');

// GET /api/user/profile - Get user profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      mobileNo: user.mobileNo,
      aadharCard: user.aadharCard,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/user/profile - Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { fullName, email, mobileNo } = req.body;

    // Validate input
    if (!fullName || !email || !mobileNo) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if email is already taken by another user
    const existingUser = await User.findOne({ 
      email, 
      _id: { $ne: req.userId } 
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    // Update user
    const user = await User.findByIdAndUpdate(
      req.userId,
      { 
        fullName, 
        email, 
        mobileNo,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      mobileNo: user.mobileNo,
      aadharCard: user.aadharCard,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;