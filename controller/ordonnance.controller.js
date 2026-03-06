import puppeteer from "puppeteer";
import { v2 as cloudinary } from "cloudinary";
import pool from "../database.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

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
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            color: #2c3e50;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #2c3e50;
            padding-bottom: 15px;
            margin-bottom: 30px;
          }
          .doctor-name {
            font-size: 22px;
            font-weight: bold;
          }
          .specialty {
            font-size: 14px;
            color: gray;
          }
          .section {
            margin-bottom: 20px;
          }
          .patient-box {
            background: #f4f6f9;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 25px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
          }
          th {
            background: #2c3e50;
            color: white;
            padding: 10px;
            font-size: 13px;
          }
          td {
            border: 1px solid #ddd;
            padding: 8px;
            font-size: 13px;
            text-align: center;
          }
          .footer {
            margin-top: 60px;
            display: flex;
            justify-content: space-between;
            font-size: 14px;
          }
          .signature {
            text-align: right;
          }
          .date {
            font-weight: bold;
          }
          .watermark {
            position: fixed;
            top: 40%;
            left: 25%;
            font-size: 80px;
            color: rgba(200,200,200,0.1);
            transform: rotate(-30deg);
            z-index: -1;
          }
        </style>
      </head>
      <body>
        <div class="watermark">ORDONNANCE</div>

        <div class="header">
          <div class="doctor-name">${doctorName}</div>
          <div class="specialty">${doctorSpecialty}</div>
        </div>

        <div class="patient-box">
          <strong>Patient:</strong> ${patientName} <br/>
          <strong>Age:</strong> ${patientAge} <br/>
          <strong>Address:</strong> ${patientAddress} <br/>
          <strong>Date:</strong> <span class="date">${prescriptionDate}</span>
        </div>

        <div class="section">
          <h3>Prescription</h3>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Medication</th>
                <th>Dosage</th>
                <th>Frequency</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              ${medicinesRows}
            </tbody>
          </table>
        </div>

        <div class="footer">
          <div>Doctor Signature</div>
          <div class="signature">${doctorName}</div>
        </div>
      </body>
    </html>
  `;
};


const generatePdfBuffer = async (htmlContent) => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage"
    ],
  });
  const page = await browser.newPage();
  await page.setContent(htmlContent);
  const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
  await browser.close();
  return pdfBuffer;
};

const uploadToCloudinary = (pdfBuffer) =>
  new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: "doctorapp/prescriptions",
          resource_type: "raw",   
          type: "upload",
          access_mode: "public",  
        },
        (error, result) => {
          if (error) {
            console.error("Cloudinary Upload Error:", error);
            reject(error);
          } else {
            console.log("Cloudinary Upload Success:", result.secure_url);
            resolve(result);
          }
        }
      )
      .end(pdfBuffer);
  });


const extractPublicId = (url) => url.split("/").pop().split(".")[0];

export const getOrdonnancesByPatient = async (req, res) => {
  try {
    const { patient_id } = req.params;
    const doctor_id = req.doctor.doctorId;

    const [rows] = await pool.query(
      `SELECT * FROM prescriptions WHERE patient_id = ? AND doctor_id = ? ORDER BY created_at DESC`,
      [patient_id, doctor_id]
    );

    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error("Get ordonnances error:", error);
    res.status(500).json({ success: false, message: "Failed to retrieve ordonnances" });
  }
};

export const getOrdonnancesByDoctor = async (req, res) => {
  try {
    const { doctor_id: paramId } = req.params;
    const doctor_id = req.doctor.doctorId;

    if (paramId && parseInt(paramId, 10) !== doctor_id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view other doctor's ordonnances",
      });
    }

    const [rows] = await pool.query(
      `SELECT * FROM prescriptions WHERE doctor_id = ? ORDER BY created_at DESC`,
      [doctor_id]
    );

    res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error("Get ordonnances error:", error);
    res.status(500).json({ success: false, message: "Failed to retrieve ordonnances" });
  }
};

export const createOrdonnance = async (req, res) => {
  try {
    const {
      appointment_id,
      patient_id,
      patientName,
      patientAddress,
      patientAge,
      prescriptionDate,
      doctorName,
      doctorSpecialty,
      medicaments,
    } = req.body;

    const doctor_id = req.doctor.doctorId;

    // VALIDATION: Ensure required IDs for the prescriptions table are present
    if (!appointment_id || !patient_id) {
      console.error("Missing required IDs in createOrdonnance:", { appointment_id, patient_id });
      return res.status(400).json({
        success: false,
        message: "L'ID du rendez-vous et l'ID du patient sont obligatoires."
      });
    }

    const html = buildPrescriptionHTML({
      doctorName,
      doctorSpecialty,
      patientName,
      patientAge,
      patientAddress,
      prescriptionDate,
      medicaments,
    });

    const pdfBuffer = await generatePdfBuffer(html);
    const uploadResult = await uploadToCloudinary(pdfBuffer);

    const [result] = await pool.query(
      `INSERT INTO prescriptions (appointment_id, doctor_id, patient_id, cloudinary_url)
       VALUES (?, ?, ?, ?)`,
      [appointment_id, doctor_id, patient_id, uploadResult.secure_url]
    );

    res.status(201).json({
      success: true,
      message: "Ordonnance created successfully",
      url: uploadResult.secure_url,
      id: result.insertId
    });
  } catch (error) {
    console.error("Create ordonnance internal error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create ordonnance",
      error: error.message
    });
  }
};

export const deleteOrdonnance = async (req, res) => {
  try {
    const { id } = req.params;
    const doctor_id = req.doctor.doctorId;

    const [rows] = await pool.query(
      `SELECT cloudinary_url FROM prescriptions WHERE id = ? AND doctor_id = ?`,
      [id, doctor_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ordonnance not found or unauthorized",
      });
    }

    const publicId = extractPublicId(rows[0].cloudinary_url);
    await cloudinary.uploader.destroy(`doctorapp/prescriptions/${publicId}`, {
      resource_type: "raw",
    });

    await pool.query(
      `DELETE FROM prescriptions WHERE id = ? AND doctor_id = ?`,
      [id, doctor_id]
    );

    res.status(200).json({ success: true, message: "Ordonnance deleted successfully" });
  } catch (error) {
    console.error("Delete ordonnance error:", error);
    res.status(500).json({ success: false, message: "Failed to delete ordonnance" });
  }
};

export const updateOrdonnance = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      patientName,
      patientAddress,
      patientAge,
      prescriptionDate,
      doctorName,
      doctorSpecialty,
      medicaments,
    } = req.body;

    const doctor_id = req.doctor.doctorId;

    const [rows] = await pool.query(
      `SELECT * FROM prescriptions WHERE id = ? AND doctor_id = ?`,
      [id, doctor_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Ordonnance not found or unauthorized",
      });
    }

    // Delete old PDF from Cloudinary
    const oldPublicId = extractPublicId(rows[0].cloudinary_url);
    await cloudinary.uploader.destroy(`doctorapp/prescriptions/${oldPublicId}`, {
      resource_type: "raw",
    });

    // Generate and upload new PDF
    const html = buildPrescriptionHTML({
      doctorName,
      doctorSpecialty,
      patientName,
      patientAge,
      patientAddress,
      prescriptionDate,
      medicaments,
    });

    const pdfBuffer = await generatePdfBuffer(html);
    const uploadResult = await uploadToCloudinary(pdfBuffer);

    // FIX: removed "updated_at = NOW()" — that column does not exist in the schema
    await pool.query(
      `UPDATE prescriptions SET cloudinary_url = ? WHERE id = ?`,
      [uploadResult.secure_url, id]
    );

    res.status(200).json({
      success: true,
      message: "Ordonnance updated successfully",
      url: uploadResult.secure_url,
    });
  } catch (error) {
    console.error("Update ordonnance error:", error);
    res.status(500).json({ success: false, message: "Failed to update ordonnance" });
  }
};
