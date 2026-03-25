import puppeteer from "puppeteer";
import { v2 as cloudinary } from "cloudinary";
import pool from "../database.js";
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

const buildPrescriptionHTML = ({
  doctorName,
  doctorSpecialty,
  patientName,
  patientAge,
  patientAddress,
  prescriptionDate,
  medicaments,
}) => {
  const medicinesRows = medicaments
    .map(
      (med, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${med.name}</td>
        <td>${med.dosage}</td>
        <td>${med.frequency}</td>
        <td>${med.duration}</td>
      </tr>
    `
    )
    .join("");

  return `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #2c3e50; }
          .header { text-align: center; border-bottom: 2px solid #2c3e50; padding-bottom: 15px; margin-bottom: 30px; }
          .doctor-name { font-size: 22px; font-weight: bold; }
          .specialty { font-size: 14px; color: gray; }
          .patient-box { background: #f4f6f9; padding: 15px; border-radius: 8px; margin-bottom: 25px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #2c3e50; color: white; padding: 10px; font-size: 13px; }
          td { border: 1px solid #ddd; padding: 8px; font-size: 13px; text-align: center; }
          .footer { margin-top: 60px; display: flex; justify-content: space-between; font-size: 14px; }
          .signature { text-align: right; }
          .date { font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="doctor-name">${doctorName}</div>
          <div class="specialty">${doctorSpecialty}</div>
        </div>
        <div class="patient-box">
          <strong>Patient:</strong> ${patientName} <br/>
          <strong>Age:</strong> ${patientAge} <br/>
          <strong>Adresse:</strong> ${patientAddress} <br/>
          <strong>Date:</strong> <span class="date">${prescriptionDate}</span>
        </div>
        <div class="section">
          <h3>Prescription</h3>
          <table>
            <thead>
              <tr><th>#</th><th>Médicament</th><th>Dosage</th><th>Fréquence</th><th>Durée</th></tr>
            </thead>
            <tbody>${medicinesRows}</tbody>
          </table>
        </div>
        <div class="footer">
          <div>Signature du Médecin</div>
          <div class="signature">${doctorName}</div>
        </div>
      </body>
    </html>
  `;
};

const generatePdfBuffer = async (htmlContent) => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setContent(htmlContent);
  const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
  await browser.close();
  return pdfBuffer;
};

const uploadToCloudinary = (pdfBuffer) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: "doctorapp/prescriptions",
        resource_type: "raw",
        format: "pdf",
        type: "upload",
        access_mode: "public",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(pdfBuffer);
  });

const extractPublicId = (url) => url.split("/").pop().split(".")[0];

export const getOrdonnancesByPatientId = async (req, res) => {
  try {
    const { patient_id } = req.params;
    const [rows] = await pool.query(
      `SELECT * FROM ordonnance WHERE patient_id = ? AND doctor_id = ? ORDER BY created_at DESC`,
      [patient_id, req.doctor.doctorId]
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erreur lors de la récupération", error: error.message });
  }
};

export const getOrdonnancesByDoctor = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM ordonnance WHERE doctor_id = ? ORDER BY created_at DESC`,
      [req.doctor.doctorId]
    );
    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const createOrdonnance = async (req, res) => {
  try {
    const {
      appointment_id, patient_id, patientName, patientAddress, patientAge,
      prescriptionDate, doctorName, doctorSpecialty, medicaments,
    } = req.body;
    const doctor_id = req.doctor.doctorId;

    if (!appointment_id || !patient_id) {
      return res.status(400).json({ success: false, message: "ID du rendez-vous et ID du patient obligatoires." });
    }

    const html = buildPrescriptionHTML({
      doctorName, doctorSpecialty, patientName, patientAge,
      patientAddress, prescriptionDate, medicaments,
    });

    const pdfBuffer = await generatePdfBuffer(html);
    const uploadResult = await uploadToCloudinary(pdfBuffer);

    const [result] = await pool.query(
      `INSERT INTO ordonnance (appointment_id, doctor_id, patient_id, file_url, medicaments)
       VALUES (?, ?, ?, ?, ?)`,
      [appointment_id, doctor_id, patient_id, uploadResult.secure_url, JSON.stringify(medicaments)]
    );

    // Automatiquement passer le RDV en statut "passé" dès qu'une ordonnance est créée
    await pool.query(
      `UPDATE appointment SET status = 'passé' WHERE id = ? AND doctor_id = ?`,
      [appointment_id, doctor_id]
    );

    res.status(201).json({
      success: true,
      message: "Ordonnance créée avec succès",
      url: uploadResult.secure_url,
      id: result.insertId
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Échec de création", error: error.message });
  }
};

export const deleteOrdonnance = async (req, res) => {
  try {
    const { id } = req.params;
    const doctor_id = req.doctor.doctorId;

    const [rows] = await pool.query(
      `SELECT file_url FROM ordonnance WHERE id = ? AND doctor_id = ?`,
      [id, doctor_id]
    );

    if (rows.length === 0) return res.status(404).json({ success: false, message: "Ordonnance non trouvée" });

    const publicId = extractPublicId(rows[0].file_url);
    await cloudinary.uploader.destroy(`doctorapp/prescriptions/${publicId}`, { resource_type: "raw" });

    await pool.query(`DELETE FROM ordonnance WHERE id = ? AND doctor_id = ?`, [id, doctor_id]);
    res.status(200).json({ success: true, message: "Supprimée" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateOrdonnance = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      patientName, patientAddress, patientAge, prescriptionDate,
      doctorName, doctorSpecialty, medicaments,
    } = req.body;
    const doctor_id = req.doctor.doctorId;

    const [rows] = await pool.query(`SELECT * FROM ordonnance WHERE id = ? AND doctor_id = ?`, [id, doctor_id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: "Ordonnance non trouvée" });

    const oldPublicId = extractPublicId(rows[0].file_url);
    await cloudinary.uploader.destroy(`doctorapp/prescriptions/${oldPublicId}`, { resource_type: "raw" });

    const html = buildPrescriptionHTML({
      doctorName, doctorSpecialty, patientName, patientAge,
      patientAddress, prescriptionDate, medicaments,
    });

    const pdfBuffer = await generatePdfBuffer(html);
    const uploadResult = await uploadToCloudinary(pdfBuffer);

    await pool.query(
      `UPDATE ordonnance SET file_url = ?, medicaments = ? WHERE id = ? AND doctor_id = ?`,
      [uploadResult.secure_url, JSON.stringify(medicaments), id, doctor_id]
    );

    res.status(200).json({ success: true, message: "Mise à jour effectuée", url: uploadResult.secure_url });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

