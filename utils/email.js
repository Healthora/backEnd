import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'kebdaniissam780@gmail.com',
        pass: process.env.EMAIL_PASS || 'ISS+N2327'
    }
});

/**
 * Send reset password email to doctor
 * @param {string} to email address
 * @param {string} resetLink link to reset page
 */
export const sendResetEmail = async (to, resetLink) => {
    const mailOptions = {
        from: `"MedSaaS Support" <${process.env.EMAIL_USER || 'kebdaniissam780@gmail.com'}>`,
        to: to,
        subject: 'Réinitialisation de votre mot de passe - MedSaaS',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e1e1e1; border-radius: 10px;">
                <h2 style="color: #3b82f6; text-align: center;">Réinitialisez votre mot de passe</h2>
                <p>Bonjour,</p>
                <p>Vous avez demandé la réinitialisation de votre mot de passe pour votre compte MedSaaS.</p>
                <p>Veuillez cliquer sur le bouton ci-dessous pour procéder à la réinitialisation. Ce lien expirera dans 1 heure.</p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetLink}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Réinitialiser mon mot de passe</a>
                </div>
                
                <p>Si vous n'avez pas demandé ce changement, vous pouvez ignorer cet e-mail.</p>
                <hr style="border: 0; border-top: 1px solid #f1f1f1; margin: 20px 0;">
                <p style="text-align: center; color: #9ca3af; font-size: 12px;">© ${new Date().getFullYear()} MedSaaS. Tous droits réservés.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Erreur lors de l\'envoi de l\'e-mail');
    }
};
