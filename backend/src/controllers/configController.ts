import { Request, Response } from 'express';
import { configService } from '../services/configService.js';
import { AuthRequest } from '../middleware/auth.js';

export const configController = {
  async setConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { key, value } = req.body;

      if (!key || !value) {
        res.status(400).json({ error: 'Key and value are required' });
        return;
      }

      const config = await configService.setConfig(key, value);
      res.json({ success: true, data: config });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to set config';
      res.status(500).json({ success: false, error: message });
    }
  },

  async getConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { key } = req.params;
      const config = await configService.getConfig(key);

      if (!config) {
        res.status(404).json({ success: false, error: 'Config not found' });
        return;
      }

      res.json({ success: true, data: config });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get config';
      res.status(500).json({ success: false, error: message });
    }
  },

  async getAllConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
      const configs = await configService.getAllConfig();
      res.json({ success: true, data: configs });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get configs';
      res.status(500).json({ success: false, error: message });
    }
  },

  async deleteConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { key } = req.params;
      const deleted = await configService.deleteConfig(key);

      if (!deleted) {
        res.status(404).json({ success: false, error: 'Config not found' });
        return;
      }

      res.json({ success: true, message: 'Config deleted' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete config';
      res.status(500).json({ success: false, error: message });
    }
  },

  async setupProject(req: AuthRequest, res: Response): Promise<void> {
    try {
      const configs = await configService.setupProject(req.body);
      res.json({ 
        success: true, 
        message: 'Project configuration completed successfully',
        data: configs 
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to setup project';
      res.status(500).json({ success: false, error: message });
    }
  },
};
