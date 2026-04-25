'use strict';

const fs = require('fs');
const path = require('path');

function extractTargetFile(taskText) {
  const match = taskText.match(/FILES[\s\S]*?- (.+\.js)/i);
  return match ? match[1].trim() : null;
}

function extractCodeBlock(taskText) {
  const match = taskText.match(/```javascript([\s\S]*?)```/i);
  return match ? match[1].trim() : null;
}

function resolvePath(root, filePath) {
  return path.isAbsolute(filePath)
    ? filePath
    : path.join(root, filePath);
}

function backup(filePath) {
  const backupPath = filePath + '.bak.' + Date.now();
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function applyPatch({ repoRoot, taskText, apply = false }) {
  const target = extractTargetFile(taskText);
  const code = extractCodeBlock(taskText);

  if (!target || !code) {
    return { status: 'BLOCKED', reason: 'Parse failure' };
  }

  const absPath = resolvePath(repoRoot, target);

  if (!fs.existsSync(absPath)) {
    return { status: 'BLOCKED', reason: 'File not found' };
  }

  if (!apply) {
    return {
      status: 'DRY_RUN',
      file: absPath,
      note: 'Set apply=true to execute'
    };
  }

  const backupPath = backup(absPath);
  fs.writeFileSync(absPath, code, 'utf8');

  return {
    status: 'SUCCESS',
    file: absPath,
    backup: backupPath
  };
}

module.exports = { applyPatch };
