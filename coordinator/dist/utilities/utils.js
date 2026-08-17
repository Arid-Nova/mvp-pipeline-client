"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.decompressGzipResponse = exports.decompressPayload = void 0;
const node_zlib_1 = __importDefault(require("node:zlib"));
const node_util_1 = require("node:util");
const gunzipAsync = (0, node_util_1.promisify)(node_zlib_1.default.gunzip);
// Converts a Base64 encoded GZIP string back into a JSON object.
const decompressPayload = (base64Data) => {
    try {
        const compressedBuffer = Buffer.from(base64Data, 'base64');
        const decompressed = node_zlib_1.default.gunzipSync(compressedBuffer);
        return JSON.parse(decompressed.toString('utf-8'));
    }
    catch (error) {
        console.error("Decompression failed:", error);
        return null;
    }
};
exports.decompressPayload = decompressPayload;
// Decompresses a GZIP-compressed binary payload into a JSON object.
const decompressGzipResponse = async (data) => {
    try {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const decompressedBuffer = await gunzipAsync(buffer);
        return JSON.parse(decompressedBuffer.toString('utf-8'));
    }
    catch (error) {
        console.error("Gzip response decompression failed:", error);
        throw error;
    }
};
exports.decompressGzipResponse = decompressGzipResponse;
