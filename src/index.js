import express from 'express';
import multer from 'multer';
import seven from 'node-7z';
import archiver from 'archiver';
import { promises as fs, createWriteStream } from 'fs';
import path from 'path';
import bodyParser from 'body-parser';

const app = express();
const PORT = 3000;

const __dirname = path.dirname(new URL(import.meta.url).pathname).replace(/^\/[A-Za-z]:\//, '/');
const MALWARE_DIR = path.join(__dirname, '../malware');
const ANALYSIS_DIR = path.join(__dirname, '../analysis');
const ZIP_DIR = path.join(__dirname, '../public/dumps');

(async () => {
  await fs.mkdir(MALWARE_DIR, { recursive: true });
  await fs.mkdir(ANALYSIS_DIR, { recursive: true });
  await fs.mkdir(ZIP_DIR, { recursive: true });
})();

app.use(bodyParser.json());
app.use(express.static('public'));
app.use('/dumps', express.static(ZIP_DIR));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, MALWARE_DIR),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

app.post('/upload', upload.single('file'), async (req, res) => {
  let response = { message: '', downloadLink: '' };
  try {
    const filePath = req.file.path;
    const filename = req.file.filename;

    const outputDir = path.join(ANALYSIS_DIR, `${filename}-extracted`);
    await fs.mkdir(outputDir, { recursive: true });

    await seven.extractFull(filePath, outputDir);

    await new Promise(resolve => setTimeout(resolve, 1000));

    const zipFilePath = path.join(ZIP_DIR, `${filename}.zip`);
    const output = createWriteStream(zipFilePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise((resolve, reject) => {
      output.on('close', () => {
        console.log(`Fichier ZIP créé : ${zipFilePath}`);
        resolve();
      });
      output.on('error', (err) => {
        console.error(`Erreur avec le flux d'écriture : ${err.message}`);
        reject(err);
      });
      archive.on('error', (err) => {
        console.error(`Erreur avec archiver : ${err.message}`);
        reject(err);
      });
      archive.on('warning', (err) => console.warn(`Avertissement archiver : ${err.message}`));

      archive.directory(outputDir, false);
      archive.pipe(output);
      archive.finalize();
    });

    response.message = 'Fichier extrait et compressé avec succès';
    response.downloadLink = `/dumps/${path.basename(zipFilePath)}`;

    await new Promise(resolve => setTimeout(resolve, 2000));
    await fs.unlink(filePath);
    await fs.rmdir(outputDir, { recursive: true });
   
  } catch (error) {
    console.error(`Erreur lors du traitement : ${error.message}`);
    response.message = 'Erreur lors du traitement';
    response.error = error.message;
    res.status(500);
  }

  res.json(response);
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});