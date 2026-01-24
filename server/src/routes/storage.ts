import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { 
  uploadFile, 
  getFile, 
  deleteFile, 
  getSignedDownloadUrl, 
  getSignedUploadUrl 
} from '../lib/storage';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Upload file
router.post('/upload', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const fileExtension = path.extname(req.file.originalname);
    const fileKey = `${crypto.randomUUID()}${fileExtension}`;
    const filePath = `uploads/${fileKey}`;

    await uploadFile(filePath, req.file.buffer, req.file.mimetype);

    res.json({
      success: true,
      key: filePath,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download file
router.get('/download/:key', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Get the full path after /download/
    const key = req.url.split('/download/')[1];

    const url = await getSignedDownloadUrl(key, 3600);

    res.json({ url });
  } catch (error) {
    console.error('Error getting download URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get signed upload URL
router.post('/signed-upload-url', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { fileName, contentType } = req.body;

    if (!fileName || !contentType) {
      return res.status(400).json({ error: 'fileName and contentType are required' });
    }

    const fileExtension = path.extname(fileName);
    const fileKey = `${crypto.randomUUID()}${fileExtension}`;
    const filePath = `uploads/${fileKey}`;

    const url = await getSignedUploadUrl(filePath, contentType, 3600);

    res.json({
      success: true,
      uploadUrl: url,
      key: filePath,
    });
  } catch (error) {
    console.error('Error generating upload URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete file
router.delete('/:key', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Get the full path after the first param
    const key = req.url.split('?')[0].substring(1); // Remove leading /

    await deleteFile(key);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
