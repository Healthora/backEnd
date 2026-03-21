import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'kebdaniissam780@gmail.com',
        pass: process.env.EMAIL_PASS || 'iadulhwskdohjqsh'
    }
});

async function test() {
    try {
        console.log('Testing with user:', process.env.EMAIL_USER || 'kebdaniissam780@gmail.com');
        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER || 'kebdaniissam780@gmail.com',
            to: 'kebdaniissam780@gmail.com',
            subject: 'Test Email',
            text: 'This is a test'
        });
        console.log('Email sent:', info.messageId);
    } catch (error) {
        console.error('Test failed:', error);
    }
}

test();
