const Teacher = require('../Models/teacher.model');
const {validationResult} = require('express-validator'); 
const teacherService = require('../Service/teacher.service');  
const blackListTokenModel = require('../Models/blacklistToken.model');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

// Configure nodemailer
var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
    }
});

exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await Teacher.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Generate OTP
        const otp = user.generateOTP();
        await user.save();
        // Send email
        const mailOptions = {
            from: process.env.EMAIL_USERNAME,
            to: email,
            subject: 'Password Reset OTP',
            text: `Your OTP for password reset is: ${otp}. This OTP will expire in 10 minutes.`
        };
        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'OTP sent to email' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const user = await Teacher.findOne({ email });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (!user.verifyOTP(otp)) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }
        // Generate reset token
        const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        user.otp = null;
        user.otpExpires = null;
        await user.save();
        res.status(200).json({ resetToken });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body;
        const user = await Teacher.findOne({
            resetPasswordToken: resetToken,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired reset token' });
        }
        // Hash and set new password
        user.password = await Teacher.hashPassword(newPassword);
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();
        res.status(200).json({ message: 'Password reset successful' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.registerTeacher = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { name, email, password } = req.body;

    const isTeacherAlreadyExist = await Teacher.findOne({ email });

    if (isTeacherAlreadyExist) {
        return res.status(400).json({ message: 'User already exist' });
    }
    const hashedPassword = await Teacher.hashPassword(password);
    const user = await teacherService.createTeacher({
        name,
        email,
        password: hashedPassword
    });
    const token = user.generateAuthToken();
    res.status(201).json({ token, user });
};

exports.loginTeacher = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { email, password } = req.body;

    const user = await Teacher.findOne({ email });

    if (!user) {
        return res.status(400).json({ message: 'User not found' });
    }

    const isValid = await user.comparePassword(password);

    if (!isValid) {
        console.log('Invalid password');
        return res.status(400).json({ message: 'Invalid password' });
    }
    const token = user.generateAuthToken();
    res.cookie('token', token);
    res.status(200).json({ token, user });
}

module.exports.getTeacherProfile = async (req, res, next) => {

    res.status(200).json(req.user);

}

module.exports.logoutTeacher = async (req, res, next) => {
    res.clearCookie('token');
    const token = req.cookies.token || req.headers.authorization.split(' ')[ 1 ];
    await blackListTokenModel.create({ token });
    res.status(200).json({ message: 'Logged out' });
}