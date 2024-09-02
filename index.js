const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const { body, validationResult } = require('express-validator');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();

// Middleware setup
app.use(cors());
app.use(bodyParser.json());
app.use(helmet()); // Security middleware to set HTTP headers
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter); // Apply rate limiting

// MongoDB setup
const MONGODB_URL = process.env.MONGODB_URL;
const PORT = process.env.PORT || 4000;

const logoPath = path.join(__dirname, 'image', 'white-logo.png');

// Email HTML generator
const generateEmailHTML = ({ firstName, lastName, jobTitle, zipCode, email, number, city, country, message }) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: Arial, sans-serif;
            background-color: #f9fafb;
            margin: 0;
            padding: 0;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            border-radius: 10px;
            background-color: #ffffff;
        }
        .header {
            text-align: left;
            padding: 10px 20px;
            background-color: #253C44;
            border-radius: 10px 10px 0 0;
        }
        .header img {
            max-width: 30%;
            height: auto;
        }
        .content {
            padding: 20px;
        }
        .content p {
            line-height: 1.6;
            font-size: 1rem;
            color: #4b5563;
            margin-bottom: 10px;
        }
        .footer {
            text-align: center;
            background-color: #1F242C;
            padding: 10px;
            font-size: 0.875rem;
            color: #9ca3af;
            border-radius: 0 0 10px 10px;
        }
        @media only screen and (max-width: 600px) {
            .container {
                padding: 10px;
            }
            .content p {
                font-size: 0.9rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="cid:logo" alt="Logo">
        </div>
        <div class="content">
            <p><strong>Name:</strong> ${firstName} ${lastName}</p>
            <p><strong>Job Title:</strong> ${jobTitle}</p>
            <p><strong>Zip Code:</strong> ${zipCode}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Number:</strong> ${number}</p>
            <p><strong>City:</strong> ${city}</p>
            <p><strong>Country:</strong> ${country}</p>
            <p><strong>Message:</strong> ${message}</p>
            <p style="margin-top: 30px;">Please do not reply to this email. Emails sent to this address will not be answered.</p>
        </div>
        <div style="text-align: center; background-color: #1F242C; padding: 10px; font-size: 0.875rem; color: #9ca3af;">
            <p>Kemp House, 160 City Road, London, United Kingdom, EC1V 2NX</p>
            <p>&copy; 2024 Charginality | Charging Today, Powering Tomorrow</p>
        </div>
    </div>
</body>
</html>
`;

// Connect to MongoDB
if (!MONGODB_URL) {
    throw new Error('MongoDB URI is not defined in the environment variables');
}
mongoose.connect(MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// Define schema and model
const QuoteRequestSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    jobTitle: { type: String, required: true },
    zipCode: { type: String, required: true },
    email: { type: String, required: true },
    number: { type: String, required: true },
    city: { type: String, required: true },
    country: { type: String, required: true },
    message: { type: String, required: true },
});

const QuoteRequest = mongoose.model('QuoteRequest', QuoteRequestSchema);

// Nodemailer transporter configuration
const transporter = nodemailer.createTransport({
    host: 'smtpout.secureserver.net',
    port: 465, 
    secure: true, 
    auth: {
        user: process.env.EMAIL,
        pass: process.env.PASSWORD,
    },
    tls: {
        rejectUnauthorized: false,
    },
});

// Handle quote requests with validation and sanitization
app.post('/api/quote-request', [
    body('firstName').isString().trim().notEmpty(),
    body('lastName').isString().trim().notEmpty(),
    body('jobTitle').isString().trim().notEmpty(),
    body('zipCode').isString().trim().notEmpty(),
    body('email').isEmail().normalizeEmail(),
    body('number').isString().trim().notEmpty(),
    body('city').isString().trim().notEmpty(),
    body('country').isString().trim().notEmpty(),
    body('message').isString().trim().notEmpty(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const {
        firstName,
        lastName,
        jobTitle,
        zipCode,
        email,
        number,
        city,
        country,
        message
    } = req.body;

    try {
        // Save the request to MongoDB
        const newRequest = new QuoteRequest({
            firstName,
            lastName,
            jobTitle,
            zipCode,
            email,
            number,
            city,
            country,
            message
        });
        await newRequest.save();

        // Email options
        const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            cc: process.env.EMAIL,
            subject: `Charginity: We’ve received your quote request!`,
            html: generateEmailHTML({
                firstName,
                lastName,
                jobTitle,
                zipCode,
                email,
                number,
                city,
                country,
                message
            }),
            attachments: [{
                filename: 'white-logo.png',
                path: logoPath,
                cid: 'logo'
            }]
        };

        // Send email
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                return res.status(500).send(`Failed to send email: ${error.message}`);
            }
            res.status(200).json({
                message: 'Request received and email sent.',
                data: newRequest
            });
        });

    } catch (error) {
        console.error('Error handling request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});