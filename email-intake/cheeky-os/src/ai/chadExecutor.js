'use strict';

const fs = require('fs');
const path = require('path');

function getLatestTask() {
  const tasksDir = path.join(__dirname, '../../tasks');

  if (!fs.existsSync(tasksDir)) return null;

  const files = fs.readdirSync(tasksDir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .reverse();

  if (files.length === 0) return null;

  return path.join(tasksDir, files[0]);
}

function readTask(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

module.exports = {
  getLatestTask,
  readTask
};
