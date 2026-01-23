#!/usr/bin/env node

/**
 * Migration script to export files from Supabase Storage to local storage
 * Creates bucket-like folder structure
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_STORAGE_PATH = '/srv/livechat/docker/volumes/supabase_storage_qddetjblszbvnmzxhiao/_data/stub/stub';
const LOCAL_STORAGE_PATH = '/srv/livechat/app/storage';

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

function migrateFiles() {
  console.log('Starting migration from Supabase Storage to local storage...');
  console.log(`Source: ${SUPABASE_STORAGE_PATH}`);
  console.log(`Destination: ${LOCAL_STORAGE_PATH}`);
  console.log('');

  if (!fs.existsSync(SUPABASE_STORAGE_PATH)) {
    console.error(`Source path does not exist: ${SUPABASE_STORAGE_PATH}`);
    process.exit(1);
  }

  // Get all files from Supabase storage
  const allFiles = getAllFiles(SUPABASE_STORAGE_PATH);
  console.log(`Found ${allFiles.length} files to migrate`);
  console.log('');

  let successCount = 0;
  let errorCount = 0;
  const migratedPaths = [];

  allFiles.forEach((sourcePath) => {
    try {
      // Extract relative path from source
      // Path format: .../stub/stub/whatsapp-media/instance/filename/uuid
      const relativePath = sourcePath.replace(SUPABASE_STORAGE_PATH + '/', '');
      const parts = relativePath.split('/');
      
      // Expected structure: bucket/instance/filename/uuid
      // We want: bucket/instance/filename
      if (parts.length >= 3) {
        const bucket = parts[0]; // whatsapp-media
        const instance = parts[1]; // ti-ubva, Suporte, etc.
        const filename = parts[2]; // actual filename with extension
        
        // Create destination path
        const destDir = path.join(LOCAL_STORAGE_PATH, bucket, instance);
        const destPath = path.join(destDir, filename);

        // Create directory if not exists
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        // Copy file (only if destination doesn't exist)
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(sourcePath, destPath);
          console.log(`✓ Copied: ${bucket}/${instance}/${filename}`);
          migratedPaths.push({
            old: `${instance}/${filename}`,
            new: `/storage/${bucket}/${instance}/${filename}`
          });
          successCount++;
        } else {
          console.log(`⊘ Skipped (exists): ${bucket}/${instance}/${filename}`);
        }
      } else {
        console.log(`⚠ Unexpected path structure: ${relativePath}`);
      }
    } catch (error) {
      console.error(`✗ Error copying ${sourcePath}: ${error.message}`);
      errorCount++;
    }
  });

  console.log('');
  console.log('='.repeat(50));
  console.log(`Migration complete!`);
  console.log(`✓ Success: ${successCount} files`);
  console.log(`✗ Errors: ${errorCount} files`);
  console.log('');

  // Save migration mapping for database update
  const mappingFile = path.join(LOCAL_STORAGE_PATH, 'migration-mapping.json');
  fs.writeFileSync(mappingFile, JSON.stringify(migratedPaths, null, 2));
  console.log(`Migration mapping saved to: ${mappingFile}`);
  
  // Generate SQL update script
  generateSQLUpdate(migratedPaths);
}

function generateSQLUpdate(migratedPaths) {
  const sqlFile = path.join(LOCAL_STORAGE_PATH, 'update-media-paths.sql');
  
  let sql = '-- SQL script to update media paths in database\n';
  sql += '-- Run this after migrating files\n\n';
  sql += 'BEGIN;\n\n';
  
  // Update whatsapp_messages table
  sql += '-- Update whatsapp_messages media_url\n';
  migratedPaths.forEach(({ old, new: newPath }) => {
    const escapedOld = old.replace(/'/g, "''");
    const escapedNew = newPath.replace(/'/g, "''");
    sql += `UPDATE whatsapp_messages SET media_url = '${escapedNew}' WHERE media_url = '${escapedOld}';\n`;
  });
  
  sql += '\n-- Also update messages that may have full path stored\n';
  migratedPaths.forEach(({ old, new: newPath }) => {
    const escapedOld = old.replace(/'/g, "''");
    const escapedNew = newPath.replace(/'/g, "''");
    sql += `UPDATE whatsapp_messages SET media_url = '${escapedNew}' WHERE media_url LIKE '%${escapedOld}';\n`;
  });
  
  sql += '\nCOMMIT;\n';
  
  fs.writeFileSync(sqlFile, sql);
  console.log(`SQL update script saved to: ${sqlFile}`);
}

// Run migration
migrateFiles();
