"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROOT = void 0;
exports.p = p;
exports.ensureDir = ensureDir;
exports.readFileSafe = readFileSafe;
exports.writeFileAtomic = writeFileAtomic;
exports.todayIso = todayIso;
exports.slugify = slugify;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
exports.ROOT = path_1.default.resolve(process.cwd());
function p(...parts) {
    return path_1.default.join(exports.ROOT, ...parts);
}
async function ensureDir(dirPath) {
    await fs_1.promises.mkdir(dirPath, { recursive: true });
}
async function readFileSafe(filePath) {
    try {
        return await fs_1.promises.readFile(filePath, "utf8");
    }
    catch {
        return "";
    }
}
async function writeFileAtomic(filePath, content) {
    await ensureDir(path_1.default.dirname(filePath));
    await fs_1.promises.writeFile(filePath, content, "utf8");
}
function todayIso(date = new Date()) {
    return date.toISOString().slice(0, 10);
}
function slugify(input) {
    return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "entity";
}
