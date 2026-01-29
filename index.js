const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();

// --- CONFIGURATION ---
const PORT = 3000;
// 1. Where do files go? (Directly to the Secure Vault)
const UPLOAD_PATH = '/mnt/angela/bumblebee_vault';

// 2. Database Connection
mongoose.connect('mongodb://localhost:27017/bumblebee_sandbox')
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ DB Error:', err));

// 3. Define the "File" Schema (The Note Card for Mongo)
const FileSchema = new mongoose.Schema({
    originalName: String, // "photo.jpg"
    storedName: String,   // "17823612873-photo.jpg" (Unique ID)
    path: String,         // Full path on the drive
    size: Number,
    uploadDate: { type: Date, default: Date.now }
});
const FileModel = mongoose.model('File', FileSchema);

// --- MULTER SETUP (The Butler) ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_PATH); // Save to the external drive
    },
    filename: function (req, file, cb) {
        // Give it a unique name so we don't overwrite files
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- ROUTES ---

// 1. Serve the HTML Dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. The Upload Route
// 'upload.single' processes the file BEFORE the function runs
app.post('/upload', upload.single('myFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    // The file is safe in /mnt/angela. Now tell MongoDB.
    const newFile = new FileModel({
        originalName: req.file.originalname,
        storedName: req.file.filename,
        path: req.file.path,
        size: req.file.size
    });

    await newFile.save(); // Save the note card
    console.log(`💾 Saved ${req.file.originalname} to Drive & DB`);

    res.send(`Success! Saved as ${req.file.filename}`);
});
// --- DOWNLOAD ROUTE ---
app.get('/download/latest', async (req, res) => {
    try {
        // 1. Ask MongoDB: "What was the last file uploaded?"
        const lastFile = await FileModel.findOne().sort({ uploadDate: -1 });

        if (!lastFile) {
            return res.status(404).send("No files found in the vault.");
        }

        // 2. Construct the full path on the hard drive
        // We combine the vault path with the stored filename
        const filePath = path.join(UPLOAD_PATH, lastFile.storedName);

        // 3. Send the file to the user
        // 'res.download' automatically handles the headers so the browser knows it's a file
        res.download(filePath, lastFile.originalName, (err) => {
            if (err) {
                console.error("Error sending file:", err);
                res.status(500).send("Could not download file.");
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

// --- DELETE ROUTE ---
app.delete('/delete/latest', async (req, res) => {
    try {
        // 1. Find the victim (Latest file)
        const fileToDelete = await FileModel.findOne().sort({ uploadDate: -1 });

        if (!fileToDelete) {
            return res.status(404).send("Nothing to delete.");
        }

        // 2. Kill the Physical File (Remove from USB Drive)
        // We check if it exists first to avoid crashing
        if (fs.existsSync(fileToDelete.path)) {
            fs.unlinkSync(fileToDelete.path); // unlink = delete
            console.log(`🗑️ Physically deleted: ${fileToDelete.storedName}`);
        }

        // 3. Burn the Record (Remove from Database)
        await FileModel.deleteOne({ _id: fileToDelete._id });
        console.log(`🔥 Database record erased.`);

        res.send(`Deleted ${fileToDelete.originalName} successfully.`);

    } catch (err) {
        console.error(err);
        res.status(500).send("Could not delete file.");
    }
});
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
